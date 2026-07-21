import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { canManageShop, getCurrentUser } from "@/lib/auth";
import { getAppUrl, getStripe, isStripeConfigured } from "@/lib/stripe";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
            "Billing is not configured in this environment. Add Stripe env vars to enable the customer portal.",
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

    const shop = await prisma.barbershop.findUniqueOrThrow({
      where: { id: user.barbershopId },
    });

    if (!shop.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer yet. Start a plan from Pricing first." },
        { status: 400 }
      );
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: shop.stripeCustomerId,
      return_url: `${getAppUrl()}/settings/billing`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (error) {
    console.error("[billing/portal]", error);
    return NextResponse.json(
      { error: "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
