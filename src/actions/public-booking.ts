"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { addMinutes } from "date-fns";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { rateLimit, sanitizeInput } from "@/lib/rate-limit";
import { normalizePhone, sendSms, buildBookingConfirmationSms } from "@/lib/twilio";
import { formatTime, formatShortDate } from "@/lib/dates";
import { resolveShopTimezone } from "@/lib/datetime";
import {
  findAvailability,
  combineDateAndTime,
  type ExistingAppointment,
} from "@/lib/ai-receptionist/availability";
import { canUseCalendar } from "@/lib/subscription";
import {
  isDoubleBookingError,
  DOUBLE_BOOKING_MESSAGE,
} from "@/lib/booking-conflict";
import { getStripe, getAppUrl } from "@/lib/stripe";
import {
  buildDepositCheckoutParams,
  toCents,
} from "@/lib/stripe-connect";

/**
 * Public (unauthenticated) booking actions for the customer-facing page at
 * /book/[slug].
 *
 * Security notes — this is the only part of the app reachable without login:
 *  - every action is rate limited per client IP
 *  - the shop is always resolved by slug; no shop id is ever trusted from input
 *  - only ACTIVE services/barbers of that shop can be selected
 *  - availability is recomputed server-side at booking time, so a stale or
 *    hand-crafted slot cannot double-book
 *  - shops without an active plan do not expose booking at all
 */

const MIN_LEAD_MINUTES = 30;
const MAX_DAYS_AHEAD = 60;
/**
 * How long a slot is held while the customer completes deposit checkout.
 * Stripe requires Checkout `expires_at` to be at least 30 minutes out, so the
 * hold and the session expiry are kept in sync at 30 minutes.
 */
const HOLD_MINUTES = 30;

/**
 * Appointments that should block a time slot.
 *
 * A deposit hold blocks the slot while checkout is open, but once the hold
 * lapses unpaid it must stop blocking — otherwise an abandoned checkout would
 * silently take the time off the calendar forever.
 */
function blockingAppointmentWhere(
  barbershopId: string,
  from: Date,
  to: Date
): Prisma.AppointmentWhereInput {
  return {
    barbershopId,
    status: { notIn: ["CANCELLED"] },
    startTime: { gte: from, lte: to },
    NOT: {
      depositStatus: "PENDING",
      holdExpiresAt: { lt: new Date() },
    },
  };
}

export type PublicShop = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  instagram: string | null;
  timezone: string;
  /** True when the shop can actually take deposits (connected + switched on). */
  depositsEnabled: boolean;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    duration: number;
    price: string;
    /** Required deposit in dollars, or null when none. */
    depositAmount: string | null;
  }>;
  barbers: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    workingHours: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isOff: boolean;
    }>;
    serviceIds: string[];
  }>;
  businessHours: Array<{
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }>;
  holidays: Array<{ date: string; isClosed: boolean }>;
};

/**
 * Opens a Stripe Checkout Session for an appointment deposit and records the
 * session on the appointment so the webhook can match it back.
 */
async function createDepositCheckout(input: {
  appointmentId: string;
  barbershopId: string;
  connectAccountId: string;
  shopName: string;
  shopSlug: string;
  serviceName: string;
  depositDollars: number;
  customerEmail: string | null;
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
      customerEmail: input.customerEmail,
      successUrl: `${base}/book/${input.shopSlug}?deposit=success&appointment=${input.appointmentId}`,
      cancelUrl: `${base}/book/${input.shopSlug}?deposit=canceled`,
      expiresAt: Math.floor((Date.now() + HOLD_MINUTES * 60_000) / 1000),
    })
  );

  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  await prisma.appointment.update({
    where: { id: input.appointmentId },
    data: { stripeCheckoutSessionId: session.id },
  });

  return session.url;
}

async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return `${prefix}:${ip}`;
}

