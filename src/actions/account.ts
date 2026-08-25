"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/db";
import { requireShopUser, requireUser, canManageShop } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { confirmationMatches, daysUntilPurge } from "@/lib/account-deletion";

/**
 * Account deletion.
 *
 * Two separate things live here, because "delete my account" means different
 * things depending on who is asking:
 *
 *  - An OWNER deleting is really deleting the whole barbershop: staff, clients,
 *    appointment history, everything. That is destructive enough to warrant a
 *    grace period, so it is scheduled rather than executed.
 *  - A BARBER or RECEPTIONIST deleting is only removing themselves. The shop
 *    carries on without them, so it happens immediately.
 *
 * NOTE: a "use server" module may only export async functions. Constants like
 * DELETION_GRACE_DAYS are imported from @/lib/account-deletion directly.
 */

/**
 * Schedules deletion of the whole shop.
 *
 * Billing is cancelled straight away — nobody should keep paying through a
 * grace period they asked to end. The data itself survives until the purge job
 * runs, so an accidental click is recoverable.
 */
export async function requestShopDeletion(
  typedConfirmation: string
): Promise<{ success: true; purgeInDays: number } | { error: string }> {
  const user = await requireShopUser();

  if (!canManageShop(user.role)) {
    return { error: "Only the shop owner can delete this account." };
  }

  const shop = await prisma.barbershop.findUnique({
    where: { id: user.barbershopId },
    select: {
      id: true,
      name: true,
      deletionRequestedAt: true,
      stripeSubscriptionId: true,
    },
  });
  if (!shop) return { error: "Shop not found." };

  if (shop.deletionRequestedAt) {
    return { error: "This account is already scheduled for deletion." };
  }

  if (!confirmationMatches(typedConfirmation, shop.name)) {
    return { error: `Type the shop name exactly — "${shop.name}" — to confirm.` };
  }

  // Cancel billing first. If this throws we stop, because scheduling deletion
  // while a subscription keeps charging is the worst of both outcomes.
  if (shop.stripeSubscriptionId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        await stripe.subscriptions.cancel(shop.stripeSubscriptionId);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        // Already gone on Stripe's side is fine — that is the state we want.
        if (code !== "resource_missing") {
          console.error("[account] failed to cancel subscription", err);
          return {
            error:
              "Couldn't cancel your subscription, so nothing was deleted. Try again or contact support.",
          };
        }
      }
    }
  }

  const requestedAt = new Date();
  await prisma.barbershop.update({
    where: { id: shop.id },
    data: {
      deletionRequestedAt: requestedAt,
      deletionRequestedBy: user.id,
      subscriptionStatus: "CANCELED",
      stripeSubscriptionId: null,
    },
  });

  revalidatePath("/", "layout");
  return { success: true, purgeInDays: daysUntilPurge(requestedAt, requestedAt) };
}

/** Calls off a scheduled deletion. Does not restore the cancelled subscription. */
export async function cancelShopDeletion(): Promise<
  { success: true } | { error: string }
> {
  const user = await requireShopUser();

  if (!canManageShop(user.role)) {
    return { error: "Only the shop owner can do that." };
  }

  const shop = await prisma.barbershop.findUnique({
    where: { id: user.barbershopId },
    select: { id: true, deletionRequestedAt: true },
  });
  if (!shop?.deletionRequestedAt) {
    return { error: "This account isn't scheduled for deletion." };
  }

  await prisma.barbershop.update({
    where: { id: shop.id },
    data: { deletionRequestedAt: null, deletionRequestedBy: null },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Deletes the signed-in staff member's own account.
 *
 * Immediate, because it destroys nothing but their login — their past
 * appointments stay with the shop, attributed to a barber record the owner
 * still controls.
 *
 * Owners are refused: they must use requestShopDeletion, otherwise a shop could
 * be orphaned with no one able to administer it.
 */
export async function deleteOwnStaffAccount(): Promise<
  { success: true } | { error: string }
> {
  const user = await requireUser();

  const ownsAnyShop = user.memberships.some((m) => m.role === "OWNER");
  if (ownsAnyShop || user.role === "OWNER") {
    return {
      error:
        "You own a shop, so deleting your login would leave it unmanaged. Delete the shop account instead, or transfer ownership first.",
    };
  }

  // Detach from the barber record rather than deleting it: the shop's
  // appointment history points at it, and that history belongs to the shop.
  await prisma.$transaction([
    prisma.barber.updateMany({
      where: { userId: user.id },
      data: { userId: null, isActive: false },
    }),
    prisma.barbershopMembership.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  // Remove the Supabase login last. If this fails the app row is already gone,
  // so they cannot get back in either way.
  try {
    const admin = await createServiceClient();
    await admin.auth.admin.deleteUser(user.id);
  } catch (err) {
    console.error("[account] failed to delete auth user", err);
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  return { success: true };
}
