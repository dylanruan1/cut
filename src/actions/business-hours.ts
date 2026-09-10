"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/db";
import { requireShopUser, canManageShop } from "@/lib/auth";
import {
  validateWeek,
  toFullWeek,
  type BusinessHourInput,
} from "@/lib/business-hours";

/**
 * Setting the shop's opening hours.
 *
 * Seeded at signup and never writable since. See @/lib/business-hours for the
 * rules.
 *
 * Deliberately not gated behind a plan. Per-barber hours live on the Pro-only
 * Team page, which is why a Starter shop could set no hours at all — shop
 * hours are the one schedule every shop must be able to correct, so this works
 * on every plan.
 */

export type ShopWeek = {
  days: BusinessHourInput[];
};

/** Current opening hours, always as a complete week. */
export async function getBusinessHours(): Promise<ShopWeek> {
  const user = await requireShopUser();

  const hours = await prisma.businessHour.findMany({
    // Scoped to the caller's shop; there is no id parameter to tamper with.
    where: { barbershopId: user.barbershopId },
    select: {
      dayOfWeek: true,
      openTime: true,
      closeTime: true,
      isClosed: true,
    },
    orderBy: { dayOfWeek: "asc" },
  });

  return { days: toFullWeek(hours) };
}

export async function setBusinessHours(
  days: BusinessHourInput[]
): Promise<{ success: true } | { error: string }> {
  const user = await requireShopUser();

  if (!canManageShop(user.role)) {
    return { error: "Only the shop owner can change business hours." };
  }

  const check = validateWeek(days);
  if (!check.ok) return { error: check.error };

  const shop = await prisma.barbershop.findUnique({
    where: { id: user.barbershopId },
    select: { slug: true },
  });
  if (!shop) return { error: "Shop not found." };

  // Upsert per day rather than delete-and-recreate: BusinessHour is unique on
  // (barbershopId, dayOfWeek), so each day has one stable row, and upserting
  // keeps its id — nothing downstream ends up pointing at a row that vanished.
  //
  // One transaction so a half-written week can never reach the availability
  // engine; a shop showing Tuesday's new hours next to Wednesday's old ones is
  // worse than the save failing outright.
  //
  // Existing appointments are untouched. Hours govern which slots are offered
  // from now on; shortening a day never cancels or moves something already
  // booked inside it.
  await prisma.$transaction(
    days.map((d) =>
      prisma.businessHour.upsert({
        where: {
          barbershopId_dayOfWeek: {
            barbershopId: user.barbershopId,
            dayOfWeek: d.dayOfWeek,
          },
        },
        create: {
          barbershopId: user.barbershopId,
          dayOfWeek: d.dayOfWeek,
          openTime: d.openTime,
          closeTime: d.closeTime,
          isClosed: d.isClosed,
        },
        update: {
          openTime: d.openTime,
          closeTime: d.closeTime,
          isClosed: d.isClosed,
        },
      })
    )
  );

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  // The public booking page reads these hours to build its slot grid, so it is
  // the page that would otherwise keep serving yesterday's opening times to
  // customers long after the owner changed them.
  revalidatePath(`/book/${shop.slug}`);

  return { success: true };
}