/** Loads a shop's public booking profile by slug. Returns null when unavailable. */
export async function getPublicShop(slug: string): Promise<PublicShop | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;

  const shop = await prisma.barbershop.findUnique({
    where: { slug: clean },
    include: {
      services: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      barbers: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: {
          workingHours: {
            select: {
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              isOff: true,
            },
          },
          services: { select: { serviceId: true } },
        },
      },
      businessHours: true,
      holidays: {
        where: { date: { gte: new Date(Date.now() - 86_400_000) } },
        select: { date: true, isClosed: true },
      },
    },
  });

  if (!shop) return null;
  // Unpaid/cancelled shops don't get a public booking page.
  if (!canUseCalendar(shop)) return null;
  if (shop.services.length === 0 || shop.barbers.length === 0) return null;

  // Deposits require both an active connected payout account and the switch on.
  const depositsEnabled =
    shop.depositsEnabled && shop.connectStatus === "ACTIVE";

  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    address: shop.address,
    phone: shop.phone,
    instagram: shop.instagram,
    timezone: resolveShopTimezone(shop.timezone),
    depositsEnabled,
    services: shop.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      duration: s.duration,
      price: s.price.toString(),
      depositAmount:
        depositsEnabled && s.depositAmount && Number(s.depositAmount) > 0
          ? s.depositAmount.toString()
          : null,
    })),
    barbers: shop.barbers.map((b) => ({
      id: b.id,
      name: b.name,
      photoUrl: b.photoUrl,
      workingHours: b.workingHours,
      serviceIds: b.services.map((s) => s.serviceId),
    })),
    holidays: shop.holidays.map((h) => ({
      date: h.date.toISOString().slice(0, 10),
      isClosed: h.isClosed,
    })),
    businessHours: shop.businessHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isClosed: h.isClosed,
    })),
  };
}

const slotsSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.string().min(1),
  /** YYYY-MM-DD in shop-local time */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  /** Omit or "any" for no preference */
  barberId: z.string().optional(),
});

export type PublicSlot = {
  startTime: string;
  label: string;
  barberId: string;
  barberName: string;
};

/** Returns bookable start times for a given service/date (and optional barber). */
export async function getPublicAvailability(input: unknown): Promise<{
  slots?: PublicSlot[];
  error?: string;
}> {
  const limited = rateLimit(await clientKey("public:slots"), 120, 60_000);
  if (!limited.success) return { error: "Too many requests. Please slow down." };

  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const shop = await getPublicShop(parsed.data.slug);
  if (!shop) return { error: "This booking page is not available." };

  const service = shop.services.find((s) => s.id === parsed.data.serviceId);
  if (!service) return { error: "Service not found." };

  const wantsSpecificBarber =
    parsed.data.barberId && parsed.data.barberId !== "any";
  const barber = wantsSpecificBarber
    ? shop.barbers.find((b) => b.id === parsed.data.barberId)
    : undefined;
  if (wantsSpecificBarber && !barber) return { error: "Barber not found." };

  const timezone = shop.timezone;
  const dayStart = combineDateAndTime(parsed.data.date, "00:00", timezone);
  const dayEnd = combineDateAndTime(parsed.data.date, "23:59", timezone);

  // Don't allow browsing arbitrarily far out.
  if (dayStart.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) {
    return { slots: [] };
  }

  const existing = await prisma.appointment.findMany({
    where: blockingAppointmentWhere(shop.id, dayStart, dayEnd),
    select: { startTime: true, endTime: true, barberId: true },
  });

  const existingAppointments: ExistingAppointment[] = existing.map((a) => ({
    startTime: a.startTime,
    endTime: a.endTime,
    barberId: a.barberId,
  }));

  const options = findAvailability({
    shop: {
      id: shop.id,
      name: shop.name,
      address: shop.address,
      phone: shop.phone,
      timezone,
      services: shop.services.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
      })),
      barbers: shop.barbers.map((b) => ({
        id: b.id,
        name: b.name,
        workingHours: b.workingHours,
        serviceIds: b.serviceIds,
      })),
      businessHours: shop.businessHours,
      holidays: shop.holidays,
    },
    serviceId: service.id,
    serviceName: service.name,
    serviceDuration: service.duration,
    preferredDate: parsed.data.date,
    barberId: barber?.id,
    existingAppointments,
    limit: 200,
    minLeadMinutes: MIN_LEAD_MINUTES,
  });

  // Collapse to one entry per start time (first free barber wins for "any").
  const seen = new Set<string>();
  const slots: PublicSlot[] = [];
  for (const o of options) {
    if (seen.has(o.startTime)) continue;
    seen.add(o.startTime);
    slots.push({
      startTime: o.startTime,
      label: formatTime(new Date(o.startTime), timezone),
      barberId: o.barberId,
      barberName: o.barberName,
    });
  }
  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return { slots };
}

