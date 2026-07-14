import {
  isTwilioConfigured,
  normalizePhone,
  sendSms,
  type SmsType,
} from "@/lib/twilio";

export type ReceptionistSmsInput = {
  to: string;
  body: string;
  barbershopId: string;
  appointmentId?: string;
  type?: SmsType;
};

/**
 * Sends SMS only when Twilio env vars are present.
 * Never throws — safe for local development without credentials.
 */
export async function sendReceptionistSms(
  input: ReceptionistSmsInput
): Promise<{ success: boolean; sid?: string; skipped?: boolean; error?: string }> {
  if (!isTwilioConfigured()) {
    console.info(
      "[ai-receptionist] SMS skipped — Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)."
    );
    return { success: false, skipped: true, error: "Twilio not configured" };
  }

  try {
    return await sendSms(
      normalizePhone(input.to),
      input.body,
      input.barbershopId,
      input.type ?? "booking_confirmation",
      input.appointmentId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMS error";
    console.error("[ai-receptionist] SMS failed:", message);
    return { success: false, error: message };
  }
}
