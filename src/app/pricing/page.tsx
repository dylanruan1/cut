import Link from "next/link";
import { Scissors } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { loadShopSubscription } from "@/lib/subscription-guards";
import { isStripeConfigured } from "@/lib/stripe";
import { PricingCards } from "@/components/billing/pricing-cards";
import { canManageShop } from "@/lib/auth";
import prisma from "@/lib/db";
import { DeletionBanner } from "@/components/settings/deletion-banner";
import { daysUntilPurge } from "@/lib/account-deletion";
import { getFoundingStatus } from "@/lib/founding";
import { FOUNDING_SHOP_LIMIT } from "@/lib/subscription";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; reason?: string; checkout?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  let currentPlan: "NONE" | "STARTER" | "PRO" | "AI_RECEPTIONIST" = "NONE";
  let canCheckout = false;

  // Requesting deletion cancels the subscription, which bounces every app page
  // here. Without the banner on this page the owner would have no reachable
  // way to undo, so the Undo control has to live here too.
  let pendingDeletionAt: Date | null = null;

  if (user?.barbershopId) {
    const shop = await loadShopSubscription(user.barbershopId);
    currentPlan = shop.plan;
    canCheckout = canManageShop(user.role);

    const deletion = await prisma.barbershop.findUnique({
      where: { id: user.barbershopId },
      select: { deletionRequestedAt: true },
    });
    pendingDeletionAt = deletion?.deletionRequestedAt ?? null;
  } else if (user) {
    canCheckout = false;
  }

  const founding = await getFoundingStatus();
  const stripeConfigured = isStripeConfigured();
  const highlighted =
    params.plan === "STARTER" ||
    params.plan === "PRO" ||
    params.plan === "AI_RECEPTIONIST"
      ? params.plan
      : "AI_RECEPTIONIST";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-12 animate-fade-in">
        {pendingDeletionAt && (
          <DeletionBanner
            daysLeft={daysUntilPurge(pendingDeletionAt)}
            canUndo={canCheckout}
          />
        )}
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <Scissors className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Cut.</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
            )}
            <Link href="/settings/billing" className="text-primary hover:underline">
              Billing
            </Link>
          </div>
        </div>

        <div className="text-center max-w-3xl mx-auto space-y-4">
          <p className="text-sm font-medium text-primary tracking-wide uppercase">
            Pricing
          </p>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-balance">
            Never miss another booking.
          </h1>
          <p className="text-lg text-muted-foreground text-balance">
            Let customers call naturally and get booked automatically. Built for
            barbershops that want fewer missed calls and more appointments.
          </p>
          {params.reason === "subscription" && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Choose a plan to unlock your shop dashboard and calendar.
            </p>
          )}
          {params.reason === "upgrade" && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              That feature needs a higher plan. Upgrade below.
            </p>
          )}
          {params.checkout === "canceled" && (
            <p className="text-sm text-muted-foreground">Checkout canceled. No charges were made.</p>
          )}
        </div>

        {!stripeConfigured && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-center">
            Billing is not configured in this environment. Checkout buttons will explain what&apos;s
            missing. See docs/BILLING.md.
          </div>
        )}

        {founding.available && (
          <div className="border-2 border-foreground px-5 py-4 text-center">
            <p className="text-lg font-semibold tracking-tight">
              Founding shops: ${founding.price}/mo, locked for life
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="nums">{founding.remaining}</span> of{" "}
              <span className="nums">{FOUNDING_SHOP_LIMIT}</span> left. After
              that the AI Receptionist plan is ${founding.listPrice}. Founders
              keep ${founding.price} for as long as they stay.
            </p>
          </div>
        )}

        <PricingCards
          currentPlan={currentPlan}
          stripeConfigured={stripeConfigured}
          canCheckout={!!user && canCheckout}
          highlightedPlan={highlighted}
        />

        {/* The actual competitive argument, and the reason it is stated in
            dollars rather than as a feature bullet. Squire bills $1–3 on every
            booking on top of subscription; at 400 cuts a month that is $400–1,200
            a shop pays them and does not pay us. A shop owner comparing two
            $99 plans cannot see that difference unless we do this arithmetic
            for them. */}
        <div className="mx-auto max-w-2xl border-t pt-8 text-center">
          <p className="text-lg font-medium tracking-tight">
            No charge per booking. Not now, not later.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Most booking software takes $1–3 every time a customer books. At 400
            cuts a month that is $400 to $1,200 on top of what you already pay
            them. Cut takes none of it — you pay the monthly price and keep
            everything Stripe doesn&apos;t take.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground max-w-xl mx-auto">
          Start booking automatically with the AI Receptionist plan — connect a Twilio number,
          answer calls 24/7, and keep every shop&apos;s calendar isolated.
        </p>
      </div>
    </div>
  );
}
