"use server";

import { z } from "zod";
import { headers } from "next/headers";
import prisma from "@/lib/db";
import { rateLimit, sanitizeInput } from "@/lib/rate-limit";

/**
 * Joining the cancellation waitlist.
 *
 * Offered at the moment someone finds a day full — that's when they care, and
 * asking later gets ignored.
 */

const joinSchema = z.object({
  slug: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  /** Empty string means "any barber". */
  barberId: z.string().trim().optional(),
  /** Shop-local calendar day, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  timePreference: z.enum(["MORNING", "AFTERNOON", "EVENING", "ANY"]),
  clientName: z.string().trim().min(1, "We need a name").max(100),
  clientPhone: z
    .string()
    .trim()
    .min(7, "That phone number looks too short")
    .max(30),
});

export async function joinWaitlist(input: {
  slug: string;
  serviceId: string;
  barberId?: string;
  date: string;
  timePreference: string;
  clientName: string;
  clientPhone: string;
}): Promise<{ success: true } | { error: string }> {
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Check the form" };
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const limited = rateLimit(`waitlist:${ip}`, 10, 10 * 60_000);
  if (!limited.success) {
    return { error: "Too many requests. Try again in a few minutes." };
  }

  const d = parsed.data;

  const shop = await prisma.barbershop.findUnique({
    where: { slug: d.slug.toLowerCase() },
    select: { id: true },
  });
  if (!shop) return { error: "Shop not found" };

  // Same person, same day, already waiting — don't create a duplicate that
  // would text them twice for one opening.
  const existing = await prisma.waitlistEntry.findFirst({
    where: {
      barbershopId: shop.id,
      date: d.date,
      clientPhone: d.clientPhone,
      status: "WAITING",
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.waitlistEntry.update({
      where: { id: existing.id },
      data: {
        timePreference: d.timePreference,
        barberId: d.barberId || null,
        serviceId: d.serviceId,
      },
    });
    return { success: true };
  }

  await prisma.waitlistEntry.create({
    data: {
      barbershopId: shop.id,
      serviceId: d.serviceId,
      barberId: d.barberId || null,
      date: d.date,
      timePreference: d.timePreference,
      clientName: sanitizeInput(d.clientName),
      clientPhone: d.clientPhone,
    },
  });

  return { success: true };
}
