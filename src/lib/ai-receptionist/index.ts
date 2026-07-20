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
  FOLLOW_UP_PROMPTS,
  intentAcknowledgement,
  describeBookingForVoice,
} from "./prompts";
import type {
  AwaitingField,
  ProcessReceptionistInput,
  ReceptionistProvider,
  ReceptionistResponse,
} from "./types";
import { MAX_PROMPT_REPEATS, MAX_TURN_COUNT } from "./types";
import {
  askMeridiemSpeech,
  neitherMeridiemSpeech,
  resolveAmbiguousTime,
} from "./time-disambiguation";

export type { ProcessReceptionistInput, ReceptionistResponse, ReceptionistProvider };
export {
  GREETING,
  UNKNOWN_PROMPT,
  buildSystemPrompt,
  LOOP_RECOVERY_PROMPT,
  describeBookingForVoice,
  getReceptionistGreeting,
  isReceptionistGreeting,
} from "./prompts";
export {
  parseReceptionistMessage,
  nextFollowUpQuestion,
  nextAwaitingField,
  detectIntent,
  getMissingFields,
  extractPreferredDate,
  extractPreferredTime,
  extractTimePreference,
  extractMeridiemAnswer,
} from "./parser";
export { findAvailability, isSlotAvailable, combineDateAndTime } from "./availability";
export {
  resolveAmbiguousTime,
  askMeridiemSpeech,
  neitherMeridiemSpeech,
  DEFAULT_BUSINESS_OPEN,
  DEFAULT_BUSINESS_CLOSE,
} from "./time-disambiguation";
export {
  executeBooking,
  cancelUpcomingAppointment,
  checkBookingAvailability,
  findExistingClientName,
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

  // Bare 1-12 hour requests must be clarified before collecting or confirming anything else.
  const disambiguated = applyTimeDisambiguation(input, parsed);
  if (disambiguated.earlyReturn) {
    return disambiguated.earlyReturn;
  }
  parsed = disambiguated.parsed;

  // parsed.clientName only ever holds what the caller said on THIS call.
  // Old names (matched Client records, previous sessions, appointment
  // snapshots) are never suggested or spoken — when the name is missing we
  // always ask "What name should I put the appointment under?".
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

  const enriched = {
    ...parsed,
    // A name in parsed.clientName can only come from the caller's own words
    // on this call — sessions and phone matches never auto-fill it.
    confirmedClientName: Boolean(parsed.clientName?.trim()),
    missingFields,
  };

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

  // Still waiting on AM/PM after a failed short answer.
  if (
    input.session?.awaitingField === "timeMeridiem" &&
    !enriched.preferredTime &&
    enriched.ambiguousTime
  ) {
    const resolution = resolveAmbiguousTime(
      enriched.ambiguousTime,
      input.shop,
      enriched.preferredDate
    );
    if (resolution.status === "ask") {
      return {
        speak: askMeridiemSpeech(resolution.spokenAm, resolution.spokenPm),
        intent: enriched.intent,
        parsed: {
          ...enriched,
          preferredTime: undefined,
          missingFields: [
            "preferredTime",
            ...enriched.missingFields.filter((f) => f !== "preferredTime"),
          ],
        },
        shouldContinue: true,
        awaitingField: "timeMeridiem",
      };
    }
  }

  // Collect booking details first; confirmation is handled after availability.
  const collectionMissing = enriched.missingFields.filter(
    (f) => f !== "confirmation"
  );

  if (collectionMissing.length > 0) {
    const awaitingField = collectionMissing[0] ?? nextAwaitingField(enriched);
    const followUp =
      nextFollowUpQuestion({ ...enriched, missingFields: collectionMissing }) ??
      UNKNOWN_PROMPT;

    const priorAwaiting = input.session?.awaitingField;
    const failedSameField =
      priorAwaiting != null &&
      priorAwaiting === awaitingField &&
      collectionMissing.includes(
        priorAwaiting as (typeof collectionMissing)[number]
      );

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

  // Defensive gate: from here on we either book or build the confirmation
  // sentence. Neither may ever happen with a blank name — if enforcement
  // above was somehow bypassed, ask for the name instead of confirming.
  if (!enriched.clientName?.trim()) {
    console.log("[ai-receptionist] confirmation blocked — missing client name", {
      awaitingFieldBefore: input.session?.awaitingField ?? null,
      sessionClientName: input.session?.clientName ?? null,
      parsedClientName: parsed.clientName ?? null,
      confirmationBlockedForMissingName: true,
    });
    return {
      speak: FOLLOW_UP_PROMPTS.clientName,
      intent: enriched.intent,
      parsed: {
        ...enriched,
        clientName: undefined,
        confirmedClientName: false,
        // Any earlier "yes" was for a nameless summary — re-confirm after
        // the caller gives the name.
        confirmed: undefined,
        missingFields: [
          "clientName",
          ...enriched.missingFields.filter((f) => f !== "clientName"),
        ],
      },
      shouldContinue: true,
      awaitingField: "clientName",
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
        ambiguousTime: undefined,
        missingFields: ["preferredTime"],
      },
      shouldContinue: true,
      awaitingField: "preferredTime",
      availabilityOptions: availability.options,
    };
  }

  const slot = availability.options[0];
  const timezone = resolveShopTimezone(input.shop.timezone);
  const confirmStart =
    enriched.preferredDate && enriched.preferredTime
      ? parseReceptionistDateTime(
          enriched.preferredDate,
          enriched.preferredTime,
          timezone
        )
      : new Date(slot.startTime);
  const spokenWhen = formatAppointmentWhenForVoice(confirmStart, timezone);
  // The caller is always "under the name X" (current session name — never a
  // matched Client profile name or dashboard user name). "with barber Y" is
  // spoken only when the caller explicitly asked for that barber; with no
  // preference the barber is omitted so it can't be confused with the client.
  const confirmName = enriched.clientName?.trim();
  const preferredBarberName = enriched.anyBarber
    ? undefined
    : enriched.barberName?.trim();
  const confirmPrompt = `Just to confirm, I have ${describeBookingForVoice({
    serviceName: enriched.serviceName,
    clientName: confirmName,
    barberName: preferredBarberName,
    shopName: input.shop.name,
  })} for ${spokenWhen}. Should I book that? Please say yes or no.`;

  console.log("[ai-receptionist] pre-confirm name", {
    sessionClientName: enriched.clientName ?? null,
    voiceConfirmationName: confirmName ?? null,
    confirmedClientName: enriched.confirmedClientName,
  });

  console.log("[ai-receptionist] pre-confirm timing", {
    rawSpeechResult: enriched.rawText,
    callerRequestedDate: enriched.preferredDate,
    callerRequestedTime: enriched.preferredTime,
    preferredTimeRaw: enriched.preferredTimeRaw,
    hasExplicitMeridiem: enriched.hasExplicitMeridiem,
    isAmbiguousHour: enriched.isAmbiguousHour,
    resolvedFinalTime: enriched.preferredTime,
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
    parsed: {
      ...enriched,
      ambiguousTime: undefined,
      missingFields: ["confirmation"],
    },
    shouldContinue: true,
    awaitingField: "confirmation",
    availabilityOptions: availability.options,
  };
}

function applyTimeDisambiguation(
  input: ProcessReceptionistInput,
  parsed: ReturnType<typeof parseReceptionistMessage>
): {
  parsed: ReturnType<typeof parseReceptionistMessage>;
  earlyReturn?: ReceptionistResponse;
} {
  if (parsed.preferredTime || !parsed.ambiguousTime) {
    return { parsed };
  }

  const resolution = resolveAmbiguousTime(
    parsed.ambiguousTime,
    input.shop,
    parsed.preferredDate
  );

  if (resolution.status === "resolved") {
    return {
      parsed: {
        ...parsed,
        preferredTime: resolution.time,
        ambiguousTime: undefined,
        missingFields: parsed.missingFields.filter((f) => f !== "preferredTime"),
      },
    };
  }

  if (resolution.status === "ask") {
    return {
      parsed: {
        ...parsed,
        preferredTime: undefined,
        missingFields: [
          "preferredTime",
          ...parsed.missingFields.filter((f) => f !== "preferredTime"),
        ],
      },
      earlyReturn: {
        speak: askMeridiemSpeech(resolution.spokenAm, resolution.spokenPm),
        intent: parsed.intent,
        parsed: {
          ...parsed,
          preferredTime: undefined,
          missingFields: [
            "preferredTime",
            ...parsed.missingFields.filter((f) => f !== "preferredTime"),
          ],
        },
        shouldContinue: true,
        awaitingField: "timeMeridiem",
      },
    };
  }

  return {
    parsed: {
      ...parsed,
      preferredTime: undefined,
      ambiguousTime: undefined,
      missingFields: [
        "preferredTime",
        ...parsed.missingFields.filter((f) => f !== "preferredTime"),
      ],
    },
    earlyReturn: {
      speak: neitherMeridiemSpeech(resolution.spokenAm, resolution.spokenPm),
      intent: parsed.intent,
      parsed: {
        ...parsed,
        preferredTime: undefined,
        ambiguousTime: undefined,
        missingFields: [
          "preferredTime",
          ...parsed.missingFields.filter((f) => f !== "preferredTime"),
        ],
      },
      shouldContinue: true,
      awaitingField: "preferredTime",
    },
  };
}

function clearField(
  parsed: ReturnType<typeof parseReceptionistMessage>,
  field: AwaitingField
): ReturnType<typeof parseReceptionistMessage> {
  if (!field) return parsed;
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
    case "timeMeridiem":
      next.preferredTime = undefined;
      next.ambiguousTime = undefined;
      break;
    case "barberName":
      next.barberName = undefined;
      next.anyBarber = undefined;
      break;
    case "confirmation":
      next.confirmed = undefined;
      break;
  }
  if (field === "timeMeridiem") {
    next.missingFields = [
      "preferredTime",
      ...parsed.missingFields.filter((f) => f !== "preferredTime"),
    ];
  } else {
    next.missingFields = [field, ...parsed.missingFields.filter((f) => f !== field)];
  }
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
