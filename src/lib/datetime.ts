import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Default shop timezone when none is configured. */
export const DEFAULT_SHOP_TIMEZONE = "America/Los_Angeles";

export function resolveShopTimezone(timezone?: string | null): string {
  const trimmed = timezone?.trim();
  return trimmed || DEFAULT_SHOP_TIMEZONE;
}

/**
 * Interprets a wall-clock date (YYYY-MM-DD) + time (HH:mm) in the shop timezone
 * and returns the UTC `Date` to store in the database.
 *
 * Example: ("2026-07-14", "16:00", "America/Los_Angeles") → 4:00 PM Pacific.
 * Does not use the server's local timezone as the intended wall clock.
 */
export function parseReceptionistDateTime(
  dateText: string,
  timeText: string,
  timezone?: string | null
): Date {
  const tz = resolveShopTimezone(timezone);
  const date = dateText.trim();
  const time = normalizeTimeText(timeText);
  const [year, month, day] = date.split("-").map((part) => parseInt(part, 10));
  const [hour, minute] = time.split(":").map((part) => parseInt(part, 10));

  if (
    [year, month, day, hour, minute].some((n) => Number.isNaN(n)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Invalid receptionist date/time: ${dateText} ${timeText}`);
  }

  // Explicit digits → fromZonedTime. The library treats these wall-clock fields
  // as occurring in `tz` and returns the matching UTC instant.
  const isoLocal = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}:00`;
  return fromZonedTime(isoLocal, tz);
}

/**
 * Parse a datetime-local / ISO-like input for appointment create/update.
 * - Absolute timestamps (Z or ±offset) are kept as-is.
 * - Naive "YYYY-MM-DDTHH:mm" values are treated as shop wall-clock time.
 */
export function parseAppointmentInputDateTime(
  value: string,
  timezone?: string | null
): Date {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Missing appointment date/time");
  }

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const absolute = new Date(trimmed);
    if (Number.isNaN(absolute.getTime())) {
      throw new Error(`Invalid appointment date/time: ${value}`);
    }
    return absolute;
  }

  const match = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})(?::\d{2})?/
  );
  if (!match) {
    const fallback = new Date(trimmed);
    if (Number.isNaN(fallback.getTime())) {
      throw new Error(`Invalid appointment date/time: ${value}`);
    }
    return fallback;
  }

  return parseReceptionistDateTime(match[1], match[2], timezone);
}

/** Spoken time for TwiML in the shop timezone (e.g. "4:00 PM"). */
export function formatAppointmentTimeForVoice(
  date: Date | string,
  timezone?: string | null
): string {
  const tz = resolveShopTimezone(timezone);
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, tz, "h:mm a");
}

/** Spoken date for TwiML in the shop timezone (e.g. "Tuesday, July 14"). */
export function formatAppointmentDateForVoice(
  date: Date | string,
  timezone?: string | null
): string {
  const tz = resolveShopTimezone(timezone);
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, tz, "EEEE, MMMM d");
}

/** Combined spoken date + time (e.g. "Tuesday, July 14 at 4:00 PM"). */
export function formatAppointmentWhenForVoice(
  date: Date | string,
  timezone?: string | null
): string {
  return `${formatAppointmentDateForVoice(date, timezone)} at ${formatAppointmentTimeForVoice(date, timezone)}`;
}

/**
 * Formats a preferred HH:mm string for voice without converting timezones
 * (already a wall-clock preference).
 */
export function formatPreferredTimeForVoice(timeText: string): string {
  const [hourRaw, minuteRaw = "0"] = timeText.split(":");
  const hour = parseInt(hourRaw, 10);
  const minute = parseInt(minuteRaw, 10) || 0;
  if (Number.isNaN(hour)) return timeText;

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

/** Calendar label time — same source of truth as voice. */
export function formatAppointmentTimeForCalendar(
  date: Date | string,
  timezone?: string | null
): string {
  return formatAppointmentTimeForVoice(date, timezone);
}

/** Hour + fractional minutes in the shop timezone for calendar grid Y position. */
export function getShopLocalDecimalHour(
  date: Date | string,
  timezone?: string | null
): number {
  const tz = resolveShopTimezone(timezone);
  const d = typeof date === "string" ? new Date(date) : date;
  const hour = Number(formatInTimeZone(d, tz, "H"));
  const minute = Number(formatInTimeZone(d, tz, "m"));
  return hour + minute / 60;
}

/** YYYY-MM-DD in the shop timezone (for day filtering on the calendar). */
export function formatShopLocalDateKey(
  date: Date | string,
  timezone?: string | null
): string {
  const tz = resolveShopTimezone(timezone);
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

/** Build a UTC Date from a calendar day + hour/minute in the shop timezone. */
export function shopWallClockToUtc(
  dateKey: string,
  hour: number,
  minute: number,
  timezone?: string | null
): Date {
  return parseReceptionistDateTime(
    dateKey,
    `${pad(hour, 2)}:${pad(minute, 2)}`,
    timezone
  );
}

/** datetime-local input value showing the instant in the shop timezone. */
export function formatDateTimeLocalInTimezone(
  date: Date | string,
  timezone?: string | null
): string {
  const tz = resolveShopTimezone(timezone);
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm");
}

function normalizeTimeText(timeText: string): string {
  const cleaned = timeText.trim();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    throw new Error(`Invalid time text: ${timeText}`);
  }
  return `${pad(parseInt(match[1], 10), 2)}:${pad(parseInt(match[2], 10), 2)}`;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}
