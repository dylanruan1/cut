/**
 * Per-barber working hours.
 *
 * The WorkingHour table and the availability engine that reads it both existed
 * from early on, but nothing ever wrote a row — so `barber.workingHours` was
 * always empty and every barber fell through to the "no hours set means always
 * available" fallback. A barber who works Thursday to Saturday was bookable on
 * Monday morning.
 *
 * Pure helpers, so the rules are testable without a database.
 */

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type WorkingHourInput = {
  /** 0 = Sunday, matching JS getDay() and the availability engine. */
  dayOfWeek: number;
  /** "HH:mm", 24-hour. */
  startTime: string;
  endTime: string;
  isOff: boolean;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Minutes since midnight, or null when the string isn't a valid time. */
export function toMinutes(value: string): number | null {
  if (!isValidTime(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validates one day's hours.
 *
 * A day marked off is always valid — its times are ignored, and forcing
 * someone to enter sensible times for a day they don't work would be a
 * pointless obstacle.
 */
export function validateDay(day: WorkingHourInput): ValidationResult {
  if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6) {
    return { ok: false, error: "Invalid day" };
  }
  if (day.isOff) return { ok: true };

  const start = toMinutes(day.startTime);
  const end = toMinutes(day.endTime);
  if (start === null || end === null) {
    return {
      ok: false,
      error: `${DAY_NAMES[day.dayOfWeek]}: times must look like 09:00`,
    };
  }
  if (start >= end) {
    return {
      ok: false,
      error: `${DAY_NAMES[day.dayOfWeek]}: finish must be after start`,
    };
  }
  return { ok: true };
}

/**
 * Validates a full week.
 *
 * Rejects a week with every day off. That barber can never be booked, which is
 * almost always a mistake rather than an intention — and if they really have
 * left, deactivating them is the honest way to say so.
 */
export function validateWeek(days: WorkingHourInput[]): ValidationResult {
  const seen = new Set<number>();
  for (const day of days) {
    if (seen.has(day.dayOfWeek)) {
      return { ok: false, error: `${DAY_NAMES[day.dayOfWeek]} is listed twice` };
    }
    seen.add(day.dayOfWeek);

    const result = validateDay(day);
    if (!result.ok) return result;
  }

  if (days.length > 0 && days.every((d) => d.isOff)) {
    return {
      ok: false,
      error:
        "Every day is off, so nobody could ever book. Deactivate the barber instead.",
    };
  }

  return { ok: true };
}

/**
 * A sensible starting week: Monday to Saturday, 9 to 6, Sunday off.
 *
 * Mirrors what onboarding seeds for shop hours, so a barber's default lines up
 * with the shop's rather than contradicting it.
 */
export function defaultWeek(): WorkingHourInput[] {
  return DAY_NAMES.map((_, dayOfWeek) => ({
    dayOfWeek,
    startTime: "09:00",
    endTime: "18:00",
    isOff: dayOfWeek === 0,
  }));
}

/**
 * Fills in any missing days from an existing set.
 *
 * A barber saved before this feature existed has no rows at all; a partial set
 * would silently mean "unavailable" for the missing days once rows exist, so
 * the editor always shows a complete week.
 */
export function toFullWeek(existing: WorkingHourInput[]): WorkingHourInput[] {
  const byDay = new Map(existing.map((d) => [d.dayOfWeek, d]));
  return defaultWeek().map((fallback) => byDay.get(fallback.dayOfWeek) ?? fallback);
}

/** Short human summary, e.g. "Mon–Sat 9:00–18:00" or "Off". */
export function describeDay(day: WorkingHourInput): string {
  if (day.isOff) return "Off";
  return `${day.startTime}–${day.endTime}`;
}

/** Count of days the barber actually works. */
export function workingDayCount(days: WorkingHourInput[]): number {
  return days.filter((d) => !d.isOff).length;
}
