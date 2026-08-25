/**
 * Account deletion policy.
 *
 * Deletion is a two-step process on purpose. Pressing the button marks the shop
 * and cancels billing immediately, but the data survives for a grace window so
 * that an accidental or angry click is recoverable. A daily job then erases it
 * for good.
 *
 * The alternative — instant hard delete — is unrecoverable. A barbershop that
 * loses its entire client list to one misclick has no way back, and neither do
 * we, because the rows are gone.
 */

/** Days between requesting deletion and the data actually being erased. */
export const DELETION_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a shop that requested deletion at `requestedAt` becomes eligible for purge. */
export function purgeDueAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * DAY_MS);
}

/** Whether the grace window has fully elapsed, so the data may be erased. */
export function isPurgeDue(requestedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= purgeDueAt(requestedAt).getTime();
}

/**
 * Whole days left before erasure, floored at 0.
 *
 * Rounded up, so a shop with any part of a day remaining reads "1 day left"
 * rather than "0 days left" while the data still exists.
 */
export function daysUntilPurge(requestedAt: Date, now: Date = new Date()): number {
  const remaining = purgeDueAt(requestedAt).getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / DAY_MS);
}

/**
 * Whether a shop is in the deletion grace window.
 *
 * Takes the raw nullable column so callers don't each repeat the null check.
 */
export function isPendingDeletion(
  deletionRequestedAt: Date | null | undefined
): deletionRequestedAt is Date {
  return deletionRequestedAt instanceof Date;
}

/**
 * The exact phrase a user must type to confirm deletion.
 *
 * Typing the shop's own name means the confirmation cannot be completed by
 * reflex — you have to look at what you are about to destroy.
 */
export function deletionConfirmationPhrase(shopName: string): string {
  return shopName.trim();
}

/** Case- and whitespace-insensitive check of the typed confirmation. */
export function confirmationMatches(typed: string, shopName: string): boolean {
  const normalise = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const target = normalise(deletionConfirmationPhrase(shopName));
  // An empty shop name must never be satisfiable by empty input.
  if (!target) return false;
  return normalise(typed) === target;
}
