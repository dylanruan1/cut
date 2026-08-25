import prisma from "@/lib/db";
import { createServiceClient } from "@/lib/supabase/server";
import { isPurgeDue } from "@/lib/account-deletion";

/**
 * Permanently erases shops whose deletion grace window has closed.
 *
 * Run from the daily cron. Deliberately separate from the server actions: this
 * is the only code path that destroys data irreversibly, and keeping it in one
 * place makes it possible to reason about.
 */

export type PurgeResult = {
  shopsPurged: number;
  usersDeleted: number;
  authUsersDeleted: number;
  errors: string[];
};

export async function purgeDeletedAccounts(
  now: Date = new Date()
): Promise<PurgeResult> {
  const result: PurgeResult = {
    shopsPurged: 0,
    usersDeleted: 0,
    authUsersDeleted: 0,
    errors: [],
  };

  const pending = await prisma.barbershop.findMany({
    where: { deletionRequestedAt: { not: null } },
    select: { id: true, name: true, deletionRequestedAt: true },
  });

  // Filter in JS rather than SQL so the grace window lives in exactly one place
  // (account-deletion.ts) instead of being duplicated as a date expression.
  const due = pending.filter(
    (s) => s.deletionRequestedAt && isPurgeDue(s.deletionRequestedAt, now)
  );

  for (const shop of due) {
    try {
      // Who belongs to this shop, before the rows disappear.
      const memberships = await prisma.barbershopMembership.findMany({
        where: { barbershopId: shop.id },
        select: { userId: true },
      });
      const candidateUserIds = memberships.map((m) => m.userId);

      // Cascades through barbers, services, clients, appointments, queue
      // entries, hours, holidays, invitations, notifications and SMS logs.
      await prisma.barbershop.delete({ where: { id: shop.id } });
      result.shopsPurged += 1;

      // Users survive the cascade (their barbershopId is set to null), so
      // remove anyone who has no other shop left. Anyone who does belong
      // elsewhere keeps their login.
      for (const userId of candidateUserIds) {
        const remaining = await prisma.barbershopMembership.count({
          where: { userId },
        });
        if (remaining > 0) continue;

        await prisma.user.deleteMany({ where: { id: userId } });
        result.usersDeleted += 1;

        try {
          const admin = await createServiceClient();
          await admin.auth.admin.deleteUser(userId);
          result.authUsersDeleted += 1;
        } catch (err) {
          // The app row is already gone, so they cannot sign in regardless.
          // Record it rather than aborting the whole run.
          result.errors.push(`auth delete failed for user ${userId}: ${String(err)}`);
        }
      }
    } catch (err) {
      result.errors.push(`shop ${shop.id} (${shop.name}): ${String(err)}`);
    }
  }

  return result;
}
