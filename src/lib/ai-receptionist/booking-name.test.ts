import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseReceptionistMessage,
  processReceptionistMessage,
} from "@/lib/ai-receptionist";
import type { ShopContext } from "@/lib/ai-receptionist/types";
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

describe("caller name extraction", () => {
  it('extracts Jeff from "My name is Jeff"', () => {
    const parsed = parseReceptionistMessage("My name is Jeff", {
      shop: shopFixture,
      session: {
        intent: "book_appointment",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        awaitingField: "clientName",
      },
    });
    expect(parsed.clientName).toBe("Jeff");
  });

  it('stores Jeff from bare "Jeff" while awaiting clientName', () => {
    const parsed = parseReceptionistMessage("Jeff", {
      shop: shopFixture,
      session: {
        intent: "book_appointment",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        awaitingField: "clientName",
      },
    });
    expect(parsed.clientName).toBe("Jeff");
  });

  it("keeps session.clientName through confirmation and booking", async () => {
    const spy = vi.spyOn(booking, "executeBooking").mockResolvedValue({
      success: true,
      appointmentId: "apt_jeff",
      message: "You're all set.",
    });

    const response = await processReceptionistMessage({
      text: "yes",
      callerPhone: "+15559876543",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "Jeff",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        barberAsked: true,
        awaitingField: "confirmation",
      },
    });

    expect(response.parsed.clientName).toBe("Jeff");
    expect(spy).toHaveBeenCalledOnce();
    const callArg = spy.mock.calls[0][0];
    expect(callArg.parsed.clientName).toBe("Jeff");
    // Must book by caller phone + conversation name, not dashboard user
    expect(callArg.callerPhone).toBe("+15559876543");
    spy.mockRestore();
  });
});

const availabilityFixture = {
  available: true as const,
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
};

