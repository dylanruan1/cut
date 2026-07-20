import prisma from "@/lib/db";
import { addMinutes } from "date-fns";
import {
  formatAppointmentTimeForVoice,
  formatAppointmentWhenForVoice,
  getShopLocalDecimalHour,
  resolveShopTimezone,
} from "@/lib/datetime";
import {
  combineDateAndTime,
  findAvailability,
  type ExistingAppointment,
} from "./availability";
import { describeBookingForVoice } from "./prompts";
import { sendReceptionistSms } from "./sms";
import type {
  BookingResult,
  ParsedBookingRequest,
  ShopContext,
} from "./types";

export type ExecuteBookingInput = {
  shop: ShopContext;
  parsed: ParsedBookingRequest;
  callerPhone: string;
};

function normalizeServiceMatch(
  requested: string | undefined,
  services: ShopContext["services"]
): ShopContext["services"][number] | undefined {
  if (!requested) return undefined;
  const needle = requested.toLowerCase();
  return (
    services.find((s) => s.name.toLowerCase() === needle) ??
    services.find((s) => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase()))
  );
}

function normalizeBarberMatch(
  requested: string | undefined,
  barbers: ShopContext["barbers"]
): ShopContext["barbers"][number] | undefined {
  if (!requested) return undefined;
  const needle = requested.toLowerCase();
  return (
    barbers.find((b) => b.name.toLowerCase() === needle) ??
    barbers.find((b) => b.name.toLowerCase().startsWith(needle))
  );
}

/**
 * Best-effort lookup of an existing Client profile name for a caller phone.
 * LOG-ONLY for the voice flow: the matched name is never spoken, suggested,
 * or used to fill the session name — the receptionist always asks the
 * caller for a name. Never throws — lookup failure means "no known client".
 */
