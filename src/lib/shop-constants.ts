export const ACTIVE_SHOP_COOKIE = "cut_active_barbershop_id";
export const DEFAULT_TIMEZONE = "America/Los_Angeles";
export const DEV_TEST_SHOP_2_NAME = "Test Shop 2";

/**
 * Booking slug linked from the marketing site as a public demo.
 *
 * This shop must keep existing and stay bookable: A2P 10DLC reviewers follow
 * the link to verify that the SMS call to action appears where a mobile number
 * is collected, and a dead link here reads to them as a missing CTA. Renaming
 * the shop is fine; changing or freeing this slug is not.
 */
export const DEMO_SHOP_SLUG = "dev";

export function isDevelopmentEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.ALLOW_DEV_SHOP_FALLBACK === "true"
  );
}
