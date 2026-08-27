import { formatInTimeZone } from "date-fns-tz";

/**
 * Cancellation waitlist matching.
 *
 * When an appointment is cancelled the slot immediately becomes bookable
 * again, but nobody knows — so it usually stays empty. A cancelled Saturday
 * 4pm is a haircut that never happens. This decides who to tell.
 *
 * Everything here is pure so the rules can be tested without a database or a
 * live Twilio account.
 */

export type TimePreference = "MORNING" | "AFTERNOON" | "EVENING" | "ANY";

/**
 * Time bands, in the SHOP's local clock.
 *
 * Boundaries are deliberately generous and overlapping-free: someone who said
 * "afternoon" should not miss a 12:00 slot on a technicality, and a shop
 * closing at 7pm should still have an "evening".
 */
const WINDOWS: Record<Exclude<TimePreference, "ANY">, { from: number; to: number }> = {
  // Up to but not including noon.
  MORNING: { from: 0, to: 12 },
  // Noon to 5pm.
  AFTERNOON: { from: 12, to: 17 },
  // 5pm to midnight.
  EVENING: { from: 17, to: 24 },
};

export const TIME_PREFERENCE_LABELS: Record<TimePreference, string> = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  EVENING: "Evening",
  ANY: "Any time",
};

/** The shop-local calendar day of an instant, as YYYY-MM-DD. */
export function localDateKey(when: Date, timezone: string): string {
  return formatInTimeZone(when, timezone, "yyyy-MM-dd");
}

/** The shop-local hour (0–23) of an instant. */
export function localHour(when: Date, timezone: string): number {
  return Number(formatInTimeZone(when, timezone, "H"));
}

/**
 * Whether a freed slot satisfies a stated time preference.
 *
 * Judged in the shop's timezone — the same instant is "morning" in one place
 * and "evening" in another, and the customer meant the shop's clock.
 */
export function matchesTimePreference(
  slotStart: Date,
  preference: TimePreference,
  timezone: string
): boolean {
  if (preference === "ANY") return true;
  const hour = localHour(slotStart, timezone);
  const window = WINDOWS[preference];
  return hour >= window.from && hour < window.to;
}

export type WaitlistCandidate = {
  id: string;
  barberId: string | null;
  serviceId: string;
  date: string;
  timePreference: TimePreference;
};

export type FreedSlot = {
  startTime: Date;
  barberId: string | null;
  serviceId: string;
};

/**
 * Which waiting people should hear about a freed slot.
 *
 * Matching is deliberately loose on service and barber:
 *
 * - A null barberId on the entry means "any barber", so it matches anything.
 * - Service is NOT required to match. Someone waiting for a beard trim will
 *   happily take a freed haircut slot if the timing works, and a shop would
 *   far rather fill the chair than honour a category. Duration differences are
 *   handled at booking time, where availability is recomputed properly.
 */
export function matchingWaiters(
  slot: FreedSlot,
  candidates: WaitlistCandidate[],
  timezone: string
): WaitlistCandidate[] {
  const day = localDateKey(slot.startTime, timezone);

  return candidates.filter((c) => {
    if (c.date !== day) return false;
    // An entry naming a barber only matches that barber. An entry naming none
    // matches any.
    if (c.barberId && slot.barberId && c.barberId !== slot.barberId) return false;
    return matchesTimePreference(slot.startTime, c.timePreference, timezone);
  });
}

/**
 * Wording for the notification.
 *
 * States plainly that it is first-come — several people get this text at once,
 * and someone who taps late and finds it gone should have been warned rather
 * than surprised.
 */
export function buildWaitlistSms(
  clientName: string,
  shopName: string,
  whenLabel: string,
  bookingUrl: string
): string {
  return `Hi ${clientName}, a spot just opened at ${shopName} — ${whenLabel}. First to book gets it: ${bookingUrl}`;
}
