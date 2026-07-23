import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserRole } from "@prisma/client";
import { sanitizeInternalRedirect } from "@/lib/safe-redirect";
import { sanitizeInput } from "@/lib/rate-limit";
import {
  AI_INACTIVE_VOICE_MESSAGE,
  canUseAiReceptionist,
} from "@/lib/subscription";

describe("safe redirects", () => {
  it("blocks open redirects and protocol-relative URLs", () => {
    expect(sanitizeInternalRedirect("//evil.com")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("https://evil.com")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("/\\evil")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("/login")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("/calendar")).toBe("/calendar");
    expect(sanitizeInternalRedirect(null)).toBe("/dashboard");
  });
});

describe("XSS sanitization", () => {
  it("strips angle brackets from user input", () => {
    expect(sanitizeInput('<script>alert("x")</script>Jeff')).toBe(
      'scriptalert("x")/scriptJeff'
    );
    expect(sanitizeInput("Normal Name")).toBe("Normal Name");
  });

  it("renders sanitized names as plain text (no HTML injection surface)", () => {
    const name = sanitizeInput("<img src=x onerror=alert(1)>");
    // React text children would escape; we also strip tags at input.
    expect(name).not.toContain("<");
    expect(name).not.toContain(">");
  });
});

describe("Twilio webhook auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects invalid signatures in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_SHOP_FALLBACK", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test_auth_token_1234567890");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://cut.example.com");

    vi.doMock("@/lib/twilio", async () => {
      const actual = await vi.importActual<typeof import("@/lib/twilio")>(
        "@/lib/twilio"
      );
      return {
        ...actual,
        validateTwilioSignature: vi.fn(() => false),
      };
    });

    const { assertTwilioWebhook } = await import("@/lib/twilio-webhook-auth");
    const formData = new FormData();
    formData.set("CallSid", "CA123");
    formData.set("From", "+15551234567");
    formData.set("To", "+14243907235");

    const request = new Request("https://cut.example.com/api/twilio/voice", {
      method: "POST",
      headers: { "x-twilio-signature": "invalid" },
    }) as unknown as import("next/server").NextRequest;

    // NextRequest-like: provide nextUrl
    Object.defineProperty(request, "nextUrl", {
      value: new URL("https://cut.example.com/api/twilio/voice"),
    });
    Object.defineProperty(request, "headers", {
      value: new Headers({ "x-twilio-signature": "invalid" }),
    });

    const result = await assertTwilioWebhook(request, formData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("allows missing token in development with warning", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");

    const { assertTwilioWebhook } = await import("@/lib/twilio-webhook-auth");
    const formData = new FormData();
    formData.set("CallSid", "CA_dev");
    const request = {
      headers: new Headers(),
      nextUrl: new URL("http://localhost:3000/api/twilio/voice"),
    } as unknown as import("next/server").NextRequest;

    const result = await assertTwilioWebhook(request, formData);
    expect(result.ok).toBe(true);
  });
});

describe("Stripe webhook signature rejection", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/stripe");
    vi.doUnmock("@/lib/db");
  });

  it("rejects invalid Stripe webhook signatures", async () => {
    vi.doMock("@/lib/stripe", () => ({
      isStripeConfigured: vi.fn(() => true),
      getStripe: vi.fn(() => ({
        webhooks: {
          constructEvent: vi.fn(() => {
            throw new Error("Invalid signature");
          }),
        },
      })),
      getStripeWebhookSecret: vi.fn(() => "whsec_test"),
    }));
    vi.doMock("@/lib/db", () => ({
      default: { barbershop: { update: vi.fn(), updateMany: vi.fn() } },
    }));

    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=bad" },
        body: "{}",
      }) as never
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid signature/i);
  });
});

