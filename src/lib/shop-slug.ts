import prisma from "@/lib/db";
import { uniqueSlugFor } from "@/lib/booking-slug";

/**
 * Keeping a shop's booking link in step with its name.
 *
 * The link is regenerated whenever the name changes, and the previous slug is
 * kept as an alias that redirects. That's what makes automatic renaming safe:
 * a QR sticker in the window, an Instagram bio, and every confirmation text
 * already sent all keep working.
 */

/**
 * Every slug that is unavailable: other shops' current links, and every
 * retired alias.
 *
 * Aliases matter as much as live slugs — reusing one would send a customer
 * holding an old link to a completely different barbershop.
 */
async function takenSlugs(excludeShopId: string): Promise<Set<string>> {
  const [shops, aliases] = await Promise.all([
    prisma.barbershop.findMany({
      where: { id: { not: excludeShopId } },
      select: { slug: true },
    }),
    prisma.shopSlugAlias.findMany({
      where: { barbershopId: { not: excludeShopId } },
      select: { slug: true },
    }),
  ]);

  return new Set([
    ...shops.map((s) => s.slug),
    ...aliases.map((a) => a.slug),
  ]);
}

/**
 * Regenerates the slug from the shop's new name.
 *
 * Returns the slug in use afterwards. A no-op when the name produces the slug
 * the shop already has, so saving settings without touching the name doesn't
 * churn aliases.
 */
export async function syncSlugToName(
  barbershopId: string,
  name: string
): Promise<string> {
  const shop = await prisma.barbershop.findUniqueOrThrow({
    where: { id: barbershopId },
    select: { slug: true },
  });

  const taken = await takenSlugs(barbershopId);

  // The shop's own current slug must not count as taken, or a rename that
  // resolves to the same value would pointlessly bump it to "-2".
  taken.delete(shop.slug);

  const next = uniqueSlugFor(name, taken);
  if (next === shop.slug) return shop.slug;

  await prisma.$transaction([
    // Retire the old link as a redirect before the new one takes its place.
    prisma.shopSlugAlias.upsert({
      where: { slug: shop.slug },
      create: { slug: shop.slug, barbershopId },
      update: { barbershopId },
    }),
    prisma.barbershop.update({
      where: { id: barbershopId },
      data: { slug: next },
    }),
    // If the shop is reclaiming a slug it used before, that alias must go or
    // it would redirect the live link to itself.
    prisma.shopSlugAlias.deleteMany({ where: { slug: next } }),
  ]);

  return next;
}

/**
 * Resolves a slug that isn't a live shop link.
 *
 * Returns the shop's current slug so the caller can redirect, or null when the
 * slug never existed.
 */
export async function resolveSlugAlias(slug: string): Promise<string | null> {
  const alias = await prisma.shopSlugAlias.findUnique({
    where: { slug: slug.trim().toLowerCase() },
    select: { barbershop: { select: { slug: true } } },
  });
  return alias?.barbershop.slug ?? null;
}
