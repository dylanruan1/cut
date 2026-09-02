import { describe, it, expect } from "vitest";
import { uniqueBarberSlug } from "./barber-slug";
import { SLUG_MAX } from "./booking-slug";

describe("uniqueBarberSlug", () => {
  it("uses the barber's name", () => {
    expect(uniqueBarberSlug("Mike Torres", new Set())).toBe("mike-torres");
    expect(uniqueBarberSlug("Chris", new Set())).toBe("chris");
  });

  it("numbers a second barber with the same name", () => {
    expect(uniqueBarberSlug("Mike", new Set(["mike"]))).toBe("mike-2");
    expect(uniqueBarberSlug("Mike", new Set(["mike", "mike-2"]))).toBe("mike-3");
  });

  it("handles apostrophes and punctuation", () => {
    expect(uniqueBarberSlug("D'Angelo", new Set())).toBe("d-angelo");
    expect(uniqueBarberSlug("Jean-Luc", new Set())).toBe("jean-luc");
  });

  it("rescues a name that slugs to nothing", () => {
    expect(uniqueBarberSlug("!!!", new Set())).toBe("barber");
    expect(uniqueBarberSlug("", new Set(["barber"]))).toBe("barber-2");
  });

  it("rescues an all-digit name", () => {
    expect(uniqueBarberSlug("123", new Set())).toBe("barber-123");
  });

  it("stays within the length limit when numbering", () => {
    const long = "a".repeat(SLUG_MAX);
    const next = uniqueBarberSlug(long, new Set([long]));
    expect(next.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(next.endsWith("-2")).toBe(true);
  });

  it("is unaffected by handles taken at other shops", () => {
    // Scoped per shop, so the caller only passes this shop's handles. Two
    // shops can each have a plain "mike".
    expect(uniqueBarberSlug("Mike", new Set())).toBe("mike");
  });
});
