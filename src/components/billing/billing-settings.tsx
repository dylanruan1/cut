"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { PricingCards } from "@/components/billing/pricing-cards";
import { PLAN_DISPLAY, type ShopPlan, type SubscriptionStatus } from "@/lib/subscription";

interface BillingSettingsProps {
  shopName: string;
  plan: ShopPlan;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  stripeConfigured: boolean;
  canManage: boolean;
}

export function BillingSettings({
  shopName,
  plan,
  subscriptionStatus,
  trialEndsAt,
  currentPeriodEnd,
  stripeConfigured,
  canManage,
}: BillingSettingsProps) {
  const [portalLoading, setPortalLoading] = useState(false);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/create-portal-session", {
        method: "POST",
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast({
          title: "Billing portal unavailable",
          description: data.error ?? "Could not open billing portal",
          variant: "destructive",
        });
        return;
      }
      window.location.href = data.url;
    } catch {
      toast({
        title: "Something went wrong",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage the plan for <span className="font-medium text-foreground">{shopName}</span>
        </p>
      </div>

      {!stripeConfigured && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">Billing is not configured in this environment.</CardTitle>
            <CardDescription>
              Add Stripe keys and price IDs to enable checkout. Local Dev shop testing
              continues to work without Stripe. See docs/BILLING.md.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>Subscription status for this shop only</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium">{PLAN_DISPLAY[plan].name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">{subscriptionStatus}</span>
          </div>
          {trialEndsAt && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Trial ends</span>
              <span className="font-medium">
                {new Date(trialEndsAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {currentPeriodEnd && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Current period ends</span>
              <span className="font-medium">
                {new Date(currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="pt-2 flex flex-wrap gap-2">
            {canManage && stripeConfigured && (
              <Button onClick={openPortal} disabled={portalLoading} variant="outline">
                {portalLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening…
                  </>
                ) : (
                  "Manage billing"
                )}
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>
          {!canManage && (
            <p className="text-muted-foreground">Only shop owners can change billing.</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Upgrade</h2>
        <p className="text-sm text-muted-foreground">
          Locked features: Team & Analytics need Pro. AI Phone needs AI Receptionist.
        </p>
        <PricingCards
          currentPlan={plan}
          stripeConfigured={stripeConfigured}
          canCheckout={canManage}
          startTrialDefault={plan === "NONE" || subscriptionStatus === "NONE"}
        />
      </div>
    </div>
  );
}
