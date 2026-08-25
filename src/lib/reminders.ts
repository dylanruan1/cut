import { formatInTimeZone } from "date-fns-tz";
// Type-only, so this file stays free of the Twilio SDK at runtime.
import type { SmsType } from "@/lib/twilio";

/**
 * Which appointments are due a reminder, and how to word it.
 *
 * The original design asked for appointments starting in a 30-minute window
 * exactly 24h (or 2h) from now. That only works if the job runs every few
 * minutes. On a once-daily schedule it matches almost nothing: a 9am run would
 * text only the people booked for 8:45–9:15 the next morning and silently skip
 * everyone else.
 *
 * So the windows here are wide and the wording is derived from the actual time
 * remaining. The job then behaves correctly whether it runs once a day or every
 * fifteen minutes — it just gets more precise as it runs more often.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Longest lead time for the day-before reminder. */
export const DAY_BEFORE_MAX_HOURS = 36;
/** Boundary between "day before" and "same day" reminders. */
export const SAME_DAY_MAX_HOURS = 12;

export type ReminderKind = "day_before" | "same_day";

/**
 * SMS log types. Kept as the original strings so reminders already sent are
 * still recognised and nobody gets texted twice after this change ships.
 */
export const REMINDER_LOG_TYPE: Record<ReminderKind, SmsType> = {
  day_before: "reminder_24h",
  same_day: "reminder_2h",
};

/** Inclusive-exclusive time range to query for a given reminder kind. */
export function reminderWindow(
  kind: ReminderKind,
  now: Date
): { start: Date; end: Date } {
  if (kind === "day_before") {
    return {
      start: new Date(now.getTime() + SAME_DAY_MAX_HOURS * HOUR_MS),
      end: new Date(now.getTime() + DAY_BEFORE_MAX_HOURS * HOUR_MS),
    };
  }
  // Same day: anything still ahead of us but inside the near window. Starts at
  // `now` so an appointment that already began is never "reminded" about.
  return {
    start: now,
    end: new Date(now.getTime() + SAME_DAY_MAX_HOURS * HOUR_MS),
  };
}

/** Hours until an appointment, as a float. Negative once it has started. */
export function hoursUntil(startTime: Date, now: Date): number {
  return (startTime.getTime() - now.getTime()) / HOUR_MS;
}

/**
 * Human wording for when the appointment is, in the shop's timezone.
 *
 * Always describes reality rather than assuming the reminder fired exactly 24
 * or 2 hours out, because on a daily schedule it usually didn't. A message
 * saying "in 2 hours" when the appointment is at teatime trains people to
 * ignore reminders.
 */
export function describeWhen(
  startTime: Date,
  now: Date,
  timezone: string
): string {
  const hours = hoursUntil(startTime, now);
  const clock = formatInTimeZone(startTime, timezone, "h:mm a");

  if (hours < 1) return "in under an hour";
  if (hours < 3) return `in about ${Math.round(hours)} hours`;

  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const day = formatInTimeZone(startTime, timezone, "yyyy-MM-dd");
  if (day === today) return `today at ${clock}`;

  const tomorrow = formatInTimeZone(
    new Date(now.getTime() + 24 * HOUR_MS),
    timezone,
    "yyyy-MM-dd"
  );
  if (day === tomorrow) return `tomorrow at ${clock}`;

  return `on ${formatInTimeZone(startTime, timezone, "EEEE")} at ${clock}`;
}
