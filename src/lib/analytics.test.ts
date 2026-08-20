import { describe, it, expect } from "vitest";
import { monthRange } from "./analytics";

const LA = "America/Los_Angeles";
const NY = "America/New_York";

describe("monthRange", () => {
  it("covers the whole month in the shop's timezone", () => {
    // Mid-August in LA.
    const now = new Date("2026-08-15T12:00:00Z");
    const { start, end, label } = monthRange(LA, now);
    // Aug 1 00:00 PT is Aug 1 07:00 UTC (PDT = UTC-7).
    expect(start.toISOString()).toBe("2026-08-01T07:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T07:00:00.000Z");
    expect(label).toBe("August 2026");
  });

  it("uses the shop timezone, not the server's", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    const la = monthRange(LA, now);
    const ny = monthRange(NY, now);
    // Same calendar month, different absolute boundaries.
    expect(la.label).toBe(ny.label);
    expect(la.start.toISOString()).not.toBe(ny.start.toISOString());
  });

  it("keeps a late-night appointment in the correct month", () => {
    // 11pm PT on Aug 31 is Sep 1 06:00 UTC — naive UTC maths would push this
    // into September and understate August's revenue.
    const now = new Date("2026-08-15T12:00:00Z");
    const { start, end } = monthRange(LA, now);
    const lateNight = new Date("2026-09-01T06:00:00Z"); // 11pm PT Aug 31
    expect(lateNight >= start && lateNight < end).toBe(true);
  });

  it("excludes the first instant of the next month", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    const { end } = monthRange(LA, now);
    const firstOfSept = new Date("2026-09-01T07:00:00Z"); // midnight PT Sep 1
    expect(firstOfSept >= end).toBe(true);
  });

  it("walks back to the previous month", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    expect(monthRange(LA, now, 1).label).toBe("July 2026");
  });

  it("rolls back across a year boundary", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    expect(monthRange(LA, now, 1).label).toBe("December 2025");
    expect(monthRange(LA, now, 2).label).toBe("November 2025");
  });

  it("handles a month with 31 days followed by 30", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    const { start, end } = monthRange(LA, now);
    const days = Math.round(
      (end.getTime() - start.getTime()) / 86_400_000
    );
    expect(days).toBe(31); // May
  });

  it("handles February in a non-leap year", () => {
    const now = new Date("2026-02-10T12:00:00Z");
    const { start, end, label } = monthRange(LA, now);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(label).toBe("February 2026");
    expect(days).toBe(28);
  });
});