export type DepositConfirmation = {
  when: string;
  serviceName: string;
  barberName: string;
  clientName: string;
  paid: boolean;
};

/**
 * Read-back for the Stripe return URL. Scoped to the shop so an appointment id
 * from one shop can't be probed through another shop's page.
 */
export async function getDepositConfirmation(
  appointmentId: string,
  barbershopId: string
): Promise<DepositConfirmation | null> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, barbershopId },
    include: { service: true, barber: true, barbershop: true, client: true },
  });
  if (!appointment) return null;

  const timezone = resolveShopTimezone(appointment.barbershop.timezone);
  return {
    when: `${formatShortDate(appointment.startTime, timezone)} at ${formatTime(
      appointment.startTime,
      timezone
    )}`,
    serviceName: appointment.service.name,
    barberName: appointment.barber.name,
    clientName: appointment.clientNameSnapshot ?? appointment.client.name,
    paid: appointment.depositStatus === "PAID",
  };
}

const bookingSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.string().min(1),
  barberId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  /** HH:mm 24-hour, shop-local */
  time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  name: z.string().min(1, "Please enter your name").max(80),
  phone: z.string().min(10, "Please enter a valid phone number").max(20),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
});

export type PublicBookingResult = {
  success?: true;
  error?: string;
  /** Present when a deposit is required — client should redirect here. */
  checkoutUrl?: string;
  appointment?: {
    id: string;
    when: string;
    serviceName: string;
    barberName: string;
    shopName: string;
    clientName: string;
  };
};

