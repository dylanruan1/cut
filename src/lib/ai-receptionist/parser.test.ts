import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectIntent,
  parseReceptionistMessage,
  getMissingFields,
  processReceptionistMessage,
  sessionToParsedState,
  createCallSession,
  getCallSession,
  mergeParsedRequestIntoSession,
  clearCallSession,
  GREETING,
  MAX_PROMPT_REPEATS,
} from "@/lib/ai-receptionist";
import type { ShopContext } from "@/lib/ai-receptionist/types";
import type { ReceptionistCallSession } from "@prisma/client";
import * as booking from "@/lib/ai-receptionist/booking";

const FIXED_NOW = new Date("2026-07-10T12:00:00");

const shopFixture: ShopContext = {
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
  businessHours: [
    { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
    { dayOfWeek: 1, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 2, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 4, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 5, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { dayOfWeek: 6, openTime: "09:00", closeTime: "17:00", isClosed: false },
  ],
};

describe("booking conversation persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores service/date/time from first utterance and asks for name", async () => {
    const response = await processReceptionistMessage({
      text: "I want a haircut tomorrow at 3 PM",
      callerPhone: "+1215551234567",
      shop: shopFixture,
      now: FIXED_NOW,
    });

    expect(response.parsed.serviceName).toBe("Haircut");
    expect(response.parsed.preferredDate).toBe("2026-07-11");
    expect(response.parsed.preferredTime).toBe("15:00");
    expect(response.awaitingField).toBe("clientName");
    expect(response.speak).not.toBe(GREETING);
    expect(response.speak.toLowerCase()).toMatch(/name/);
  });

  it("fills clientName from Dylan when awaitingField is clientName", async () => {
    const response = await processReceptionistMessage({
      text: "Dylan",
      callerPhone: "+1215551234567",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        awaitingField: "clientName",
      },
    });

    expect(response.parsed.clientName).toBe("Dylan");
    expect(response.parsed.serviceName).toBe("Haircut");
    expect(response.parsed.preferredDate).toBe("2026-07-11");
    expect(response.parsed.preferredTime).toBe("15:00");
    expect(response.awaitingField).toBe("barberName");
    expect(response.speak).not.toMatch(/thanks for calling cut/i);
    expect(response.speak).not.toBe(GREETING);
  });

  it("treats no preference as skipping barber", async () => {
    vi.spyOn(booking, "checkBookingAvailability").mockResolvedValue({
      available: true,
      options: [
        {
          startTime: "2026-07-11T22:00:00.000Z",
          endTime: "2026-07-11T22:30:00.000Z",
          barberId: "barber_chris",
          barberName: "Chris",
          serviceId: "svc_haircut",
          serviceName: "Haircut",
        },
      ],
    });

    const response = await processReceptionistMessage({
      text: "no preference",
      callerPhone: "+1215551234567",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "Dylan",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        awaitingField: "barberName",
      },
    });

    expect(response.parsed.anyBarber).toBe(true);
    expect(response.parsed.clientName).toBe("Dylan");
    expect(response.awaitingField).toBe("confirmation");
    expect(response.speak.toLowerCase()).toMatch(/book|yes|no|go ahead|confirm/);
    expect(response.speak).toMatch(/3:00 PM/);
    expect(response.speak).toMatch(/under the name Dylan/);
    expect(response.speak).toMatch(/at Cut Demo/);
  });

  it("confirms booking with yes and creates an appointment", async () => {
    const spy = vi.spyOn(booking, "executeBooking").mockResolvedValue({
      success: true,
      appointmentId: "apt_test_123",
      message: "You're all set. I booked Haircut with Chris.",
    });

    const response = await processReceptionistMessage({
      text: "yes",
      callerPhone: "+1215551234567",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "Dylan",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        barberAsked: true,
        awaitingField: "confirmation",
      },
    });

    expect(response.parsed.confirmed).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(response.bookingResult?.appointmentId).toBe("apt_test_123");
    expect(response.sessionComplete).toBe(true);
    expect(response.shouldContinue).toBe(false);
    expect(response.speak).not.toBe(GREETING);

    spy.mockRestore();
  });

  it("does not repeat the intro during an active booking call", async () => {
    const response = await processReceptionistMessage({
      text: "hmm",
      callerPhone: "+1215551234567",
      shop: shopFixture,
      now: FIXED_NOW,
      turnCount: 3,
      session: {
        intent: "book_appointment",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        awaitingField: "clientName",
      },
    });

    expect(response.speak).not.toBe(GREETING);
    expect(response.speak.toLowerCase()).not.toMatch(/^thanks for calling cut/);
    expect(response.awaitingField).toBe("clientName");
  });
});

