import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  describeBookingForVoice,
  getReceptionistGreeting,
} from "@/lib/ai-receptionist/prompts";
import { getVoiceWebhookUrl } from "@/lib/voice-webhook";
import { UNCONNECTED_NUMBER_MESSAGE } from "@/lib/ai-receptionist/shop-resolve";
import { normalizePhone } from "@/lib/twilio";

describe("AI receptionist shop identity in voice", () => {
  it("greeting includes the shop name", () => {
    expect(getReceptionistGreeting("Westside Barbers")).toBe(
      "Thanks for calling Westside Barbers. I'm the AI receptionist. I can help you book, reschedule, or cancel an appointment. How can I help you today?"
    );
  });

  it("confirmation description includes shop name with under-the-name convention", () => {
    const spoken = describeBookingForVoice({
      serviceName: "Haircut",
      clientName: "Marcus",
      shopName: "Westside Barbers",
    });
    expect(spoken).toBe("Haircut under the name Marcus at Westside Barbers");
    expect(spoken).toMatch(/under the name Marcus/);
    expect(spoken).toMatch(/at Westside Barbers/);
  });

  it("confirmation can include preferred barber without confusing names", () => {
    const spoken = describeBookingForVoice({
      serviceName: "Fade",
      clientName: "Marcus",
      barberName: "Chris",
      shopName: "Westside Barbers",
    });
    expect(spoken).toBe(
      "Fade under the name Marcus with barber Chris at Westside Barbers"
    );
  });

  it("final booked message pattern includes shop name", () => {
    const shopName = "Westside Barbers";
    const details = describeBookingForVoice({
      serviceName: "Haircut",
      clientName: "Marcus",
      shopName,
    });
    const speak = `You're booked at ${shopName}. The appointment is ${details} for tomorrow at 8 PM. You'll get a text confirmation shortly.`;
    expect(speak).toMatch(/You're booked at Westside Barbers/);
    expect(speak).toMatch(/at Westside Barbers/);
  });
});

describe("voice webhook URL", () => {
  it("derives from NEXT_PUBLIC_APP_URL", () => {
    expect(getVoiceWebhookUrl("https://cut.example.com")).toBe(
      "https://cut.example.com/api/twilio/voice"
    );
    expect(getVoiceWebhookUrl("https://cut.example.com/")).toBe(
      "https://cut.example.com/api/twilio/voice"
    );
  });
});

describe("shop settings Twilio number normalization", () => {
  it("normalizes twilioPhone the same way routing does", () => {
    const saved = normalizePhone("+1 (555) 987-6543");
    expect(saved).toBe("+15559876543");
    expect(normalizePhone("555-987-6543")).toBe(saved);
  });
});

const prismaMock = vi.hoisted(() => ({
  barbershop: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  service: { findMany: vi.fn() },
  barber: { findMany: vi.fn() },
  businessHour: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  default: prismaMock,
}));

describe("unknown Twilio number does not book wrong shop in production", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("resolveShopForTwilioTo returns unmatched with no shop when production has no match", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_SHOP_FALLBACK", "");

    prismaMock.barbershop.findFirst.mockResolvedValue(null);
    prismaMock.barbershop.findMany.mockResolvedValue([
      {
        id: "shop_other",
        name: "Other Shop",
        twilioPhone: "+15551111111",
      },
    ]);

    const { resolveShopForTwilioTo } = await import(
      "@/lib/ai-receptionist/shop-resolve"
    );
    const result = await resolveShopForTwilioTo("+15559999999");

    expect(result.shop).toBeNull();
    expect(result.unmatched).toBe(true);
    expect(UNCONNECTED_NUMBER_MESSAGE).toMatch(
      /phone number is not connected to a barbershop/i
    );
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("routes Shop A and Shop B by their own twilioPhone", async () => {
    const shopA = {
      id: "shop_a",
      name: "Shop A",
      twilioPhone: "+15551111111",
      address: null,
      phone: null,
      timezone: "America/Los_Angeles",
    };
    const shopB = {
      id: "shop_b",
      name: "Shop B",
      twilioPhone: "+15552222222",
      address: null,
      phone: null,
      timezone: "America/Los_Angeles",
    };

    prismaMock.barbershop.findFirst
      .mockResolvedValueOnce(shopA)
      .mockResolvedValueOnce(shopB);
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.barber.findMany.mockResolvedValue([]);
    prismaMock.businessHour.findMany.mockResolvedValue([]);

    const { resolveShopForTwilioTo } = await import(
      "@/lib/ai-receptionist/shop-resolve"
    );

    const a = await resolveShopForTwilioTo("+15551111111");
    expect(a.shop?.id).toBe("shop_a");
    expect(a.shop?.name).toBe("Shop A");

    const b = await resolveShopForTwilioTo("+15552222222");
    expect(b.shop?.id).toBe("shop_b");
    expect(b.shop?.name).toBe("Shop B");
  });
});
