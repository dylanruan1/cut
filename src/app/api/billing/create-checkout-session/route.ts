import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import prisma from "@/lib/db";
import { canManageShop } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import {
  getAppUrl,
  getPriceIdForPlan,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe";
import { isBillablePlan } from "@/lib/subscription";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = rateLimit(`billing:checkout:${user.id}`, 10, 60_000);
    if (!limited.success) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Please wait a minute." },
        { status: 429 }
      );
    }

    if (!user.barbershopId) {
      return NextResponse.json(
        { error: "Complete onboarding before billing" },
        { status: 400 }
      );
    }
    if (!canManageShop(user.role)) {
      return NextResponse.json(
        { error: "Only shop owners can manage billing" },
        { status: 403 }
      );
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error:
            "Billing is not configured in this environment. Add Stripe env vars to enable checkout.",
        },
        { status: 503 }
      );
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "Billing is not configured in this environment." },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      plan?: string;
      trialDays?: number;
    };
    const plan = body.plan;
    if (!plan || !isBillablePlan(plan)) {
      return NextResponse.json(
        { error: "Invalid plan. Choose STARTER, PRO, or AI_RECEPTIONIST." },
        { status: 400 }
      );
    }

    const priceId = getPriceIdForPlan(plan);
    if (!priceId) {
      return NextResponse.json(
        { error: `Missing Stripe price id for plan ${plan}` },
        { status: 503 }
      );
    }

    const shop = await prisma.barbershop.findUniqueOrThrow({
      where: { id: user.barbershopId },
    });

    let customerId = shop.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: shop.name,
        metadata: {
          barbershopId: shop.id,
          userId: user.id,
        },
      });
      customerId = customer.id;
      await prisma.barbershop.update({
        where: { id: shop.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const trialDays =
      typeof body.trialDays === "number" && body.trialDays > 0
        ? Math.min(body.trialDays, 30)
        : undefined;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${getAppUrl()}/settings/billing?checkout=success`,
      cancel_url: `${getAppUrl()}/pricing?checkout=canceled`,
      client_reference_id: shop.id,
      metadata: {
        barbershopId: shop.id,
        userId: user.id,
        plan,
      },
      subscription_data: {
        metadata: {
          barbershopId: shop.id,
          userId: user.id,
          plan,
        },
        ...(trialDays ? { trial_period_days: trialDays } : {}),
      },
      allow_promotion_codes: true,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("[billing/checkout]", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
