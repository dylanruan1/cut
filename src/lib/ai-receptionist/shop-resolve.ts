import prisma from "@/lib/db";
import {
  findBarbershopByTwilioTo,
  findDevFallbackBarbershop,
} from "@/lib/barbershop";
import type { ShopContext } from "@/lib/ai-receptionist/types";

export const UNCONNECTED_NUMBER_MESSAGE =
  "Sorry, this phone number is not connected to a barbershop yet. Goodbye.";

/**
 * Resolve shop for an inbound Twilio To number.
 * Unmatched numbers return null (unless a logged local-dev fallback applies).
 */
export async function resolveShopForTwilioTo(
  toNumber: string
): Promise<{ shop: ShopContext | null; unmatched: boolean }> {
  let barbershop = await findBarbershopByTwilioTo(toNumber);

  if (!barbershop) {
    console.warn("[twilio] To number not matched to any barbershop.twilioPhone", {
      to: toNumber,
    });
    barbershop = await findDevFallbackBarbershop(toNumber);
    if (!barbershop) {
      return { shop: null, unmatched: true };
    }
  }

  const [services, barbers, businessHours, holidays] = await Promise.all([
    prisma.service.findMany({
      where: { barbershopId: barbershop.id, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, duration: true, depositAmount: true },
    }),
    prisma.barber.findMany({
      where: { barbershopId: barbershop.id, isActive: true },
      select: {
        id: true,
        name: true,
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
    }),
    prisma.businessHour.findMany({
      where: { barbershopId: barbershop.id },
      orderBy: { dayOfWeek: "asc" },
    }),
    // Only upcoming closures matter for booking.
    prisma.holiday.findMany({
      where: {
        barbershopId: barbershop.id,
        date: { gte: new Date(Date.now() - 86_400_000) },
      },
      select: { date: true, isClosed: true },
    }),
  ]);

  // Deposits are only real when the shop has switched them on and its payout
  // account can actually accept charges.
  const depositsLive =
    barbershop.depositsEnabled &&
    barbershop.connectStatus === "ACTIVE" &&
    Boolean(barbershop.stripeConnectAccountId);

  return {
    unmatched: false,
    shop: {
      id: barbershop.id,
      name: barbershop.name,
      address: barbershop.address,
      phone: barbershop.phone,
      timezone: barbershop.timezone || "America/Los_Angeles",
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
        // Only surfaced to the caller when the shop can actually charge it.
        depositAmount:
          depositsLive && s.depositAmount ? Number(s.depositAmount) : null,
      })),
      barbers: barbers.map((b) => ({
        id: b.id,
        name: b.name,
        // Defensive: a missing relation must never crash an in-progress call.
        // Empty means "no restriction", matching findAvailability's fallback.
        workingHours: b.workingHours ?? [],
        serviceIds: (b.services ?? []).map((s) => s.serviceId),
      })),
      businessHours: businessHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      })),
      holidays: holidays.map((h) => ({
        date: toDateKey(h.date),
        isClosed: h.isClosed,
      })),
    },
  };
}

/** Prisma @db.Date comes back as a Date at UTC midnight — take the calendar day. */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
