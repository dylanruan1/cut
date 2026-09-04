import prisma from "@/lib/db";
import {
  FOUNDING_AI_PRICE,
  FOUNDING_SHOP_LIMIT,
  PLAN_DISPLAY,
} from "@/lib/subscription";

/**
 * Founding pricing for the AI receptionist plan.
 *
 * The first FOUNDING_SHOP_LIMIT shops to take the AI plan pay FOUNDING_AI_PRICE
 * for the life of that subscription; list price stays where it is for everyone
 * after. The scarcity is real — the counter reads the database, so the number
 * shown on the pricing page is the number of seats actually left.
 */

export type FoundingStatus = {
  claimed: number;
  remaining: number;
  available: boolean;
  price: number;
  listPrice: number;
};

/**
 * How many founding slots are gone.
 *
 * Counts shops that have ever *held* the AI plan, not shops holding it right
 * now. A founder who cancels does not free their slot back into the pool —
 * otherwise the counter could go backwards, and a page that said "6 left"
 * yesterday and "8 left" today reads as a lie even though it isn't.
 *
 * foundingClaimedAt is the record of the claim and is never cleared.
 */
export async function getFoundingStatus(): Promise<FoundingStatus> {
  const listPrice = PLAN_DISPLAY.AI_RECEPTIONIST.monthlyPrice ?? 249;
  try {
    const claimed = await prisma.barbershop.count({
      where: { foundingClaimedAt: { not: null } },
    });
    const remaining = Math.max(0, FOUNDING_SHOP_LIMIT - claimed);
    return {
      claimed,
      remaining,
      available: remaining > 0,
      price: FOUNDING_AI_PRICE,
      listPrice,
    };
  } catch (error) {
    // A counter failure must not take down the pricing page. Falling back to
    // "sold out" is the safe direction: we would rather under-promise a
    // discount than advertise one we then cannot honour.
    console.error("[founding] count failed, treating as sold out", error);
    return {
      claimed: FOUNDING_SHOP_LIMIT,
      remaining: 0,
      available: false,
      price: FOUNDING_AI_PRICE,
      listPrice,
    };
  }
}

/**
 * The price this shop should be charged for the AI plan right now.
 *
 * A shop that already claimed a founding slot keeps that price forever, even
 * once the pool is empty — that is the entire promise. Checked before the pool,
 * so re-subscribing or switching plans never quietly raises their rate.
 */
export async function aiPriceForShop(barbershopId: string): Promise<number> {
  const listPrice = PLAN_DISPLAY.AI_RECEPTIONIST.monthlyPrice ?? 249;

  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { foundingClaimedAt: true },
  });
  if (shop?.foundingClaimedAt) return FOUNDING_AI_PRICE;

  const status = await getFoundingStatus();
  return status.available ? FOUNDING_AI_PRICE : listPrice;
}

/**
 * Stamp a shop as a founding member, if slots remain.
 *
 * Returns whether the slot was granted. Uses updateMany with a null guard so a
 * shop that already has a claim is never re-stamped with a later date, which
 * would let someone reset their own position in the queue by resubscribing.
 *
 * There is a benign race here: two shops checking out at the same moment could
 * both see the last slot. Allowing 26 founders rather than 25 costs $199 once
 * and is a much better failure than holding a lock across a Stripe call.
 */
export async function claimFoundingSlot(
  barbershopId: string
): Promise<boolean> {
  const status = await getFoundingStatus();
  if (!status.available) return false;

  const result = await prisma.barbershop.updateMany({
    where: { id: barbershopId, foundingClaimedAt: null },
    data: { foundingClaimedAt: new Date() },
  });
  return result.count > 0;
}
