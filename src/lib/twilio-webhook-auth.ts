import { NextRequest, NextResponse } from "next/server";
import {
  generateTwimlResponse,
  twimlSay,
  validateTwilioSignature,
} from "@/lib/twilio";
import { isDevelopmentEnvironment } from "@/lib/shop-constants";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Validate an inbound Twilio webhook.
 * - Production: requires valid X-Twilio-Signature when TWILIO_AUTH_TOKEN is set.
 * - Development: allows bypass with a clear warning when token missing or signature invalid.
 */
export async function assertTwilioWebhook(
  request: NextRequest,
  formData: FormData
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });

  const callSid = params.CallSid || params.From || "unknown";
  const limited = rateLimit(`twilio:${callSid}`, 120, 60_000);
  if (!limited.success) {
    return {
      ok: false,
      response: new NextResponse(
        generateTwimlResponse(
          twimlSay("We're receiving too many requests. Please try again shortly.")
        ),
        { status: 429, headers: { "Content-Type": "text/xml" } }
      ),
    };
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const hasToken = Boolean(authToken && !authToken.startsWith("your-"));
  const signature = request.headers.get("x-twilio-signature") || "";
  const url =
    process.env.TWILIO_WEBHOOK_URL?.trim() ||
    `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || ""}${request.nextUrl.pathname}`;

  const isDev = isDevelopmentEnvironment();

  if (!hasToken) {
    if (isDev) {
      console.warn(
        "[twilio] DEV BYPASS: TWILIO_AUTH_TOKEN not set — skipping signature validation"
      );
      return { ok: true };
    }
    console.error("[twilio] Rejecting request — TWILIO_AUTH_TOKEN not configured in production");
    return {
      ok: false,
      response: new NextResponse(
        generateTwimlResponse(twimlSay("This phone line is not configured. Goodbye.")),
        { status: 503, headers: { "Content-Type": "text/xml" } }
      ),
    };
  }

  if (!signature) {
    if (isDev) {
      console.warn("[twilio] DEV BYPASS: missing X-Twilio-Signature");
      return { ok: true };
    }
    return {
      ok: false,
      response: new NextResponse(
        generateTwimlResponse(twimlSay("Unauthorized request. Goodbye.")),
        { status: 403, headers: { "Content-Type": "text/xml" } }
      ),
    };
  }

  const valid = validateTwilioSignature(url, params, signature);
  if (!valid) {
    if (isDev) {
      console.warn(
        "[twilio] DEV BYPASS: invalid Twilio signature (check TWILIO_WEBHOOK_URL / APP_URL)",
        { url }
      );
      return { ok: true };
    }
    console.warn("[twilio] Rejecting invalid signature", { url });
    return {
      ok: false,
      response: new NextResponse(
        generateTwimlResponse(twimlSay("Unauthorized request. Goodbye.")),
        { status: 403, headers: { "Content-Type": "text/xml" } }
      ),
    };
  }

  return { ok: true };
}
