"use server";

import { z } from "zod";
import prisma from "@/lib/db";
import { addMinutes } from "date-fns";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { rateLimit, sanitizeInput } from "@/lib/rate-limit";
import { normalizePhone, sendSms, buildBookingConfirmationSms } from "@/lib/twilio";
import { formatTime, formatShortDate } from "@/lib/dates";
import { resolveShopTimezone } from "@/lib/datetime";
import {
  findAvailability,
  combineDateAndTime,
  type ExistingAppointment,
} from "@/lib/ai-receptionist/availability";
import { canUseCalendar } from "@/lib/subscription";

/**
 * Public (unauthenticated) booking actions for the customer-facing page at
 * /book/[slug].
 *
 * Security notes — this is the only part of the app reachable without login:
 *  - every action is rate limited per client IP
 *  - the shop is always resolved by slug; no shop id is ever trusted from input
 *  - only ACTIVE services/barbers of that shop can be selected
 *  - availability is recomputed server-side at booking time, so a stale or
 *    hand-crafted slot cannot double-book
 *  - shops without an active plan do not expose booking at all
 */

const MIN_LEAD_MINUTES = 30;
const MAX_DAYS_AHEAD = 60;

export type PublicShop = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  instagram: string | null;
  timezone: string;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    duration: number;
    price: string;
  }>;
  barbers: Array<{ id: string; name: string; photoUrl: string | null }>;
  businessHours: Array<{
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }>;
};

async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return `${prefix}:${ip}`;
}

/** Loads a shop's public booking profile by slug. Returns null when unavailable. */
export async function getPublicShop(slug: string): Promise<PublicShop | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;

  const shop = await prisma.barbershop.findUnique({
    where: { slug: clean },
    include: {
      services: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      barbers: { where: { isActive: true }, orderBy: { name: "asc" } },
      businessHours: true,
    },
  });

  if (!shop) return null;
  // Unpaid/cancelled shops don't get a public booking page.
  if (!canUseCalendar(shop)) return null;
  if (shop.services.length === 0 || shop.barbers.length === 0) return null;

  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    address: shop.address,
    phone: shop.phone,
    instagram: shop.instagram,
    timezone: resolveShopTimezone(shop.timezone),
    services: shop.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      duration: s.duration,
      price: s.price.toString(),
    })),
    barbers: shop.barbers.map((b) => ({
      id: b.id,
      name: b.name,
      photoUrl: b.photoUrl,
    })),
    businessHours: shop.businessHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isClosed: h.isClosed,
    })),
  };
}

const slotsSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.string().min(1),
  /** YYYY-MM-DD in shop-local time */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  /** Omit or "any" for no preference */
  barberId: z.string().optional(),
});

export type PublicSlot = {
  startTime: string;
  label: string;
  barberId: string;
  barberName: string;
};

/** Returns bookable start times for a given service/date (and optional barber). */
export async function getPublicAvailability(input: unknown): Promise<{
  slots?: PublicSlot[];
  error?: string;
}> {
  const limited = rateLimit(await clientKey("public:slots"), 120, 60_000);
  if (!limited.success) return { error: "Too many requests. Please slow down." };

  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const shop = await getPublicShop(parsed.data.slug);
  if (!shop) return { error: "This booking page is not available." };

  const service = shop.services.find((s) => s.id === parsed.data.serviceId);
  if (!service) return { error: "Service not found." };

  const wantsSpecificBarber =
    parsed.data.barberId && parsed.data.barberId !== "any";
  const barber = wantsSpecificBarber
    ? shop.barbers.find((b) => b.id === parsed.data.barberId)
    : undefined;
  if (wantsSpecificBarber && !barber) return { error: "Barber not found." };

  const timezone = shop.timezone;
  const dayStart = combineDateAndTime(parsed.data.date, "00:00", timezone);
  const dayEnd = combineDateAndTime(parsed.data.date, "23:59", timezone);

  // Don't allow browsing arbitrarily far out.
  if (dayStart.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) {
    return { slots: [] };
  }

  const existing = await prisma.appointment.findMany({
    where: {
      barbershopId: shop.id,
      status: { notIn: ["CANCELLED"] },
      startTime: { gte: dayStart, lte: dayEnd },
    },
    select: { startTime: true, endTime: true, barberId: true },
  });

  const existingAppointments: ExistingAppointment[] = existing.map((a) => ({
    startTime: a.startTime,
    endTime: a.endTime,
    barberId: a.barberId,
  }));

  const options = findAvailability({
    shop: {
      id: shop.id,
      name: shop.name,
      address: shop.address,
      phone: shop.phone,
      timezone,
      services: shop.services.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
      })),
      barbers: shop.barbers.map((b) => ({ id: b.id, name: b.name })),
      businessHours: shop.businessHours,
    },
    serviceId: service.id,
    serviceName: service.name,
    serviceDuration: service.duration,
    preferredDate: parsed.data.date,
    barberId: barber?.id,
    existingAppointments,
    limit: 200,
    minLeadMinutes: MIN_LEAD_MINUTES,
  });

  // Collapse to one entry per start time (first free barber wins for "any").
  const seen = new Set<string>();
  const slots: PublicSlot[] = [];
  for (const o of options) {
    if (seen.has(o.startTime)) continue;
    seen.add(o.startTime);
    slots.push({
      startTime: o.startTime,
      label: formatTime(new Date(o.startTime), timezone),
      barberId: o.barberId,
      barberName: o.barberName,
    });
  }
  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return { slots };
}

const bookingSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.string().min(1),
  barberId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  /** HH:mm 24-hour, shop-local */
  time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  name: z.string().min(1, "Please enter your name").max(80),
  phone: z.string().min(10, "Please enter a valid phone number").max(20),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
});

export type PublicBookingResult = {
  success?: true;
  error?: string;
  appointment?: {
    id: string;
    when: string;
    serviceName: string;
    barberName: string;
    shopName: string;
    clientName: string;
  };
};

/** Creates an appointment from the public page. Re-validates availability server-side. */
export async function createPublicBooking(
  input: unknown
): Promise<PublicBookingResult> {
  const limited = rateLimit(await clientKey("public:book"), 8, 60_000);
  if (!limited.success) {
    return { error: "Too many booking attempts. Please try again in a minute." };
  }

  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const shop = await getPublicShop(parsed.data.slug);
  if (!shop) return { error: "This booking page is not available." };

  const service = shop.services.find((s) => s.id === parsed.data.serviceId);
  if (!service) return { error: "Service not found." };

  const timezone = shop.timezone;
  const start = combineDateAndTime(parsed.data.date, parsed.data.time, timezone);
  const end = addMinutes(start, service.duration);

  if (start.getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000) {
    return { error: "That time has already passed. Please pick another slot." };
  }

  // Recompute availability at write time so a stale page can't double-book.
  const dayStart = combineDateAndTime(parsed.data.date, "00:00", timezone);
  const dayEnd = combineDateAndTime(parsed.data.date, "23:59", timezone);
  const existing = await prisma.appointment.findMany({
    where: {
      barbershopId: shop.id,
      status: { notIn: ["CANCELLED"] },
      startTime: { gte: dayStart, lte: dayEnd },
    },
    select: { startTime: true, endTime: true, barberId: true },
  });

  const wantsSpecificBarber =
    parsed.data.barberId && parsed.data.barberId !== "any";
  const requestedBarber = wantsSpecificBarber
    ? shop.barbers.find((b) => b.id === parsed.data.barberId)
    : undefined;
  if (wantsSpecificBarber && !requestedBarber) {
    return { error: "Barber not found." };
  }

  const options = findAvailability({
    shop: {
      id: shop.id,
      name: shop.name,
      address: shop.address,
      phone: shop.phone,
      timezone,
      services: shop.services.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
      })),
      barbers: shop.barbers.map((b) => ({ id: b.id, name: b.name })),
      businessHours: shop.businessHours,
    },
    serviceId: service.id,
    serviceName: service.name,
    serviceDuration: service.duration,
    preferredDate: parsed.data.date,
    preferredTime: parsed.data.time,
    barberId: requestedBarber?.id,
    existingAppointments: existing.map((a) => ({
      startTime: a.startTime,
      endTime: a.endTime,
      barberId: a.barberId,
    })),
    limit: 5,
    minLeadMinutes: MIN_LEAD_MINUTES,
  });

  const slot = options.find(
    (o) => new Date(o.startTime).getTime() === start.getTime()
  );
  if (!slot) {
    return {
      error: "Sorry, that time was just taken. Please choose another slot.",
    };
  }

  const name = sanitizeInput(parsed.data.name);
  const phone = normalizePhone(parsed.data.phone);
  const email = parsed.data.email ? sanitizeInput(parsed.data.email) : null;
  const notes = parsed.data.notes ? sanitizeInput(parsed.data.notes) : null;

  // Reuse an existing client record by phone, but never rename it — the
  // appointment snapshot preserves the name given for this booking.
  let client = await prisma.client.findUnique({
    where: { barbershopId_phone: { barbershopId: shop.id, phone } },
  });
  if (!client) {
    client = await prisma.client.create({
      data: { barbershopId: shop.id, name, phone, email },
    });
  }

  const appointment = await prisma.appointment.create({
    data: {
      barbershopId: shop.id,
      clientId: client.id,
      barberId: slot.barberId,
      serviceId: service.id,
      startTime: start,
      endTime: end,
      duration: service.duration,
      status: "CONFIRMED",
      source: "online",
      notes,
      clientNameSnapshot: name,
      clientPhoneSnapshot: phone,
      clientEmailSnapshot: email,
    },
  });

  const when = `${formatShortDate(start, timezone)} at ${formatTime(start, timezone)}`;

  await prisma.notification.create({
    data: {
      barbershopId: shop.id,
      title: "Online booking",
      message: `${name} booked ${service.name} with ${slot.barberName} online`,
      type: "APPOINTMENT",
      metadata: { appointmentId: appointment.id, source: "online" },
    },
  });

  await sendSms(
    phone,
    buildBookingConfirmationSms(
      name,
      service.name,
      slot.barberName,
      when,
      shop.name
    ),
    shop.id,
    "booking_confirmation",
    appointment.id
  );

  revalidatePath("/dashboard");
  revalidatePath("/calendar");

  return {
    success: true,
    appointment: {
      id: appointment.id,
      when,
      serviceName: service.name,
      barberName: slot.barberName,
      shopName: shop.name,
      clientName: name,
    },
  };
}
