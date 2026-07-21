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

export const PLAN_DISPLAY: Record<
  ShopPlan,
  {
    name: string;
    subtitle: string;
    features: string[];
    highlight?: boolean;
  }
> = {
  NONE: {
    name: "No plan",
    subtitle: "Choose a plan to unlock Cut.",
    features: [],
  },
  STARTER: {
    name: "Starter",
    subtitle: "Run your appointment calendar.",
    features: [
      "Calendar scheduling",
      "Client list",
      "Services",
      "Shop settings",
      "Basic appointment management",
    ],
  },
  PRO: {
    name: "Pro",
    subtitle: "Manage your shop, team, clients, and analytics.",
    features: [
      "Everything in Starter",
      "Team management",
      "Analytics",
      "Multi-barber calendar",
      "Better client management",
    ],
  },
  AI_RECEPTIONIST: {
    name: "AI Receptionist",
    subtitle: "Let customers call and book automatically.",
    features: [
      "Everything in Pro",
      "AI phone receptionist",
      "Automatic phone booking",
      "Twilio phone setup",
      "Call routing by shop",
      "Appointment confirmations",
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

