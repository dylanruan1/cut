import { describe, it, expect, afterEach, vi } from "vitest";
import { billingCycleStart } from "@/lib/usage";

/**
 * The cycle window decides which calls count toward the abuse ceiling. Get it
 * wrong and either a shop's whole history counts (permanent block) or nothing
 * does (no ceiling at all), so it is worth pinning down precisely.
 */
describe("billingCycleStart", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("walks back one month from Stripe's period end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    const start = billingCycleStart(new Date("2026-09-20T00:00:00Z"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-08-20");
  });

  it("falls back to the calendar month when there is no period end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));

    // Trialing shops and shops mid-signup have no period end yet.
    const start = billingCycleStart(null);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(8); // September
  });

  it("ignores a stale period end rather than counting a closed window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    // Period end already passed — the webhook never landed. Walking back from
    // it gives a July window that closed before today, so today's calls would
    // fall outside it and the ceiling would silently never fire.
    const start = billingCycleStart(new Date("2026-08-01T00:00:00Z"));
    expect(start.getMonth()).toBe(8); // September, the calendar fallback
    expect(start.getDate()).toBe(1);
  });

  it("never returns a start in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));

    // A far-future period end would otherwise produce a window that has not
    // begun, and every count inside it would be zero.
    const start = billingCycleStart(new Date("2027-06-01T00:00:00Z"));
    expect(start.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
