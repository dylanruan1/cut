import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractTimePreference,
  extractMeridiemAnswer,
  parseReceptionistMessage,
  processReceptionistMessage,
  resolveAmbiguousTime,
} from "@/lib/ai-receptionist";
import type { ShopContext } from "@/lib/ai-receptionist/types";
import {
  formatAppointmentWhenForVoice,
  parseReceptionistDateTime,
} from "@/lib/datetime";
import * as booking from "@/lib/ai-receptionist/booking";

const FIXED_NOW = new Date("2026-07-10T12:00:00");

const defaultHoursShop: ShopContext = {
  id: "shop_1",
  name: "Cut Demo",
  address: "123 Main St",
  phone: "+15551234567",
  timezone: "America/Los_Angeles",
  services: [
    { id: "svc_haircut", name: "Haircut", duration: 30 },
    { id: "svc_fade", name: "Fade", duration: 45 },
  ],
  barbers: [
    { id: "barber_chris", name: "Chris" },
    { id: "barber_alex", name: "Alex" },
  ],
  // Default-like 9–7 window most days; Sat 9–5
  businessHours: [
    { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
    { dayOfWeek: 1, openTime: "09:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 2, openTime: "09:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 3, openTime: "09:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 4, openTime: "09:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 5, openTime: "09:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 6, openTime: "09:00", closeTime: "17:00", isClosed: false },
  ],
};

/** Open early enough that both 8 AM and 8 PM are in hours. */
const bothEightShop: ShopContext = {
  ...defaultHoursShop,
  businessHours: defaultHoursShop.businessHours.map((h) =>
    h.isClosed
      ? h
      : { ...h, openTime: "08:00", closeTime: "21:00" }
  ),
};

describe("extractTimePreference", () => {
  it("resolves explicit AM/PM", () => {
    expect(extractTimePreference("8 AM")).toMatchObject({
      status: "resolved",
      time: "08:00",
      hasExplicitMeridiem: true,
      isAmbiguousHour: false,
    });
    expect(extractTimePreference("8 PM")).toMatchObject({
      status: "resolved",
      time: "20:00",
      hasExplicitMeridiem: true,
      isAmbiguousHour: false,
    });
  });

  it("resolves contextual morning / tonight", () => {
    expect(extractTimePreference("tomorrow at 8 in the morning")).toMatchObject({
      status: "resolved",
      time: "08:00",
      hasExplicitMeridiem: false,
      isAmbiguousHour: false,
    });
    expect(extractTimePreference("tomorrow at 8 tonight")).toMatchObject({
      status: "resolved",
      time: "20:00",
      hasExplicitMeridiem: false,
      isAmbiguousHour: false,
    });
    expect(extractTimePreference("8 in the evening")).toMatchObject({
      status: "resolved",
      time: "20:00",
    });
    expect(extractTimePreference("8 afternoon")).toMatchObject({
      status: "resolved",
      time: "20:00",
    });
  });

  it("marks bare hours as ambiguous", () => {
    expect(extractTimePreference("tomorrow at 8")).toMatchObject({
      status: "ambiguous",
      raw: "8",
      hour: 8,
      minute: 0,
      hasExplicitMeridiem: false,
      isAmbiguousHour: true,
    });
    expect(extractTimePreference("at 4")).toMatchObject({
      status: "ambiguous",
      raw: "4",
      hour: 4,
      minute: 0,
    });
    expect(extractTimePreference("around 7")).toMatchObject({
      status: "ambiguous",
      raw: "7",
      hour: 7,
      minute: 0,
    });
    expect(extractTimePreference("book me for 6")).toMatchObject({
      status: "ambiguous",
      raw: "6",
      hour: 6,
      minute: 0,
    });
  });

  it("parses spelled-out hours with time context", () => {
    expect(extractTimePreference("at four")).toMatchObject({
      status: "ambiguous",
      hour: 4,
      minute: 0,
    });
    expect(extractTimePreference("around four")).toMatchObject({
      status: "ambiguous",
      hour: 4,
    });
    expect(extractTimePreference("four PM")).toMatchObject({
      status: "resolved",
      time: "16:00",
      hasExplicitMeridiem: true,
    });
    expect(extractTimePreference("four o'clock")).toMatchObject({
      status: "ambiguous",
      hour: 4,
    });
    expect(extractTimePreference("four in the afternoon")).toMatchObject({
      status: "resolved",
      time: "16:00",
    });
  });

  it("never treats numbers without time context as times", () => {
    // The word "for" is never the number four.
    expect(extractTimePreference("for a haircut").status).toBe("none");
    expect(extractTimePreference("for a fade").status).toBe("none");
    expect(
      extractTimePreference("i want to make an appointment for a haircut").status
    ).toBe("none");
    // STT artifacts: "for a haircut" transcribed as "4 a haircut" / "four a haircut".
    expect(extractTimePreference("4 a haircut").status).toBe("none");
    expect(extractTimePreference("four a haircut").status).toBe("none");
    expect(extractTimePreference("4 an appointment").status).toBe("none");
    expect(extractTimePreference("at 4 a haircut").status).toBe("none");
    // Free-floating digits with no at/around/AM/PM/o'clock context.
    expect(extractTimePreference("4").status).toBe("none");
    expect(extractTimePreference("i want a haircut 4 sure").status).toBe("none");
  });

  it("accepts a bare hour only when answering a time question (assumeTime)", () => {
    expect(extractTimePreference("4", { assumeTime: true })).toMatchObject({
      status: "ambiguous",
      hour: 4,
      minute: 0,
    });
    expect(extractTimePreference("four", { assumeTime: true })).toMatchObject({
      status: "ambiguous",
      hour: 4,
    });
    expect(extractTimePreference("15", { assumeTime: true })).toMatchObject({
      status: "resolved",
      time: "15:00",
    });
  });

  it("resolves noon and midnight without ambiguity", () => {
    expect(extractTimePreference("tomorrow at noon")).toMatchObject({
      status: "resolved",
      time: "12:00",
      isAmbiguousHour: false,
    });
    expect(extractTimePreference("tomorrow at midnight")).toMatchObject({
      status: "resolved",
      time: "00:00",
      isAmbiguousHour: false,
    });
  });
});

describe("extractMeridiemAnswer", () => {
  it("maps AM / morning and PM / evening / tonight", () => {
    expect(extractMeridiemAnswer("AM")).toBe("am");
    expect(extractMeridiemAnswer("morning")).toBe("am");
    expect(extractMeridiemAnswer("8 AM")).toBe("am");
    expect(extractMeridiemAnswer("PM")).toBe("pm");
    expect(extractMeridiemAnswer("evening")).toBe("pm");
    expect(extractMeridiemAnswer("tonight")).toBe("pm");
    expect(extractMeridiemAnswer("8 PM")).toBe("pm");
  });
});

describe("resolveAmbiguousTime", () => {
  it("asks even when only one candidate is inside hours", () => {
    const result = resolveAmbiguousTime(
      { hour: 4, minute: 0 },
      defaultHoursShop,
      "2026-07-11"
    );
    expect(result).toMatchObject({ status: "ask" });
  });

  it("asks when both AM and PM are inside hours", () => {
    const result = resolveAmbiguousTime(
      { hour: 8, minute: 0 },
      bothEightShop,
      "2026-07-11"
    );
    expect(result.status).toBe("ask");
  });

  it("asks even when both candidates are outside hours", () => {
    const result = resolveAmbiguousTime(
      { hour: 11, minute: 0 },
      {
        ...defaultHoursShop,
        businessHours: defaultHoursShop.businessHours.map((h) =>
          h.isClosed ? h : { ...h, openTime: "13:00", closeTime: "14:00" }
        ),
      },
      "2026-07-11"
    );
    expect(result.status).toBe("ask");
  });
});

describe("AM/PM disambiguation in processReceptionistMessage", () => {
  beforeEach(() => {
    vi.spyOn(booking, "checkBookingAvailability").mockResolvedValue({
      available: true,
      options: [
        {
          startTime: parseReceptionistDateTime(
            "2026-07-11",
            "20:00",
            "America/Los_Angeles"
          ).toISOString(),
          endTime: parseReceptionistDateTime(
            "2026-07-11",
            "20:30",
            "America/Los_Angeles"
          ).toISOString(),
          barberId: "barber_chris",
          barberName: "Chris",
          serviceId: "svc_haircut",
          serviceName: "Haircut",
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('"tomorrow at 4" asks AM or PM even when 4 AM is outside hours', async () => {
    const response = await processReceptionistMessage({
      text: "I want a haircut tomorrow at 4",
      callerPhone: "+1215551234567",
      shop: defaultHoursShop,
      now: FIXED_NOW,
    });

    expect(response.awaitingField).toBe("timeMeridiem");
    expect(response.parsed.preferredTime).toBeUndefined();
    expect(response.parsed.preferredTimeRaw).toBe("4");
    expect(response.parsed.hasExplicitMeridiem).toBe(false);
    expect(response.parsed.isAmbiguousHour).toBe(true);
    expect(response.parsed.ambiguousTime).toEqual({ hour: 4, minute: 0 });
    expect(response.speak).toMatch(/4:00 AM/i);
    expect(response.speak).toMatch(/4:00 PM/i);
  });

  it('"tomorrow at 8" asks AM or PM when both are in hours', async () => {
    const response = await processReceptionistMessage({
      text: "I want a haircut tomorrow at 8",
      callerPhone: "+1215551234567",
      shop: bothEightShop,
      now: FIXED_NOW,
    });

    expect(response.awaitingField).toBe("timeMeridiem");
    expect(response.parsed.preferredTime).toBeUndefined();
    expect(response.parsed.preferredTimeRaw).toBe("8");
    expect(response.parsed.hasExplicitMeridiem).toBe(false);
    expect(response.parsed.isAmbiguousHour).toBe(true);
    expect(response.parsed.ambiguousTime).toEqual({ hour: 8, minute: 0 });
    expect(response.speak).toMatch(/8:00 AM/i);
    expect(response.speak).toMatch(/8:00 PM/i);
  });

  it('"tomorrow at 8 AM" does not ask AM or PM', async () => {
    const response = await processReceptionistMessage({
      text: "I want a haircut tomorrow at 8 AM",
      callerPhone: "+1215551234567",
      shop: bothEightShop,
      now: FIXED_NOW,
    });

    expect(response.parsed.preferredTime).toBe("08:00");
    expect(response.parsed.hasExplicitMeridiem).toBe(true);
    expect(response.parsed.isAmbiguousHour).toBe(false);
    expect(response.awaitingField).not.toBe("timeMeridiem");
  });

  it('"tomorrow at 8 PM" does not ask AM or PM', async () => {
    const response = await processReceptionistMessage({
      text: "I want a haircut tomorrow at 8 PM",
      callerPhone: "+1215551234567",
      shop: bothEightShop,
      now: FIXED_NOW,
    });

    expect(response.parsed.preferredTime).toBe("20:00");
    expect(response.parsed.hasExplicitMeridiem).toBe(true);
    expect(response.parsed.isAmbiguousHour).toBe(false);
    expect(response.awaitingField).not.toBe("timeMeridiem");
  });

  it('"tomorrow at 8 in the morning" → 8 AM', async () => {
    const response = await processReceptionistMessage({
      text: "I want a haircut tomorrow at 8 in the morning",
      callerPhone: "+1215551234567",
      shop: bothEightShop,
      now: FIXED_NOW,
    });

    expect(response.parsed.preferredTime).toBe("08:00");
    expect(response.parsed.hasExplicitMeridiem).toBe(false);
    expect(response.parsed.isAmbiguousHour).toBe(false);
    expect(response.awaitingField).not.toBe("timeMeridiem");
  });

  it('"tomorrow at 8 tonight" → 8 PM', async () => {
    const response = await processReceptionistMessage({
      text: "I want a haircut tomorrow at 8 tonight",
      callerPhone: "+1215551234567",
      shop: bothEightShop,
      now: FIXED_NOW,
    });

    expect(response.parsed.preferredTime).toBe("20:00");
    expect(response.parsed.hasExplicitMeridiem).toBe(false);
    expect(response.parsed.isAmbiguousHour).toBe(false);
    expect(response.awaitingField).not.toBe("timeMeridiem");
  });

  it('"AM" while awaiting timeMeridiem → AM', async () => {
    const response = await processReceptionistMessage({
      text: "AM",
      callerPhone: "+1215551234567",
      shop: bothEightShop,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        awaitingField: "timeMeridiem",
        ambiguousTime: { hour: 8, minute: 0 },
      },
    });

    expect(response.parsed.preferredTime).toBe("08:00");
    expect(response.parsed.ambiguousTime).toBeUndefined();
    expect(response.parsed.preferredDate).toBe("2026-07-11");
    expect(response.parsed.serviceName).toBe("Haircut");
  });

  it('"PM" while awaiting timeMeridiem → PM', async () => {
    const response = await processReceptionistMessage({
      text: "PM",
      callerPhone: "+1215551234567",
      shop: bothEightShop,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        awaitingField: "timeMeridiem",
        ambiguousTime: { hour: 8, minute: 0 },
      },
    });

    expect(response.parsed.preferredTime).toBe("20:00");
    expect(response.parsed.isAmbiguousHour).toBe(false);
  });

  it("does not create an appointment until AM/PM ambiguity is resolved", async () => {
    const executeSpy = vi.spyOn(booking, "executeBooking").mockResolvedValue({
      success: true,
      appointmentId: "apt_should_not_create",
      message: "booked",
    });
    const availabilitySpy = vi.spyOn(booking, "checkBookingAvailability");

    const response = await processReceptionistMessage({
      text: "8",
      callerPhone: "+1215551234567",
      shop: bothEightShop,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "Dylan",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        anyBarber: true,
        barberAsked: true,
        awaitingField: "preferredTime",
      },
    });

    expect(response.awaitingField).toBe("timeMeridiem");
    expect(response.parsed.preferredTime).toBeUndefined();
    expect(response.parsed.isAmbiguousHour).toBe(true);
    expect(availabilitySpy).not.toHaveBeenCalled();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("final confirmation speech matches the chosen appointment time", async () => {
    const response = await processReceptionistMessage({
      text: "no preference",
      callerPhone: "+1215551234567",
      shop: bothEightShop,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "Dylan",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "20:00",
        awaitingField: "barberName",
        barberAsked: false,
      },
    });

    expect(response.awaitingField).toBe("confirmation");
    const expectedWhen = formatAppointmentWhenForVoice(
      parseReceptionistDateTime("2026-07-11", "20:00", "America/Los_Angeles"),
      "America/Los_Angeles"
    );
    expect(response.speak).toContain(expectedWhen);
    expect(response.speak).toMatch(/just to confirm/i);
    expect(response.speak).toMatch(/8:00 PM/);
    expect(response.parsed.preferredTime).toBe("20:00");
  });
});

describe("timeMeridiem contextual parse", () => {
  it("merges AM into existing preferred date/service without guessing", () => {
    const parsed = parseReceptionistMessage("morning", {
      shop: bothEightShop,
      session: {
        intent: "book_appointment",
        clientName: "Dylan",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        awaitingField: "timeMeridiem",
        ambiguousTime: { hour: 8, minute: 0 },
      },
    });

    expect(parsed.preferredTime).toBe("08:00");
    expect(parsed.clientName).toBe("Dylan");
    expect(parsed.serviceName).toBe("Haircut");
    expect(parsed.preferredDate).toBe("2026-07-11");
  });
});
