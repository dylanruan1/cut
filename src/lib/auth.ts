import { cache } from "react";
import { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import {
  ACTIVE_SHOP_COOKIE,
  ensureMembershipForUser,
  listMembershipsForUser,
  setActiveBarbershopCookie,
  type ShopMembershipSummary,
} from "@/lib/barbershop";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  /** Active / selected shop. Null until onboarding. */
  barbershopId: string | null;
  barberId: string | null;
  barbershop: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  } | null;
  memberships: ShopMembershipSummary[];
};

export type ShopAuthUser = AuthUser & {
  barbershopId: string;
  barbershop: NonNullable<AuthUser["barbershop"]>;
};

/**
 * The signed-in user, with active shop and memberships.
 *
 * Wrapped in React's cache() so it runs **once per request** instead of once
 * per caller. The app layout calls it, and then the page calls
 * requireActiveSubscription() which calls it again — so every navigation was
 * paying for two Supabase auth round trips and two membership queries to get
 * the same answer. Deduping is the single biggest win on page-to-page speed.
 *
 * cache() is per-request, so this never serves one user's data to another.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const userInclude = {
    barbershop: {
      select: { id: true, name: true, slug: true, timezone: true },
    },
  } as const;

  let dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: userInclude,
  });

  /**
   * Heal an orphaned account.
   *
   * Signup creates the Supabase auth user first, then this app row separately.
   * If the second step fails — a database blip, a deploy mid-signup — the
   * person ends up permanently stuck: their email is taken so they cannot sign
   * up again, and returning null here bounces them back to the login page in a
   * loop with nothing explaining why.
   *
   * Recreating the row from the auth record they already hold a valid session
   * for costs one insert and removes that dead end entirely.
   */
  if (!dbUser) {
    const email = user.email;
    if (!email) return null;

    try {
      dbUser = await prisma.user.create({
        data: {
          id: user.id,
          email,
          name:
            (user.user_metadata?.name as string | undefined)?.trim() || null,
          role: UserRole.OWNER,
          // Null until onboarding, which is exactly where they'll be sent.
          barbershopId: null,
        },
        include: userInclude,
      });
      console.warn("[auth] recreated missing app user row", { id: user.id });
    } catch (err) {
      console.error("[auth] could not heal missing user row", err);
      return null;
    }
  }

  await ensureMembershipForUser({
    id: dbUser.id,
    role: dbUser.role,
    barbershopId: dbUser.barbershopId,
  });

  let memberships = await listMembershipsForUser(dbUser.id);

  // Resolve active shop: cookie preference → user.barbershopId → first membership
  const jar = await cookies();
  const cookieShopId = jar.get(ACTIVE_SHOP_COOKIE)?.value ?? null;
  const preferredShopId =
    (cookieShopId &&
      memberships.some((m) => m.barbershop.id === cookieShopId) &&
      cookieShopId) ||
    (dbUser.barbershopId &&
      memberships.some((m) => m.barbershop.id === dbUser.barbershopId) &&
      dbUser.barbershopId) ||
    memberships[0]?.barbershop.id ||
    null;

  let activeMembership = preferredShopId
    ? memberships.find((m) => m.barbershop.id === preferredShopId)
    : undefined;

  // Keep User.barbershopId / role in sync with selected membership.
  if (
    activeMembership &&
    (dbUser.barbershopId !== activeMembership.barbershop.id ||
      dbUser.role !== activeMembership.role)
  ) {
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        barbershopId: activeMembership.barbershop.id,
        role: activeMembership.role,
      },
    });
  }

  // Re-read memberships if we only had legacy user.barbershopId just backfilled
  if (memberships.length === 0 && dbUser.barbershopId) {
    memberships = await listMembershipsForUser(dbUser.id);
    activeMembership = memberships.find(
      (m) => m.barbershop.id === dbUser.barbershopId
    );
  }

  const barbershop = activeMembership?.barbershop ?? dbUser.barbershop ?? null;
  const barbershopId = barbershop?.id ?? null;
  const role = activeMembership?.role ?? dbUser.role;

  // Resolve barber profile for the active shop (User.barber is 1:1 legacy; barbers are per-shop).
  let barberId: string | null = null;
  if (barbershopId) {
    const activeBarber = await prisma.barber.findFirst({
      where: { userId: dbUser.id, barbershopId },
      select: { id: true },
    });
    barberId = activeBarber?.id ?? null;
  }

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role,
    barbershopId,
    barberId,
    barbershop,
    memberships,
  };
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

/** Requires an authenticated user with an active barbershop. Redirects to onboarding if missing. */
export async function requireShopUser(): Promise<ShopAuthUser> {
  const user = await requireUser();
  if (!user.barbershopId || !user.barbershop) {
    redirect("/onboarding");
  }
  return user as ShopAuthUser;
}

export async function switchActiveBarbershop(barbershopId: string): Promise<
  | { success: true }
  | { error: string }
> {
  const user = await requireUser();
  const membership = user.memberships.find((m) => m.barbershop.id === barbershopId);
  if (!membership) {
    return { error: "You do not belong to that barbershop" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      barbershopId: membership.barbershop.id,
      role: membership.role,
    },
  });
  await setActiveBarbershopCookie(membership.barbershop.id);

  return { success: true };
}

export function canManageShop(role: UserRole): boolean {
  return role === UserRole.OWNER;
}

export function canManageAllAppointments(role: UserRole): boolean {
  return role === UserRole.OWNER || role === UserRole.RECEPTIONIST;
}

export function canInviteBarbers(role: UserRole): boolean {
  return role === UserRole.OWNER;
}

export function canViewAnalytics(role: UserRole): boolean {
  return role === UserRole.OWNER;
}

export function canManageServices(role: UserRole): boolean {
  return role === UserRole.OWNER;
}
