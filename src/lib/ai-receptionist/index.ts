import { DAYS_OF_WEEK } from "@/lib/dates";
import {
  formatAppointmentWhenForVoice,
  formatPreferredTimeForVoice,
  parseReceptionistDateTime,
  resolveShopTimezone,
} from "@/lib/datetime";
import {
  cancelUpcomingAppointment,
  checkBookingAvailability,
  executeBooking,
} from "./booking";
import {
  nextAwaitingField,
  nextFollowUpQuestion,
  parseReceptionistMessage,
  getMissingFields,
} from "./parser";
import {
  GREETING,
  UNKNOWN_PROMPT,
  LOOP_RECOVERY_PROMPT,
  intentAcknowledgement,
} from "./prompts";
import type {
  AwaitingField,
  BookingField,
  ProcessReceptionistInput,
  ReceptionistProvider,
  ReceptionistResponse,
} from "./types";
import { MAX_PROMPT_REPEATS, MAX_TURN_COUNT } from "./types";

export type { ProcessReceptionistInput, ReceptionistResponse, ReceptionistProvider };
export { GREETING, UNKNOWN_PROMPT, buildSystemPrompt, LOOP_RECOVERY_PROMPT } from "./prompts";
export {
  parseReceptionistMessage,
  nextFollowUpQuestion,
  nextAwaitingField,
  detectIntent,
  getMissingFields,
  extractPreferredDate,
  extractPreferredTime,
} from "./parser";
export { findAvailability, isSlotAvailable, combineDateAndTime } from "./availability";
export {
  executeBooking,
  cancelUpcomingAppointment,
  checkBookingAvailability,
} from "./booking";
export { sendReceptionistSms } from "./sms";
export {
  getCallSession,
  createCallSession,
  updateCallSession,
  mergeParsedRequestIntoSession,
  clearCallSession,
  expireOldCallSessions,
  sessionToParsedState,
  getSessionContext,
  summarizeSession,
  isContinuableSession,
} from "./session";
export type * from "./types";
export { MAX_TURN_COUNT, MAX_PROMPT_REPEATS, SESSION_TTL_HOURS } from "./types";

/**
 * Main entry point for the AI receptionist.
 * Stateless regarding persistence — callers pass merged session state in.
 */
export async function processReceptionistMessage(
  input: ProcessReceptionistInput,
  options?: { provider?: ReceptionistProvider }
): Promise<ReceptionistResponse> {
  const provider = options?.provider ?? "rules";

  if (provider === "openai") {
    console.info(
      "[ai-receptionist] OpenAI provider requested but not configured; using rules parser."
    );
  }

  return processWithRules(input);
}

async function processWithRules(
  input: ProcessReceptionistInput
): Promise<ReceptionistResponse> {
  const turnCount = input.turnCount ?? 0;

  if (turnCount >= MAX_TURN_COUNT) {
    return {
      speak: "We've been going back and forth for a while. Please call back and we'll start fresh. Goodbye.",
      intent: input.session?.intent ?? "unknown",
      parsed: {
        intent: input.session?.intent ?? "unknown",
        rawText: input.text,
        confidence: 1,
        missingFields: [],
        clientName: input.session?.clientName,
        serviceName: input.session?.serviceName,
        barberName: input.session?.barberName,
        preferredDate: input.session?.preferredDate,
        preferredTime: input.session?.preferredTime,
      },
      shouldContinue: false,
      sessionComplete: true,
    };
  }

  const parsed = parseReceptionistMessage(input.text, {
    shop: input.shop,
    session: input.session,
    now: input.now,
  });

  // If we are mid-booking, never fall back to the intro / unknown prompt.
  const sessionIntent = input.session?.intent;
  const inBooking =
    Boolean(input.session?.awaitingField) ||
    sessionIntent === "book_appointment" ||
    sessionIntent === "reschedule_appointment" ||
    Boolean(input.session?.serviceName) ||
    Boolean(input.session?.clientName);

  let intent = parsed.intent;
  if (
    inBooking &&
    (intent === "unknown" ||
      intent === "ask_hours" ||
      intent === "ask_services" ||
      intent === "ask_location")
  ) {
    // Prefer completing the booking unless the caller clearly asked for info
    // AND we are not awaiting a short answer field.
    if (!input.session?.awaitingField) {
      // allow info intents only when not awaiting a field
    } else {
      intent =
        sessionIntent === "reschedule_appointment"
          ? "reschedule_appointment"
          : "book_appointment";
      parsed.intent = intent;
    }
  }

  if (inBooking && intent === "unknown") {
    intent = sessionIntent === "reschedule_appointment"
      ? "reschedule_appointment"
      : "book_appointment";
    parsed.intent = intent;
  }

  // Info intents can interrupt collection without wiping booking state in the session layer.
  switch (intent) {
    case "ask_hours":
      return speakAndContinue(formatHoursSpeech(input.shop), parsed, input.session?.awaitingField ?? null);
    case "ask_services":
      return speakAndContinue(formatServicesSpeech(input.shop), parsed, input.session?.awaitingField ?? null);
    case "ask_location":
      return speakAndContinue(formatLocationSpeech(input.shop), parsed, input.session?.awaitingField ?? null);

    case "cancel_appointment": {
      const result = await cancelUpcomingAppointment({
        shopId: input.shop.id,
        callerPhone: input.callerPhone,
      });
      return {
        speak: result.message,
        intent: parsed.intent,
        parsed,
        shouldContinue: !result.success,
        bookingResult: result,
        sessionComplete: result.success,
        awaitingField: null,
      };
    }

    case "reschedule_appointment":
    case "book_appointment": {
      return handleBookingFlow(input, parsed);
    }

    default:
      // Never speak the full greeting mid-call.
      return {
        speak: UNKNOWN_PROMPT,
        intent: "unknown",
        parsed,
        shouldContinue: true,
        awaitingField: null,
      };
  }
}

