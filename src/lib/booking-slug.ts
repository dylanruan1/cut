/**
 * The shop's public booking link.
 *
 * Kept separate from the shop name on purpose. Renaming a shop must NOT change
 * the slug: the link is printed on QR stickers in the window, pasted into
 * Instagram bios, and sitting in every confirmation text already sent. Silently
 * repointing it would break all of them at once, and the shop would find out
 * from customers who couldn't book.
 *
 * So changing the link is its own explicit action, with its own warning.
 */

/** Reserved so a booking link can never shadow a real route or look official. */
const RESERVED = new Set([
  "admin",
  "api",
  "app",
  "book",
  "booking",
  "cut",
  "dashboard",
  "help",
  "login",
  "logout",
  "pricing",
  "privacy",
  "q",
  "queue",
  "settings",
  "signup",
  "support",
  "terms",
  "www",
]);

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/** Best-effort conversion of free text into a usable slug. */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    // A trailing hyphen can reappear after the slice.
    .replace(/-+$/g, "");
}

export type SlugCheck = { ok: true; slug: string } | { ok: false; error: string };

/**
 * Validates a slug a shop owner typed.
 *
 * Deliberately strict: this ends up in a URL customers read aloud, type from a
 * sticker, and see in a text message. Underscores, capitals and double hyphens
 * all cause "is that a dash or an underscore" phone calls.
 */
export function validateSlug(raw: string): SlugCheck {
  const slug = raw.toLowerCase().trim();

  if (!slug) return { ok: false, error: "Pick a booking link" };

  if (slug.length < SLUG_MIN) {
    return { ok: false, error: `At least ${SLUG_MIN} characters` };
  }
  if (slug.length > SLUG_MAX) {
    return { ok: false, error: `At most ${SLUG_MAX} characters` };
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "Use lowercase letters, numbers and hyphens only" };
  }
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return { ok: false, error: "Can't start or end with a hyphen" };
  }
  if (slug.includes("--")) {
    return { ok: false, error: "No double hyphens" };
  }
  if (RESERVED.has(slug)) {
    return { ok: false, error: "That word is reserved — pick another" };
  }
  if (/^\d+$/.test(slug)) {
    // A link of pure digits reads as a mistake and looks untrustworthy to a
    // customer deciding whether to tap it.
    return { ok: false, error: "Use some letters, not just numbers" };
  }

  return { ok: true, slug };
}

/** The full public URL, for display and copying. */
export function bookingUrl(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/$/, "")}/book/${slug}`;
}

/** Fallback when a shop name produces nothing usable, e.g. "!!!" or "123". */
const FALLBACK_BASE = "shop";

/**
 * The slug a shop should have, given its name and what's already taken.
 *
 * Two shops called "Fades" get `fades` and `fades-2`. The number is appended
 * only on collision, so the first shop with a name keeps the clean link.
 *
 * `taken` must include other shops' current slugs AND every retired alias —
 * handing out a slug that used to point somewhere else would send a customer
 * with an old link to the wrong barbershop.
 */
export function uniqueSlugFor(name: string, taken: Set<string>): string {
  let base = toSlug(name);

  // An empty or all-digit base is unusable: "123" reads as broken to a
  // customer and is rejected by validateSlug.
  if (!base || base.length < SLUG_MIN || /^\d+$/.test(base)) {
    base = base ? `${FALLBACK_BASE}-${base}`.slice(0, SLUG_MAX) : FALLBACK_BASE;
  }
  if (RESERVED.has(base)) base = `${base}-shop`;

  if (!taken.has(base)) return base;

  // Cap the search so a pathological case can't spin. 999 shops sharing one
  // name is not a real scenario, and falling back to a timestamp is better
  // than looping.
  for (let n = 2; n <= 999; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${base.slice(0, SLUG_MAX - 14)}-${Date.now().toString(36)}`;
}
