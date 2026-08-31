"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/db";
import { requireShopUser, canManageShop } from "@/lib/auth";
import {
  validateWeek,
  toFullWeek,
  type WorkingHourInput,
} from "@/lib/working-hours";

/**
 * Setting a barber's weekly hours.
 *
 * Availability has always enforced these; nothing could set them. See
 * @/lib/working-hours for the rules.
 */

export type BarberWeek = {
  barberId: string;
  barberName: string;
  days: WorkingHourInput[];
};

/** Current hours for one barber, always as a complete week. */
export async function getBarberWeek(barberId: string): Promise<BarberWeek | null> {
  const user = await requireShopUser();

  const barber = await prisma.barber.findFirst({
    // Scoped to the caller's shop so a barber id from another shop returns
    // nothing rather than leaking its schedule.
    where: { id: barberId, barbershopId: user.barbershopId },
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
    },
  });
  if (!barber) return null;

  return {
    barberId: barber.id,
    barberName: barber.name,
    days: toFullWeek(barber.workingHours),
  };
}

export async function setBarberWorkingHours(
  barberId: string,
  days: WorkingHourInput[]
): Promise<{ success: true } | { error: string }> {
  const user = await requireShopUser();

  if (!canManageShop(user.role)) {
    return { error: "Only the shop owner can change working hours." };
  }

  const barber = await prisma.barber.findFirst({
    where: { id: barberId, barbershopId: user.barbershopId },
    select: { id: true },
  });
  if (!barber) return { error: "Barber not found." };

  const check = validateWeek(days);
  if (!check.ok) return { error: check.error };

  // Replace the week wholesale. Upserting day by day would leave orphaned rows
  // for any day dropped from the input, and a stale row here silently blocks
  // bookings — the worst kind of bug to chase.
  await prisma.$transaction([
    prisma.workingHour.deleteMany({ where: { barberId } }),
    prisma.workingHour.createMany({
      data: days.map((d) => ({
        barberId,
        dayOfWeek: d.dayOfWeek,
        startTime: d.startTime,
        endTime: d.endTime,
        isOff: d.isOff,
      })),
    }),
  ]);

  revalidatePath("/team");
  revalidatePath("/calendar");

  return { success: true };
}