async function handleBookingFlow(
  input: ProcessReceptionistInput,
  parsed: ReturnType<typeof parseReceptionistMessage>
): Promise<ReceptionistResponse> {
  const barberAsked =
    Boolean(input.session?.barberAsked) ||
    Boolean(parsed.barberName) ||
    Boolean(parsed.anyBarber) ||
    input.session?.awaitingField === "barberName";

  const missingFields = getMissingFields(parsed.intent, {
    clientName: parsed.clientName,
    serviceName: parsed.serviceName,
    preferredDate: parsed.preferredDate,
    preferredTime: parsed.preferredTime,
    barberName: parsed.barberName,
    anyBarber: parsed.anyBarber,
    confirmed: parsed.confirmed,
    barberAsked,
  });

  const enriched = { ...parsed, missingFields };

  // User declined confirmation — clear only confirmation, keep details.
  if (
    input.session?.awaitingField === "confirmation" &&
    enriched.confirmed === false
  ) {
    return {
      speak: "No problem. What would you like to change — the service, day, or time?",
      intent: enriched.intent,
      parsed: { ...enriched, confirmed: undefined, missingFields: ["preferredDate"] },
      shouldContinue: true,
      awaitingField: "preferredDate",
    };
  }

  if (enriched.missingFields.length > 0) {
    const awaitingField = nextAwaitingField(enriched);
    const followUp = nextFollowUpQuestion(enriched) ?? UNKNOWN_PROMPT;

    const priorAwaiting = input.session?.awaitingField;
    const failedSameField =
      priorAwaiting != null &&
      priorAwaiting === awaitingField &&
      enriched.missingFields.includes(priorAwaiting);

    const promptRepeatCount = failedSameField
      ? (input.promptRepeatCount ?? 0) + 1
      : 1;

    if (promptRepeatCount > MAX_PROMPT_REPEATS && awaitingField) {
      return {
        speak: `${LOOP_RECOVERY_PROMPT} ${followUp}`,
        intent: enriched.intent,
        parsed: clearField(enriched, awaitingField),
        shouldContinue: true,
        awaitingField,
      };
    }

    const ack =
      !input.session?.intent || input.session.intent === "unknown"
        ? intentAcknowledgement(enriched.intent)
        : "";

    return {
      speak: `${ack} ${followUp}`.trim(),
      intent: enriched.intent,
      parsed: enriched,
      shouldContinue: true,
      awaitingField,
    };
  }

  // All fields present + confirmed → book
  if (enriched.confirmed) {
    const booking = await executeBooking({
      shop: input.shop,
      parsed: enriched,
      callerPhone: input.callerPhone,
    });

    return {
      speak: booking.message,
      intent: enriched.intent,
      parsed: enriched,
      shouldContinue: !booking.success,
      bookingResult: booking,
      sessionComplete: booking.success,
      awaitingField: booking.success ? null : "confirmation",
    };
  }

  // Check availability before asking for confirmation
  const availability = await checkBookingAvailability({
    shop: input.shop,
    parsed: enriched,
  });

  if (!availability.available) {
    return {
      speak:
        availability.message ??
        "I don't have an opening at that time. Would you like a different day or time?",
      intent: enriched.intent,
      parsed: {
        ...enriched,
        preferredTime: undefined,
        missingFields: ["preferredTime"],
      },
      shouldContinue: true,
      awaitingField: "preferredTime",
      availabilityOptions: availability.options,
    };
  }

  const slot = availability.options[0];
  const timezone = resolveShopTimezone(input.shop.timezone);
  const who = enriched.anyBarber || !enriched.barberName ? slot.barberName : enriched.barberName;
  const confirmStart =
    enriched.preferredDate && enriched.preferredTime
      ? parseReceptionistDateTime(
          enriched.preferredDate,
          enriched.preferredTime,
          timezone
        )
      : new Date(slot.startTime);
  const spokenWhen = formatAppointmentWhenForVoice(confirmStart, timezone);
  const confirmPrompt = `I have ${enriched.serviceName} with ${who} on ${spokenWhen}. Should I go ahead and book that? Please say yes or no.`;

  console.log("[ai-receptionist] pre-confirm timing", {
    callerRequestedDate: enriched.preferredDate,
    callerRequestedTime: enriched.preferredTime,
    preferredTimeSpoken: enriched.preferredTime
      ? formatPreferredTimeForVoice(enriched.preferredTime)
      : null,
    timezoneUsed: timezone,
    appointmentStartStored: confirmStart.toISOString(),
    appointmentStartDisplayed: spokenWhen,
  });

  return {
    speak: confirmPrompt,
    intent: enriched.intent,
    parsed: { ...enriched, missingFields: ["confirmation"] },
    shouldContinue: true,
    awaitingField: "confirmation",
    availabilityOptions: availability.options,
  };
}

