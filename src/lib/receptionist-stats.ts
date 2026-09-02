import prisma from "@/lib/db";
import { monthRange } from "@/lib/analytics";
import { resolveShopTimezone } from "@/lib/datetime";

/**
 * What the AI receptionist did this month.
 *
 * This is the shop's answer to "what am I paying $249 for". Every figure here
 * is something that measurably happened — calls the AI picked up, appointments
 * it created, and what those appointments are worth.
 *
 * Deliberately NOT framed as "calls saved" or "revenue recovered". Whether a
 * caller would have rung back, left a voicemail, or gone to the shop next door
 * is unknowable, and a number invented to flatter the product is the fastest
 * way to lose a shop owner who can count.
 */

export type ReceptionistStats = {
  monthLabel: string;
  /** Calls the receptionist picked up and held a conversation on. */
  callsAnswered: number;
  /** Calls that ended with a real appointment in the calendar. */
  callsBooked: number;
  /** Value of those appointments, at list price. */
  bookedValue: number;
  /** Percentage of answered calls that became a booking, or null when none. */
  conversionPct: number | null;
  /** Calls still mid-conversation or abandoned. Shown honestly, not hidden. */
  callsUnfinished: number;
};

/**
 * Share of answered calls that became bookings.
 *
 * Returns null rather than 0 for a month with no calls — "0%" reads as a
 * failure, whereas nothing happened at all.
 */
export function conversionPercent(
  answered: number,
  booked: number
): number | null {
  if (answered <= 0) return null;
  return Math.round((booked / answered) * 100);
}

export async function getReceptionistStats(
  barbershopId: string,
  shopTimezone: string | null | undefined,
  now: Date = new Date()
): Promise<ReceptionistStats> {
  const tz = resolveShopTimezone(shopTimezone);
  const month = monthRange(tz, now, 0);

  const sessions = await prisma.receptionistCallSession.findMany({
    where: {
      barbershopId,
      createdAt: { gte: month.start, lt: month.end },
    },
    select: { appointmentId: true, status: true },
  });

  const bookedIds = sessions
    .map((s) => s.appointmentId)
    .filter((id): id is string => Boolean(id));

  // Price the appointments the AI actually created. Cancelled ones are
  // excluded — a booking the customer called off is not something to bill the
  // receptionist's success against.
  const booked = bookedIds.length
    ? await prisma.appointment.findMany({
        where: { id: { in: bookedIds }, status: { notIn: ["CANCELLED"] } },
        select: { service: { select: { price: true } } },
      })
    : [];

  const bookedValue = booked.reduce(
    (sum, a) => sum + Number(a.service?.price ?? 0),
    0
  );

  const callsAnswered = sessions.length;
  const callsBooked = booked.length;

  return {
    monthLabel: month.label,
    callsAnswered,
    callsBooked,
    bookedValue,
    conversionPct: conversionPercent(callsAnswered, callsBooked),
    callsUnfinished: sessions.filter(
      (s) => s.status === "ACTIVE" || s.status === "AWAITING_CONFIRMATION"
    ).length,
  };
}
