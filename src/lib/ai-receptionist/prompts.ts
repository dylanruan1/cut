import type { BookingField, ReceptionistIntent } from "./types";

/** Default greeting used only when no shop name is available (tests / legacy). */
export const GREETING =
  "Thanks for calling Cut. I'm the AI receptionist. I can help you book, reschedule, or cancel an appointment. How can I help you today?";

export function getReceptionistGreeting(shopName: string): string {
  const name = shopName.trim() || "Cut";
  return `Thanks for calling ${name}. I'm the AI receptionist. I can help you book, reschedule, or cancel an appointment. How can I help you today?`;
}

/**
 * Bilingual greeting: announces the Spanish option so Spanish-speaking callers
 * know it exists, without forcing a "press 2" menu on everyone. The caller
 * simply answers in whichever language they prefer and the receptionist follows.
 */
export function getBilingualReceptionistGreeting(shopName: string): string {
  const name = shopName.trim() || "Cut";
  // The keypad option is deterministic — Twilio can only run speech recognition
  // in one language per turn, so a Spanish first sentence heard by the English
  // recognizer is often garbled. Pressing 2 switches reliably.
  return `Thanks for calling ${name}. I can help you book, reschedule, or cancel an appointment. Para español, oprima el dos. How can I help you today?`;
}

/** Spoken entirely in Spanish once the caller opts into Spanish. */
export function getSpanishReceptionistGreeting(shopName: string): string {
  const name = shopName.trim() || "Cut";
  return `Gracias por llamar a ${name}. Le puedo ayudar a hacer, cambiar o cancelar una cita. ¿En qué le puedo ayudar?`;
}

export function isReceptionistGreeting(speak: string): boolean {
  return /^Thanks for calling .+\. I'm the AI receptionist\./i.test(speak.trim());
}

export const FOLLOW_UP_PROMPTS: Record<BookingField, string> = {
  clientName: "What name should I put the appointment under?",
  serviceName: "What service would you like?",
  preferredDate: "What day works best for you?",
  preferredTime: "What time works best?",
  barberName: "Do you have a preferred barber? You can say a name, or say any available.",
  confirmation: "Should I go ahead and book that for you? Please say yes or no.",
};

export const UNKNOWN_PROMPT =
  "I can help you book, reschedule, or cancel an appointment, or tell you about our hours, services, and location. What would you like to do?";

export const LOOP_RECOVERY_PROMPT =
  "I'm having trouble understanding. Let me restart.";

export function buildMissingInfoPrompt(missing: BookingField[]): string {
  if (missing.length === 0) return "";
  const first = missing[0];
  return FOLLOW_UP_PROMPTS[first];
}

export function intentAcknowledgement(intent: ReceptionistIntent): string {
  switch (intent) {
    case "book_appointment":
      return "Sure, I can help you book an appointment.";
    case "reschedule_appointment":
      return "I can help you reschedule.";
    case "cancel_appointment":
      return "I can help you cancel an appointment.";
    case "ask_hours":
      return "Happy to share our hours.";
    case "ask_services":
      return "Here's what we offer.";
    case "ask_location":
      return "Here's where you can find us.";
    default:
      return "";
  }
}

/**
 * Speech-safe description of a booking, e.g.
 * "Haircut under the name Dylan with barber Chris at Westside Barbers".
 *
 * The client is always introduced as "under the name X" and the barber as
 * "with barber Y" so a listener can never mistake the client for the barber.
 * Pass barberName only when the caller explicitly asked for that barber;
 * omit it entirely when they have no preference.
 * Pass shopName so confirmation speech names the barbershop.
 */
export function describeBookingForVoice(input: {
  serviceName?: string | null;
  clientName?: string | null;
  barberName?: string | null;
  shopName?: string | null;
}): string {
  const parts = [input.serviceName?.trim() || "an appointment"];
  const clientName = input.clientName?.trim();
  if (clientName) parts.push(`under the name ${clientName}`);
  const barberName = input.barberName?.trim();
  if (barberName) parts.push(`with barber ${barberName}`);
  const shopName = input.shopName?.trim();
  if (shopName) parts.push(`at ${shopName}`);
  return parts.join(" ");
}

/**
 * Prompt template reserved for a future LLM provider.
 * Keep this stable so OpenAI / other models can be swapped in without
 * rewriting Twilio routes.
 */
export function buildSystemPrompt(shopName: string, services: string[], barbers: string[]): string {
  return [
    `You are the AI receptionist for ${shopName}, a barbershop.`,
    "You help callers book, reschedule, or cancel appointments, and answer questions about hours, services, and location.",
    "Be concise, warm, and clear. Ask only for missing information.",
    `Services: ${services.join(", ") || "none listed"}.`,
    `Barbers: ${barbers.join(", ") || "any available"}.`,
    "Never invent availability. Only confirm bookings the system validates.",
  ].join(" ");
}
