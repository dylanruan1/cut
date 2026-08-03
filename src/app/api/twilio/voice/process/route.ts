import { NextRequest, NextResponse } from "next/server";
import {
  generateTwimlResponse,
  twimlSpeechGather,
  twimlSay,
  normalizePhone,
  detectSpokenLanguage,
  voiceForLanguage,
  type VoiceLanguage,
} from "@/lib/twilio";
import {
  processReceptionistMessage,
  getConfiguredProvider,
  createCallSession,
  getCallSession,
  mergeParsedRequestIntoSession,
  clearCallSession,
  sessionToParsedState,
  getSessionContext,
  summarizeSession,
  isContinuableSession,
  findExistingClientName,
  type CallSessionContext,
} from "@/lib/ai-receptionist";
import {
  resolveShopForTwilioTo,
  UNCONNECTED_NUMBER_MESSAGE,
} from "@/lib/ai-receptionist/shop-resolve";
import { isReceptionistGreeting } from "@/lib/ai-receptionist/prompts";
import {
  AI_INACTIVE_VOICE_MESSAGE,
  canUseAiReceptionist,
} from "@/lib/subscription";
import prisma from "@/lib/db";
import { assertTwilioWebhook } from "@/lib/twilio-webhook-auth";

function appBaseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
}

function processActionUrl(request: NextRequest): string {
  return `${appBaseUrl(request)}/api/twilio/voice/process`;
}

function log(label: string, data: unknown) {
  console.log(`[twilio/voice/process] ${label}`, data);
}

