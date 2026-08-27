"use server";

import prisma from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";
import {
  sendSms,
  buildCancellationSms,
  buildRescheduleSms,
} from "@/lib/twilio";
import {
  findAvailability,
  combineDateAndTime,
} from "@/lib/ai-receptionist/availability";
import type { ShopContext } from "@/lib/ai-receptionist/types";
import { canUseCalendar } from "@/lib/subscription";
import {
  isDoubleBookingError,
  DOUBLE_BOOKING_MESSAGE,
} from "@/lib/booking-conflict";
import { formatTime, formatShortDate } from "@/lib/dates";
import { notifyWaitlistForFreedSlot } from "@/lib/waitlist-notify";
import { resolveShopTimezone } from "@/lib/datetime";
import {
  hoursUntil as hoursUntilStart,
  shouldRefundDeposit,
  isCancellable,
} from "@/lib/cancellation-policy";

/**
 * Customer-facing appointment management, reachable without an account via an
 * unguessable token sent in confirmation texts (`/appointment/[token]`).
 *
 * Security: the token is the only credential, so it is never echoed back in
 * responses, lookups are rate limited per IP, and nothing here can read or
 * mutate any record other than the one the token points at.
 */

// NOTE: a "use server" module may only export async functions, so the
// FREE_CANCELLATION_HOURS constant is imported directly from
// @/lib/cancellation-policy by anything that needs it.

export type ManagedAppointment = {
  token: string;
  shopName: string;
  shopPhone: string | null;
  serviceName: string;
  barberName: string;
  when: string;
  startTimeIso: string;
  clientName: string;
  status: string;
  /** Deposit paid on this booking, in dollars. Null when none. */
  depositAmount: number | null;
  depositPaid: boolean;
  /** Whether cancelling right now would refund the deposit. */
  refundIfCancelledNow: boolean;
  cancellable: boolean;
  isPast: boolean;
};

async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return `${prefix}:${ip}`;
}


/**
 * Builds the ShopContext the availability engine needs, including barber
 * schedules, service assignments and holidays — the same data new bookings use,
 * so a reschedule can never land somewhere a fresh booking couldn't.
 */
async function loadShopForAvailability(
  barbershopId: string,
  timezone: string
): Promise<ShopContext | null> {
  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    include: {
      services: { where: { isActive: true } },
      barbers: {
        where: { isActive: true },
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
  if (!shop || !canUseCalendar(shop)) return null;

  return {
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
      workingHours: b.workingHours ?? [],
      serviceIds: (b.services ?? []).map((x) => x.serviceId),
    })),
    businessHours: shop.businessHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isClosed: h.isClosed,
    })),
    holidays: (shop.holidays ?? []).map((h) => ({
      date: h.date.toISOString().slice(0, 10),
      isClosed: h.isClosed,
    })),
  };
}

function hoursUntil(date: Date): number {
  return hoursUntilStart(date);
}

/** Loads a booking by its manage token. Returns null for unknown tokens. */
export async function getManagedAppointment(
  token: string
): Promise<ManagedAppointment | null> {
  const clean = token?.trim();
  if (!clean) return null;

  const limited = rateLimit(await clientKey("manage:view"), 60, 60_000);
  if (!limited.success) return null;

  const appointment = await prisma.appointment.findUnique({
    where: { manageToken: clean },
    include: { service: true, barber: true, barbershop: true, client: true },
  });
  if (!appointment) return null;

  const tz = resolveShopTimezone(appointment.barbershop.timezone);
  const isPast = hoursUntil(appointment.startTime) <= 0;
  const depositPaid = appointment.depositStatus === "PAID";

  return {
    token: clean,
    shopName: appointment.barbershop.name,
    shopPhone: appointment.barbershop.phone,
    serviceName: appointment.service.name,
    barberName: appointment.barber.name,
    when: `${formatShortDate(appointment.startTime, tz)} at ${formatTime(
      appointment.startTime,
      tz
    )}`,
    startTimeIso: appointment.startTime.toISOString(),
    clientName: appointment.clientNameSnapshot ?? appointment.client.name,
    status: appointment.status,
    depositAmount: appointment.depositAmount
      ? Number(appointment.depositAmount)
      : null,
    depositPaid,
    refundIfCancelledNow: shouldRefundDeposit({
      depositStatus: appointment.depositStatus,
      startTime: appointment.startTime,
    }),
    cancellable: isCancellable({
      status: appointment.status,
      startTime: appointment.startTime,
    }),
    isPast,
  };
}

export type RescheduleSlot = {
  startTime: string;
  label: string;
  barberName: string;
};

/**
 * Open slots the customer could move this appointment to.
 *
 * Rescheduling is better for the shop than cancelling — the booking and any
 * deposit survive — so this deliberately reuses the same availability engine
 * (barber hours, holidays, service eligibility, lead time) as new bookings.
 */
