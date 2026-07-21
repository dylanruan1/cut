import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import prisma from "@/lib/db";
import {
  getStripe,
  getStripeWebhookSecret,
  isStripeConfigured,
} from "@/lib/stripe";
import {
  isBillablePlan,
  mapStripeSubscriptionStatus,
  planFromStripePriceId,
  type ShopPlan,
} from "@/lib/subscription";

export const runtime = "nodejs";

async function applySubscriptionToShop(
  subscription: Stripe.Subscription,
  fallbackBarbershopId?: string | null,
  fallbackPlan?: string | null
) {
  const barbershopId =
    subscription.metadata?.barbershopId || fallbackBarbershopId || null;
  if (!barbershopId) {
    console.warn("[billing/webhook] subscription missing barbershopId", {
      subscriptionId: subscription.id,
    });
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const planFromPrice = planFromStripePriceId(priceId);
  const planFromMeta =
    fallbackPlan && isBillablePlan(fallbackPlan)
      ? fallbackPlan
      : subscription.metadata?.plan && isBillablePlan(subscription.metadata.plan)
        ? subscription.metadata.plan
        : null;
  const plan: ShopPlan = planFromPrice ?? planFromMeta ?? "STARTER";
  const status = mapStripeSubscriptionStatus(subscription.status);

  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;
  const periodEndUnix =
    subscription.items?.data?.[0]?.current_period_end ??
    (subscription as { current_period_end?: number }).current_period_end;
  const currentPeriodEnd = periodEndUnix
    ? new Date(periodEndUnix * 1000)
    : null;

  await prisma.barbershop.update({
    where: { id: barbershopId },
    data: {
      plan: status === "CANCELED" ? "NONE" : plan,
      subscriptionStatus: status,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeCustomerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id,
      trialEndsAt,
      currentPeriodEnd,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isStripeConfigured() && !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Billing is not configured in this environment." },
      { status: 503 }
    );
  }

  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      {
        error:
          "Stripe webhook is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
      },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("[billing/webhook] signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const barbershopId =
          session.metadata?.barbershopId || session.client_reference_id;
        const plan = session.metadata?.plan;
        if (session.subscription && typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription
          );
          await applySubscriptionToShop(subscription, barbershopId, plan);
        } else if (barbershopId && plan && isBillablePlan(plan)) {
          await prisma.barbershop.update({
            where: { id: barbershopId },
            data: {
              plan,
              subscriptionStatus: "ACTIVE",
              stripeCustomerId:
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id,
            },
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await applySubscriptionToShop(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const barbershopId = subscription.metadata?.barbershopId;
        if (barbershopId) {
          await prisma.barbershop.update({
            where: { id: barbershopId },
            data: {
              plan: "NONE",
              subscriptionStatus: "CANCELED",
              stripeSubscriptionId: null,
              stripePriceId: null,
              trialEndsAt: null,
              currentPeriodEnd: null,
            },
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        if (customerId) {
          await prisma.barbershop.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "PAST_DUE" },
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("[billing/webhook] handler error", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
