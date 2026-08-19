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
import { deriveConnectStatus } from "@/lib/stripe-connect";
import { sendSms, buildBookingConfirmationSms } from "@/lib/twilio";
import { formatTime, formatShortDate } from "@/lib/dates";
import { resolveShopTimezone } from "@/lib/datetime";

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

/**
 * Deposit paid — promote the held appointment to a real confirmed booking and
 * text the customer. Idempotent: replaying the event is a no-op.
 */
async function confirmDepositPaid(session: Stripe.Checkout.Session) {
  const appointmentId = session.metadata?.appointmentId;
  if (!appointmentId) {
    console.warn("[billing/webhook] deposit session missing appointmentId", {
      sessionId: session.id,
    });
    return;
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true, barber: true, barbershop: true, client: true },
  });
  if (!appointment) {
    console.warn("[billing/webhook] deposit for unknown appointment", {
      appointmentId,
    });
    return;
  }
  if (appointment.depositStatus === "PAID") return; // already handled

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status: "CONFIRMED",
      depositStatus: "PAID",
      holdExpiresAt: null,
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
    },
  });

  const timezone = resolveShopTimezone(appointment.barbershop.timezone);
  const when = `${formatShortDate(appointment.startTime, timezone)} at ${formatTime(
    appointment.startTime,
    timezone
  )}`;
  const clientName = appointment.clientNameSnapshot ?? appointment.client.name;
  const phone = appointment.clientPhoneSnapshot ?? appointment.client.phone;

  await prisma.notification.create({
    data: {
      barbershopId: appointment.barbershopId,
      title: "Online booking (deposit paid)",
      message: `${clientName} booked ${appointment.service.name} with ${appointment.barber.name} and paid a deposit`,
      type: "APPOINTMENT",
      metadata: { appointmentId: appointment.id, source: "online" },
    },
  });

  await sendSms(
    phone,
    buildBookingConfirmationSms(
      clientName,
      appointment.service.name,
      appointment.barber.name,
      when,
      appointment.barbershop.name,
      appointment.manageToken
    ),
    appointment.barbershopId,
    "booking_confirmation",
    appointment.id
  );
}

/**
 * A walk-in paid by card. Only here does the visit get marked paid — the
 * client never sets that state itself, so a receipt always means money moved.
 */
async function confirmQueuePaid(session: Stripe.Checkout.Session) {
  const entryId = session.metadata?.queueEntryId;
  if (!entryId) return;

  const entry = await prisma.queueEntry.findUnique({
    where: { id: entryId },
    select: { id: true, paymentMethod: true, barbershopId: true },
  });
  if (!entry || entry.paymentMethod !== "UNPAID") return; // idempotent

  await prisma.queueEntry.update({
    where: { id: entry.id },
    data: {
      paymentMethod: "CARD",
      // Card payments are inherently verified — Stripe moved real money.
      cashVerified: true,
      verifiedAt: new Date(),
      paidAmount: session.amount_total ? session.amount_total / 100 : null,
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
      status: "DONE",
      completedAt: new Date(),
    },
  });
}

/** Checkout expired without payment — free the slot back up. */
async function releaseUnpaidHold(session: Stripe.Checkout.Session) {
  const appointmentId = session.metadata?.appointmentId;
  if (!appointmentId) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, depositStatus: true },
  });
  // Never cancel something that actually got paid.
  if (!appointment || appointment.depositStatus !== "PENDING") return;

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED", depositStatus: "FAILED", holdExpiresAt: null },
  });
}

/** Mirrors Stripe Connect account state onto the shop record. */
async function syncConnectAccount(account: Stripe.Account) {
  const shop = await prisma.barbershop.findFirst({
    where: { stripeConnectAccountId: account.id },
    select: { id: true, depositsEnabled: true },
  });
  if (!shop) return;

  const status = deriveConnectStatus({
    id: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    currentlyDue: account.requirements?.currently_due ?? [],
  });

  await prisma.barbershop.update({
    where: { id: shop.id },
    data: {
      connectStatus: status,
      // Losing the ability to charge must also switch deposits off.
      depositsEnabled: status === "ACTIVE" ? shop.depositsEnabled : false,
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

        // Appointment deposits are a different flow from SaaS subscriptions.
        if (session.metadata?.kind === "appointment_deposit") {
          await confirmDepositPaid(session);
          break;
        }

        // Walk-in queue payment taken in the shop.
        if (session.metadata?.kind === "queue_payment") {
          await confirmQueuePaid(session);
          break;
        }

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
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.kind === "appointment_deposit") {
          await releaseUnpaidHold(session);
        }
        break;
      }
      case "account.updated": {
        // Keep a shop's payout status in sync as Stripe verifies them.
        const account = event.data.object as Stripe.Account;
        await syncConnectAccount(account);
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