/** Creates an appointment from the public page. Re-validates availability server-side. */
export async function createPublicBooking(
  input: unknown
): Promise<PublicBookingResult> {
  const limited = rateLimit(await clientKey("public:book"), 8, 60_000);
  if (!limited.success) {
    return { error: "Too many booking attempts. Please try again in a minute." };
  }

  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const shop = await getPublicShop(parsed.data.slug);
  if (!shop) return { error: "This booking page is not available." };

  const service = shop.services.find((s) => s.id === parsed.data.serviceId);
  if (!service) return { error: "Service not found." };

  // Deposit eligibility is re-checked against the database, never trusted from
  // the client. Also grab the payout account we'd send the money to.
  const shopPayments = await prisma.barbershop.findUnique({
    where: { id: shop.id },
    select: {
      depositsEnabled: true,
      connectStatus: true,
      stripeConnectAccountId: true,
    },
  });
  const connectAccountId = shopPayments?.stripeConnectAccountId ?? null;
  const depositsLive =
    Boolean(shopPayments?.depositsEnabled) &&
    shopPayments?.connectStatus === "ACTIVE" &&
    Boolean(connectAccountId);

  const timezone = shop.timezone;
  const start = combineDateAndTime(parsed.data.date, parsed.data.time, timezone);
  const end = addMinutes(start, service.duration);

  if (start.getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000) {
    return { error: "That time has already passed. Please pick another slot." };
  }

  // Recompute availability at write time so a stale page can't double-book.
  const dayStart = combineDateAndTime(parsed.data.date, "00:00", timezone);
  const dayEnd = combineDateAndTime(parsed.data.date, "23:59", timezone);
  const existing = await prisma.appointment.findMany({
    where: blockingAppointmentWhere(shop.id, dayStart, dayEnd),
    select: { startTime: true, endTime: true, barberId: true },
  });

  const wantsSpecificBarber =
    parsed.data.barberId && parsed.data.barberId !== "any";
  const requestedBarber = wantsSpecificBarber
    ? shop.barbers.find((b) => b.id === parsed.data.barberId)
    : undefined;
  if (wantsSpecificBarber && !requestedBarber) {
    return { error: "Barber not found." };
  }

  const options = findAvailability({
    shop: {
      id: shop.id,
      name: shop.name,
      address: shop.address,
      phone: shop.phone,
      timezone,
      services: shop.services.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
      })),
      barbers: shop.barbers.map((b) => ({
        id: b.id,
        name: b.name,
        workingHours: b.workingHours,
        serviceIds: b.serviceIds,
      })),
      businessHours: shop.businessHours,
      holidays: shop.holidays,
    },
    serviceId: service.id,
    serviceName: service.name,
    serviceDuration: service.duration,
    preferredDate: parsed.data.date,
    preferredTime: parsed.data.time,
    barberId: requestedBarber?.id,
    existingAppointments: existing.map((a) => ({
      startTime: a.startTime,
      endTime: a.endTime,
      barberId: a.barberId,
    })),
    limit: 5,
    minLeadMinutes: MIN_LEAD_MINUTES,
  });

  const slot = options.find(
    (o) => new Date(o.startTime).getTime() === start.getTime()
  );
  if (!slot) {
    return {
      error: "Sorry, that time was just taken. Please choose another slot.",
    };
  }

  const name = sanitizeInput(parsed.data.name);
  const phone = normalizePhone(parsed.data.phone);
  const email = parsed.data.email ? sanitizeInput(parsed.data.email) : null;
  const notes = parsed.data.notes ? sanitizeInput(parsed.data.notes) : null;

  // Reuse an existing client record by phone, but never rename it — the
  // appointment snapshot preserves the name given for this booking.
  let client = await prisma.client.findUnique({
    where: { barbershopId_phone: { barbershopId: shop.id, phone } },
  });
  if (!client) {
    client = await prisma.client.create({
      data: { barbershopId: shop.id, name, phone, email },
    });
  }

  const depositDollars = service.depositAmount
    ? Number(service.depositAmount)
    : 0;
  const requiresDeposit = depositsLive && depositDollars > 0;

  let appointment;
  try {
    appointment = await prisma.appointment.create({
    data: {
      barbershopId: shop.id,
      clientId: client.id,
      barberId: slot.barberId,
      serviceId: service.id,
      startTime: start,
      endTime: end,
      duration: service.duration,
      // A deposit booking is only pencilled in until payment succeeds; the
      // hold keeps the slot reserved during checkout and lapses if abandoned.
      status: requiresDeposit ? "PENDING" : "CONFIRMED",
      depositStatus: requiresDeposit ? "PENDING" : "NONE",
      depositAmount: requiresDeposit ? depositDollars : null,
      holdExpiresAt: requiresDeposit
        ? new Date(Date.now() + HOLD_MINUTES * 60_000)
        : null,
      source: "online",
      notes,
      clientNameSnapshot: name,
      clientPhoneSnapshot: phone,
      clientEmailSnapshot: email,
    },
    });
  } catch (error) {
    // Lost a race with a simultaneous booking — the DB constraint caught it.
    if (isDoubleBookingError(error)) {
      return { error: DOUBLE_BOOKING_MESSAGE };
    }
    throw error;
  }

  const when = `${formatShortDate(start, timezone)} at ${formatTime(start, timezone)}`;

  // Deposit path: hand the customer to Stripe Checkout. The appointment is
  // confirmed by the webhook once payment succeeds.
  if (requiresDeposit) {
    try {
      const checkoutUrl = await createDepositCheckout({
        appointmentId: appointment.id,
        barbershopId: shop.id,
        connectAccountId: connectAccountId!,
        shopName: shop.name,
        shopSlug: shop.slug,
        serviceName: service.name,
        depositDollars,
        customerEmail: email,
      });
      return { success: true, checkoutUrl };
    } catch (error) {
      console.error("[public-booking] deposit checkout failed", error);
      // Don't leave a phantom hold behind if we couldn't start checkout.
      await prisma.appointment.delete({ where: { id: appointment.id } }).catch(() => {});
      return {
        error: "We couldn't start the payment. Please try again in a moment.",
      };
    }
  }

  await prisma.notification.create({
    data: {
      barbershopId: shop.id,
      title: "Online booking",
      message: `${name} booked ${service.name} with ${slot.barberName} online`,
      type: "APPOINTMENT",
      metadata: { appointmentId: appointment.id, source: "online" },
    },
  });

  await sendSms(
    phone,
    buildBookingConfirmationSms(
      name,
      service.name,
      slot.barberName,
      when,
      shop.name
    ),
    shop.id,
    "booking_confirmation",
    appointment.id
  );

  revalidatePath("/dashboard");
  revalidatePath("/calendar");

  return {
    success: true,
    appointment: {
      id: appointment.id,
      when,
      serviceName: service.name,
      barberName: slot.barberName,
      shopName: shop.name,
      clientName: name,
    },
  };
}
