/**
 * Cancellation policy rules, kept separate from the server action so they can
 * be unit tested without mocking Prisma or Stripe.
 */

/**
 * Cancel at least this many hours ahead and a paid deposit is refunded.
 * Cancel later and the shop keeps it — that is the no-show protection.
 */
export const FREE_CANCELLATION_HOURS = 24;

export function hoursUntil(startTime: Date, now: Date = new Date()): number {
  return (startTime.getTime() - now.getTime()) / 3_600_000;
}

/** Whether cancelling right now should refund the deposit. */
export function shouldRefundDeposit(input: {
  depositStatus: string;
  startTime: Date;
  now?: Date;
}): boolean {
  if (input.depositStatus !== "PAID") return false;
  return hoursUntil(input.startTime, input.now) >= FREE_CANCELLATION_HOURS;
}

/** Whether the customer may still cancel this booking themselves. */
export function isCancellable(input: {
  status: string;
  startTime: Date;
  now?: Date;
}): boolean {
  if (input.status === "CANCELLED" || input.status === "COMPLETED") return false;
  return hoursUntil(input.startTime, input.now) > 0;
}
