import Link from "next/link";
import { Scissors } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { loadShopSubscription } from "@/lib/subscription-guards";
import { isStripeConfigured } from "@/lib/stripe";
import { PricingCards } from "@/components/billing/pricing-cards";
import { canManageShop } from "@/lib/auth";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; reason?: string; checkout?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  let currentPlan: "NONE" | "STARTER" | "PRO" | "AI_RECEPTIONIST" = "NONE";
  let canCheckout = false;

  if (user?.barbershopId) {
    const shop = await loadShopSubscription(user.barbershopId);
    currentPlan = shop.plan;
    canCheckout = canManageShop(user.role);
  } else if (user) {
    canCheckout = false;
  }

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

        <PricingCards
          currentPlan={currentPlan}
          stripeConfigured={stripeConfigured}
          canCheckout={!!user && canCheckout}
          highlightedPlan={highlighted}
        />

        <p className="text-center text-sm text-muted-foreground max-w-xl mx-auto">
          Start booking automatically with the AI Receptionist plan — connect a Twilio number,
          answer calls 24/7, and keep every shop&apos;s calendar isolated.
        </p>
      </div>
    </div>
  );
}
