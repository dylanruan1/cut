import type Stripe from "stripe";
import { getStripe, getAppUrl } from "@/lib/stripe";

/**
 * Stripe Connect (Express) helpers.
 *
 * Money model — important:
 *  - Customer deposits are *destination charges*. The charge is created on the
 *    platform (Cut) but funds settle into the barbershop's own connected
 *    account, so Cut never holds the shop's money.
 *  - Cut may take an `application_fee_amount` per deposit. That fee is Cut's
 *    revenue and is the only portion that lands in the platform account.
 *
 * This keeps Cut out of money-transmission territory and matches how other
 * booking platforms handle shop payouts.
 */

/** Platform fee in basis points (100 bps = 1%). Configurable per deployment. */
export function platformFeeBps(): number {
  const raw = Number(process.env.PLATFORM_FEE_BPS ?? "0");
  if (!Number.isFinite(raw) || raw < 0) return 0;
  // Never take more than 20% — guards against a bad env value.
  return Math.min(Math.round(raw), 2000);
}

/** Computes Cut's application fee (in cents) for a deposit of `amountCents`. */
export function applicationFeeCents(amountCents: number): number {
  const bps = platformFeeBps();
  if (bps <= 0) return 0;
  const fee = Math.floor((amountCents * bps) / 10_000);
  // Never let the fee swallow the whole deposit.
  return Math.max(0, Math.min(fee, amountCents - 1));
}

export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

export type ConnectAccountState = {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** Requirements Stripe still needs before the account can charge. */
  currentlyDue: string[];
};

/** Creates an Express connected account for a shop. */
export async function createConnectAccount(input: {
  shopName: string;
  email?: string | null;
  shopId: string;
}): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const account = await stripe.accounts.create({
    type: "express",
    business_type: "individual",
    business_profile: {
      name: input.shopName,
      product_description: "Barbershop appointment deposits",
      mcc: "7230", // Beauty and barber shops
    },
    email: input.email ?? undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { barbershopId: input.shopId },
  });

  return account.id;
}

/** Generates a fresh onboarding link. Links are single-use and short-lived. */
export async function createOnboardingLink(
  accountId: string
): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${getAppUrl()}/settings?payouts=refresh`,
    return_url: `${getAppUrl()}/settings?payouts=done`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Express dashboard link so a connected shop can manage payouts. */
export async function createLoginLink(accountId: string): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}

export async function getConnectAccountState(
  accountId: string
): Promise<ConnectAccountState | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return {
      id: account.id,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      currentlyDue: account.requirements?.currently_due ?? [],
    };
  } catch (error) {
    console.error("[stripe-connect] failed to retrieve account", accountId, error);
    return null;
  }
}

/** Maps Stripe account state onto our ConnectStatus enum. */
export function deriveConnectStatus(
  state: ConnectAccountState | null
): "NOT_CONNECTED" | "PENDING" | "ACTIVE" | "RESTRICTED" {
  if (!state) return "NOT_CONNECTED";
  if (state.chargesEnabled && state.payoutsEnabled) return "ACTIVE";
  if (!state.detailsSubmitted) return "PENDING";
  // Submitted but Stripe still wants something, or capabilities are off.
  return state.currentlyDue.length > 0 ? "RESTRICTED" : "PENDING";
}

/**
 * Builds the Checkout Session params for a deposit.
 * Uses a destination charge so funds land in the shop's connected account.
 */
export function buildDepositCheckoutParams(input: {
  connectAccountId: string;
  shopName: string;
  serviceName: string;
  depositCents: number;
  appointmentId: string;
  barbershopId: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Session auto-expires so an abandoned checkout releases the held slot. */
  expiresAt: number;
}): Stripe.Checkout.SessionCreateParams {
  const fee = applicationFeeCents(input.depositCents);

  return {
    mode: "payment",
    expires_at: input.expiresAt,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.depositCents,
          product_data: {
            name: `Deposit — ${input.serviceName}`,
            description: `Appointment deposit for ${input.shopName}. Applied to your service total.`,
          },
        },
      },
    ],
    payment_intent_data: {
      ...(fee > 0 ? { application_fee_amount: fee } : {}),
      transfer_data: { destination: input.connectAccountId },
      metadata: {
        appointmentId: input.appointmentId,
        barbershopId: input.barbershopId,
        kind: "appointment_deposit",
      },
    },
    metadata: {
      appointmentId: input.appointmentId,
      barbershopId: input.barbershopId,
      kind: "appointment_deposit",
    },
  };
}
