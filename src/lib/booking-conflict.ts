/**
 * Detection for the database-level double-booking guard.
 *
 * The `appointments_no_double_booking` exclusion constraint (Postgres
 * `EXCLUDE USING gist`) rejects any two non-cancelled appointments that overlap
 * in time for the same barber. It is the last line of defence: application-level
 * availability checks can always lose a race between two simultaneous requests,
 * but the database cannot.
 *
 * Prisma has no typed error for exclusion violations, so we detect Postgres
 * SQLSTATE 23P01 / the constraint name in the error payload.
 */

const EXCLUSION_SQLSTATE = "23P01";
const CONSTRAINT_NAME = "appointments_no_double_booking";

export function isDoubleBookingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as {
    code?: string;
    meta?: Record<string, unknown>;
    message?: string;
  };

  if (err.code === EXCLUSION_SQLSTATE) return true;
  if (typeof err.meta?.code === "string" && err.meta.code === EXCLUSION_SQLSTATE) {
    return true;
  }

  const haystack = `${err.message ?? ""} ${JSON.stringify(err.meta ?? {})}`;
  return (
    haystack.includes(CONSTRAINT_NAME) || haystack.includes(EXCLUSION_SQLSTATE)
  );
}

/** Friendly, customer-facing wording for a lost booking race. */
export const DOUBLE_BOOKING_MESSAGE =
  "Sorry, that time was just booked by someone else. Please choose another slot.";
