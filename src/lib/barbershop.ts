import { cookies } from "next/headers";
import { Prisma, UserRole, type Barbershop } from "@prisma/client";
import prisma from "@/lib/db";
import { DEFAULT_SERVICES } from "@/lib/dates";
import { generateSlug } from "@/lib/utils";
import { normalizePhone } from "@/lib/twilio";
import {
  ACTIVE_SHOP_COOKIE,
  DEFAULT_TIMEZONE,
  DEV_TEST_SHOP_2_NAME,
  isDevelopmentEnvironment,
} from "@/lib/shop-constants";

export {
  ACTIVE_SHOP_COOKIE,
  DEFAULT_TIMEZONE,
  DEV_TEST_SHOP_2_NAME,
  isDevelopmentEnvironment,
} from "@/lib/shop-constants";

export type ShopMembershipSummary = {
  id: string;
  role: UserRole;
  barbershop: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
};

/**
 * Resolve barbershop from Twilio "To" number.
 * Prefers exact unique twilioPhone match after normalizePhone.
 * Returns null when unmatched — callers should NOT silently default to another shop
 * except an explicitly logged local-dev fallback.
 */
export async function findBarbershopByTwilioTo(
  toNumber: string
): Promise<Barbershop | null> {
  if (!toNumber?.trim()) return null;

  const normalized = normalizePhone(toNumber);

  const exact = await prisma.barbershop.findFirst({
    where: { twilioPhone: normalized },
  });
  if (exact) return exact;

  // Tolerate legacy rows stored without consistent E.164 formatting.
  const candidates = await prisma.barbershop.findMany({
    where: { twilioPhone: { not: null } },
  });

  return (
    candidates.find(
      (shop) => shop.twilioPhone && normalizePhone(shop.twilioPhone) === normalized
    ) ?? null
  );
}

/**
 * Local-dev only: when To does not match any shop, optionally use the oldest shop.
 * Always logs clearly. Production callers should reject unmatched numbers instead.
 */
export async function findDevFallbackBarbershop(
  toNumber: string
): Promise<Barbershop | null> {
  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.ALLOW_DEV_SHOP_FALLBACK === "true";

  if (!isDev) return null;

  const shop = await prisma.barbershop.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (shop) {
    console.warn(
      "[twilio] DEV FALLBACK: To number not connected to a shop; using first barbershop",
      { to: toNumber, shopId: shop.id, shopName: shop.name }
    );
  }

  return shop;
}

export async function getActiveBarbershopIdFromCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACTIVE_SHOP_COOKIE)?.value ?? null;
}

export async function setActiveBarbershopCookie(barbershopId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTIVE_SHOP_COOKIE, barbershopId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export type CreateShopInput = {
  name: string;
  timezone?: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  phone?: string | null;
  address?: string | null;
  twilioPhone?: string | null;
  /** When false, adds membership without switching the user's active shop. Default true. */
  setAsActive?: boolean;
};

/**
 * Creates a barbershop with defaults, owner membership, and owner barber profile.
 */
export async function createBarbershopWithOwner(
  input: CreateShopInput
): Promise<Barbershop> {
  const slugBase = generateSlug(input.name);
  const existing = await prisma.barbershop.findUnique({ where: { slug: slugBase } });
  const slug = existing ? `${slugBase}-${Date.now()}` : slugBase;
  const timezone = input.timezone?.trim() || DEFAULT_TIMEZONE;
  const twilioPhone = input.twilioPhone
    ? normalizePhone(input.twilioPhone)
    : undefined;

  const barbershop = await prisma.barbershop.create({
    data: {
      name: input.name.trim(),
      slug,
      timezone,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      twilioPhone: twilioPhone || null,
      businessHours: {
        create: Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          openTime: i === 0 ? "00:00" : "09:00",
          closeTime: i === 0 ? "00:00" : "18:00",
          isClosed: i === 0,
        })),
      },
      services: {
        create: DEFAULT_SERVICES.map((s, i) => ({
          name: s.name,
          description: s.description,
          duration: s.duration,
          price: s.price,
          color: s.color,
          sortOrder: i,
        })),
      },
    },
  });

  const setAsActive = input.setAsActive !== false;

  if (setAsActive) {
    await prisma.$transaction([
      prisma.barbershopMembership.create({
        data: {
          userId: input.ownerUserId,
          barbershopId: barbershop.id,
          role: UserRole.OWNER,
        },
      }),
      prisma.user.update({
        where: { id: input.ownerUserId },
        data: {
          barbershopId: barbershop.id,
          role: UserRole.OWNER,
          name: input.ownerName,
        },
      }),
    ]);
  } else {
    await prisma.barbershopMembership.create({
      data: {
        userId: input.ownerUserId,
        barbershopId: barbershop.id,
        role: UserRole.OWNER,
      },
    });
  }

  // User.barber is 1:1 — only link userId when the owner has no barber profile yet.
  const existingOwnerBarber = await prisma.barber.findUnique({
    where: { userId: input.ownerUserId },
    select: { id: true },
  });
  const ownerBarberUserId = existingOwnerBarber ? null : input.ownerUserId;

  const ownerBarber = await prisma.barber.create({
    data: {
      barbershopId: barbershop.id,
      userId: ownerBarberUserId,
      name: input.ownerName,
      email: input.ownerEmail,
      color: "#007AFF",
      workingHours: {
        create: Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          startTime: i === 0 ? "00:00" : "09:00",
          endTime: i === 0 ? "00:00" : "18:00",
          isOff: i === 0,
        })),
      },
    },
  });

  const services = await prisma.service.findMany({
    where: { barbershopId: barbershop.id },
  });

  if (services.length > 0) {
    await prisma.barberService.createMany({
      data: services.map((s) => ({
        barberId: ownerBarber.id,
        serviceId: s.id,
      })),
    });
  }

  if (setAsActive) {
    await setActiveBarbershopCookie(barbershop.id);
  }

  return barbershop;
}

