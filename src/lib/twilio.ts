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

/** Spoken language for the AI receptionist. */
export type VoiceLanguage = "en" | "es";

/** Neural voices per language. Spanish text needs a Spanish voice or it is mispronounced. */
const VOICE_BY_LANGUAGE: Record<VoiceLanguage, string> = {
  en: "Polly.Joanna",
  es: "Polly.Lupe",
};

/** Speech-recognition locales passed to <Gather language="...">. */
const SPEECH_LOCALE_BY_LANGUAGE: Record<VoiceLanguage, string> = {
  en: "en-US",
  es: "es-US",
};

export function voiceForLanguage(language: VoiceLanguage = "en"): string {
  return VOICE_BY_LANGUAGE[language] ?? VOICE_BY_LANGUAGE.en;
}

export function speechLocaleForLanguage(language: VoiceLanguage = "en"): string {
  return SPEECH_LOCALE_BY_LANGUAGE[language] ?? SPEECH_LOCALE_BY_LANGUAGE.en;
}

/**
 * Heuristic language detection on a caller's transcript.
 * Deliberately conservative: only flips to Spanish on clear Spanish signals,
 * so an English caller is never switched by accident.
 */
export function detectSpokenLanguage(
  text: string,
  current: VoiceLanguage = "en"
): VoiceLanguage {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\s¿¡]/gu, " ")} `;
  if (!t.trim()) return current;

  // Accented/inverted punctuation characters are a strong Spanish signal.
  if (/[ñáéíóúü¿¡]/i.test(text)) return "es";

  const SPANISH_MARKERS = [
    "hola",
    "buenos",
    "buenas",
    "gracias",
    "quiero",
    "necesito",
    "quisiera",
    "cita",
    "corte",
    "pelo",
    "barba",
    "manana",
    "mañana",
    "hoy",
    "tarde",
    "para",
    "por favor",
    "cuanto",
    "cuando",
    "donde",
    "si",
    "una",
    "puedo",
    "tienen",
    "disponible",
    "nombre",
    "me llamo",
    "abierto",
    "hablar",
    "espanol",
    "español",
  ];

  const hits = SPANISH_MARKERS.reduce(
    (count, word) => (t.includes(` ${word} `) ? count + 1 : count),
    0
  );

  // Two or more markers avoids false positives on shared words like "si"/"para".
  if (hits >= 2) return "es";
  // A single unambiguous opener is enough.
  if (/\b(hola|buenos dias|buenas tardes|espanol|español|quisiera|necesito una cita)\b/i.test(t)) {
    return "es";
  }
  return current;
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
/**
 * Speech hints bias Twilio's recognizer toward vocabulary it will actually hear
 * on a barbershop call. This measurably improves accuracy, especially for
 * Spanish where generic models mis-hear booking terms.
 */
const SPEECH_HINTS: Record<VoiceLanguage, string> = {
  en: [
    "haircut","fade","beard trim","line up","kids cut","taper","shape up",
    "today","tomorrow","morning","afternoon","evening","tonight",
    "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
    "AM","PM","o'clock","thirty","any barber","appointment","book","cancel","reschedule",
    "yes","no","that works","sounds good",
  ].join(","),
  es: [
    "corte","corte de pelo","recorte","barba","recorte de barba","desvanecido",
    "perfilado","corte de niño","cita","turno","reservar","agendar","cancelar","cambiar",
    "hoy","mañana","pasado mañana","por la mañana","por la tarde","por la noche",
    "lunes","martes","miércoles","jueves","viernes","sábado","domingo",
    "de la mañana","de la tarde","de la noche","y media","en punto",
    "cualquier barbero","me llamo","mi nombre es","sí","no","está bien","perfecto",
    "quiero","quisiera","necesito","disponible","a qué hora","cuánto cuesta",
  ].join(","),
};

/** A chunk of speech rendered with its own language's native voice. */
export type SpeechSegment = { text: string; language: VoiceLanguage };

export function twimlSpeechGather(
  action: string,
  prompt: string | SpeechSegment[],
  options?: {
    timeout?: number;
    speechTimeout?: string;
    /** Language for both the spoken prompt and speech recognition. */
    language?: VoiceLanguage;
  }
): string {
  const timeout = options?.timeout ?? 8;
  const speechTimeout = options?.speechTimeout ?? "auto";
  const language = options?.language ?? "en";
  const hints = SPEECH_HINTS[language] ?? SPEECH_HINTS.en;
  // Each segment is spoken by the native voice for its own language, so a
  // Spanish sentence is never mispronounced by an English voice.
  const saySegments = Array.isArray(prompt)
    ? prompt
        .filter((s) => s.text.trim())
        .map((s) => twimlSay(s.text, voiceForLanguage(s.language)))
        .join("")
    : twimlSay(prompt, voiceForLanguage(language));
  // enhanced + phone_call model is materially more accurate on telephony audio.
  // actionOnEmptyResult ensures timeouts POST back to process (with empty SpeechResult)
  // instead of falling through and ending the call.
  return [
    `<Gather input="speech dtmf" action="${escapeXml(action)}" method="POST" timeout="${timeout}" speechTimeout="${speechTimeout}" language="${speechLocaleForLanguage(language)}" speechModel="phone_call" enhanced="true" hints="${escapeXml(hints)}" actionOnEmptyResult="true">`,
    saySegments,
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
