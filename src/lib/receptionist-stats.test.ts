import { describe, it, expect } from "vitest";
import { conversionPercent } from "./receptionist-stats";

describe("conversionPercent", () => {
  it("is null when no calls came in", () => {
    // "0%" reads as failure; nothing actually happened.
    expect(conversionPercent(0, 0)).toBeNull();
  });

  it("computes a whole percentage", () => {
    expect(conversionPercent(45, 12)).toBe(27);
    expect(conversionPercent(10, 5)).toBe(50);
    expect(conversionPercent(3, 3)).toBe(100);
  });

  it("is 0 when calls came in but none booked", () => {
    // Distinct from null — this is a real, and bad, result worth showing.
    expect(conversionPercent(20, 0)).toBe(0);
  });

  it("rounds rather than truncating", () => {
    // 1/3 = 33.33 -> 33, 2/3 = 66.67 -> 67
    expect(conversionPercent(3, 1)).toBe(33);
    expect(conversionPercent(3, 2)).toBe(67);
  });

  it("handles a negative or nonsense answered count safely", () => {
    expect(conversionPercent(-5, 2)).toBeNull();
  });
});
