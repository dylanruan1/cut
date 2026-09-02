import prisma from "@/lib/db";
import { toSlug, SLUG_MAX } from "@/lib/booking-slug";

/**
 * A barber's personal booking link: /book/{shop}/{barber}.
 *
 * The point is distribution. A barber's clients follow the barber, not the
 * shop — given their own link they put it in their own Instagram bio, so a
 * six-chair shop markets Cut six times over instead of once.
 *
 * Unique within a shop rather than globally: two different shops can each have
 * a Mike, and forcing "mike-2" on the second shop for no reason would be odd.
 */

/** Fallback when a name produces nothing usable. */
const FALLBACK = "barber";

/**
 * Picks a free handle for a barber within one shop.
 *
 * Pure so the numbering rules are testable; the caller supplies what's taken.
 */
export function uniqueBarberSlug(name: string, taken: Set<string>): string {
  let base = toSlug(name);

  if (!base || /^\d+$/.test(base)) {
    base = base ? `${FALLBACK}-${base}`.slice(0, SLUG_MAX) : FALLBACK;
  }

  if (!taken.has(base)) return base;

  for (let n = 2; n <= 99; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${base.slice(0, SLUG_MAX - 8)}-${Date.now().toString(36).slice(-6)}`;
}

/**
 * Assigns or refreshes a barber's handle.
 *
 * Unlike the shop slug, an existing barber handle is NOT regenerated when
 * their name changes — a barber who has printed cards or put the link in a bio
 * would lose it, and there is no alias table for barbers. Handles are assigned
 * once, on creation or first backfill.
 */
export async function ensureBarberSlug(
  barbershopId: string,
  barberId: string,
  name: string
): Promise<string> {
  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    select: { slug: true },
  });
  if (barber?.slug) return barber.slug;

  const siblings = await prisma.barber.findMany({
    where: { barbershopId, slug: { not: null }, id: { not: barberId } },
    select: { slug: true },
  });
  const taken = new Set(
    siblings.map((s) => s.slug).filter((s): s is string => Boolean(s))
  );

  const slug = uniqueBarberSlug(name, taken);
  await prisma.barber.update({ where: { id: barberId }, data: { slug } });
  return slug;
}

/**
 * Gives every barber in a shop a handle if they don't have one.
 *
 * Barbers created before this feature have none; called lazily when the shop
 * views its team so nobody has to run a migration by hand.
 */
export async function backfillBarberSlugs(barbershopId: string): Promise<void> {
  const missing = await prisma.barber.findMany({
    where: { barbershopId, slug: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (missing.length === 0) return;

  for (const barber of missing) {
    // Sequential on purpose: each assignment must see the handles the previous
    // one just claimed, or two barbers called Mike would both get "mike" and
    // the unique constraint would reject the second.
    await ensureBarberSlug(barbershopId, barber.id, barber.name);
  }
}
