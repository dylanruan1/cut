import { toZonedTime } from "date-fns-tz";
import {
  formatPreferredTimeForVoice,
  parseReceptionistDateTime,
  resolveShopTimezone,
} from "@/lib/datetime";
import type { ShopContext } from "./types";

/** Default when shop hours are missing: 9 AM–7 PM. */
export const DEFAULT_BUSINESS_OPEN = "09:00";
export const DEFAULT_BUSINESS_CLOSE = "19:00";

export type AmbiguousClock = {
  hour: number;
  minute: number;
};

export type AmbiguousTimeResolution =
  | { status: "resolved"; time: string; spoken: string }
  | { status: "ask"; am: string; pm: string; spokenAm: string; spokenPm: string }
  | {
      status: "neither";
      am: string;
      pm: string;
      spokenAm: string;
      spokenPm: string;
    };

export function formatHHmm(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Convert a 1–12 clock hour + meridiem to HH:mm. */
export function clockToHHmm(
  hour: number,
  minute: number,
  meridiem: "am" | "pm"
): string {
  let hour24 = hour % 12;
  if (meridiem === "pm") hour24 += 12;
  return formatHHmm(hour24, minute);
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Start time is inside hours when open <= time < close. */
export function isTimeWithinBusinessHours(
  timeHHmm: string,
  openTime: string,
  closeTime: string
): boolean {
  const t = toMinutes(timeHHmm);
  return t >= toMinutes(openTime) && t < toMinutes(closeTime);
}

export function getBusinessHoursForDate(
  shop: Pick<ShopContext, "businessHours" | "timezone">,
  preferredDate?: string
): { openTime: string; closeTime: string } | null {
  if (!preferredDate) {
    return { openTime: DEFAULT_BUSINESS_OPEN, closeTime: DEFAULT_BUSINESS_CLOSE };
  }

  const timezone = resolveShopTimezone(shop.timezone);
  const noonUtc = parseReceptionistDateTime(preferredDate, "12:00", timezone);
  const dayOfWeek = toZonedTime(noonUtc, timezone).getDay();
  const hours = shop.businessHours.find((h) => h.dayOfWeek === dayOfWeek);

  if (!hours || hours.isClosed) {
    return null;
  }

  return { openTime: hours.openTime, closeTime: hours.closeTime };
}

/**
 * Bare 1-12 hour requests must be clarified by the caller.
 * Business hours are intentionally not used to infer AM/PM.
 */
export function resolveAmbiguousTime(
  clock: AmbiguousClock,
  _shop: Pick<ShopContext, "businessHours" | "timezone">,
  _preferredDate?: string
): AmbiguousTimeResolution {
  const { hour, minute } = clock;
  const am = clockToHHmm(hour, minute, "am");
  const pm = clockToHHmm(hour, minute, "pm");
  const spokenAm = formatPreferredTimeForVoice(am);
  const spokenPm = formatPreferredTimeForVoice(pm);

  return { status: "ask", am, pm, spokenAm, spokenPm };
}

export function askMeridiemSpeech(spokenAm: string, spokenPm: string): string {
  return `Did you mean ${spokenAm} or ${spokenPm}?`;
}

export function neitherMeridiemSpeech(spokenAm: string, spokenPm: string): string {
  return `I don't see availability at ${spokenAm} or ${spokenPm}. What other time works for you?`;
}
