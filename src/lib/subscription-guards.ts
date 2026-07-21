import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireShopUser, type ShopAuthUser } from "@/lib/auth";
import {
  canUseAiReceptionist,
  canUseAnalytics,
  canUseBasicApp,
  canUseTeam,
  type ShopSubscriptionSnapshot,
} from "@/lib/subscription";

export async function loadShopSubscription(
  barbershopId: string
): Promise<ShopSubscriptionSnapshot> {
  const shop = await prisma.barbershop.findUniqueOrThrow({
    where: { id: barbershopId },
    select: {
      id: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
    },
  });
  return shop;
}

export async function requireActiveSubscription(): Promise<{
  user: ShopAuthUser;
  shop: ShopSubscriptionSnapshot;
}> {
  const user = await requireShopUser();
  const shop = await loadShopSubscription(user.barbershopId);
  if (!canUseBasicApp(shop)) {
    redirect("/pricing?reason=subscription");
  }
  return { user, shop };
}

export async function requireProPlan(): Promise<{
  user: ShopAuthUser;
  shop: ShopSubscriptionSnapshot;
}> {
  const { user, shop } = await requireActiveSubscription();
  if (!canUseTeam(shop)) {
    redirect("/pricing?plan=PRO&reason=upgrade");
  }
  return { user, shop };
}

export async function requireAnalyticsAccess(): Promise<{
  user: ShopAuthUser;
  shop: ShopSubscriptionSnapshot;
}> {
  const { user, shop } = await requireActiveSubscription();
  if (!canUseAnalytics(shop)) {
    redirect("/pricing?plan=PRO&reason=upgrade");
  }
  return { user, shop };
}

export async function requireAiReceptionistPlan(): Promise<{
  user: ShopAuthUser;
  shop: ShopSubscriptionSnapshot;
}> {
  const { user, shop } = await requireActiveSubscription();
  if (!canUseAiReceptionist(shop)) {
    redirect("/pricing?plan=AI_RECEPTIONIST&reason=upgrade");
  }
  return { user, shop };
}
