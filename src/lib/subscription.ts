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
 * Per-barber price above a plan's included seats.
 *
 * A seat costs us almost nothing — the marginal cost of another barber is a few
 * more reminder texts. $12 is priced against what a shop already pays per chair
 * elsewhere, not against our cost.
 */
export const PER_BARBER_PRICE = 12;

/**
 * Founding price for the AI plan, locked for the life of the subscription.
 *
 * List stays $249. The first FOUNDING_SHOP_LIMIT shops to subscribe pay this
 * instead, forever. The point is a real reason to sign up today rather than
 * think about it, without permanently discounting every future customer.
 */
export const FOUNDING_AI_PRICE = 199;
export const FOUNDING_SHOP_LIMIT = 25;

/**
 * Usage ceilings for the AI receptionist.
 *
 * These are NOT a billing device — nobody is ever charged for going over. They
 * exist because of where the money actually goes on a call:
 *
 *   Twilio speech recognition   7 turns × $0.02  = $0.140
 *   Twilio inbound voice        3 min × $0.0085  = $0.026
 *   Claude Haiku                20k in / 1.2k out = $0.026
 *                                                  -------
 *                                        per call ≈ $0.19
 *
 * Against $249/mo with a typical shop's texts and fixed costs, break-even lands
 * near 1,150 answered calls a month — about 38 a day, every day. No real
 * barbershop reaches that. A shop doing 400 haircuts would need three phone
 * calls per booking.
 *
 * So the only thing that gets us to a loss is abuse: robocallers hammering the
 * number, or a call loop. Charging a shop for that would be billing them for
 * something they never asked for, which is why WARN is a private signal to us
 * and CEILING only trips in territory that is already obviously wrong.
 *
 * At CEILING (900 calls) we are down to roughly $19 of margin — still positive,
 * which is deliberate. The stop should fire while there is still room, not
 * after the money is gone.
 */
export const AI_CALLS_WARN_THRESHOLD = 300;
export const AI_CALLS_HARD_CEILING = 900;
export const SMS_WARN_THRESHOLD = 1500;

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
    /** Barbers included before per-seat billing starts. Null = no cap. */
    includedBarbers?: number | null;
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
    includedBarbers: 1,
    features: [
      "Online booking page",
      "Walk-in queue with QR code",
      "Calendar scheduling",
      "Client list and services",
      "Deposits and no-show protection",
      "No fees on payments — you keep what Stripe doesn't take",
      "No charge per booking, ever",
    ],
  },
  PRO: {
    name: "Pro",
    subtitle: "For a shop with a team.",
    monthlyPrice: 99,
    includedBarbers: 6,
    priceNote: `Up to 6 barbers, then $${PER_BARBER_PRICE} each.`,
    features: [
      "Everything in Starter",
      "Up to 6 barbers included",
      "Team management and permissions",
      "Revenue and no-show analytics",
      "Multi-barber calendar",
      "Cancellation waitlist included — competitors charge extra",
    ],
  },
  AI_RECEPTIONIST: {
    name: "AI Receptionist",
    subtitle: "Nobody misses a call again.",
    monthlyPrice: 249,
    includedBarbers: 6,
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