describe("session helpers", () => {
  it("sessionToParsedState preserves stored fields including awaitingField column", () => {
    const session = {
      id: "1",
      callSid: "CA_test",
      callerPhone: "+1215551234567",
      barbershopId: "shop_1",
      intent: "book_appointment",
      clientName: null,
      serviceName: "Haircut",
      barberName: null,
      preferredDate: "2026-07-11",
      preferredTime: "15:00",
      awaitingField: "clientName",
      appointmentId: null,
      status: "ACTIVE",
      turnCount: 1,
      context: { turnCount: 1, barberAsked: false },
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    } as ReceptionistCallSession;

    const state = sessionToParsedState(session);
    expect(state.serviceName).toBe("Haircut");
    expect(state.awaitingField).toBe("clientName");
    expect(state.preferredTime).toBe("15:00");
  });
});

describe('service phrases never parse "for" as a time', () => {
  it('"I want to make an appointment for a haircut" → service only, no time', async () => {
    const parsed = parseReceptionistMessage(
      "I want to make an appointment for a haircut",
      { shop: shopFixture, now: FIXED_NOW }
    );
    expect(parsed.intent).toBe("book_appointment");
    expect(parsed.serviceName).toBe("Haircut");
    expect(parsed.preferredTime).toBeUndefined();
    expect(parsed.ambiguousTime).toBeUndefined();
    expect(parsed.isAmbiguousHour).toBeFalsy();

    const response = await processReceptionistMessage({
      text: "I want to make an appointment for a haircut",
      callerPhone: "+1215551234567",
      shop: shopFixture,
      now: FIXED_NOW,
    });
    // Must not jump into AM/PM disambiguation or announce "at four".
    expect(response.awaitingField).not.toBe("timeMeridiem");
    expect(response.speak).not.toMatch(/at (4|four)/i);
    expect(response.speak).not.toMatch(/am or pm/i);
  });

  it('"I want to book a haircut" → service, no time', () => {
    const parsed = parseReceptionistMessage("I want to book a haircut", {
      shop: shopFixture,
      now: FIXED_NOW,
    });
    expect(parsed.serviceName).toBe("Haircut");
    expect(parsed.preferredTime).toBeUndefined();
    expect(parsed.ambiguousTime).toBeUndefined();
  });

  it('"I need a fade" → service, no time', () => {
    const parsed = parseReceptionistMessage("I need a fade", {
      shop: shopFixture,
      now: FIXED_NOW,
    });
    expect(parsed.intent).toBe("book_appointment");
    expect(parsed.serviceName).toBe("Fade");
    expect(parsed.preferredTime).toBeUndefined();
    expect(parsed.ambiguousTime).toBeUndefined();
  });

  it('"I want a haircut at four" → ambiguous 4 asking AM or PM', async () => {
    const response = await processReceptionistMessage({
      text: "I want a haircut tomorrow at four",
      callerPhone: "+1215551234567",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "Dylan",
      },
    });
    expect(response.awaitingField).toBe("timeMeridiem");
    expect(response.parsed.ambiguousTime).toEqual({ hour: 4, minute: 0 });
    expect(response.parsed.preferredTime).toBeUndefined();
  });

  it('"I want a haircut at 4 PM" → 16:00', () => {
    const parsed = parseReceptionistMessage("I want a haircut at 4 PM", {
      shop: shopFixture,
      now: FIXED_NOW,
    });
    expect(parsed.serviceName).toBe("Haircut");
    expect(parsed.preferredTime).toBe("16:00");
    expect(parsed.hasExplicitMeridiem).toBe(true);
  });

  it("service known but date missing → asks what day works best", async () => {
    const response = await processReceptionistMessage({
      text: "haircut please",
      callerPhone: "+1215551234567",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "Dylan",
        awaitingField: "serviceName",
      },
    });
    expect(response.awaitingField).toBe("preferredDate");
    expect(response.speak).toMatch(/what day works best for you\?/i);
  });

  it("date known but time missing → asks what time works best", async () => {
    const response = await processReceptionistMessage({
      text: "tomorrow",
      callerPhone: "+1215551234567",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "Dylan",
        serviceName: "Haircut",
        awaitingField: "preferredDate",
      },
    });
    expect(response.awaitingField).toBe("preferredTime");
    expect(response.speak).toMatch(/what time works best\?/i);
  });
});

