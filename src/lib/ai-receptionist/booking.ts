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
import { isDoubleBookingError } from "@/lib/booking-conflict";
import { getStripe, getAppUrl } from "@/lib/stripe";
import { buildDepositCheckoutParams, toCents } from "@/lib/stripe-connect";
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

/**
 * How long a phone booking is held while the caller pays the texted deposit
 * link. Stripe requires Checkout sessions to expire no sooner than 30 minutes.
 */
const PHONE_HOLD_MINUTES = 30;

type DepositRequirement = {
  amount: number;
  connectAccountId: string;
  shopSlug: string;
};

/**
 * Returns the deposit owed for a service, or null when none applies.
 * Requires the shop to have deposits switched on AND an active payout account.
 */
async function resolveDepositRequirement(
  shopId: string,
  serviceId: string
): Promise<DepositRequirement | null> {
  const [shop, service] = await Promise.all([
    prisma.barbershop.findUnique({
      where: { id: shopId },
      select: {
        slug: true,
        depositsEnabled: true,
        connectStatus: true,
        stripeConnectAccountId: true,
      },
    }),
    prisma.service.findUnique({
      where: { id: serviceId },
      select: { depositAmount: true },
    }),
  ]);

  if (
    !shop?.depositsEnabled ||
    shop.connectStatus !== "ACTIVE" ||
    !shop.stripeConnectAccountId
  ) {
    return null;
  }

  const amount = service?.depositAmount ? Number(service.depositAmount) : 0;
  if (!(amount > 0)) return null;

  return {
    amount,
    connectAccountId: shop.stripeConnectAccountId,
    shopSlug: shop.slug,
  };
}

/** Creates the Stripe Checkout session whose link gets texted to the caller. */
async function createPhoneDepositCheckout(input: {
  appointmentId: string;
  barbershopId: string;
  connectAccountId: string;
  shopName: string;
  shopSlug: string;
  serviceName: string;
  depositDollars: number;
}): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const base = getAppUrl();
  const session = await stripe.checkout.sessions.create(
    buildDepositCheckoutParams({
      connectAccountId: input.connectAccountId,
      shopName: input.shopName,
      serviceName: input.serviceName,
      depositCents: toCents(input.depositDollars),
      appointmentId: input.appointmentId,
      barbershopId: input.barbershopId,
      successUrl: `${base}/book/${input.shopSlug}?deposit=success&appointment=${input.appointmentId}`,
      cancelUrl: `${base}/book/${input.shopSlug}?deposit=canceled`,
      expiresAt: Math.floor((Date.now() + PHONE_HOLD_MINUTES * 60_000) / 1000),
    })
  );

  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  await prisma.appointment.update({
    where: { id: input.appointmentId },
    data: { stripeCheckoutSessionId: session.id },
  });

  return session.url;
}

/** "$10" reads better than "10 dollars" in most TTS voices, but be explicit. */
function formatMoneyForVoice(amount: number): string {
  const whole = Math.round(amount);
  return Number.isInteger(amount) || Math.abs(amount - whole) < 0.005
    ? `${whole} dollar${whole === 1 ? "" : "s"}`
    : `${amount.toFixed(2)} dollars`;
}

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

  // Does this booking need a deposit? Read live from the DB — ShopContext
  // carries no payment state, and it must never be trusted from the caller.
  const deposit = await resolveDepositRequirement(shop.id, service.id);

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

  let appointment;
  try {
    appointment = await prisma.appointment.create({
      data: {
        barbershopId: shop.id,
        clientId: client.id,
        barberId: slot.barberId,
        serviceId: service.id,
        startTime,
        endTime,
        duration: service.duration,
        // With a deposit due the slot is only held until the caller pays.
        status: deposit ? "PENDING" : "CONFIRMED",
        depositStatus: deposit ? "PENDING" : "NONE",
        depositAmount: deposit ? deposit.amount : null,
        holdExpiresAt: deposit
          ? new Date(Date.now() + PHONE_HOLD_MINUTES * 60_000)
          : null,
        source: "ai_receptionist",
        clientNameSnapshot: clientName,
        clientPhoneSnapshot: callerPhone,
      },
    });
  } catch (error) {
    // Someone booked this exact slot mid-call — tell the caller, don't crash.
    if (isDoubleBookingError(error)) {
      return {
        success: false,
        message:
          "Sorry, that time was just taken. Would you like a different time?",
        error: "double_booked",
      };
    }
    throw error;
  }

  await prisma.notification.create({
    data: {
      barbershopId: shop.id,
      title: deposit ? "Phone booking (awaiting deposit)" : "Phone booking",
      message: deposit
        ? `${clientName} requested ${service.name} with ${slot.barberName} — deposit link sent`
        : `${clientName} booked ${service.name} with ${slot.barberName} via AI receptionist`,
      type: "APPOINTMENT",
      metadata: { appointmentId: appointment.id, source: "ai_receptionist" },
    },
  });

  // Deposit flow: a caller can't pay over the phone, so text them a secure
  // payment link and hold the slot until it's paid.
  if (deposit) {
    const whenSpoken = formatAppointmentWhenForVoice(
      appointment.startTime,
      timezone
    );
    try {
      const url = await createPhoneDepositCheckout({
        appointmentId: appointment.id,
        barbershopId: shop.id,
        connectAccountId: deposit.connectAccountId,
        shopName: shop.name,
        shopSlug: deposit.shopSlug,
        serviceName: service.name,
        depositDollars: deposit.amount,
      });

      await sendReceptionistSms({
        to: callerPhone,
        barbershopId: shop.id,
        appointmentId: appointment.id,
        body: `${shop.name}: to lock in your ${service.name} on ${whenSpoken}, pay the $${deposit.amount.toFixed(0)} deposit here within ${PHONE_HOLD_MINUTES} minutes: ${url}`,
      });

      return {
        success: true,
        appointmentId: appointment.id,
        message: `Almost done. I've texted you a link to pay the ${formatMoneyForVoice(deposit.amount)} deposit. I'm holding ${whenSpoken} for you for the next ${PHONE_HOLD_MINUTES} minutes, and it's confirmed as soon as you pay.`,
      };
    } catch (error) {
      console.error("[ai-receptionist/booking] deposit link failed", error);
      // Don't leave a phantom hold if we couldn't send the link.
      await prisma.appointment
        .update({
          where: { id: appointment.id },
          data: { status: "CANCELLED", depositStatus: "FAILED", holdExpiresAt: null },
        })
        .catch(() => {});
      return {
        success: false,
        message: `I'm having trouble sending the deposit link right now. Please call the shop directly to finish booking.`,
        error: "deposit_link_failed",
      };
    }
  }

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