describe("confirmation voice name precedence", () => {
  it("confirmation names Jeff even when existing client is Dylan", async () => {
    const spy = vi
      .spyOn(booking, "checkBookingAvailability")
      .mockResolvedValue(availabilityFixture);

    const response = await processReceptionistMessage({
      text: "no preference",
      callerPhone: "+15559876543",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "Jeff",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        awaitingField: "barberName",
      },
    });

    expect(response.awaitingField).toBe("confirmation");
    expect(response.speak).toMatch(/under the name jeff/i);
    expect(response.speak).not.toMatch(/with jeff/i);
    expect(response.speak).not.toMatch(/dylan/i);
    expect(response.parsed.clientName).toBe("Jeff");
    spy.mockRestore();
  });

  it("asks for the name instead of auto-filling it when the session has none", async () => {
    const response = await processReceptionistMessage({
      text: "no preference",
      callerPhone: "+15559876543",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        awaitingField: "barberName",
      },
    });

    expect(response.parsed.clientName).toBeUndefined();
    expect(response.parsed.missingFields).toContain("clientName");
    expect(response.awaitingField).toBe("clientName");
    expect(response.speak).toMatch(/what name should i put the appointment under\?/i);
    expect(response.speak).not.toMatch(/is this .* under/i);
    expect(response.speak).not.toMatch(/just to confirm/i);
  });

  it('says "with barber Chris" only for the barber when caller prefers Chris', async () => {
    const spy = vi
      .spyOn(booking, "checkBookingAvailability")
      .mockResolvedValue(availabilityFixture);

    const response = await processReceptionistMessage({
      text: "Chris please",
      callerPhone: "+15559876543",
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

    expect(response.awaitingField).toBe("confirmation");
    expect(response.speak).toMatch(/under the name dylan/i);
    expect(response.speak).toMatch(/with barber chris/i);
    expect(response.speak).not.toMatch(/with dylan/i);
    spy.mockRestore();
  });

  it("omits the barber entirely when the caller has no preference", async () => {
    const spy = vi
      .spyOn(booking, "checkBookingAvailability")
      .mockResolvedValue(availabilityFixture);

    const response = await processReceptionistMessage({
      text: "no preference",
      callerPhone: "+15559876543",
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

    expect(response.awaitingField).toBe("confirmation");
    expect(response.speak).toMatch(/under the name dylan/i);
    // No barber phrase at all — the tentatively assigned slot barber (Chris)
    // must not be spoken as if the caller chose them.
    expect(response.speak).not.toMatch(/with /i);
    expect(response.speak).not.toMatch(/chris/i);
    spy.mockRestore();
  });

  it("does not silently fall back while awaiting the caller's explicit name answer", async () => {
    const response = await processReceptionistMessage({
      text: "uh",
      callerPhone: "+15559876543",
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

    expect(response.parsed.clientName).toBeUndefined();
    expect(response.awaitingField).toBe("clientName");
  });
});

describe("blank name can never reach confirmation", () => {
  it("whitespace-only session name triggers the name question, not confirmation", async () => {
    const spy = vi
      .spyOn(booking, "checkBookingAvailability")
      .mockResolvedValue(availabilityFixture);

    // Mimics the reported call: all booking details collected, but the
    // session "name" is blank — the AI must ask for the name instead of
    // saying "I have an appointment under the name ...<nothing>".
    const response = await processReceptionistMessage({
      text: "no preference",
      callerPhone: "+15559876543",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: "   ",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        awaitingField: "barberName",
      },
    });

    expect(response.awaitingField).toBe("clientName");
    expect(response.parsed.missingFields).toContain("clientName");
    expect(response.speak).toMatch(/what name should i put the appointment under\?/i);
    expect(response.speak).not.toMatch(/under the name\s*(for|\.|,|$)/i);
    expect(response.speak).not.toMatch(/just to confirm/i);
    spy.mockRestore();
  });

  it("blank name blocks final booking even when the caller says yes", async () => {
    const bookingSpy = vi.spyOn(booking, "executeBooking");

    const response = await processReceptionistMessage({
      text: "yes",
      callerPhone: "+15559876543",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        intent: "book_appointment",
        clientName: " ",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        barberAsked: true,
        awaitingField: "confirmation",
      },
    });

    expect(bookingSpy).not.toHaveBeenCalled();
    expect(response.awaitingField).toBe("clientName");
    expect(response.speak).toMatch(/what name should i put the appointment under\?/i);
    expect(response.speak).not.toMatch(/under the name\s*(for|\.|,|$)/i);
    bookingSpy.mockRestore();
  });

  it("executeBooking never stores a blank clientNameSnapshot", async () => {
    // Freeze time so the fixed booking date stays in the future.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.client.create.mockResolvedValue({
      id: "client_new",
      name: "Phone Customer",
      phone: "+15559876543",
      barbershopId: "shop_1",
    });
    prismaMock.appointment.findMany.mockResolvedValue([]);
    // No deposits configured in these fixtures.
    prismaMock.barbershop.findUnique.mockResolvedValue({
      slug: "shop",
      depositsEnabled: false,
      connectStatus: "NOT_CONNECTED",
      stripeConnectAccountId: null,
    });
    prismaMock.service.findUnique.mockResolvedValue({ depositAmount: null });
    prismaMock.appointment.create.mockResolvedValue({
      id: "apt_blank_guard",
      startTime: new Date("2026-07-11T22:00:00.000Z"),
    });
    prismaMock.notification.create.mockResolvedValue({});

    const { executeBooking } = await import("@/lib/ai-receptionist/booking");

    const result = await executeBooking({
      shop: shopFixture,
      callerPhone: "+15559876543",
      parsed: {
        intent: "book_appointment",
        clientName: "   ",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        confirmed: true,
        rawText: "yes",
        confidence: 0.95,
        missingFields: [],
      },
    });

    expect(result.success).toBe(true);
    const snapshot =
      prismaMock.appointment.create.mock.calls[0][0].data.clientNameSnapshot;
    expect(typeof snapshot).toBe("string");
    expect(snapshot.trim().length).toBeGreaterThan(0);
    expect(result.message).not.toMatch(/under the name\s*(for|\.|,|$)/i);
    vi.useRealTimers();
  });
});