describe("contextual parsing", () => {
  it("parses no preference for barber", () => {
    const parsed = parseReceptionistMessage("no preference", {
      shop: shopFixture,
      session: {
        intent: "book_appointment",
        clientName: "Dylan",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        awaitingField: "barberName",
      },
    });
    expect(parsed.anyBarber).toBe(true);
    expect(getMissingFields(parsed.intent, { ...parsed, barberAsked: true })).toEqual([
      "confirmation",
    ]);
  });

  it("detects book intent", () => {
    expect(detectIntent("I want a haircut tomorrow at 3")).toBe("book_appointment");
  });
});

describe("prisma call session lifecycle", () => {
  const callSid = `CA_unit_${Date.now()}`;

  afterEach(async () => {
    try {
      await clearCallSession(callSid);
    } catch {
      // ignore cleanup errors in CI without DB
    }
  });

  it("first call creates a session and merge keeps prior values", async () => {
    let created;
    try {
      created = await createCallSession(callSid, "+1215551234567", {
        barbershopId: undefined,
      });
    } catch (error) {
      console.warn("[test] skipping prisma session lifecycle — DB unreachable", error);
      return;
    }
    expect(created.callSid).toBe(callSid);
    expect(created.status).toBe("ACTIVE");

    const merged = await mergeParsedRequestIntoSession(
      callSid,
      {
        intent: "book_appointment",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        rawText: "I want a haircut tomorrow at 3",
        confidence: 0.9,
        missingFields: ["clientName"],
      },
      { awaitingField: "clientName", turnCount: 1, status: "ACTIVE" }
    );

    expect(merged.serviceName).toBe("Haircut");
    expect(merged.preferredDate).toBe("2026-07-11");
    expect(merged.preferredTime).toBe("15:00");
    expect(merged.awaitingField).toBe("clientName");

    // Simulate confirmation status without wiping
    const confirming = await mergeParsedRequestIntoSession(
      callSid,
      {
        intent: "book_appointment",
        clientName: "Dylan",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        rawText: "no preference",
        confidence: 0.9,
        missingFields: ["confirmation"],
      },
      {
        awaitingField: "confirmation",
        turnCount: 3,
        status: "AWAITING_CONFIRMATION",
        contextPatch: { barberAsked: true, anyBarber: true },
      }
    );

    expect(confirming.status).toBe("AWAITING_CONFIRMATION");
    expect(confirming.clientName).toBe("Dylan");
    expect(confirming.serviceName).toBe("Haircut");

    // createCallSession must NOT wipe AWAITING_CONFIRMATION sessions
    const again = await createCallSession(callSid, "+1215551234567");
    expect(again.clientName).toBe("Dylan");
    expect(again.serviceName).toBe("Haircut");
    expect(again.status).toBe("AWAITING_CONFIRMATION");

    const loaded = await getCallSession(callSid);
    expect(loaded?.clientName).toBe("Dylan");
  }, 30000);
});
