export const ACTIVE_SHOP_COOKIE = "cut_active_barbershop_id";
export const DEFAULT_TIMEZONE = "America/Los_Angeles";
export const DEV_TEST_SHOP_2_NAME = "Test Shop 2";

export function isDevelopmentEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.ALLOW_DEV_SHOP_FALLBACK === "true"
  );
}