describe("always asks for the appointment name", () => {
  const bookingSessionWithoutName = {
    intent: "book_appointment" as const,
    serviceName: "Haircut",
    preferredDate: "2026-07-11",
    preferredTime: "15:00",
    anyBarber: true,
    barberAsked: true,
  };

  it("new call asks the exact name question and never speaks an old name", async () => {
    // The caller's phone matching an existing client (e.g. Jeff) cannot
    // influence the flow: processReceptionistMessage no longer accepts a
    // matched/suggested name at all — only the session from THIS call.
    const response = await processReceptionistMessage({
      text: "I want a haircut tomorrow at 3 PM",
      callerPhone: "+15559876543",
      shop: shopFixture,
      now: FIXED_NOW,
    });

    expect(response.parsed.clientName).toBeUndefined();
    expect(response.parsed.confirmedClientName).toBe(false);
    expect(response.parsed.missingFields).toContain("clientName");
    expect(response.awaitingField).toBe("clientName");
    expect(response.speak).toMatch(/what name should i put the appointment under\?/i);
    expect(response.speak).not.toMatch(/jeff/i);
    expect(response.speak).not.toMatch(/is this .* under/i);
    expect(response.speak).not.toMatch(/i have an appointment under/i);
  });

  it('caller answers "Marcus" → final confirmation uses Marcus', async () => {
    const availabilitySpy = vi
      .spyOn(booking, "checkBookingAvailability")
      .mockResolvedValue(availabilityFixture);

    const response = await processReceptionistMessage({
      text: "Marcus",
      callerPhone: "+15559876543",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        ...bookingSessionWithoutName,
        awaitingField: "clientName",
      },
    });

    expect(response.parsed.clientName).toBe("Marcus");
    expect(response.parsed.confirmedClientName).toBe(true);
    expect(response.awaitingField).toBe("confirmation");
    expect(response.speak).toMatch(/under the name marcus/i);
    // "under the name" must never be followed by nothing.
    expect(response.speak).not.toMatch(/under the name\s*(for|\.|,|$)/i);
    expect(response.speak).not.toMatch(/jeff/i);

    availabilitySpy.mockRestore();
  });

  it("booking cannot proceed while the name is missing — asks for it instead", async () => {
    const bookingSpy = vi.spyOn(booking, "executeBooking");

    const response = await processReceptionistMessage({
      text: "yes",
      callerPhone: "+15559876543",
      shop: shopFixture,
      now: FIXED_NOW,
      session: {
        ...bookingSessionWithoutName,
        awaitingField: "confirmation",
      },
    });

    expect(bookingSpy).not.toHaveBeenCalled();
    expect(response.parsed.missingFields).toContain("clientName");
    expect(response.awaitingField).toBe("clientName");
    expect(response.speak).toMatch(/what name should i put the appointment under\?/i);

    bookingSpy.mockRestore();
  });
});

const prismaMock = vi.hoisted(() => ({
  client: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  // Deposit lookup: executeBooking checks whether the shop takes deposits and
  // whether this service requires one.
  barbershop: {
    findUnique: vi.fn(),
  },
  service: {
    findUnique: vi.fn(),
  },
  appointment: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  notification: {
    create: vi.fn(),
  },
  receptionistCallSession: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  default: prismaMock,
}));

vi.mock("@/lib/ai-receptionist/sms", () => ({
  sendReceptionistSms: vi.fn().mockResolvedValue({ success: true }),
}));