export async function findExistingClientName(
  shopId: string,
  callerPhone: string
): Promise<string | null> {
  if (!callerPhone) return null;
  try {
    const client = await prisma.client.findUnique({
      where: {
        barbershopId_phone: {
          barbershopId: shopId,
          phone: callerPhone,
        },
      },
      select: { name: true },
    });
    return client?.name?.trim() || null;
  } catch (error) {
    console.warn("[ai-receptionist/booking] existing client lookup failed", {
      shopId,
      callerPhone,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

export type AvailabilityCheckResult = {
  available: boolean;
  options: Awaited<ReturnType<typeof findAvailability>>;
  service?: ShopContext["services"][number];
  message?: string;
  error?: string;
};

/** Checks whether the requested date/time (and optional barber) is free. */
export async function checkBookingAvailability(input: {
  shop: ShopContext;
  parsed: Pick<
    ParsedBookingRequest,
    "serviceName" | "preferredDate" | "preferredTime" | "barberName" | "anyBarber"
  >;
}): Promise<AvailabilityCheckResult> {
  const { shop, parsed } = input;
  const timezone = resolveShopTimezone(shop.timezone);

  if (!parsed.serviceName || !parsed.preferredDate || !parsed.preferredTime) {
    return {
      available: false,
      options: [],
      message: "I still need a few details before I can check availability.",
      error: "missing_fields",
    };
  }

  const service = normalizeServiceMatch(parsed.serviceName, shop.services);
  if (!service) {
    return {
      available: false,
      options: [],
      message: `I couldn't find a service called ${parsed.serviceName}. What service would you like?`,
      error: "service_not_found",
    };
  }

  const preferredBarber = normalizeBarberMatch(parsed.barberName, shop.barbers);

  const dayStart = combineDateAndTime(parsed.preferredDate, "00:00", timezone);
  const dayEnd = combineDateAndTime(parsed.preferredDate, "23:59", timezone);

  const existing = await prisma.appointment.findMany({
    where: {
      barbershopId: shop.id,
      status: { notIn: ["CANCELLED"] },
      startTime: { gte: dayStart, lte: dayEnd },
    },
    select: { startTime: true, endTime: true, barberId: true },
  });

  const existingAppointments: ExistingAppointment[] = existing.map((a) => ({
    startTime: a.startTime,
    endTime: a.endTime,
    barberId: a.barberId,
  }));

  const options = findAvailability({
    shop: { ...shop, timezone },
    serviceId: service.id,
    serviceName: service.name,
    serviceDuration: service.duration,
    preferredDate: parsed.preferredDate,
    preferredTime: parsed.preferredTime,
    barberId: preferredBarber?.id,
    existingAppointments,
    limit: 3,
  });

  if (options.length === 0) {
    return {
      available: false,
      options: [],
      service,
      message:
        "I don't have an opening at that time. Would you like a different day or time?",
      error: "no_availability",
    };
  }

  return { available: true, options, service };
}

export async function executeBooking(input: ExecuteBookingInput): Promise<BookingResult> {
  const { shop, parsed, callerPhone } = input;
  const timezone = resolveShopTimezone(shop.timezone);

  const availability = await checkBookingAvailability({
    shop: { ...shop, timezone },
    parsed,
  });
  if (!availability.available || !availability.service) {
    return {
      success: false,
      message:
        availability.message ??
        "I don't have an opening at that time. Would you like a different day or time?",
      error: availability.error ?? "no_availability",
    };
  }

  const service = availability.service;
  const options = availability.options;

  const slot = options[0];
  // Prefer re-deriving from preferred wall-clock so store + speak stay aligned.
  const startTime =
    parsed.preferredDate && parsed.preferredTime
      ? combineDateAndTime(parsed.preferredDate, parsed.preferredTime, timezone)
      : new Date(slot.startTime);
  const endTime = addMinutes(startTime, service.duration);

  let client = await prisma.client.findUnique({
    where: {
      barbershopId_phone: {
        barbershopId: shop.id,
        phone: callerPhone,
      },
    },
  });

  // Source of truth is the name spoken/confirmed on this call
  // (session.clientName → parsed.clientName). The conversation flow won't
  // reach booking without a confirmed name; the existing-client /
  // "Phone Customer" fallback below is a booking-time-only safety net and
  // never drives conversation prompts. Never a dashboard/auth user name.
  const callerProvidedName = parsed.clientName?.trim() || null;
  const clientName =
    callerProvidedName || client?.name?.trim() || "Phone Customer";

  console.log("[ai-receptionist/booking] client name resolution", {
    phone: callerPhone,
    existingMatchedClientName: client?.name ?? null,
    callerProvidedName,
    finalClientName: clientName,
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        barbershopId: shop.id,
        name: clientName,
        phone: callerPhone,
      },
    });
  } else if (
    callerProvidedName &&
    client.name.trim().toLowerCase() !== clientName.toLowerCase()
  ) {
    // Do not rename the Client profile — keep history stable; snapshot holds this call's name.
    console.log(
      "[ai-receptionist/booking] caller name mismatch — preserving existing client, snapshot keeps caller name",
      {
        clientId: client.id,
        phone: callerPhone,
        existingName: client.name,
        callerProvidedName: clientName,
      }
    );
  }

  const appointment = await prisma.appointment.create({
    data: {
      barbershopId: shop.id,
      clientId: client.id,
      barberId: slot.barberId,
      serviceId: service.id,
      startTime,
      endTime,
      duration: service.duration,
      status: "CONFIRMED",
      source: "ai_receptionist",
      clientNameSnapshot: clientName,
      clientPhoneSnapshot: callerPhone,
    },
  });

  await prisma.notification.create({
    data: {
      barbershopId: shop.id,
      title: "Phone booking",
      message: `${clientName} booked ${service.name} with ${slot.barberName} via AI receptionist`,
      type: "APPOINTMENT",
      metadata: { appointmentId: appointment.id, source: "ai_receptionist" },
    },
  });

  const spokenWhen = formatAppointmentWhenForVoice(appointment.startTime, timezone);
  const spokenTime = formatAppointmentTimeForVoice(appointment.startTime, timezone);
  // Speak "with barber X" only when the caller explicitly asked for that
  // barber; otherwise omit the assigned barber so it can't be mistaken for
  // the client. The client is always "under the name X".
  const spokenBarberName =
    !parsed.anyBarber && parsed.barberName ? slot.barberName : undefined;
  const speak = `You're booked at ${shop.name}. The appointment is ${describeBookingForVoice({
    serviceName: service.name,
    clientName,
    barberName: spokenBarberName,
    shopName: shop.name,
  })} for ${spokenWhen}. You'll get a text confirmation shortly.`;

  console.log("[ai-receptionist/booking] booked voice name", {
    voiceConfirmationName: clientName,
    appointmentSnapshotName: appointment.clientNameSnapshot ?? clientName,
    existingClientProfileName: client.name,
    appointmentId: appointment.id,
  });

  console.log("[ai-receptionist/booking] confirmation timing", {
    rawSpeechResult: parsed.rawText,
    parsedPreferredDate: parsed.preferredDate,
    parsedPreferredTime: parsed.preferredTime,
    preferredTimeRaw: parsed.preferredTimeRaw,
    hasExplicitMeridiem: parsed.hasExplicitMeridiem,
    isAmbiguousHour: parsed.isAmbiguousHour,
    resolvedFinalTime: parsed.preferredTime,
    timezoneUsed: timezone,
    finalAppointmentStartISO: appointment.startTime.toISOString(),
    finalAppointmentStartFormatted: spokenWhen,
    appointmentTimeDisplayed: spokenTime,
    calendarDecimalHour: getShopLocalDecimalHour(appointment.startTime, timezone),
    appointmentId: appointment.id,
  });

  await sendReceptionistSms({
    to: callerPhone,
    barbershopId: shop.id,
    appointmentId: appointment.id,
    body: `Hi ${clientName}! Your ${service.name} with barber ${slot.barberName} at ${shop.name} is confirmed for ${spokenWhen}. Reply STOP to opt out.`,
  });

  return {
    success: true,
    appointmentId: appointment.id,
    message: speak,
  };
}

export async function cancelUpcomingAppointment(input: {
  shopId: string;
  callerPhone: string;
}): Promise<BookingResult> {
  const client = await prisma.client.findUnique({
    where: {
      barbershopId_phone: {
        barbershopId: input.shopId,
        phone: input.callerPhone,
      },
    },
  });

  if (!client) {
    return {
      success: false,
      message: "I couldn't find an upcoming appointment under this phone number.",
      error: "client_not_found",
    };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      barbershopId: input.shopId,
      clientId: client.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { gte: new Date() },
    },
    include: { service: true, barber: true },
    orderBy: { startTime: "asc" },
  });

  if (!appointment) {
    return {
      success: false,
      message: "I couldn't find an upcoming appointment to cancel.",
      error: "appointment_not_found",
    };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED" },
  });

  await sendReceptionistSms({
    to: input.callerPhone,
    barbershopId: input.shopId,
    appointmentId: appointment.id,
    body: `Your ${appointment.service.name} with barber ${appointment.barber.name} has been cancelled. Call us anytime to rebook.`,
    type: "cancellation",
  });

  return {
    success: true,
    appointmentId: appointment.id,
    message: `I've cancelled your ${appointment.service.name} with barber ${appointment.barber.name}. Is there anything else I can help with?`,
  };
}

export { normalizeServiceMatch, normalizeBarberMatch };