export async function getRescheduleOptions(
  token: string,
  date: string
): Promise<{ slots?: RescheduleSlot[]; error?: string }> {
  const clean = token?.trim();
  if (!clean) return { error: "Invalid link." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Invalid date." };

  const limited = rateLimit(await clientKey("manage:slots"), 120, 60_000);
  if (!limited.success) return { error: "Too many requests." };

  const appointment = await prisma.appointment.findUnique({
    where: { manageToken: clean },
    include: { service: true, barbershop: true },
  });
  if (!appointment) return { error: "We couldn't find that appointment." };
  if (!isCancellable({ status: appointment.status, startTime: appointment.startTime })) {
    return { error: "This appointment can no longer be changed." };
  }

  const tz = resolveShopTimezone(appointment.barbershop.timezone);
  const shop = await loadShopForAvailability(appointment.barbershopId, tz);
  if (!shop) return { error: "This shop isn't taking bookings right now." };

  const dayStart = combineDateAndTime(date, "00:00", tz);
  const dayEnd = combineDateAndTime(date, "23:59", tz);

  const existing = await prisma.appointment.findMany({
    where: {
      barbershopId: appointment.barbershopId,
      status: { notIn: ["CANCELLED"] },
      startTime: { gte: dayStart, lte: dayEnd },
      // Ignore this booking's own slot, otherwise it blocks itself.
      NOT: { id: appointment.id },
    },
    select: { startTime: true, endTime: true, barberId: true },
  });

  const options = findAvailability({
    shop,
    serviceId: appointment.serviceId,
    serviceName: appointment.service.name,
    serviceDuration: appointment.duration,
    preferredDate: date,
    // Keep them with the same barber where possible.
    barberId: appointment.barberId,
    existingAppointments: existing.map((a) => ({
      startTime: a.startTime,
      endTime: a.endTime,
      barberId: a.barberId,
    })),
    limit: 200,
    minLeadMinutes: 60,
  });

  const seen = new Set<string>();
  const slots: RescheduleSlot[] = [];
  for (const o of options) {
    if (seen.has(o.startTime)) continue;
    seen.add(o.startTime);
    slots.push({
      startTime: o.startTime,
      label: formatTime(new Date(o.startTime), tz),
      barberName: o.barberName,
    });
  }
  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return { slots };
}

/** Moves the appointment. The deposit rides along — nothing is refunded. */
export async function rescheduleManagedAppointment(input: {
  token: string;
  date: string;
  time: string;
}): Promise<{ success?: true; error?: string; when?: string }> {
  const clean = input.token?.trim();
  if (!clean) return { error: "Invalid link." };

  const limited = rateLimit(await clientKey("manage:reschedule"), 10, 60_000);
  if (!limited.success) return { error: "Too many attempts. Try again shortly." };

  const appointment = await prisma.appointment.findUnique({
    where: { manageToken: clean },
    include: { service: true, barber: true, barbershop: true, client: true },
  });
  if (!appointment) return { error: "We couldn't find that appointment." };
  if (!isCancellable({ status: appointment.status, startTime: appointment.startTime })) {
    return { error: "This appointment can no longer be changed." };
  }

  const tz = resolveShopTimezone(appointment.barbershop.timezone);
  const start = combineDateAndTime(input.date, input.time, tz);
  const end = new Date(start.getTime() + appointment.duration * 60_000);

  if (start.getTime() < Date.now() + 60 * 60_000) {
    return { error: "Please choose a time at least an hour from now." };
  }

  // Re-check availability at write time so a stale page can't double-book.
  const shop = await loadShopForAvailability(appointment.barbershopId, tz);
  if (!shop) return { error: "This shop isn't taking bookings right now." };

  const dayStart = combineDateAndTime(input.date, "00:00", tz);
  const dayEnd = combineDateAndTime(input.date, "23:59", tz);
  const existing = await prisma.appointment.findMany({
    where: {
      barbershopId: appointment.barbershopId,
      status: { notIn: ["CANCELLED"] },
      startTime: { gte: dayStart, lte: dayEnd },
      NOT: { id: appointment.id },
    },
    select: { startTime: true, endTime: true, barberId: true },
  });

  const options = findAvailability({
    shop,
    serviceId: appointment.serviceId,
    serviceName: appointment.service.name,
    serviceDuration: appointment.duration,
    preferredDate: input.date,
    preferredTime: input.time,
    barberId: appointment.barberId,
    existingAppointments: existing.map((a) => ({
      startTime: a.startTime,
      endTime: a.endTime,
      barberId: a.barberId,
    })),
    limit: 5,
    minLeadMinutes: 60,
  });

  const slot = options.find(
    (o) => new Date(o.startTime).getTime() === start.getTime()
  );
  if (!slot) {
    return { error: "That time isn't available anymore. Please pick another." };
  }

  try {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { startTime: start, endTime: end, barberId: slot.barberId },
    });
  } catch (error) {
    if (isDoubleBookingError(error)) {
      return { error: DOUBLE_BOOKING_MESSAGE };
    }
    throw error;
  }

  const when = `${formatShortDate(start, tz)} at ${formatTime(start, tz)}`;
  const clientName = appointment.clientNameSnapshot ?? appointment.client.name;

  await prisma.notification.create({
    data: {
      barbershopId: appointment.barbershopId,
      title: "Appointment rescheduled",
      message: `${clientName} moved their ${appointment.service.name} to ${when}`,
      type: "APPOINTMENT",
      metadata: { appointmentId: appointment.id, source: "customer" },
    },
  });

  await sendSms(
    appointment.clientPhoneSnapshot ?? appointment.client.phone,
    buildRescheduleSms(
      clientName,
      appointment.service.name,
      when,
      appointment.barbershop.name
    ),
    appointment.barbershopId,
    "reschedule",
    appointment.id
  );

  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { success: true, when };
}

