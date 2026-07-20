import twilio from "twilio";

let twilioClient: ReturnType<typeof twilio> | null = null;

export type TwilioConfigStatus = {
  configured: boolean;
  missing: string[];
};

/**
 * Soft validation — never throws. Safe for local development.
 */
export function getTwilioConfigStatus(): TwilioConfigStatus {
  const required = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_PHONE_NUMBER",
  ] as const;

  const missing = required.filter((key) => {
    const value = process.env[key];
    return !value || value.startsWith("your-");
  });

  return { configured: missing.length === 0, missing: [...missing] };
}

export function isTwilioConfigured(): boolean {
  return getTwilioConfigStatus().configured;
}

function getTwilioClient() {
  const status = getTwilioConfigStatus();
  if (!status.configured) {
    throw new Error(
      `Twilio credentials not configured. Missing: ${status.missing.join(", ")}`
    );
  }

  if (!twilioClient) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
  }
  return twilioClient;
}

export type SmsType =
  | "booking_confirmation"
  | "reminder_24h"
  | "reminder_2h"
  | "cancellation"
  | "reschedule"
  | "no_show_followup";

export async function sendSms(
  to: string,
  body: string,
  barbershopId: string,
  type: SmsType,
  appointmentId?: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  if (!isTwilioConfigured()) {
    console.warn(
      "[twilio] SMS skipped — credentials not configured:",
      getTwilioConfigStatus().missing.join(", ")
    );
    return { success: false, error: "Twilio not configured" };
  }

  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalizePhone(to),
    });

    const { default: prisma } = await import("@/lib/db");
    await prisma.smsLog.create({
      data: {
        barbershopId,
        appointmentId,
        to: normalizePhone(to),
        body,
        type,
        twilioSid: message.sid,
        status: message.status,
      },
    });

    return { success: true, sid: message.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("SMS send failed:", message);
    return { success: false, error: message };
  }
}

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  if (phone.startsWith("+")) return phone;
  return `+${cleaned}`;
}

export function buildBookingConfirmationSms(
  clientName: string,
  serviceName: string,
  barberName: string,
  dateTime: string,
  shopName: string
): string {
  return `Hi ${clientName}! Your appointment at ${shopName} is confirmed.\n\n${serviceName} with barber ${barberName}\n${dateTime}\n\nReply STOP to opt out.`;
}

export function buildReminderSms(
  clientName: string,
  serviceName: string,
  dateTime: string,
  shopName: string,
  hoursBefore: number
): string {
  const timeLabel = hoursBefore === 24 ? "tomorrow" : "in 2 hours";
  return `Hi ${clientName}! Reminder: Your ${serviceName} at ${shopName} is ${timeLabel} at ${dateTime}. See you soon!`;
}

export function buildCancellationSms(
  clientName: string,
  serviceName: string,
  dateTime: string,
  shopName: string
): string {
  return `Hi ${clientName}, your ${serviceName} appointment at ${shopName} on ${dateTime} has been cancelled. Call us to rebook.`;
}

export function buildRescheduleSms(
  clientName: string,
  serviceName: string,
  newDateTime: string,
  shopName: string
): string {
  return `Hi ${clientName}! Your ${serviceName} at ${shopName} has been rescheduled to ${newDateTime}.`;
}

export function buildNoShowFollowupSms(
  clientName: string,
  shopName: string,
  shopPhone: string
): string {
  return `Hi ${clientName}, we missed you at ${shopName} today. We'd love to reschedule! Call ${shopPhone} or reply to book.`;
}

export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || authToken.startsWith("your-")) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

export function generateTwimlResponse(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`;
}

export function twimlSay(text: string, voice = "Polly.Joanna"): string {
  return `<Say voice="${voice}">${escapeXml(text)}</Say>`;
}

export function twimlGather(
  action: string,
  prompt: string,
  numDigits = 1,
  timeout = 5
): string {
  return `<Gather numDigits="${numDigits}" action="${action}" timeout="${timeout}">${twimlSay(prompt)}</Gather>${twimlSay("We didn't receive any input. Goodbye.")}`;
}

/** Speech-enabled Gather for the AI receptionist voice flow. */
export function twimlSpeechGather(
  action: string,
  prompt: string,
  options?: { timeout?: number; speechTimeout?: string }
): string {
  const timeout = options?.timeout ?? 8;
  const speechTimeout = options?.speechTimeout ?? "auto";
  // actionOnEmptyResult ensures timeouts POST back to process (with empty SpeechResult)
  // instead of falling through and ending the call.
  return [
    `<Gather input="speech dtmf" action="${escapeXml(action)}" method="POST" timeout="${timeout}" speechTimeout="${speechTimeout}" language="en-US" actionOnEmptyResult="true">`,
    twimlSay(prompt),
    `</Gather>`,
    `<Redirect method="POST">${escapeXml(action)}</Redirect>`,
  ].join("");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
