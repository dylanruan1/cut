"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { PLAN_DISPLAY, type ShopPlan } from "@/lib/subscription";
import { cn } from "@/lib/utils";

const SELECTABLE_PLANS: Exclude<ShopPlan, "NONE">[] = [
  "STARTER",
  "PRO",
  "AI_RECEPTIONIST",
];

interface PricingCardsProps {
  currentPlan?: ShopPlan;
  stripeConfigured: boolean;
  canCheckout: boolean;
  highlightedPlan?: ShopPlan | null;
  startTrialDefault?: boolean;
}

export function PricingCards({
  currentPlan = "NONE",
  stripeConfigured,
  canCheckout,
  highlightedPlan = "AI_RECEPTIONIST",
  startTrialDefault = true,
}: PricingCardsProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function startCheckout(plan: Exclude<ShopPlan, "NONE">, trial: boolean) {
    if (!canCheckout) {
      toast({
        title: "Sign in required",
        description: "Create an account or sign in to choose a plan.",
        variant: "destructive",
      });
      return;
    }
    if (!stripeConfigured) {
      toast({
        title: "Billing not configured",
        description:
          "Stripe env vars are missing in this environment. See docs/BILLING.md.",
        variant: "destructive",
      });
      return;
    }

    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          trialDays: trial ? 14 : undefined,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast({
          title: "Checkout unavailable",
          description: data.error ?? "Could not start checkout",
          variant: "destructive",
        });
        return;
      }
      window.location.href = data.url;
    } catch {
      toast({
        title: "Checkout failed",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {SELECTABLE_PLANS.map((plan) => {
        const meta = PLAN_DISPLAY[plan];
        const isCurrent = currentPlan === plan;
        const isHighlight = highlightedPlan === plan || meta.highlight;
        const loading = loadingPlan === plan;

        return (
          <Card
            key={plan}
            className={cn(
              "relative flex flex-col border-border/60",
              isHighlight && "border-primary shadow-soft ring-1 ring-primary/20"
            )}
          >
            {isHighlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  <Sparkles className="h-3 w-3" />
                  Most popular
                </span>
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-xl">{meta.name}</CardTitle>
              <CardDescription>{meta.subtitle}</CardDescription>
              {/* The page previously listed features and a "Choose plan"
                  button with no price anywhere — a shop owner had to start
                  checkout to discover the cost. */}
              {meta.monthlyPrice !== null && (
                <div className="pt-3">
                  <p className="nums flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tracking-tight">
                      ${meta.monthlyPrice}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      /month
                    </span>
                  </p>
                  {meta.priceNote && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {meta.priceNote}
                    </p>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <ul className="space-y-2.5">
                {meta.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              {isCurrent ? (
                <Button className="w-full" variant="secondary" disabled>
                  Current plan
                </Button>
              ) : (
                <>
                  <Button
                    className="w-full"
                    onClick={() => startCheckout(plan, startTrialDefault)}
                    disabled={loading || !!loadingPlan}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting…
                      </>
                    ) : startTrialDefault ? (
                      "Start trial"
                    ) : (
                      "Upgrade"
                    )}
                  </Button>
                  {startTrialDefault && (
                    <Button
                      className="w-full"
                      variant="ghost"
                      size="sm"
                      onClick={() => startCheckout(plan, false)}
                      disabled={loading || !!loadingPlan}
                    >
                      Upgrade now
                    </Button>
                  )}
                </>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
