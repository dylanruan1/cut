import { describe, it, expect } from "vitest";
import {
  toSlug,
  validateSlug,
  bookingUrl,
  uniqueSlugFor,
  SLUG_MAX,
} from "./booking-slug";

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

describe("uniqueSlugFor", () => {
  it("uses the plain slug when nothing is taken", () => {
    expect(uniqueSlugFor("Fades Barbershop", new Set())).toBe("fades-barbershop");
  });

  it("appends 2 for the second shop with the same name", () => {
    expect(uniqueSlugFor("Fades", new Set(["fades"]))).toBe("fades-2");
  });

  it("keeps counting past the second", () => {
    const taken = new Set(["fades", "fades-2", "fades-3"]);
    expect(uniqueSlugFor("Fades", taken)).toBe("fades-4");
  });

  it("rescues a name that slugs to nothing", () => {
    expect(uniqueSlugFor("!!!", new Set())).toBe("shop");
    expect(uniqueSlugFor("", new Set(["shop"]))).toBe("shop-2");
  });

  it("rescues a name with no latin letters at all", () => {
    // Nothing survives toSlug, so the shop would have been created with an
    // empty slug and a booking link that ended at /book/.
    for (const name of ["Стрижка", "حلاقة", "剪发", "✂️✂️"]) {
      const slug = uniqueSlugFor(name, new Set());
      expect(validateSlug(slug), `${name} -> ${slug}`).toEqual({ ok: true, slug });
    }
  });

  it("rescues an all-digit name", () => {
    // The exact live case: a shop called 23423423423432.
    const slug = uniqueSlugFor("23423423423432", new Set());
    expect(slug.startsWith("shop-")).toBe(true);
    expect(validateSlug(slug).ok).toBe(true);
  });

  it("avoids reserved words", () => {
    expect(uniqueSlugFor("Support", new Set())).toBe("support-shop");
  });

  it("never returns something validateSlug would reject", () => {
    const names = ["Fades", "!!!", "123456", "Support", "A", "Ünïcodé Cuts"];
    for (const name of names) {
      const slug = uniqueSlugFor(name, new Set());
      expect(validateSlug(slug), `${name} -> ${slug}`).toEqual({
        ok: true,
        slug,
      });
    }
  });

  it("stays within the length limit when numbering", () => {
    const long = "a".repeat(SLUG_MAX);
    const taken = new Set([long]);
    const next = uniqueSlugFor(long, taken);
    expect(next.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(next.endsWith("-2")).toBe(true);
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
