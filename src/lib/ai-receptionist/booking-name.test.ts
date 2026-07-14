import { describe, it, expect, vi, beforeEach } from "vitest";
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

const prismaMock = vi.hoisted(() => ({
  client: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  appointment: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  notification: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  default: prismaMock,
}));

vi.mock("@/lib/ai-receptionist/sms", () => ({
  sendReceptionistSms: vi.fn().mockResolvedValue({ success: true }),
}));

describe("executeBooking caller name vs existing client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.appointment.findMany.mockResolvedValue([]);
    prismaMock.appointment.create.mockResolvedValue({
      id: "apt_1",
      startTime: new Date("2026-07-11T22:00:00.000Z"),
    });
    prismaMock.notification.create.mockResolvedValue({});
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
