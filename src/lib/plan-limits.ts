import type { ShopPlan } from "@prisma/client";
import {
  PLAN_DISPLAY,
  PER_BARBER_PRICE,
  AI_CALLS_WARN_THRESHOLD,
  AI_CALLS_HARD_CEILING,
  SMS_WARN_THRESHOLD,
} from "@/lib/subscription";

/**
 * Seat counting and usage ceilings.
 *
 * Kept as pure functions with no database or Stripe access so the rules can be
 * tested directly. Callers do the I/O and hand the numbers in.
 */

/** Barbers included in a plan before per-seat billing starts. */
export function includedBarbers(plan: ShopPlan): number | null {
  return PLAN_DISPLAY[plan].includedBarbers ?? null;
}

/**
 * Seats billed on top of the base price.
 *
 * Never negative: a shop on Pro with two barbers is not owed four seats back.
 */
export function billableSeats(plan: ShopPlan, barberCount: number): number {
  const included = includedBarbers(plan);
  if (included === null) return 0;
  return Math.max(0, barberCount - included);
}

/** Base price plus seats. Null when the plan has no price (NONE). */
export function monthlyTotal(
  plan: ShopPlan,
  barberCount: number,
  basePriceOverride?: number
): number | null {
  const base = basePriceOverride ?? PLAN_DISPLAY[plan].monthlyPrice;
  if (base === null || base === undefined) return null;
  return base + billableSeats(plan, barberCount) * PER_BARBER_PRICE;
}

/**
 * Whether another barber can be added.
 *
 * Deliberately permissive: going past the included count is allowed and simply
 * costs more. The old behaviour advertised "up to 6 barbers" and enforced
 * nothing, so a 10-chair shop paid the same as a 3-chair shop. Blocking the
 * seventh barber outright would be worse than either — it turns a growing
 * customer into a support ticket. They get told the price and charged for it.
 */
export type SeatCheck =
  | { allowed: true; billable: false }
  | { allowed: true; billable: true; seats: number; additionalCost: number };

export function checkAddBarber(
  plan: ShopPlan,
  currentBarberCount: number
): SeatCheck {
  const after = currentBarberCount + 1;
  const seats = billableSeats(plan, after);
  if (seats === 0) return { allowed: true, billable: false };
  return {
    allowed: true,
    billable: true,
    seats,
    additionalCost: seats * PER_BARBER_PRICE,
  };
}

/**
 * State of a shop's AI receptionist usage for the current billing cycle.
 *
 * "warn" is a private signal — the shop sees nothing, we get told. "blocked"
 * means the number is almost certainly being hit by something other than
 * customers; see the cost arithmetic in subscription.ts for why the ceiling
 * sits where it does.
 */
export type UsageState = "ok" | "warn" | "blocked";

export function aiCallUsageState(callsThisCycle: number): UsageState {
  if (callsThisCycle >= AI_CALLS_HARD_CEILING) return "blocked";
  if (callsThisCycle >= AI_CALLS_WARN_THRESHOLD) return "warn";
  return "ok";
}

export function smsUsageState(smsThisCycle: number): UsageState {
  // No hard stop on texts. Reminders are the product working correctly, and
  // silently not sending one costs the shop a no-show worth more than the
  // message. Texts are also two thirds cheaper per unit than a call.
  return smsThisCycle >= SMS_WARN_THRESHOLD ? "warn" : "ok";
}

/**
 * Whether the AI should answer this call.
 *
 * Separate from canUseAiReceptionist() in subscription.ts, which answers "is
 * this shop paying for the feature". This answers "is something wrong right
 * now". Both must pass.
 */
export function shouldAnswerCall(callsThisCycle: number): boolean {
  return aiCallUsageState(callsThisCycle) !== "blocked";
}

/** Calls left before the ceiling. Zero once blocked, never negative. */
export function callsRemaining(callsThisCycle: number): number {
  return Math.max(0, AI_CALLS_HARD_CEILING - callsThisCycle);
}
