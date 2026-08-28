import type { ShopPlan, SubscriptionStatus } from "@prisma/client";
import { isDevelopmentEnvironment } from "@/lib/shop-constants";

export type { ShopPlan, SubscriptionStatus };

export const PLAN_ORDER: ShopPlan[] = [
  "NONE",
  "STARTER",
  "PRO",
  "AI_RECEPTIONIST",
];

export const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "TRIALING",
  "ACTIVE",
];

export type ShopSubscriptionSnapshot = {
  id: string;
  name: string;
  plan: ShopPlan;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

/**
 * Plan pricing and copy.
 *
 * Prices live here rather than only in Stripe so the pricing page can state a
 * number without a round trip. They must be kept in step with the Stripe
 * prices created by scripts/setup-stripe-products.ts — Stripe is the source of
 * truth for what is actually charged; this is what the customer is told.
 *
 * Positioning note: Cut takes no cut of payments (PLATFORM_FEE_BPS is 0), so a
 * shop pays only Stripe's own processing. Competitors resell processing at
 * 2.6–2.75%, so "we don't touch your payments" is a real difference and is
 * stated on the page deliberately.
 */
export const PLAN_DISPLAY: Record<
  ShopPlan,
  {
    name: string;
    subtitle: string;
    /** Monthly price in whole dollars. Null for the placeholder NONE plan. */
    monthlyPrice: number | null;
    features: string[];
    highlight?: boolean;
    /** Shown under the price where it needs justifying. */
    priceNote?: string;
  }
> = {
  NONE: {
    name: "No plan",
    subtitle: "Choose a plan to unlock Cut.",
    monthlyPrice: null,
    features: [],
  },
  STARTER: {
    name: "Starter",
    subtitle: "For a solo barber.",
    monthlyPrice: 39,
    features: [
      "Online booking page",
      "Walk-in queue with QR code",
      "Calendar scheduling",
      "Client list and services",
      "Deposits and no-show protection",
      "No fees on payments — you keep what Stripe doesn't take",
    ],
  },
  PRO: {
    name: "Pro",
    subtitle: "For a shop with a team.",
    monthlyPrice: 99,
    features: [
      "Everything in Starter",
      "Up to 6 barbers",
      "Team management and permissions",
      "Revenue and no-show analytics",
      "Multi-barber calendar",
    ],
  },
  AI_RECEPTIONIST: {
    name: "AI Receptionist",
    subtitle: "Nobody misses a call again.",
    monthlyPrice: 249,
    priceNote:
      "Pays for itself at about six recovered calls a month.",
    features: [
      "Everything in Pro",
      "AI answers your phone 24/7",
      "Books, reschedules and cancels by voice",
      "Speaks English and Spanish",
      "Keeps your existing number",
      "Never puts a customer on hold",
    ],
    highlight: true,
  },
};

export function planRank(plan: ShopPlan): number {
  return PLAN_ORDER.indexOf(plan);
}

export function hasPlanAtLeast(
  current: ShopPlan,
  required: ShopPlan
): boolean {
  return planRank(current) >= planRank(required);
}

/** Dev shop named "Dev" bypasses paywalls in local development only. */
export function isLocalDevShopBypass(shop: {
  name: string;
}): boolean {
  return isDevelopmentEnvironment() && shop.name.trim() === "Dev";
}

export function isSubscriptionAccessActive(
  status: SubscriptionStatus,
  trialEndsAt?: Date | null
): boolean {
  if (status === "ACTIVE") return true;
  if (status === "TRIALING") {
    if (!trialEndsAt) return true;
    return trialEndsAt.getTime() > Date.now();
  }
  return false;
}

export function getShopSubscription(
  shop: ShopSubscriptionSnapshot
): ShopSubscriptionSnapshot {
  return shop;
}

export function canUseCalendar(shop: ShopSubscriptionSnapshot): boolean {
  if (isLocalDevShopBypass(shop)) return true;
  return (
    isSubscriptionAccessActive(shop.subscriptionStatus, shop.trialEndsAt) &&
    hasPlanAtLeast(shop.plan, "STARTER")
  );
}

export function canUseTeam(shop: ShopSubscriptionSnapshot): boolean {
  if (isLocalDevShopBypass(shop)) return true;
  return (
    isSubscriptionAccessActive(shop.subscriptionStatus, shop.trialEndsAt) &&
    hasPlanAtLeast(shop.plan, "PRO")
  );
}

export function canUseAnalytics(shop: ShopSubscriptionSnapshot): boolean {
  if (isLocalDevShopBypass(shop)) return true;
  return (
    isSubscriptionAccessActive(shop.subscriptionStatus, shop.trialEndsAt) &&
    hasPlanAtLeast(shop.plan, "PRO")
  );
}

export function canUseAiReceptionist(shop: ShopSubscriptionSnapshot): boolean {
  if (isLocalDevShopBypass(shop)) return true;
  return (
    isSubscriptionAccessActive(shop.subscriptionStatus, shop.trialEndsAt) &&
    hasPlanAtLeast(shop.plan, "AI_RECEPTIONIST")
  );
}

export function canUseBasicApp(shop: ShopSubscriptionSnapshot): boolean {
  return canUseCalendar(shop);
}

export function getRequiredPlanForFeature(
  feature: "calendar" | "team" | "analytics" | "ai"
): ShopPlan {
  switch (feature) {
    case "calendar":
      return "STARTER";
    case "team":
    case "analytics":
      return "PRO";
    case "ai":
      return "AI_RECEPTIONIST";
  }
}

export const AI_INACTIVE_VOICE_MESSAGE =
  "Sorry, this barbershop's AI receptionist is not active right now.";

export function stripePriceEnvForPlan(plan: ShopPlan): string | undefined {
  switch (plan) {
    case "STARTER":
      return process.env.STRIPE_STARTER_PRICE_ID;
    case "PRO":
      return process.env.STRIPE_PRO_PRICE_ID;
    case "AI_RECEPTIONIST":
      return process.env.STRIPE_AI_RECEPTIONIST_PRICE_ID;
    default:
      return undefined;
  }
}

export function isBillablePlan(plan: string): plan is Exclude<ShopPlan, "NONE"> {
  return plan === "STARTER" || plan === "PRO" || plan === "AI_RECEPTIONIST";
}

export function planFromStripePriceId(priceId: string | null | undefined): ShopPlan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "STARTER";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO";
  if (priceId === process.env.STRIPE_AI_RECEPTIONIST_PRICE_ID) {
    return "AI_RECEPTIONIST";
  }
  return null;
}

export function mapStripeSubscriptionStatus(
  status: string
): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "unpaid":
      return "CANCELED";
    case "incomplete":
    case "incomplete_expired":
      return "INCOMPLETE";
    default:
      return "INCOMPLETE";
  }
}

export function defaultTrialEndsAt(days = 14): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

