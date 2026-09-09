/**
 * Affirmative SMS consent.
 *
 * Carriers do not accept "by booking you agree" as opt-in. They want a
 * deliberate act by the customer — a checkbox they ticked themselves, or a
 * spoken yes — recorded with when it happened and where it came from. A2P
 * campaign rejection 30925 was exactly this: the consent language was on the
 * page, but nothing on it was an act of consent.
 *
 * Consent is per shop. Opting out is global (see SmsOptOut), because STOP is
 * global to the carrier and a customer who says stop means stop.
 */

import prisma from "@/lib/db";
import { normalizePhone } from "@/lib/twilio";

export type SmsConsentSource = "booking" | "queue" | "waitlist" | "phone";

/**
 * Records that someone agreed to be texted by this shop.
 *
 * Idempotent, and deliberately keeps the ORIGINAL timestamp on repeat
 * bookings: the audit question is when they first agreed, and refreshing it
 * would quietly erase how long consent has stood.
 *
 * Never throws. A booking must not fail because a consent row could not be
 * written — the cost of that failure is a missed text, not a lost appointment.
 */
export async function recordSmsConsent(
  barbershopId: string,
  phone: string,
  source: SmsConsentSource
): Promise<void> {
  const normalised = normalizePhone(phone);
  try {
    await prisma.smsConsent.upsert({
      where: { barbershopId_phone: { barbershopId, phone: normalised } },
      create: { barbershopId, phone: normalised, source },
      update: {},
    });
  } catch (error) {
    console.error("[sms-consent] failed to record consent", error);
  }
}

/**
 * Has this number agreed to texts from this shop?
 *
 * Returns false when the lookup fails. This is the opposite of how the
 * opt-out check fails — that one sends anyway, because Twilio enforces
 * opt-out at its edge regardless. Nothing enforces consent but us, so an
 * unreadable answer has to mean no.
 */
export async function hasSmsConsent(
  barbershopId: string,
  phone: string
): Promise<boolean> {
  try {
    const consent = await prisma.smsConsent.findUnique({
      where: {
        barbershopId_phone: { barbershopId, phone: normalizePhone(phone) },
      },
      select: { id: true },
    });
    return consent !== null;
  } catch (error) {
    console.error("[sms-consent] consent lookup failed, treating as no", error);
    return false;
  }
}
