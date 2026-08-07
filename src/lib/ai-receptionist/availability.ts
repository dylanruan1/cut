import { addMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  parseReceptionistDateTime,
  resolveShopTimezone,
} from "@/lib/datetime";
import type { AvailabilityOption, ShopContext } from "./types";

export type ExistingAppointment = {
  startTime: Date;
  endTime: Date;
  barberId: string;
};

export type FindAvailabilityInput = {
  shop: ShopContext;
  serviceId: string;
  serviceName: string;
  serviceDuration: number;
  preferredDate: string;
  preferredTime?: string;
  barberId?: string;
  existingAppointments: ExistingAppointment[];
  /** How many options to return when time is flexible */
  limit?: number;
  /** "Now" instant used to exclude slots already in the past (defaults to current time). */
  now?: Date;
  /** Minimum minutes of lead time before a slot can be booked (default 0). */
  minLeadMinutes?: number;
};

/**
 * Finds available slots for a preferred date/time.
 * Prefer exact preferredTime match; otherwise return nearby open slots.
 * All wall-clock times are interpreted in the shop timezone.
 */
export function findAvailability(input: FindAvailabilityInput): AvailabilityOption[] {
  const {
    shop,
    serviceId,
    serviceName,
    serviceDuration,
    preferredDate,
    preferredTime,
    barberId,
    existingAppointments,
    limit = 5,
    now = new Date(),
    minLeadMinutes = 0,
  } = input;

  const earliestStart = addMinutes(now, minLeadMinutes);
  const timezone = resolveShopTimezone(shop.timezone);
  const dayOfWeek = dayOfWeekInTimezone(preferredDate, timezone);
  const hours = shop.businessHours.find((h) => h.dayOfWeek === dayOfWeek);

  if (!hours || hours.isClosed) {
    return [];
  }

  // Shop-wide closures (holidays) override normal business hours.
  const holiday = shop.holidays?.find((h) => h.date === preferredDate);
  if (holiday?.isClosed) {
    return [];
  }

  const barbers = (
    barberId ? shop.barbers.filter((b) => b.id === barberId) : shop.barbers
  ).filter((b) => barberPerformsService(b, serviceId));

  if (barbers.length === 0) {
    return [];
  }

  const slots = generateDaySlots(
    preferredDate,
    hours.openTime,
    hours.closeTime,
    30,
    timezone
  );
  const options: AvailabilityOption[] = [];

  for (const slotStart of slots) {
    const slotEnd = addMinutes(slotStart, serviceDuration);
    // Never offer a time that has already passed (or is inside the lead window).
    if (slotStart.getTime() < earliestStart.getTime()) {
      continue;
    }
    if (
      !fitsWithinHours(
        slotStart,
        slotEnd,
        preferredDate,
        hours.openTime,
        hours.closeTime,
        timezone
      )
    ) {
      continue;
    }

    if (preferredTime) {
      const preferred = combineDateAndTime(preferredDate, preferredTime, timezone);
      if (slotStart.getTime() !== preferred.getTime()) {
        continue;
      }
    }

    for (const barber of barbers) {
      // A barber can only be booked inside their own working hours.
      if (
        !withinBarberHours(
          barber,
          dayOfWeek,
          slotStart,
          slotEnd,
          preferredDate,
          timezone
        )
      ) {
        continue;
      }

      const conflict = existingAppointments.some(
        (apt) =>
          apt.barberId === barber.id &&
          rangesOverlap(slotStart, slotEnd, apt.startTime, apt.endTime)
      );
      if (conflict) continue;

      options.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        barberId: barber.id,
        barberName: barber.name,
        serviceId,
        serviceName,
      });

      if (options.length >= limit) {
        return options;
      }
    }
  }

  // If exact time wasn't available, surface nearby slots that day
  if (preferredTime && options.length === 0) {
    return findAvailability({
      ...input,
      preferredTime: undefined,
      limit,
    });
  }

  return options;
}

export function isSlotAvailable(
  start: Date,
  end: Date,
  barberId: string,
  existingAppointments: ExistingAppointment[]
): boolean {
  return !existingAppointments.some(
    (apt) =>
      apt.barberId === barberId &&
      rangesOverlap(start, end, apt.startTime, apt.endTime)
  );
}

/**
 * Builds a UTC Date for the given shop-local date + HH:mm.
 * Defaults to America/Los_Angeles when timezone is missing.
 */
export function combineDateAndTime(
  date: string,
  time: string,
  timezone?: string | null
): Date {
  return parseReceptionistDateTime(date, time, timezone);
}

/**
 * Whether a barber performs a given service.
 * A barber with no explicit assignments is treated as performing everything,
 * so shops that never configured this keep working as before.
 */
function barberPerformsService(
  barber: ShopContext["barbers"][number],
  serviceId: string
): boolean {
  if (!barber.serviceIds || barber.serviceIds.length === 0) return true;
  return barber.serviceIds.includes(serviceId);
}

/**
 * Whether a slot fits inside this barber's own schedule for the day.
 * A barber with no configured hours inherits the shop's hours (the caller has
 * already constrained the slot to those), so this returns true.
 */
function withinBarberHours(
  barber: ShopContext["barbers"][number],
  dayOfWeek: number,
  slotStart: Date,
  slotEnd: Date,
  date: string,
  timezone: string
): boolean {
  if (!barber.workingHours || barber.workingHours.length === 0) return true;

  const wh = barber.workingHours.find((h) => h.dayOfWeek === dayOfWeek);
  // No entry for this weekday means the barber doesn't work it.
  if (!wh || wh.isOff) return false;

  const start = combineDateAndTime(date, wh.startTime, timezone);
  const end = combineDateAndTime(date, wh.endTime, timezone);
  return slotStart >= start && slotEnd <= end;
}

function dayOfWeekInTimezone(date: string, timezone: string): number {
  // Noon avoids DST edge cases when reading the weekday in the shop TZ.
  const noonUtc = parseReceptionistDateTime(date, "12:00", timezone);
  return toZonedTime(noonUtc, timezone).getDay();
}

function generateDaySlots(
  date: string,
  openTime: string,
  closeTime: string,
  intervalMinutes: number,
  timezone: string
): Date[] {
  const slots: Date[] = [];
  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  let current = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  while (current < end) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(
      combineDateAndTime(
        date,
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        timezone
      )
    );
    current += intervalMinutes;
  }

  return slots;
}

function fitsWithinHours(
  start: Date,
  end: Date,
  date: string,
  openTime: string,
  closeTime: string,
  timezone: string
): boolean {
  const open = combineDateAndTime(date, openTime, timezone);
  const close = combineDateAndTime(date, closeTime, timezone);
  return start >= open && end <= close;
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}
