"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/db";
import { requireShopUser, canManageShop } from "@/lib/auth";
import { validateSlug, toSlug } from "@/lib/booking-slug";

/**
 * Changing the shop's public booking link.
 *
 * Its own action rather than part of updateShopSettings, because renaming a
 * shop must not silently repoint the link — see @/lib/booking-slug.
 */

export async function getBookingSlug(): Promise<string | null> {
  const user = await requireShopUser();
  const shop = await prisma.barbershop.findUnique({
    where: { id: user.barbershopId },
    select: { slug: true },
  });
  return shop?.slug ?? null;
}

/** A starting suggestion when the current link is obviously junk. */
export async function suggestBookingSlug(): Promise<string> {
  const user = await requireShopUser();
  const shop = await prisma.barbershop.findUnique({
    where: { id: user.barbershopId },
    select: { name: true },
  });
  return toSlug(shop?.name ?? "");
}

export async function updateBookingSlug(
  raw: string
): Promise<{ success: true; slug: string } | { error: string }> {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) {
    return { error: "Only the shop owner can change the booking link." };
  }

  const check = validateSlug(raw);
  if (!check.ok) return { error: check.error };

  const current = await prisma.barbershop.findUnique({
    where: { id: user.barbershopId },
    select: { slug: true },
  });
  if (current?.slug === check.slug) {
    return { success: true, slug: check.slug };
  }

  const taken = await prisma.barbershop.findUnique({
    where: { slug: check.slug },
    select: { id: true },
  });
  if (taken && taken.id !== user.barbershopId) {
    return { error: "Another shop already uses that link. Try another." };
  }

  await prisma.barbershop.update({
    where: { id: user.barbershopId },
    data: { slug: check.slug },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/queue-code");

  return { success: true, slug: check.slug };
}