function clearField(
  parsed: ReturnType<typeof parseReceptionistMessage>,
  field: BookingField
): ReturnType<typeof parseReceptionistMessage> {
  const next = { ...parsed };
  switch (field) {
    case "clientName":
      next.clientName = undefined;
      break;
    case "serviceName":
      next.serviceName = undefined;
      break;
    case "preferredDate":
      next.preferredDate = undefined;
      break;
    case "preferredTime":
      next.preferredTime = undefined;
      break;
    case "barberName":
      next.barberName = undefined;
      next.anyBarber = undefined;
      break;
    case "confirmation":
      next.confirmed = undefined;
      break;
  }
  next.missingFields = [field, ...parsed.missingFields.filter((f) => f !== field)];
  return next;
}

function speakAndContinue(
  speak: string,
  parsed: ReturnType<typeof parseReceptionistMessage>,
  awaitingField: AwaitingField
): ReceptionistResponse {
  return {
    speak,
    intent: parsed.intent,
    parsed,
    shouldContinue: true,
    awaitingField,
  };
}

function formatHoursSpeech(shop: ProcessReceptionistInput["shop"]): string {
  const openDays = shop.businessHours
    .filter((h) => !h.isClosed)
    .map(
      (h) =>
        `${DAYS_OF_WEEK[h.dayOfWeek]} from ${toSpeechTime(h.openTime)} to ${toSpeechTime(h.closeTime)}`
    );

  if (openDays.length === 0) {
    return `${shop.name} hours are not configured yet. Please call back later.`;
  }

  return `${shop.name} is open ${openDays.join(". ")}.`;
}

function formatServicesSpeech(shop: ProcessReceptionistInput["shop"]): string {
  if (shop.services.length === 0) {
    return "We don't have services listed yet. Please ask for a haircut or fade and I'll help you book.";
  }
  const list = shop.services.map((s) => s.name).join(", ");
  return `We offer ${list}. Which one would you like?`;
}

function formatLocationSpeech(shop: ProcessReceptionistInput["shop"]): string {
  if (!shop.address) {
    return `${shop.name} location isn't listed yet. You can reach the shop at ${shop.phone ?? "our main number"}.`;
  }
  return `We're located at ${shop.address}.`;
}

function toSpeechTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0
    ? `${hour12} ${period}`
    : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function getReceptionistGreeting(): string {
  return GREETING;
}
