import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { resolveShopTimezone } from "@/lib/datetime";

/**
 * Shop analytics.
 *
 * Deliberately counts revenue from two places, because money reaches a
 * barbershop two ways: booked appointments and walk-ins. Reporting only one
 * understates the shop's actual takings, which is worse than showing nothing.
 */

export type ShopAnalytics = {
  monthLabel: string;
  revenue: number;
  appointmentCount: number;
  walkInCount: number;
  avgTicket: number;
  newClients: number;
  totalClients: number;
  noShowCount: number;
  serviceBreakdown: Array<{ name: string; count: number }>;
  /** Percentage change in revenue vs the previous month, or null when no history. */
  revenueChangePct: number | null;
};

/**
 * Start/end of a month **in the shop's timezone**.
 *
 * Using the server's clock would shift the boundary by hours (Vercel runs UTC),
 * miscounting appointments early on the 1st or late on the last day.
 */
export function monthRange(
  timezone: string,
  now: Date = new Date(),
  monthsAgo = 0
): { start: Date; end: Date; label: string } {
  const year = Number(formatInTimeZone(now, timezone, "yyyy"));
  const month = Number(formatInTimeZone(now, timezone, "MM")); // 1-12

  let targetYear = year;
  let targetMonth = month - monthsAgo;
  while (targetMonth <= 0) {
    targetMonth += 12;
    targetYear -= 1;
  }

  const mm = String(targetMonth).padStart(2, "0");
  const start = fromZonedTime(`${targetYear}-${mm}-01T00:00:00`, timezone);

  let nextYear = targetYear;
  let nextMonth = targetMonth + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const nextMm = String(nextMonth).padStart(2, "0");
  const end = fromZonedTime(`${nextYear}-${nextMm}-01T00:00:00`, timezone);

  return {
    start,
    end,
    label: formatInTimeZone(start, timezone, "MMMM yyyy"),
  };
}

/**
 * Appointments that count as earned revenue.
 *
 * A past appointment that was never explicitly marked COMPLETED still happened
 * — nothing in the app auto-completes them, so requiring that status would
 * report $0 forever. Anything cancelled or a no-show is excluded.
 */
function earnedAppointmentWhere(
  barbershopId: string,
  start: Date,
  end: Date
): Prisma.AppointmentWhereInput {
  return {
    barbershopId,
    startTime: { gte: start, lt: end },
    status: { notIn: ["CANCELLED", "NO_SHOW"] },
  };
}

export async function getShopAnalytics(
  barbershopId: string,
  shopTimezone: string | null | undefined,
  now: Date = new Date()
): Promise<ShopAnalytics> {
  const tz = resolveShopTimezone(shopTimezone);
  const thisMonth = monthRange(tz, now, 0);
  const lastMonth = monthRange(tz, now, 1);

  const [
    appointments,
    lastMonthAppointments,
    queueEntries,
    lastMonthQueue,
    newClients,
    totalClients,
    noShowCount,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...earnedAppointmentWhere(barbershopId, thisMonth.start, thisMonth.end),
        // Only count time that has actually happened.
        startTime: { gte: thisMonth.start, lt: thisMonth.end, lte: now },
      },
      include: { service: { select: { name: true, price: true } } },
    }),
    prisma.appointment.findMany({
      where: earnedAppointmentWhere(barbershopId, lastMonth.start, lastMonth.end),
      include: { service: { select: { price: true } } },
    }),
    prisma.queueEntry.findMany({
      where: {
        barbershopId,
        paymentMethod: { not: "UNPAID" },
        completedAt: { gte: thisMonth.start, lt: thisMonth.end },
      },
      include: { service: { select: { name: true, price: true } } },
    }),
    prisma.queueEntry.findMany({
      where: {
        barbershopId,
        paymentMethod: { not: "UNPAID" },
        completedAt: { gte: lastMonth.start, lt: lastMonth.end },
      },
      select: { paidAmount: true, service: { select: { price: true } } },
    }),
    prisma.client.count({
      where: {
        barbershopId,
        createdAt: { gte: thisMonth.start, lt: thisMonth.end },
      },
    }),
    prisma.client.count({ where: { barbershopId } }),
    prisma.appointment.count({
      where: {
        barbershopId,
        status: "NO_SHOW",
        startTime: { gte: thisMonth.start, lt: thisMonth.end },
      },
    }),
  ]);

  const appointmentRevenue = appointments.reduce(
    (sum, a) => sum + Number(a.service.price),
    0
  );
  // Walk-ins use what was actually collected (includes tips) where we have it.
  const queueRevenue = queueEntries.reduce(
    (sum, q) => sum + Number(q.paidAmount ?? q.service.price),
    0
  );
  const revenue = appointmentRevenue + queueRevenue;

  const lastRevenue =
    lastMonthAppointments.reduce((s, a) => s + Number(a.service.price), 0) +
    lastMonthQueue.reduce(
      (s, q) => s + Number(q.paidAmount ?? q.service.price),
      0
    );

  const totalVisits = appointments.length + queueEntries.length;

  const counts = new Map<string, number>();
  for (const a of appointments) {
    counts.set(a.service.name, (counts.get(a.service.name) ?? 0) + 1);
  }
  for (const q of queueEntries) {
    counts.set(q.service.name, (counts.get(q.service.name) ?? 0) + 1);
  }

  return {
    monthLabel: thisMonth.label,
    revenue,
    appointmentCount: appointments.length,
    walkInCount: queueEntries.length,
    avgTicket: totalVisits > 0 ? revenue / totalVisits : 0,
    newClients,
    totalClients,
    noShowCount,
    serviceBreakdown: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    revenueChangePct:
      lastRevenue > 0
        ? Math.round(((revenue - lastRevenue) / lastRevenue) * 100)
        : null,
  };
}