/**
 * Creates an additional barbershop for an existing owner without switching their active shop.
 * Does not copy appointments or Twilio settings from other shops.
 */
export async function createAdditionalBarbershopForOwner(
  input: Omit<CreateShopInput, "setAsActive">
): Promise<Barbershop> {
  return createBarbershopWithOwner({ ...input, setAsActive: false });
}

/**
 * Dev-only: create "Test Shop 2" for the current user if it doesn't exist yet.
 * Returns the shop and whether it was newly created.
 */
export async function createDevTestShop2ForUser(user: {
  id: string;
  name: string | null;
  email: string;
  memberships: ShopMembershipSummary[];
}): Promise<
  | { shop: Barbershop; created: boolean }
  | { error: string }
> {
  if (!isDevelopmentEnvironment()) {
    return { error: "Only available in development" };
  }

  const existing = user.memberships.find(
    (m) => m.barbershop.name === DEV_TEST_SHOP_2_NAME
  );
  if (existing) {
    const shop = await prisma.barbershop.findUnique({
      where: { id: existing.barbershop.id },
    });
    if (!shop) return { error: "Test Shop 2 membership found but shop missing" };
    return { shop, created: false };
  }

  const shop = await createAdditionalBarbershopForOwner({
    name: DEV_TEST_SHOP_2_NAME,
    timezone: DEFAULT_TIMEZONE,
    ownerUserId: user.id,
    ownerName: user.name ?? user.email.split("@")[0],
    ownerEmail: user.email,
  });

  return { shop, created: true };
}

/**
 * Ensure a membership row exists for legacy users that only have User.barbershopId.
 * Fully idempotent: concurrent calls for the same userId+barbershopId never crash.
 */
export async function ensureMembershipForUser(user: {
  id: string;
  role: UserRole;
  barbershopId: string | null;
}) {
  if (!user.barbershopId) return null;

  const where = {
    userId_barbershopId: {
      userId: user.id,
      barbershopId: user.barbershopId,
    },
  } as const;

  const existing = await prisma.barbershopMembership.findUnique({ where });
  if (existing) return existing;

  try {
    return await prisma.barbershopMembership.create({
      data: {
        userId: user.id,
        barbershopId: user.barbershopId,
        role: user.role,
      },
    });
  } catch (error) {
    // Race: another request created the row between findUnique and create.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.barbershopMembership.findUnique({ where });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function listMembershipsForUser(
  userId: string
): Promise<ShopMembershipSummary[]> {
  const memberships = await prisma.barbershopMembership.findMany({
    where: { userId },
    include: {
      barbershop: {
        select: { id: true, name: true, slug: true, timezone: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.id,
    role: m.role,
    barbershop: m.barbershop,
  }));
}

export function shopSelectForAuth() {
  return {
    id: true,
    name: true,
    slug: true,
    timezone: true,
  } satisfies Prisma.BarbershopSelect;
}
