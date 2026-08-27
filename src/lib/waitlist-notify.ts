import prisma from "@/lib/db";
import { sendSms } from "@/lib/twilio";
import { formatShortDate, formatTime } from "@/lib/dates";
import { resolveShopTimezone } from "@/lib/datetime";
import { getAppUrl } from "@/lib/stripe";
import {
  matchingWaiters,
  buildWaitlistSms,
  localDateKey,
  type TimePreference,
} from "@/lib/waitlist";

/**
 * Tells waiting customers that a slot has opened.
 *
 * Called after a cancellation. Everything here is best-effort: a failed text
 * must never turn a successful cancellation into an error for the person who
 * cancelled. They did nothing wrong and their action already succeeded.
 */
export async function notifyWaitlistForFreedSlot(input: {
  barbershopId: string;
  startTime: Date;
  barberId: string | null;
  serviceId: string;
}): Promise<{ notified: number }> {
  try {
    const shop = await prisma.barbershop.findUnique({
      where: { id: input.barbershopId },
      select: { name: true, slug: true, timezone: true },
    });
    if (!shop) return { notified: 0 };

    const tz = resolveShopTimezone(shop.timezone);
    const day = localDateKey(input.startTime, tz);

    // Only people still waiting for that shop-local day. Narrowed in SQL so a
    // busy shop isn't loading its whole waitlist on every cancellation.
    const rows = await prisma.waitlistEntry.findMany({
      where: {
        barbershopId: input.barbershopId,
        date: day,
        status: "WAITING",
      },
      orderBy: { createdAt: "asc" },
    });
    if (rows.length === 0) return { notified: 0 };

    const matches = matchingWaiters(
      {
        startTime: input.startTime,
        barberId: input.barberId,
        serviceId: input.serviceId,
      },
      rows.map((r) => ({
        id: r.id,
        barberId: r.barberId,
        serviceId: r.serviceId,
        date: r.date,
        timePreference: r.timePreference as TimePreference,
      })),
      tz
    );
    if (matches.length === 0) return { notified: 0 };

    const whenLabel = `${formatShortDate(input.startTime, tz)} at ${formatTime(
      input.startTime,
      tz
    )}`;
    const bookingUrl = `${getAppUrl().replace(/\/$/, "")}/book/${shop.slug}`;

    const byId = new Map(rows.map((r) => [r.id, r]));
    let notified = 0;

    for (const match of matches) {
      const row = byId.get(match.id);
      if (!row) continue;

      const result = await sendSms(
        row.clientPhone,
        buildWaitlistSms(row.clientName, shop.name, whenLabel, bookingUrl),
        input.barbershopId,
        "booking_confirmation"
      );

      // Mark NOTIFIED only when the message actually went out. If SMS is down
      // — as it is until A2P clears — the entry stays WAITING so the next
      // cancellation gives them another chance rather than silently dropping
      // them.
      if (result.success) {
        await prisma.waitlistEntry.update({
          where: { id: row.id },
          data: { status: "NOTIFIED", notifiedAt: new Date() },
        });
        notified += 1;
      }
    }

    return { notified };
  } catch (error) {
    console.error("[waitlist] notify failed", error);
    return { notified: 0 };
  }
}
