import { describe, it, expect } from "vitest";
import { toSlug, validateSlug, bookingUrl, SLUG_MAX } from "./booking-slug";

describe("toSlug", () => {
  it("converts a shop name into a link", () => {
    expect(toSlug("The Gentleman's Cut")).toBe("the-gentleman-s-cut");
    expect(toSlug("Fades & Blades")).toBe("fades-blades");
    expect(toSlug("  Mike's Barbershop  ")).toBe("mike-s-barbershop");
  });

  it("never leaves a leading or trailing hyphen", () => {
    expect(toSlug("!!! Fades !!!")).toBe("fades");
    expect(toSlug("---")).toBe("");
  });

  it("truncates without leaving a trailing hyphen", () => {
    const long = "a".repeat(SLUG_MAX + 10);
    expect(toSlug(long)).toHaveLength(SLUG_MAX);
    expect(toSlug("x".repeat(SLUG_MAX - 1) + " more").endsWith("-")).toBe(false);
  });
});

describe("validateSlug", () => {
  it("accepts a normal link", () => {
    expect(validateSlug("fades-barbershop")).toEqual({
      ok: true,
      slug: "fades-barbershop",
    });
  });

  it("lowercases what the owner typed", () => {
    expect(validateSlug("Fades")).toEqual({ ok: true, slug: "fades" });
  });

  it("rejects anything too short", () => {
    expect(validateSlug("ab").ok).toBe(false);
  });

  it("rejects characters that cause phone calls", () => {
    // "Is that a dash or an underscore?"
    expect(validateSlug("fades_barbershop").ok).toBe(false);
    expect(validateSlug("fades barbershop").ok).toBe(false);
    expect(validateSlug("fadés").ok).toBe(false);
  });

  it("rejects leading, trailing and double hyphens", () => {
    expect(validateSlug("-fades").ok).toBe(false);
    expect(validateSlug("fades-").ok).toBe(false);
    expect(validateSlug("fades--shop").ok).toBe(false);
  });

  it("rejects reserved words", () => {
    for (const word of ["book", "api", "support", "pricing", "cut"]) {
      expect(validateSlug(word).ok).toBe(false);
    }
  });

  it("rejects an all-digit link", () => {
    // The exact problem on the live shop: /book/23423423423432 reads as broken
    // and made the A2P reviewer's job harder.
    const res = validateSlug("23423423423432");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("letters");
  });

  it("allows digits mixed with letters", () => {
    expect(validateSlug("shop-101").ok).toBe(true);
  });
});

describe("bookingUrl", () => {
  it("joins cleanly whether or not the base has a trailing slash", () => {
    expect(bookingUrl("https://cutchair.com", "fades")).toBe(
      "https://cutchair.com/book/fades"
    );
    expect(bookingUrl("https://cutchair.com/", "fades")).toBe(
      "https://cutchair.com/book/fades"
    );
  });
});