describe("executeBooking caller name vs existing client", () => {
  // These fixtures book a fixed calendar date. Freeze the clock just before it
  // so the availability engine's past-time guard doesn't reject the slot once
  // that date drifts into the past in real life.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    prismaMock.appointment.findMany.mockResolvedValue([]);
    // No deposits configured in these fixtures.
    prismaMock.barbershop.findUnique.mockResolvedValue({
      slug: "shop",
      depositsEnabled: false,
      connectStatus: "NOT_CONNECTED",
      stripeConnectAccountId: null,
    });
    prismaMock.service.findUnique.mockResolvedValue({ depositAmount: null });
    prismaMock.appointment.create.mockResolvedValue({
      id: "apt_1",
      startTime: new Date("2026-07-11T22:00:00.000Z"),
    });
    prismaMock.notification.create.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves Dylan client when same phone books as Jeff; stores Jeff snapshot", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: "client_dylan",
      name: "Dylan",
      phone: "+15559876543",
      barbershopId: "shop_1",
    });

    const { executeBooking } = await import("@/lib/ai-receptionist/booking");

    const result = await executeBooking({
      shop: shopFixture,
      callerPhone: "+15559876543",
      parsed: {
        intent: "book_appointment",
        clientName: "Jeff",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        confirmed: true,
        rawText: "yes",
        confidence: 0.95,
        missingFields: [],
      },
    });

    expect(result.success).toBe(true);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
    expect(prismaMock.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "client_dylan",
          barbershopId: "shop_1",
          clientNameSnapshot: "Jeff",
          clientPhoneSnapshot: "+15559876543",
        }),
      })
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.stringContaining("Jeff"),
        }),
      })
    );
  });

  it("voice booked message uses caller name Jeff, snapshot Jeff, client stays Dylan", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: "client_dylan",
      name: "Dylan",
      phone: "+15559876543",
      barbershopId: "shop_1",
    });

    const { executeBooking } = await import("@/lib/ai-receptionist/booking");

    const result = await executeBooking({
      shop: shopFixture,
      callerPhone: "+15559876543",
      parsed: {
        intent: "book_appointment",
        clientName: "Jeff",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        confirmed: true,
        rawText: "yes",
        confidence: 0.95,
        missingFields: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/under the name jeff/i);
    expect(result.message).not.toMatch(/with jeff/i);
    expect(result.message).not.toMatch(/dylan/i);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it('booked message says "with barber Chris" when the caller asked for Chris', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: "client_dylan",
      name: "Dylan",
      phone: "+15559876543",
      barbershopId: "shop_1",
    });

    const { executeBooking } = await import("@/lib/ai-receptionist/booking");

    const result = await executeBooking({
      shop: shopFixture,
      callerPhone: "+15559876543",
      parsed: {
        intent: "book_appointment",
        clientName: "Dylan",
        serviceName: "Haircut",
        barberName: "Chris",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        confirmed: true,
        rawText: "yes",
        confidence: 0.95,
        missingFields: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/under the name dylan/i);
    expect(result.message).toMatch(/with barber chris/i);
    expect(result.message).not.toMatch(/with dylan/i);
  });

  it("caller Marcus with matched client Jeff: snapshot Marcus, Jeff never spoken, no rename", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: "client_jeff",
      name: "Jeff",
      phone: "+15559876543",
      barbershopId: "shop_1",
    });

    const { executeBooking } = await import("@/lib/ai-receptionist/booking");

    const result = await executeBooking({
      shop: shopFixture,
      callerPhone: "+15559876543",
      parsed: {
        intent: "book_appointment",
        clientName: "Marcus",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        confirmed: true,
        rawText: "yes",
        confidence: 0.95,
        missingFields: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/under the name marcus/i);
    expect(result.message).not.toMatch(/jeff/i);
    // Links to the existing client internally but never renames it.
    expect(prismaMock.client.update).not.toHaveBeenCalled();
    expect(prismaMock.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "client_jeff",
          clientNameSnapshot: "Marcus",
          clientPhoneSnapshot: "+15559876543",
        }),
      })
    );
  });

  it("falls back to existing client name Dylan when parsed has no name", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: "client_dylan",
      name: "Dylan",
      phone: "+15559876543",
      barbershopId: "shop_1",
    });

    const { executeBooking } = await import("@/lib/ai-receptionist/booking");

    const result = await executeBooking({
      shop: shopFixture,
      callerPhone: "+15559876543",
      parsed: {
        intent: "book_appointment",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        confirmed: true,
        rawText: "yes",
        confidence: 0.95,
        missingFields: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/under the name dylan/i);
    expect(result.message).not.toMatch(/with dylan/i);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
    expect(prismaMock.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientNameSnapshot: "Dylan",
          clientPhoneSnapshot: "+15559876543",
        }),
      })
    );
  });

  it("never books under a dashboard user name when session has Jeff", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.client.create.mockResolvedValue({
      id: "client_jeff",
      name: "Jeff",
      phone: "+15559876543",
      barbershopId: "shop_1",
    });

    const { executeBooking } = await import("@/lib/ai-receptionist/booking");

    await executeBooking({
      shop: shopFixture,
      callerPhone: "+15559876543",
      parsed: {
        intent: "book_appointment",
        clientName: "Jeff",
        serviceName: "Haircut",
        preferredDate: "2026-07-11",
        preferredTime: "15:00",
        anyBarber: true,
        confirmed: true,
        rawText: "yes",
        confidence: 0.95,
        missingFields: [],
      },
    });

    expect(prismaMock.client.create).toHaveBeenCalledWith({
      data: {
        barbershopId: "shop_1",
        name: "Jeff",
        phone: "+15559876543",
      },
    });
    expect(prismaMock.client.create.mock.calls[0][0].data.name).not.toBe("Dylan");
    expect(prismaMock.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientNameSnapshot: "Jeff",
          clientPhoneSnapshot: "+15559876543",
        }),
      })
    );
  });
});

