import { describe, it, expect } from "vitest";
import {
  DEFAULT_SHOP_TIMEZONE,
  formatAppointmentDateForVoice,
  formatAppointmentTimeForCalendar,
  formatAppointmentTimeForVoice,
  formatAppointmentWhenForVoice,
  getShopLocalDecimalHour,
  parseReceptionistDateTime,
  resolveShopTimezone,
} from "@/lib/datetime";
import { combineDateAndTime } from "@/lib/ai-receptionist/availability";
import { formatTime } from "@/lib/dates";

describe("datetime voice + calendar alignment", () => {
  it("defaults missing timezone to America/Los_Angeles", () => {
    expect(resolveShopTimezone(null)).toBe(DEFAULT_SHOP_TIMEZONE);
    expect(resolveShopTimezone(undefined)).toBe("America/Los_Angeles");
    expect(resolveShopTimezone("")).toBe("America/Los_Angeles");
  });

  it('"tomorrow at 4" in America/Los_Angeles creates a calendar appointment shown at 4 PM', () => {
    const timezone = "America/Los_Angeles";
    const start = parseReceptionistDateTime("2026-07-14", "16:00", timezone);

    expect(formatAppointmentTimeForCalendar(start, timezone)).toBe("4:00 PM");
    expect(formatTime(start, timezone)).toBe("4:00 PM");
    expect(getShopLocalDecimalHour(start, timezone)).toBe(16);
    // PDT (UTC-7): 4 PM local => 23:00 UTC
    expect(start.toISOString()).toBe("2026-07-14T23:00:00.000Z");
  });

  it('"tomorrow at 3" in America/Los_Angeles creates a calendar appointment shown at 3 PM', () => {
    const timezone = "America/Los_Angeles";
    const start = parseReceptionistDateTime("2026-07-14", "15:00", timezone);

    expect(formatAppointmentTimeForCalendar(start, timezone)).toBe("3:00 PM");
    expect(formatTime(start, timezone)).toBe("3:00 PM");
    expect(getShopLocalDecimalHour(start, timezone)).toBe(15);
    expect(start.toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  it("voice confirmation matches the calendar time", () => {
    const timezone = "America/Los_Angeles";
    const stored = combineDateAndTime("2026-07-14", "16:00", timezone);
    const voice = formatAppointmentTimeForVoice(stored, timezone);
    const calendar = formatAppointmentTimeForCalendar(stored, timezone);

    expect(voice).toBe(calendar);
    expect(voice).toBe("4:00 PM");
    expect(formatAppointmentWhenForVoice(stored, timezone)).toContain("4:00 PM");
  });

  it("no 3-hour offset appears between store and display", () => {
    const timezone = "America/Los_Angeles";
    const start = parseReceptionistDateTime("2026-07-14", "16:00", timezone);

    expect(formatAppointmentTimeForVoice(start, timezone)).toBe("4:00 PM");
    expect(formatAppointmentTimeForCalendar(start, timezone)).toBe("4:00 PM");
    expect(getShopLocalDecimalHour(start, timezone)).toBe(16);
    // Eastern would be +3 hours — prove we are NOT accidentally using it for LA shops
    expect(formatAppointmentTimeForVoice(start, "America/New_York")).toBe("7:00 PM");
    expect(formatAppointmentTimeForVoice(start, timezone)).not.toBe("1:00 PM");
    expect(formatAppointmentTimeForVoice(start, timezone)).not.toBe("7:00 PM");
  });

  it("no UTC/local server timezone mismatch appears in voice response", () => {
    const timezone = "America/Los_Angeles";
    const start = parseReceptionistDateTime("2026-07-14", "16:00", timezone);
    const spoken = formatAppointmentWhenForVoice(start, timezone);

    expect(spoken).toMatch(/4:00 PM/);
    expect(spoken).not.toMatch(/UTC|GMT|[+-]\d{2}:\d{2}/);
    expect(formatAppointmentDateForVoice(start, timezone)).toContain("July");
  });
});
