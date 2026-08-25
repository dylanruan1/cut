"use server";

import prisma from "@/lib/db";
import { requireShopUser } from "@/lib/auth";

/**
 * Shop notifications.
 *
 * The rows have existed since early on — bookings, cancellations, reschedules,
 * walk-ins, phone bookings and billing events all write one. Nothing ever read
 * them back, so the bell in the header sat disabled while real activity piled
 * up unseen. These actions are the missing half.
 */

export type ShopNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAtIso: string;
};

/** Most recent notifications for the active shop, newest first. */
export async function getNotifications(
  limit = 20
): Promise<{ items: ShopNotification[]; unread: number }> {
  const user = await requireShopUser();

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { barbershopId: user.barbershopId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
    }),
    prisma.notification.count({
      where: { barbershopId: user.barbershopId, isRead: false },
    }),
  ]);

  return {
    items: rows.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: n.isRead,
      // Serialised, because Date objects can't cross the server/client boundary.
      createdAtIso: n.createdAt.toISOString(),
    })),
    unread,
  };
}

/** Unread count only — cheap enough to run on every page render. */
export async function getUnreadNotificationCount(): Promise<number> {
  const user = await requireShopUser();
  return prisma.notification.count({
    where: { barbershopId: user.barbershopId, isRead: false },
  });
}

/**
 * Marks everything read for the active shop.
 *
 * Scoped by barbershopId rather than by the ids the client sends, so a
 * tampered request cannot touch another shop's rows.
 */
export async function markAllNotificationsRead(): Promise<{ success: true }> {
  const user = await requireShopUser();
  await prisma.notification.updateMany({
    where: { barbershopId: user.barbershopId, isRead: false },
    data: { isRead: true },
  });
  return { success: true };
}
