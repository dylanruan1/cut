"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireShopUser, canManageShop } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/stripe";
import {
  createConnectAccount,
  createOnboardingLink,
  createLoginLink,
  getConnectAccountState,
  deriveConnectStatus,
} from "@/lib/stripe-connect";

/**
 * Owner-facing actions for connecting a shop's Stripe payout account.
 * Deposits are paid directly to the shop, so every shop must complete its own
 * Stripe onboarding before deposits can be enabled.
 */

export type ConnectStatusResult = {
  status: "NOT_CONNECTED" | "PENDING" | "ACTIVE" | "RESTRICTED";
  depositsEnabled: boolean;
  /** Outstanding Stripe requirements, when the account is not yet usable. */
  currentlyDue?: string[];
  error?: string;
};

/** Starts (or resumes) Stripe Express onboarding and returns a redirect URL. */
export async function startPayoutOnboarding(): Promise<{
  url?: string;
  error?: string;
}> {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) {
    return { error: "Only shop owners can set up payouts." };
  }
  if (!isStripeConfigured()) {
    return { error: "Payments are not configured in this environment." };
  }

  const shop = await prisma.barbershop.findUniqueOrThrow({
    where: { id: user.barbershopId },
    select: { id: true, name: true, stripeConnectAccountId: true },
  });

  try {
    let accountId = shop.stripeConnectAccountId;
    if (!accountId) {
      accountId = await createConnectAccount({
        shopId: shop.id,
        shopName: shop.name,
        email: user.email,
      });
      await prisma.barbershop.update({
        where: { id: shop.id },
        data: { stripeConnectAccountId: accountId, connectStatus: "PENDING" },
      });
    }

    const url = await createOnboardingLink(accountId);
    return { url };
  } catch (error) {
    console.error("[connect] onboarding failed", error);
    return { error: "Could not start payout setup. Please try again." };
  }
}

/** Re-reads the account from Stripe and syncs our stored status. */
export async function refreshPayoutStatus(): Promise<ConnectStatusResult> {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) {
    return { status: "NOT_CONNECTED", depositsEnabled: false, error: "Unauthorized" };
  }

  const shop = await prisma.barbershop.findUniqueOrThrow({
    where: { id: user.barbershopId },
    select: {
      id: true,
      stripeConnectAccountId: true,
      connectStatus: true,
      depositsEnabled: true,
    },
  });

  if (!shop.stripeConnectAccountId) {
    return { status: "NOT_CONNECTED", depositsEnabled: false };
  }

  const state = await getConnectAccountState(shop.stripeConnectAccountId);
  const status = deriveConnectStatus(state);

  // An account that can no longer charge must not keep deposits switched on.
  const depositsEnabled = status === "ACTIVE" ? shop.depositsEnabled : false;

  await prisma.barbershop.update({
    where: { id: shop.id },
    data: { connectStatus: status, depositsEnabled },
  });

  revalidatePath("/settings");
  return { status, depositsEnabled, currentlyDue: state?.currentlyDue ?? [] };
}

/** Link to the shop's Stripe Express dashboard (payouts, balance). */
export async function getPayoutDashboardLink(): Promise<{
  url?: string;
  error?: string;
}> {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) return { error: "Unauthorized" };

  const shop = await prisma.barbershop.findUniqueOrThrow({
    where: { id: user.barbershopId },
    select: { stripeConnectAccountId: true, connectStatus: true },
  });

  if (!shop.stripeConnectAccountId || shop.connectStatus !== "ACTIVE") {
    return { error: "Finish payout setup first." };
  }

  try {
    const url = await createLoginLink(shop.stripeConnectAccountId);
    return { url };
  } catch (error) {
    console.error("[connect] login link failed", error);
    return { error: "Could not open your Stripe dashboard." };
  }
}

/** Turns deposit collection on/off. Requires an ACTIVE connected account. */
export async function setDepositsEnabled(
  enabled: boolean
): Promise<{ success?: true; error?: string }> {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) return { error: "Unauthorized" };

  const shop = await prisma.barbershop.findUniqueOrThrow({
    where: { id: user.barbershopId },
    select: { id: true, connectStatus: true },
  });

  if (enabled && shop.connectStatus !== "ACTIVE") {
    return { error: "Connect your payout account before enabling deposits." };
  }

  await prisma.barbershop.update({
    where: { id: shop.id },
    data: { depositsEnabled: enabled },
  });

  revalidatePath("/settings");
  revalidatePath("/services");
  return { success: true };
}

/** Sets (or clears) the required deposit for a single service. */
export async function setServiceDeposit(
  serviceId: string,
  amount: number | null
): Promise<{ success?: true; error?: string }> {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) return { error: "Unauthorized" };

  if (amount !== null) {
    if (!Number.isFinite(amount) || amount < 0) {
      return { error: "Enter a valid deposit amount." };
    }
    if (amount > 0 && amount < 1) {
      return { error: "Deposits must be at least $1." };
    }
  }

  const service = await prisma.service.findFirst({
    where: { id: serviceId, barbershopId: user.barbershopId },
    select: { id: true, price: true },
  });
  if (!service) return { error: "Service not found." };

  if (amount !== null && amount > Number(service.price)) {
    return { error: "Deposit can't be more than the service price." };
  }

  await prisma.service.update({
    where: { id: service.id },
    data: { depositAmount: amount && amount > 0 ? amount : null },
  });

  revalidatePath("/services");
  return { success: true };
}
