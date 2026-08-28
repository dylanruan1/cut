import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { generateTwimlResponse, normalizePhone } from "@/lib/twilio";
import { assertTwilioWebhook } from "@/lib/twilio-webhook-auth";
import { classifyInboundSms, helpReply } from "@/lib/sms-keywords";
import { resolveShopForTwilioTo } from "@/lib/ai-receptionist/shop-resolve";

/**
 * Inbound SMS webhook.
 *
 * Records STOP and START so the application knows who has opted out. Twilio
 * blocks messages to opted-out numbers on its own, so this is not what keeps
 * Cut compliant — it is what stops Cut from believing it sent messages that
 * were silently discarded.
 *
 * Replies to HELP with the required contact information. Deliberately silent
 * on everything else: this is not a support channel, and auto-replying to
 * ordinary messages would be both annoying and a carrier violation risk.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const auth = await assertTwilioWebhook(request, formData);
    if (!auth.ok) return auth.response;

    const from = (formData.get("From") as string) || "";
    const to = (formData.get("To") as string) || "";
    const body = (formData.get("Body") as string) || "";

    if (!from) return twiml("");

    const phone = normalizePhone(from);
    const keyword = classifyInboundSms(body);

    if (keyword === "STOP") {
      await prisma.smsOptOut.upsert({
        where: { phone },
        create: { phone },
        update: { optedOutAt: new Date(), optedInAt: null },
      });
      console.log("[twilio/sms] opt-out recorded", { phone });
      // Twilio sends its own opt-out confirmation; sending a second one would
      // be a duplicate the carrier may flag.
      return twiml("");
    }

    if (keyword === "START") {
      await prisma.smsOptOut.deleteMany({ where: { phone } });
      console.log("[twilio/sms] opt-in restored", { phone });
      return twiml("");
    }

    if (keyword === "HELP") {
      const { shop } = await resolveShopForTwilioTo(to);
      return twiml(`<Message>${escapeXml(helpReply(shop?.name))}</Message>`);
    }

    return twiml("");
  } catch (error) {
    console.error("[twilio/sms] failed", error);
    return twiml("");
  }
}

function twiml(inner: string) {
  return new NextResponse(generateTwimlResponse(inner), {
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
