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

  const [services, barbers, businessHours] = await Promise.all([
    prisma.service.findMany({
      where: { barbershopId: barbershop.id, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, duration: true },
    }),
    prisma.barber.findMany({
      where: { barbershopId: barbershop.id, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.businessHour.findMany({
      where: { barbershopId: barbershop.id },
      orderBy: { dayOfWeek: "asc" },
    }),
  ]);

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
      })),
      barbers,
      businessHours: businessHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      })),
    },
  };
}
