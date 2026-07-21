import { requireShopUser, canManageShop } from "@/lib/auth";
import { loadShopSubscription } from "@/lib/subscription-guards";
import { isStripeConfigured } from "@/lib/stripe";
import { BillingSettings } from "@/components/billing/billing-settings";
import { redirect } from "next/navigation";

export default async function BillingPage() {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) {
    redirect("/dashboard");
  }

  const shop = await loadShopSubscription(user.barbershopId);

  return (
    <BillingSettings
      shopName={shop.name}
      plan={shop.plan}
      subscriptionStatus={shop.subscriptionStatus}
      trialEndsAt={shop.trialEndsAt?.toISOString() ?? null}
      currentPeriodEnd={shop.currentPeriodEnd?.toISOString() ?? null}
      stripeConfigured={isStripeConfigured()}
      canManage={canManageShop(user.role)}
    />
  );
}