describe("call session name isolation", () => {
  const completedJeffSession = {
    id: "sess_old",
    callSid: "CA_old_call",
    callerPhone: "+15559876543",
    barbershopId: "shop_1",
    intent: "book_appointment",
    clientName: "Jeff",
    suggestedClientName: "Jeff",
    confirmedClientName: true,
    serviceName: "Haircut",
    barberName: null,
    preferredDate: "2026-07-11",
    preferredTime: "15:00",
    awaitingField: null,
    appointmentId: "apt_old",
    status: "COMPLETED",
    turnCount: 6,
    context: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a new CallSid starts a fresh session with no name from previous calls", async () => {
    prismaMock.receptionistCallSession.findUnique.mockResolvedValue(null);
    prismaMock.receptionistCallSession.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...completedJeffSession,
          ...data,
          id: "sess_new",
          clientName: null,
          suggestedClientName: null,
          confirmedClientName: false,
          appointmentId: null,
        })
    );

    const { createCallSession } = await import("@/lib/ai-receptionist/session");
    const session = await createCallSession("CA_new_call", "+15559876543", {
      barbershopId: "shop_1",
    });

    expect(prismaMock.receptionistCallSession.create).toHaveBeenCalledOnce();
    const createData =
      prismaMock.receptionistCallSession.create.mock.calls[0][0].data;
    // Fresh row — no name may be seeded from anywhere.
    expect(createData.clientName).toBeUndefined();
    expect(createData.suggestedClientName).toBeUndefined();
    expect(session.clientName).toBeNull();
    expect(session.confirmedClientName).toBe(false);
    expect(session.status).toBe("ACTIVE");
  });

  it("a completed session reused by CallSid is reset — Jeff cannot leak into the new call", async () => {
    prismaMock.receptionistCallSession.findUnique.mockResolvedValue(
      completedJeffSession
    );
    prismaMock.receptionistCallSession.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...completedJeffSession, ...data })
    );

    const { createCallSession } = await import("@/lib/ai-receptionist/session");
    const session = await createCallSession("CA_old_call", "+15559876543", {
      barbershopId: "shop_1",
    });

    const updateData =
      prismaMock.receptionistCallSession.update.mock.calls[0][0].data;
    expect(updateData.clientName).toBeNull();
    expect(updateData.suggestedClientName).toBeNull();
    expect(updateData.confirmedClientName).toBe(false);
    expect(updateData.appointmentId).toBeNull();
    expect(updateData.status).toBe("ACTIVE");

    expect(session.clientName).toBeNull();
    expect(session.suggestedClientName).toBeNull();
    expect(session.confirmedClientName).toBe(false);
    expect(session.status).toBe("ACTIVE");
  });
});
