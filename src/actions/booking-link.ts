"use server";

/**
 * Superseded.
 *
 * The booking slug is no longer edited by hand — it is generated from the shop
 * name and regenerated on rename, with the old slug kept as a redirect. See
 * src/lib/shop-slug.ts and updateShopSettings in src/actions/appointments.ts.
 *
 * Left as an empty module rather than deleted so nothing that still imports it
 * breaks the build; safe to remove once nothing references it.
 */

export async function bookingLinkModuleRetired(): Promise<void> {
  // Intentionally empty.
}
