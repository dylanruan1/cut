import type { BookingField, ReceptionistIntent } from "./types";

export const GREETING =
  "Thanks for calling Cut. I'm the AI receptionist. I can help you book, reschedule, or cancel an appointment. How can I help you today?";

export const FOLLOW_UP_PROMPTS: Record<BookingField, string> = {
  clientName: "What's your name?",
  serviceName: "What service would you like?",
  preferredDate: "What day works best?",
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