describe("authorization isolation", () => {
  const prismaMock = vi.hoisted(() => ({
    appointment: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    service: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    barber: { findFirst: vi.fn() },
    client: { findMany: vi.fn() },
    barbershop: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    barbershopMembership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: { findUnique: vi.fn(), update: vi.fn() },
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/supabase/server");
    vi.doUnmock("next/cache");
  });

  it("updateAppointment rejects serviceId from another shop", async () => {
    vi.doMock("@/lib/db", () => ({ default: prismaMock }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_dev" } },
          })),
        },
      })),
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn() })),
    }));

    const shop = {
      id: "shop_dev",
      name: "Dev",
      slug: "dev",
      timezone: "America/Los_Angeles",
    };

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_dev",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.OWNER,
      barbershopId: "shop_dev",
      barbershop: shop,
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue({
      id: "m1",
      userId: "user_dev",
      barbershopId: "shop_dev",
      role: UserRole.OWNER,
    });
    prismaMock.barbershopMembership.findMany.mockResolvedValue([
      { id: "m1", role: UserRole.OWNER, barbershop: shop },
    ]);
    prismaMock.appointment.findFirst.mockResolvedValue({
      id: "apt_1",
      barbershopId: "shop_dev",
      barberId: "b1",
      duration: 30,
      startTime: new Date(),
      clientPhoneSnapshot: "+15550001111",
      client: { phone: "+15550001111", name: "Jeff" },
      barber: { id: "b1", name: "Chris" },
      service: { id: "svc_dev", name: "Haircut" },
      barbershop: shop,
    });
    // Cross-shop service lookup returns null
    prismaMock.service.findFirst.mockResolvedValue(null);

    // barber findFirst for active shop resolution
    prismaMock.barber.findFirst.mockResolvedValue({ id: "b1" });

    const { updateAppointment } = await import("@/actions/appointments");
    const result = await updateAppointment("apt_1", {
      serviceId: "svc_other_shop",
    });
    expect(result).toEqual({ error: "Service not found" });
    expect(prismaMock.appointment.update).not.toHaveBeenCalled();
  });

  it("non-owner cannot change phone setup", async () => {
    vi.doMock("@/lib/db", () => ({ default: prismaMock }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_barber" } },
          })),
        },
      })),
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn() })),
    }));

    const shop = {
      id: "shop_dev",
      name: "Dev",
      slug: "dev",
      timezone: "America/Los_Angeles",
    };

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_barber",
      email: "barber@example.com",
      name: "Barber",
      role: UserRole.BARBER,
      barbershopId: "shop_dev",
      barbershop: shop,
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue({
      id: "m1",
      userId: "user_barber",
      barbershopId: "shop_dev",
      role: UserRole.BARBER,
    });
    prismaMock.barbershopMembership.findMany.mockResolvedValue([
      { id: "m1", role: UserRole.BARBER, barbershop: shop },
    ]);
    prismaMock.barber.findFirst.mockResolvedValue({ id: "b1" });

    const { updateShopSettings } = await import("@/actions/appointments");
    const result = await updateShopSettings({
      name: "Dev",
      timezone: "America/Los_Angeles",
      twilioPhone: "+15559999999",
    });
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("updateService always includes active barbershopId in the update scope", async () => {
    vi.doMock("@/lib/db", () => ({ default: prismaMock }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_dev" } },
          })),
        },
      })),
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn() })),
    }));

    const shop = {
      id: "shop_dev",
      name: "Dev",
      slug: "dev",
      timezone: "America/Los_Angeles",
    };

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_dev",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.OWNER,
      barbershopId: "shop_dev",
      barbershop: shop,
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue({
      id: "m1",
      userId: "user_dev",
      barbershopId: "shop_dev",
      role: UserRole.OWNER,
    });
    prismaMock.barbershopMembership.findMany.mockResolvedValue([
      { id: "m1", role: UserRole.OWNER, barbershop: shop },
    ]);
    prismaMock.barber.findFirst.mockResolvedValue({ id: "b1" });
    prismaMock.service.update.mockResolvedValue({
      id: "svc_dev",
      name: "Haircut",
      description: null,
      duration: 30,
      price: 35,
      color: "#007AFF",
      isActive: true,
      barbershopId: "shop_dev",
    });

    const { updateService } = await import("@/actions/appointments");
    await updateService("svc_dev", {
      name: "Haircut",
      description: "",
      duration: 30,
      price: 35,
      color: "#007AFF",
    });

    expect(prismaMock.service.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "svc_dev", barbershopId: "shop_dev" },
      })
    );
  });
});

describe("shop switch cache bust", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/auth");
    vi.doUnmock("next/cache");
  });

  it("revalidates shop-scoped routes after setActiveShop", async () => {
    const revalidatePath = vi.fn();
    vi.doMock("next/cache", () => ({ revalidatePath }));
    vi.doMock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        switchActiveBarbershop: vi.fn(async () => ({ success: true })),
      };
    });

    const { setActiveShop } = await import("@/actions/auth");
    const result = await setActiveShop("shop_b");
    expect(result).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(revalidatePath).toHaveBeenCalledWith("/settings/billing");
  });
});

describe("AI paywall voice message", () => {
  it("unpaid production shop cannot use AI receptionist", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_SHOP_FALLBACK", "");
    const unpaid = {
      id: "s1",
      name: "Acme",
      plan: "STARTER" as const,
      subscriptionStatus: "ACTIVE" as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
    };
    expect(canUseAiReceptionist(unpaid)).toBe(false);
    expect(AI_INACTIVE_VOICE_MESSAGE).toMatch(/not active/i);
    vi.unstubAllEnvs();
  });

  it("Dev shop can still test locally", () => {
    vi.stubEnv("NODE_ENV", "development");
    const dev = {
      id: "s1",
      name: "Dev",
      plan: "NONE" as const,
      subscriptionStatus: "NONE" as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
    };
    expect(canUseAiReceptionist(dev)).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("cron fail-closed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  it("rejects when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.doMock("@/lib/db", () => ({
      default: { appointment: { findMany: vi.fn() } },
    }));

    const { GET } = await import("@/app/api/cron/reminders/route");
    const res = await GET(
      new Request("http://localhost/api/cron/reminders") as never
    );
    expect(res.status).toBe(503);
  });
});
