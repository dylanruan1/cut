import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  canUseAiReceptionist,
  canUseAnalytics,
  canUseCalendar,
  canUseTeam,
  isLocalDevShopBypass,
  mapStripeSubscriptionStatus,
  AI_INACTIVE_VOICE_MESSAGE,
  type ShopSubscriptionSnapshot,
} from "@/lib/subscription";
import { getStripeConfigStatus, isStripeConfigured } from "@/lib/stripe";

function shop(
  overrides: Partial<ShopSubscriptionSnapshot> = {}
): ShopSubscriptionSnapshot {
  return {
    id: "shop_1",
    name: "Acme Cuts",
    plan: "NONE",
    subscriptionStatus: "NONE",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    ...overrides,
  };
}

describe("subscription paywall helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks unpaid shops from calendar/team/analytics/ai", () => {
    const unpaid = shop();
    expect(canUseCalendar(unpaid)).toBe(false);
    expect(canUseTeam(unpaid)).toBe(false);
    expect(canUseAnalytics(unpaid)).toBe(false);
    expect(canUseAiReceptionist(unpaid)).toBe(false);
  });

  it("Starter trial unlocks calendar but not team/ai", () => {
    const starter = shop({
      plan: "STARTER",
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 86400000),
    });
    expect(canUseCalendar(starter)).toBe(true);
    expect(canUseTeam(starter)).toBe(false);
    expect(canUseAiReceptionist(starter)).toBe(false);
  });

  it("Pro unlocks team and analytics", () => {
    const pro = shop({ plan: "PRO", subscriptionStatus: "ACTIVE" });
    expect(canUseCalendar(pro)).toBe(true);
    expect(canUseTeam(pro)).toBe(true);
    expect(canUseAnalytics(pro)).toBe(true);
    expect(canUseAiReceptionist(pro)).toBe(false);
  });

  it("AI_RECEPTIONIST unlocks AI phone", () => {
    const ai = shop({
      plan: "AI_RECEPTIONIST",
      subscriptionStatus: "ACTIVE",
    });
    expect(canUseAiReceptionist(ai)).toBe(true);
    expect(canUseTeam(ai)).toBe(true);
  });

  it("local Dev shop bypasses paywall in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const dev = shop({ name: "Dev", plan: "NONE", subscriptionStatus: "NONE" });
    expect(isLocalDevShopBypass(dev)).toBe(true);
    expect(canUseAiReceptionist(dev)).toBe(true);
    expect(canUseCalendar(dev)).toBe(true);
  });

  it("Test Shop 2 does not get Dev bypass", () => {
    vi.stubEnv("NODE_ENV", "development");
    const test2 = shop({
      name: "Test Shop 2",
      plan: "NONE",
      subscriptionStatus: "NONE",
    });
    expect(isLocalDevShopBypass(test2)).toBe(false);
    expect(canUseAiReceptionist(test2)).toBe(false);
  });

  it("production Dev shop does not bypass", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_SHOP_FALLBACK", "");
    const dev = shop({ name: "Dev" });
    expect(isLocalDevShopBypass(dev)).toBe(false);
    expect(canUseAiReceptionist(dev)).toBe(false);
  });

  it("maps stripe statuses", () => {
    expect(mapStripeSubscriptionStatus("trialing")).toBe("TRIALING");
    expect(mapStripeSubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("CANCELED");
  });

  it("exposes inactive AI voice message", () => {
    expect(AI_INACTIVE_VOICE_MESSAGE).toMatch(/not active/i);
  });
});

describe("stripe config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports missing env vars without crashing", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    vi.stubEnv("STRIPE_STARTER_PRICE_ID", "");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "");
    vi.stubEnv("STRIPE_AI_RECEPTIONIST_PRICE_ID", "");
    const status = getStripeConfigStatus();
    expect(status.configured).toBe(false);
    expect(status.missing.length).toBeGreaterThan(0);
    expect(isStripeConfigured()).toBe(false);
  });
});

describe("billing API auth gates", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/auth");
    vi.doUnmock("@/lib/stripe");
    vi.doUnmock("@/lib/db");
  });

  it("checkout rejects unauthenticated users", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => null),
      canManageShop: vi.fn(() => true),
    }));
    vi.doMock("@/lib/stripe", () => ({
      isStripeConfigured: vi.fn(() => true),
      getStripe: vi.fn(() => ({})),
      getPriceIdForPlan: vi.fn(() => "price_x"),
      getAppUrl: vi.fn(() => "http://localhost:3000"),
    }));

    const { POST } = await import(
      "@/app/api/billing/create-checkout-session/route"
    );
    const res = await POST(
      new Request("http://localhost/api/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "STARTER" }),
      }) as never
    );
    expect(res.status).toBe(401);
  });

  it("checkout rejects non-owner users", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "u1",
        email: "b@example.com",
        role: "BARBER",
        barbershopId: "shop_1",
      })),
      canManageShop: vi.fn(() => false),
    }));
    vi.doMock("@/lib/stripe", () => ({
      isStripeConfigured: vi.fn(() => true),
      getStripe: vi.fn(() => ({})),
      getPriceIdForPlan: vi.fn(() => "price_x"),
      getAppUrl: vi.fn(() => "http://localhost:3000"),
    }));

    const { POST } = await import(
      "@/app/api/billing/create-checkout-session/route"
    );
    const res = await POST(
      new Request("http://localhost/api/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "PRO" }),
      }) as never
    );
    expect(res.status).toBe(403);
  });

  it("checkout rejects missing Stripe env vars gracefully", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "u1",
        email: "o@example.com",
        role: "OWNER",
        barbershopId: "shop_1",
      })),
      canManageShop: vi.fn(() => true),
    }));
    vi.doMock("@/lib/stripe", () => ({
      isStripeConfigured: vi.fn(() => false),
      getStripe: vi.fn(() => null),
      getPriceIdForPlan: vi.fn(() => null),
      getAppUrl: vi.fn(() => "http://localhost:3000"),
    }));

    const { POST } = await import(
      "@/app/api/billing/create-checkout-session/route"
    );
    const res = await POST(
      new Request("http://localhost/api/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "AI_RECEPTIONIST" }),
      }) as never
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
  });
});

describe("webhook subscription update", () => {
  it("applies plan and status from subscription metadata shape", async () => {
    const update = vi.fn().mockResolvedValue({});
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      default: { barbershop: { update: update, updateMany: vi.fn() } },
    }));
    vi.doMock("@/lib/stripe", () => ({
      isStripeConfigured: vi.fn(() => true),
      getStripe: vi.fn(() => ({
        webhooks: {
          constructEvent: vi.fn(() => ({
            type: "customer.subscription.updated",
            data: {
              object: {
                id: "sub_1",
                status: "active",
                customer: "cus_1",
                trial_end: null,
                current_period_end: 1900000000,
                metadata: {
                  barbershopId: "shop_ai",
                  plan: "AI_RECEPTIONIST",
                },
                items: {
                  data: [{ price: { id: "price_ai" } }],
                },
              },
            },
          })),
        },
      })),
      getStripeWebhookSecret: vi.fn(() => "whsec_test"),
    }));
    vi.stubEnv("STRIPE_AI_RECEPTIONIST_PRICE_ID", "price_ai");

    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=fake" },
        body: "{}",
      }) as never
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "shop_ai" },
        data: expect.objectContaining({
          plan: "AI_RECEPTIONIST",
          subscriptionStatus: "ACTIVE",
          stripeSubscriptionId: "sub_1",
        }),
      })
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
