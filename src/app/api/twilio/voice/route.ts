import { NextRequest, NextResponse } from "next/server";
import {
  generateTwimlResponse,
  twimlSpeechGather,
  twimlSay,
  normalizePhone,
} from "@/lib/twilio";
import {
  getReceptionistGreeting,
  getBilingualReceptionistGreeting,
  createCallSession,
} from "@/lib/ai-receptionist";
import {
  resolveShopForTwilioTo,
  UNCONNECTED_NUMBER_MESSAGE,
} from "@/lib/ai-receptionist/shop-resolve";
import {
  AI_INACTIVE_VOICE_MESSAGE,
  canUseAiReceptionist,
} from "@/lib/subscription";
import prisma from "@/lib/db";
import { assertTwilioWebhook } from "@/lib/twilio-webhook-auth";

/**
 * Twilio Voice webhook — AI receptionist entry point.
 * Creates a persistent CallSid session, then gathers speech.
 * Only this endpoint speaks the intro greeting.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const auth = await assertTwilioWebhook(request, formData);
    if (!auth.ok) return auth.response;

    const callSid = (formData.get("CallSid") as string) || `local-${Date.now()}`;
    const from = (formData.get("From") as string) || "";
    const to = (formData.get("To") as string) || "";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

    console.log("[twilio/voice] incoming call", { callSid, from, to });

    const { shop, unmatched } = await resolveShopForTwilioTo(to);
    if (!shop) {
      console.warn("[twilio/voice] rejecting unmatched To number", { to, unmatched });
      return new NextResponse(
        generateTwimlResponse(twimlSay(UNCONNECTED_NUMBER_MESSAGE)),
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    const subscription = await prisma.barbershop.findUnique({
      where: { id: shop.id },
      select: {
        id: true,
        name: true,
        plan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
        currentPeriodEnd: true,
      },
    });

    if (!subscription || !canUseAiReceptionist(subscription)) {
      console.warn("[twilio/voice] AI receptionist inactive for shop", {
        shopId: shop.id,
        plan: subscription?.plan,
        status: subscription?.subscriptionStatus,
      });
      return new NextResponse(
        generateTwimlResponse(twimlSay(AI_INACTIVE_VOICE_MESSAGE)),
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    await ensureReceptionistSession(callSid, from, shop.id);

    // Bilingual greeting announces the Spanish option without a phone-tree menu.
    const greeting = getBilingualReceptionistGreeting(shop.name);
    const twiml = generateTwimlResponse(
      twimlSpeechGather(`${baseUrl}/api/twilio/voice/process`, greeting, {
        language: "en",
      })
    );

    return new NextResponse(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[twilio/voice] error:", error);
    const fallback = generateTwimlResponse(
      twimlSay(
        "Thanks for calling Cut. We're having a brief technical issue. Please try again in a moment."
      )
    );
    return new NextResponse(fallback, {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

async function ensureReceptionistSession(
  callSid: string,
  from: string,
  barbershopId: string
) {
  try {
    const callerPhone = from ? normalizePhone(from) : "+10000000000";
    const session = await createCallSession(callSid, callerPhone, {
      barbershopId,
    });
    console.log("[twilio/voice] session ready", {
      callSid: session.callSid,
      barbershopId,
      status: session.status,
      turnCount: session.turnCount,
    });
  } catch (error) {
    console.warn("[twilio/voice] session create skipped:", error);
  }
}
