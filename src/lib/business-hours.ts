/**
 * Shop-wide opening hours.
 *
 * The BusinessHour table is seeded once at signup (Sunday closed, Monday to
 * Saturday 09:00–18:00) and nothing ever wrote to it again — the Settings tab
 * listed the rows and stopped there. Availability generates slots strictly
 * inside these hours, so every shop in the product was permanently bookable
 * Mon–Sat 9–6 whatever its real trading hours. A shop that opens Sundays, or
 * closes at 8pm, had no way to say so.
 *
 * Same rules as per-barber working hours, different column names: openTime /
 * closeTime / isClosed rather than startTime / endTime / isOff. The time
 * primitives and day names are shared rather than copied — two definitions of
 * "is this a valid time" is one too many.
 *
 * Pure helpers, so the rules are testable without a database.
 */

import { DAY_NAMES, isValidTime, toMinutes } from "@/lib/working-hours";

export { DAY_NAMES, isValidTime, toMinutes };

export type BusinessHourInput = {
  /** 0 = Sunday, matching JS getDay() and the availability engine. */
  dayOfWeek: number;
  /** "HH:mm", 24-hour. */
  openTime: string;
  closeTime: string;
  isClosed: boolean;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validates one day's hours.
 *
 * A day marked closed is always valid — its times are ignored, and forcing an
 * owner to enter sensible times for a day the shop is shut would be a
 * pointless obstacle.
 */
export function validateDay(day: BusinessHourInput): ValidationResult {
  if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6) {
    return { ok: false, error: "Invalid day" };
  }
  if (day.isClosed) return { ok: true };

  const open = toMinutes(day.openTime);
  const close = toMinutes(day.closeTime);
  if (open === null || close === null) {
    return {
      ok: false,
      error: `${DAY_NAMES[day.dayOfWeek]}: times must look like 09:00`,
    };
  }
  if (open >= close) {
    return {
      ok: false,
      error: `${DAY_NAMES[day.dayOfWeek]}: closing must be after opening`,
    };
  }
  return { ok: true };
}

/**
 * Validates a full week.
 *
 * Rejects a week with every day closed. Nobody could ever book that shop, and
 * its booking link would show an empty calendar forever — almost always a slip
 * rather than an intention.
 */
export function validateWeek(days: BusinessHourInput[]): ValidationResult {
  const seen = new Set<number>();
  for (const day of days) {
    if (seen.has(day.dayOfWeek)) {
      return { ok: false, error: `${DAY_NAMES[day.dayOfWeek]} is listed twice` };
    }
    seen.add(day.dayOfWeek);

    const result = validateDay(day);
    if (!result.ok) return result;
  }

  if (days.length > 0 && days.every((d) => d.isClosed)) {
    return {
      ok: false,
      error:
        "Every day is closed, so nobody could ever book. Leave at least one day open.",
    };
  }

  return { ok: true };
}

/**
 * A sensible starting week: Monday to Saturday, 9 to 6, Sunday closed.
 *
 * Matches what onboarding seeds, so a shop that has never opened this editor
 * sees exactly the hours it is already trading under rather than a surprise.
 */
export function defaultWeek(): BusinessHourInput[] {
  return DAY_NAMES.map((_, dayOfWeek) => ({
    dayOfWeek,
    openTime: "09:00",
    closeTime: "18:00",
    isClosed: dayOfWeek === 0,
  }));
}

/**
 * Fills in any missing days from an existing set.
 *
 * Seeding could fail part-way, and a shop created before seeding existed has
 * no rows at all. A partial set would silently mean "closed" for the missing
 * days, so the editor always shows a complete week.
 */
export function toFullWeek(existing: BusinessHourInput[]): BusinessHourInput[] {
  const byDay = new Map(existing.map((d) => [d.dayOfWeek, d]));
  return defaultWeek().map((fallback) => byDay.get(fallback.dayOfWeek) ?? fallback);
}

/** Short human summary, e.g. "09:00–18:00" or "Closed". */
export function describeDay(day: BusinessHourInput): string {
  if (day.isClosed) return "Closed";
  return `${day.openTime}–${day.closeTime}`;
}

/** Count of days the shop is actually open. */
export function openDayCount(days: BusinessHourInput[]): number {
  return days.filter((d) => !d.isClosed).length;
}
