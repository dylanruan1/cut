"use server";

import prisma from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";
import { sendSms, buildCancellationSms } from "@/lib/twilio";
import { formatTime, formatShortDate } from "@/lib/dates";
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

  revalidatePath("/dashboard");
  revalidatePath("/calendar");

  return { success: true, refunded };
}
