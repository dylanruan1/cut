import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  generateTwimlResponse,
  twimlSpeechGather,
  twimlSay,
  normalizePhone,
} from "@/lib/twilio";
import {
  processReceptionistMessage,
  createCallSession,
  getCallSession,
  mergeParsedRequestIntoSession,
  clearCallSession,
  sessionToParsedState,
  getSessionContext,
  summarizeSession,
  isContinuableSession,
  GREETING,
  type ShopContext,
  type CallSessionContext,
} from "@/lib/ai-receptionist";

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
    const callSid = (formData.get("CallSid") as string) || "";
    const speechResult =
      (formData.get("SpeechResult") as string) ||
      (formData.get("Digits") as string) ||
      "";
    const from = (formData.get("From") as string) || "";
    const to = (formData.get("To") as string) || "";
    const actionUrl = processActionUrl(request);

    log("request", { callSid, from, to, speechResult });

    if (!callSid) {
      return twimlXml(
        twimlSay("I'm missing call information. Please try calling again. Goodbye.")
      );
    }

    const shop = await loadShopContext(to);
    if (!shop) {
      return twimlXml(
        twimlSay(
          "Thanks for calling. Our booking system isn't ready yet. Please try again later. Goodbye."
        )
      );
    }

    const callerPhone = from ? normalizePhone(from) : "+10000000000";

    // Always load-or-create. createCallSession preserves ACTIVE / AWAITING_CONFIRMATION.
    let session = await getCallSession(callSid);
    if (!session || !isContinuableSession(session)) {
      session = await createCallSession(callSid, callerPhone, {
        barbershopId: shop.id,
      });
    }

    log("session_before_merge", summarizeSession(session));

    if (!speechResult.trim()) {
      const prompt =
        session.awaitingField || getSessionContext(session).lastPrompt
          ? "Sorry, I didn't catch that. Could you say that again?"
          : "Sorry, I didn't catch that. How can I help you today?";
      return twimlXml(twimlSpeechGather(actionUrl, prompt));
    }

    const context = getSessionContext(session);
    const priorState = sessionToParsedState(session);
    const turnCount = (session.turnCount ?? context.turnCount ?? 0) + 1;

    const response = await processReceptionistMessage({
      text: speechResult,
      callerPhone: session.callerPhone || callerPhone,
      shop,
      session: priorState,
      turnCount,
      promptRepeatCount: context.promptRepeatCount ?? 0,
      lastPrompt: context.lastPrompt,
    });

    // Never speak the full intro mid-call.
    if (response.speak.trim() === GREETING.trim() && turnCount > 1) {
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
      response.parsed.missingFields.includes(priorAwaiting)
        ? (context.promptRepeatCount ?? 0) + 1
        : 1;

    const nextContext: CallSessionContext = {
      ...context,
      turnCount,
      awaitingField: response.awaitingField ?? null,
      lastPrompt: response.speak,
      promptRepeatCount,
      barberAsked,
      anyBarber: Boolean(response.parsed.anyBarber) || Boolean(context.anyBarber),
      confirmed: response.parsed.confirmed,
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

    log("parsed_fields", {
      intent: response.parsed.intent,
      clientName: response.parsed.clientName,
      serviceName: response.parsed.serviceName,
      barberName: response.parsed.barberName,
      preferredDate: response.parsed.preferredDate,
      preferredTime: response.parsed.preferredTime,
      anyBarber: response.parsed.anyBarber,
      confirmed: response.parsed.confirmed,
      missingFields: response.parsed.missingFields,
      awaitingField: response.awaitingField,
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
      if (response.awaitingField === "preferredTime") clearPatch.preferredTime = null;
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
    });

    if (response.sessionComplete) {
      await clearCallSession(callSid);
    }

    if (response.shouldContinue) {
      return twimlXml(twimlSpeechGather(actionUrl, response.speak));
    }

    return twimlXml(
      `${twimlSay(response.speak)}${twimlSay("Thanks for calling Cut. Goodbye.")}`
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

async function loadShopContext(toNumber: string): Promise<ShopContext | null> {
  try {
    let shop = null as Awaited<ReturnType<typeof prisma.barbershop.findFirst>>;

    if (toNumber) {
      shop = await prisma.barbershop.findFirst({
        where: { twilioPhone: normalizePhone(toNumber) },
      });
    }

    if (!shop) {
      shop = await prisma.barbershop.findFirst({ orderBy: { createdAt: "asc" } });
    }

    if (!shop) return null;

    const [services, barbers, businessHours] = await Promise.all([
      prisma.service.findMany({
        where: { barbershopId: shop.id, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, duration: true },
      }),
      prisma.barber.findMany({
        where: { barbershopId: shop.id, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.businessHour.findMany({
        where: { barbershopId: shop.id },
        orderBy: { dayOfWeek: "asc" },
      }),
    ]);

    return {
      id: shop.id,
      name: shop.name,
      address: shop.address,
      phone: shop.phone,
      timezone: shop.timezone || "America/Los_Angeles",
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
      })),
      barbers,
      businessHours: businessHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      })),
    };
  } catch (error) {
    console.warn("[twilio/voice/process] shop load failed:", error);
    return null;
  }
}