/**
 * Twilio speech callback — loads persistent CallSid session, merges new speech,
 * and asks only for the next missing field.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const auth = await assertTwilioWebhook(request, formData);
    if (!auth.ok) return auth.response;

    const callSid = (formData.get("CallSid") as string) || "";
    const speechResult =
      (formData.get("SpeechResult") as string) ||
      (formData.get("Digits") as string) ||
      "";
    const from = (formData.get("From") as string) || "";
    const to = (formData.get("To") as string) || "";
    const actionUrl = processActionUrl(request);

    log("request", { callSid, from, to, speechResult, rawSpeechResult: speechResult });

    if (!callSid) {
      return twimlXml(
        twimlSay("I'm missing call information. Please try calling again. Goodbye.")
      );
    }

    const { shop } = await resolveShopForTwilioTo(to);
    if (!shop) {
      console.warn("[twilio/voice/process] unmatched To number", { to });
      return twimlXml(twimlSay(UNCONNECTED_NUMBER_MESSAGE));
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
      return twimlXml(twimlSay(AI_INACTIVE_VOICE_MESSAGE));
    }

    const callerPhone = from ? normalizePhone(from) : "+10000000000";

    // Always load-or-create. createCallSession preserves ACTIVE /
    // AWAITING_CONFIRMATION and resets completed/expired sessions to a
    // clean slate, so nothing from an old call can leak into this one.
    let session = await getCallSession(callSid);
    const sessionReused = Boolean(session && isContinuableSession(session));
    if (!session || !sessionReused) {
      session = await createCallSession(callSid, callerPhone, {
        barbershopId: shop.id,
      });
    }

    log("session_load", {
      callSid,
      from,
      sessionReused,
      status: session.status,
    });

    log("session_before_merge", summarizeSession(session));

    if (!speechResult.trim()) {
      const emptyContext = getSessionContext(session);
      const emptyLanguage = (emptyContext.language as VoiceLanguage | undefined) ?? "en";
      const inProgress = Boolean(session.awaitingField || emptyContext.lastPrompt);
      const prompt =
        emptyLanguage === "es"
          ? inProgress
            ? "Perdón, no escuché bien. ¿Puede repetirlo?"
            : "Perdón, no escuché bien. ¿En qué le puedo ayudar?"
          : inProgress
            ? "Sorry, I didn't catch that. Could you say that again?"
            : "Sorry, I didn't catch that. How can I help you today?";
      return twimlXml(
        twimlSpeechGather(actionUrl, prompt, { language: emptyLanguage })
      );
    }

    const context = getSessionContext(session);
    const priorState = sessionToParsedState(session);
    const turnCount = (session.turnCount ?? context.turnCount ?? 0) + 1;

    // Language sticks for the rest of the call once the caller reveals it.
    const priorLanguage = (context.language as VoiceLanguage | undefined) ?? "en";
    const language = detectSpokenLanguage(speechResult, priorLanguage);
    if (language !== priorLanguage) {
      log("language_switch", { callSid, from: priorLanguage, to: language });
    }

    // Log-only lookup: a Client matched by phone is NEVER spoken, suggested,
    // or used to fill session.clientName. The receptionist always asks
    // "What name should I put the appointment under?" and only the caller's
    // answer becomes the name. The matched record is used internally at
    // booking time to link the appointment (without renaming the client).
    let matchedClientName: string | null = null;
    if (!session.clientName?.trim()) {
      matchedClientName = await findExistingClientName(
        shop.id,
        session.callerPhone || callerPhone
      );
    }

    const response = await processReceptionistMessage(
      {
        text: speechResult,
        callerPhone: session.callerPhone || callerPhone,
        shop,
        session: priorState,
        conversationHistory: context.messages ?? [],
        turnCount,
        promptRepeatCount: context.promptRepeatCount ?? 0,
        lastPrompt: context.lastPrompt,
      },
      { provider: getConfiguredProvider() }
    );

    log("client_name_state", {
      callSid,
      from,
      sessionReused,
      awaitingFieldBefore: priorState.awaitingField ?? null,
      awaitingFieldAfter: response.awaitingField ?? null,
      existingMatchedClientName: matchedClientName ?? null,
      matchedNameIgnoredForVoice: Boolean(matchedClientName),
      sessionClientNameBefore: session.clientName ?? null,
      confirmedClientNameBefore: session.confirmedClientName,
      parsedClientName: response.parsed.clientName ?? null,
      confirmedClientNameAfter: response.parsed.confirmedClientName ?? false,
      confirmationBlockedForMissingName:
        priorState.awaitingField === "confirmation" &&
        response.awaitingField === "clientName",
    });

    log("time_parse", {
      rawSpeechResult: speechResult,
      normalizedTranscript: speechResult.toLowerCase().trim(),
      parsedServiceName: response.parsed.serviceName ?? null,
      parsedPreferredDate: response.parsed.preferredDate ?? null,
      parsedPreferredTime:
        response.parsed.preferredTime ?? response.parsed.preferredTimeRaw ?? null,
      preferredTimeRaw: response.parsed.preferredTimeRaw ?? null,
      hasExplicitMeridiem: response.parsed.hasExplicitMeridiem ?? null,
      isAmbiguousHour: response.parsed.isAmbiguousHour ?? false,
      awaitingField: response.awaitingField ?? null,
      resolvedFinalTime: response.parsed.preferredTime ?? null,
    });

    // Never speak the full intro mid-call.
    if (isReceptionistGreeting(response.speak) && turnCount > 1) {
      response.speak = "What was that? I can help you finish booking.";
    }

    const barberAsked =
      Boolean(priorState.barberAsked) ||
      Boolean(response.parsed.barberName) ||
      Boolean(response.parsed.anyBarber) ||
      priorState.awaitingField === "barberName" ||
      response.awaitingField === "confirmation";

    const priorAwaiting = priorState.awaitingField ?? null;
    const promptRepeatCount =
      priorAwaiting &&
      priorAwaiting === response.awaitingField &&
      (priorAwaiting === "timeMeridiem"
        ? !response.parsed.preferredTime
        : response.parsed.missingFields.includes(priorAwaiting))
        ? (context.promptRepeatCount ?? 0) + 1
        : 1;

    const nextContext: CallSessionContext = {
      ...context,
      language,
      turnCount,
      awaitingField: response.awaitingField ?? null,
      lastPrompt: response.speak,
      promptRepeatCount,
      barberAsked,
      anyBarber: Boolean(response.parsed.anyBarber) || Boolean(context.anyBarber),
      confirmed: response.parsed.confirmed,
      preferredTimeRaw:
        response.parsed.preferredTimeRaw ?? context.preferredTimeRaw,
      hasExplicitMeridiem:
        response.parsed.hasExplicitMeridiem ?? context.hasExplicitMeridiem,
      isAmbiguousHour:
        response.parsed.isAmbiguousHour ?? Boolean(response.parsed.ambiguousTime),
      messages: [
        ...(context.messages ?? []),
        {
          role: "user" as const,
          content: speechResult,
          timestamp: new Date().toISOString(),
        },
        {
          role: "assistant" as const,
          content: response.speak,
          timestamp: new Date().toISOString(),
        },
      ].slice(-20),
    };

    if (response.parsed.ambiguousTime) {
      nextContext.pendingAmbiguousHour = response.parsed.ambiguousTime.hour;
      nextContext.pendingAmbiguousMinute = response.parsed.ambiguousTime.minute;
    } else {
      delete nextContext.pendingAmbiguousHour;
      delete nextContext.pendingAmbiguousMinute;
    }

    log("parsed_fields", {
      intent: response.parsed.intent,
      clientName: response.parsed.clientName,
      confirmedClientName: response.parsed.confirmedClientName,
      serviceName: response.parsed.serviceName,
      barberName: response.parsed.barberName,
      preferredDate: response.parsed.preferredDate,
      preferredTime: response.parsed.preferredTime,
      preferredTimeRaw: response.parsed.preferredTimeRaw,
      hasExplicitMeridiem: response.parsed.hasExplicitMeridiem,
      isAmbiguousHour: response.parsed.isAmbiguousHour,
      resolvedFinalTime: response.parsed.preferredTime ?? null,
      anyBarber: response.parsed.anyBarber,
      confirmed: response.parsed.confirmed,
      missingFields: response.parsed.missingFields,
      awaitingField: response.awaitingField,
      barbershopId: shop.id,
    });

    session = await mergeParsedRequestIntoSession(callSid, response.parsed, {
      awaitingField: response.awaitingField ?? null,
      barbershopId: shop.id,
      appointmentId: response.bookingResult?.appointmentId,
      turnCount,
      clearBarberName: Boolean(response.parsed.anyBarber),
      status: response.sessionComplete
        ? "COMPLETED"
        : response.awaitingField === "confirmation"
          ? "AWAITING_CONFIRMATION"
          : "ACTIVE",
      contextPatch: nextContext,
    });

    // Loop recovery: clear only the stuck field
    if (response.speak.includes("Let me restart") && response.awaitingField) {
      const { updateCallSession } = await import("@/lib/ai-receptionist/session");
      const clearPatch: Record<string, null> = {};
      if (response.awaitingField === "clientName") clearPatch.clientName = null;
      if (response.awaitingField === "serviceName") clearPatch.serviceName = null;
      if (response.awaitingField === "preferredDate") clearPatch.preferredDate = null;
      if (
        response.awaitingField === "preferredTime" ||
        response.awaitingField === "timeMeridiem"
      ) {
        clearPatch.preferredTime = null;
      }
      if (response.awaitingField === "barberName") clearPatch.barberName = null;
      if (Object.keys(clearPatch).length > 0) {
        await updateCallSession(callSid, clearPatch);
      }
    }

    log("session_after_merge", summarizeSession(session));
    log("next_awaitingField", response.awaitingField ?? null);
    log("appointment_created", {
      created: Boolean(response.bookingResult?.success && response.bookingResult.appointmentId),
      appointmentId: response.bookingResult?.appointmentId ?? null,
      bookingError: response.bookingResult?.error ?? null,
      clientName: session.clientName,
      shopId: shop.id,
    });

    if (response.sessionComplete) {
      await clearCallSession(callSid);
    }

    if (response.shouldContinue) {
      return twimlXml(twimlSpeechGather(actionUrl, response.speak, { language }));
    }

    const signOff =
      language === "es"
        ? `Gracias por llamar a ${shop.name}. ¡Que tenga buen día!`
        : `Thanks for calling ${shop.name}. Goodbye.`;
    const voice = voiceForLanguage(language);
    return twimlXml(
      `${twimlSay(response.speak, voice)}${twimlSay(signOff, voice)}`
    );
  } catch (error) {
    console.error("[twilio/voice/process] error:", error);
    return twimlXml(
      twimlSay(
        "I'm having trouble processing that right now. Please try calling again. Goodbye."
      )
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

function twimlXml(content: string) {
  return new NextResponse(generateTwimlResponse(content), {
    headers: { "Content-Type": "text/xml" },
  });
}