export type CancelResult = {
  success?: true;
  error?: string;
  /** True when a deposit was refunded as part of this cancellation. */
  refunded?: boolean;
};

/** Cancels a booking via its token, refunding the deposit when eligible. */
export async function cancelManagedAppointment(
  token: string
): Promise<CancelResult> {
  const clean = token?.trim();
  if (!clean) return { error: "Invalid link." };

  const limited = rateLimit(await clientKey("manage:cancel"), 10, 60_000);
  if (!limited.success) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const appointment = await prisma.appointment.findUnique({
    where: { manageToken: clean },
    include: { service: true, barber: true, barbershop: true, client: true },
  });
  if (!appointment) return { error: "We couldn't find that appointment." };

  if (appointment.status === "CANCELLED") {
    return { success: true, refunded: false }; // idempotent
  }
  if (appointment.status === "COMPLETED") {
    return { error: "That appointment has already happened." };
  }
  if (hoursUntil(appointment.startTime) <= 0) {
    return {
      error:
        "That appointment time has already passed. Please call the shop if you need help.",
    };
  }

  const eligibleForRefund = shouldRefundDeposit({
    depositStatus: appointment.depositStatus,
    startTime: appointment.startTime,
  });

  let refunded = false;
  if (eligibleForRefund && appointment.stripePaymentIntentId) {
    try {
      const stripe = getStripe();
      if (stripe) {
        await stripe.refunds.create({
          payment_intent: appointment.stripePaymentIntentId,
          // Destination charge: pull the money back out of the shop's account
          // and hand back our platform fee too.
          reverse_transfer: true,
          refund_application_fee: true,
        });
        refunded = true;
      }
    } catch (error) {
      // A refund failure must not block the cancellation — the slot still needs
      // freeing. The shop can refund manually from Stripe.
      console.error("[manage-booking] refund failed", {
        appointmentId: appointment.id,
        error,
      });
    }
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status: "CANCELLED",
      depositStatus: refunded ? "REFUNDED" : appointment.depositStatus,
      holdExpiresAt: null,
    },
  });

  const tz = resolveShopTimezone(appointment.barbershop.timezone);
  const when = `${formatShortDate(appointment.startTime, tz)} at ${formatTime(
    appointment.startTime,
    tz
  )}`;
  const clientName = appointment.clientNameSnapshot ?? appointment.client.name;

  await prisma.notification.create({
    data: {
      barbershopId: appointment.barbershopId,
      title: "Appointment cancelled",
      message: `${clientName} cancelled their ${appointment.service.name} on ${when}${
        refunded ? " (deposit refunded)" : ""
      }`,
      type: "APPOINTMENT",
      metadata: { appointmentId: appointment.id, source: "customer" },
    },
  });

  await sendSms(
    appointment.clientPhoneSnapshot ?? appointment.client.phone,
    buildCancellationSms(
      clientName,
      appointment.service.name,
      when,
      appointment.barbershop.name
    ),
    appointment.barbershopId,
    "cancellation",
    appointment.id
  );

  // The slot is bookable again the moment the status flips, but nobody knows
  // unless we say so — which is how a cancelled Saturday afternoon quietly
  // becomes a haircut that never happens. Best-effort: never let a failed
  // notification turn a successful cancellation into an error.
  await notifyWaitlistForFreedSlot({
    barbershopId: appointment.barbershopId,
    startTime: appointment.startTime,
    barberId: appointment.barberId,
    serviceId: appointment.serviceId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/calendar");

  return { success: true, refunded };
}
