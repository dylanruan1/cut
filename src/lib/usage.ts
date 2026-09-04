import prisma from "@/lib/db";
import {
  aiCallUsageState,
  smsUsageState,
  shouldAnswerCall,
  type UsageState,
} from "@/lib/plan-limits";
import {
  AI_CALLS_WARN_THRESHOLD,
  AI_CALLS_HARD_CEILING,
} from "@/lib/subscription";

/**
 * Counting what a shop has actually used this billing cycle.
 *
 * Every count is scoped to a cycle rather than all-time, otherwise a shop that
 * has been on Cut for a year would trip the ceiling permanently.
 */

/**
 * Start of the current billing cycle.
 *
 * Derived by walking back a month from Stripe's period end, so the window lines
 * up with what the shop is actually being invoiced for. Shops on a trial (or
 * mid-signup, before the first webhook lands) have no period end, so those fall
 * back to the calendar month — close enough for a ceiling whose whole job is to
 * catch abuse.
 */
/** Marker stored in Notification.metadata so we only alert once per cycle. */
export const USAGE_NOTIFICATION_KIND = "usage_high";

export function billingCycleStart(currentPeriodEnd: Date | null): Date {
  const now = Date.now();

  if (currentPeriodEnd) {
    const end = currentPeriodEnd.getTime();
    const start = new Date(currentPeriodEnd);
    start.setMonth(start.getMonth() - 1);

    // Two ways Stripe's period end can be useless, and both have to be checked
    // against the END, not the derived start:
    //
    //   end in the past    the webhook never landed. Walking back from it gives
    //                      a window that already closed, so today's calls fall
    //                      outside it and the ceiling silently stops working.
    //   end far in future  a bad write, or an annual term. The derived start is
    //                      then also in the future, so every count inside it is
    //                      zero — same failure, opposite direction.
    //
    // Either way the calendar month is the safer window.
    if (end > now && start.getTime() <= now) return start;
  }

  const today = new Date(now);
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

export type ShopUsage = {
  cycleStart: Date;
  aiCalls: number;
  smsSent: number;
  callState: UsageState;
  smsState: UsageState;
  /** False once the ceiling is hit — the AI stops picking up. */
  aiAnswering: boolean;
};

export async function getShopUsage(
  barbershopId: string,
  currentPeriodEnd: Date | null
): Promise<ShopUsage> {
  const cycleStart = billingCycleStart(currentPeriodEnd);

  const [aiCalls, smsSent] = await Promise.all([
    // One row per call: callSid is unique on this table.
    prisma.receptionistCallSession.count({
      where: { barbershopId, createdAt: { gte: cycleStart } },
    }),
    prisma.smsLog.count({
      where: { barbershopId, createdAt: { gte: cycleStart }, status: "sent" },
    }),
  ]);

  return {
    cycleStart,
    aiCalls,
    smsSent,
    callState: aiCallUsageState(aiCalls),
    smsState: smsUsageState(smsSent),
    aiAnswering: shouldAnswerCall(aiCalls),
  };
}

/**
 * Whether the AI should pick up, checked at the start of a call.
 *
 * Counts only — no writes, no email — because this sits in the path of a
 * ringing phone. Returning true on a database error is deliberate: a counting
 * failure must not silently stop a paying shop's phone from being answered.
 * The downside of being wrong here is a few dollars; the downside of the
 * opposite is a shop whose customers hear nothing.
 */
export async function canAnswerCallNow(
  barbershopId: string,
  currentPeriodEnd: Date | null
): Promise<boolean> {
  try {
    const cycleStart = billingCycleStart(currentPeriodEnd);
    const calls = await prisma.receptionistCallSession.count({
      where: { barbershopId, createdAt: { gte: cycleStart } },
    });
    return shouldAnswerCall(calls);
  } catch (error) {
    console.error("[usage] call count failed, answering anyway", error);
    return true;
  }
}

/**
 * Tell us — not the shop — that a number is running hot.
 *
 * The shop is never billed for overage and never sees a warning, so this exists
 * purely so a robocalled number surfaces to a human before it reaches the
 * ceiling. Sent once per cycle per shop: the notification row doubles as the
 * "already told them" marker, so repeated calls in the same cycle stay quiet.
 */
export async function maybeAlertHighUsage(
  barbershopId: string,
  currentPeriodEnd: Date | null
): Promise<void> {
  try {
    const usage = await getShopUsage(barbershopId, currentPeriodEnd);
    if (usage.callState === "ok") return;

    const already = await prisma.notification.findFirst({
      where: {
        barbershopId,
        createdAt: { gte: usage.cycleStart },
        metadata: { path: ["kind"], equals: USAGE_NOTIFICATION_KIND },
      },
      select: { id: true },
    });
    if (already) return;

    const blocked = usage.callState === "blocked";
    await prisma.notification.create({
      data: {
        barbershopId,
        type: "SYSTEM",
        title: blocked
          ? "AI calls stopped — usage ceiling hit"
          : "Unusually high AI call volume",
        message: blocked
          ? `${usage.aiCalls} answered calls this cycle, past the ${AI_CALLS_HARD_CEILING} ceiling. The AI has stopped answering. This is almost certainly robocalls rather than customers — check the number.`
          : `${usage.aiCalls} answered calls this cycle, past the ${AI_CALLS_WARN_THRESHOLD} mark. Still profitable and still answering; worth a look if it keeps climbing.`,
        // NotificationType has no usage variant, so the kind is carried in
        // metadata. This is also the once-per-cycle marker.
        metadata: { kind: USAGE_NOTIFICATION_KIND, aiCalls: usage.aiCalls },
      },
    });
  } catch (error) {
    // Never let a monitoring failure affect a live call.
    console.error("[usage] high-usage alert failed", error);
  }
}
