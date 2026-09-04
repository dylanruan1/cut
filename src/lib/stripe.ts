import Stripe from "stripe";
import type { ShopPlan } from "@prisma/client";
import { isBillablePlan, stripePriceEnvForPlan } from "@/lib/subscription";

export type StripeConfigStatus = {
  configured: boolean;
  missing: string[];
  publishableKey: string | null;
};

export function getStripeConfigStatus(): StripeConfigStatus {
  const required = [
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_STARTER_PRICE_ID",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_AI_RECEPTIONIST_PRICE_ID",
  ] as const;

  const missing = required.filter((key) => !process.env[key]?.trim());
  return {
    configured: missing.length === 0,
    missing: [...missing],
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null,
  };
}

export function isStripeConfigured(): boolean {
  return getStripeConfigStatus().configured;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      typescript: true,
    });
  }
  return stripeClient;
}

export function getPriceIdForPlan(plan: ShopPlan): string | null {
  if (!isBillablePlan(plan)) return null;
  return stripePriceEnvForPlan(plan)?.trim() || null;
}

/**
 * Stripe price for a founding-member AI subscription.
 *
 * Falls back to the list AI price when unset, so a missing env var overcharges
 * rather than crashing checkout — and deliberately not the reverse, since a
 * misconfiguration that silently gave everyone the founding rate forever would
 * be far harder to notice and impossible to claw back.
 */
export function getFoundingPriceId(): string | null {
  return (
    process.env.STRIPE_AI_FOUNDING_PRICE_ID?.trim() ||
    getPriceIdForPlan("AI_RECEPTIONIST")
  );
}

/**
 * Stripe price for one barber seat above a plan's included count.
 */
export function getPerBarberPriceId(): string | null {
  return process.env.STRIPE_PER_BARBER_PRICE_ID?.trim() || null;
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
