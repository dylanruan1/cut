import Anthropic from "@anthropic-ai/sdk";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { resolveShopTimezone } from "@/lib/datetime";
import {
  checkBookingAvailability,
  executeBooking,
  cancelUpcomingAppointment,
} from "./booking";
import { formatAppointmentTimeForVoice } from "@/lib/datetime";
import type {
  ProcessReceptionistInput,
  ReceptionistResponse,
  ReceptionistIntent,
  ReceptionistMessage,
  ParsedBookingRequest,
  ShopContext,
} from "./types";

/**
 * Claude-backed receptionist brain.
 *
 * Replaces the regex parser with an LLM that reads the whole conversation and
 * decides what to say / when to book. Reuses the existing booking engine
 * (checkBookingAvailability / executeBooking / cancelUpcomingAppointment) via
 * tool calls, and returns the same ReceptionistResponse shape so the Twilio
 * route is unchanged.
 *
 * Fully optional: if ANTHROPIC_API_KEY is absent this module reports
 * unconfigured and the caller falls back to the rules parser.
 */

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_ROUNDS = 5;

function model(): string {
  return process.env.AI_RECEPTIONIST_MODEL?.trim() || DEFAULT_MODEL;
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: key });
  }
  return cachedClient;
}

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function daysOfWeekOpen(shop: ShopContext, tz: string): string {
  const names = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const open = shop.businessHours
    .filter((h) => !h.isClosed)
    .map((h) => `${names[h.dayOfWeek]} ${to12h(h.openTime)}–${to12h(h.closeTime)}`);
  return open.length ? open.join("; ") : "hours not set";
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

function dateReference(tz: string): string {
  const now = new Date();
  const lines: string[] = [];
  for (let i = 0; i < 14; i++) {
    const day = addDays(now, i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatInTimeZone(day, tz, "EEEE");
    lines.push(`  ${label} = ${formatInTimeZone(day, tz, "yyyy-MM-dd (EEEE, MMMM d)")}`);
  }
  return lines.join("\n");
}

function buildSystemPrompt(shop: ShopContext): string {
  const tz = resolveShopTimezone(shop.timezone);
  const now = formatInTimeZone(new Date(), tz, "EEEE, MMMM d, yyyy 'at' h:mm a");
  const services =
    shop.services
      .map((s) => {
        const deposit = s.depositAmount ? `, $${s.depositAmount} deposit` : "";
        return `${s.name} (${s.duration} min${deposit})`;
      })
      .join(", ") || "none listed";
  const barbers = shop.barbers.map((b) => b.name).join(", ") || "any available";

  return [
    `You are the friendly female receptionist answering the phone for ${shop.name}, a barbershop.`,
    `Your job: help callers book, reschedule, or cancel appointments, and answer quick questions about hours, services, and location.`,
    ``,
    `PERSONALITY & VOICE:`,
    `- Warm, upbeat, and personable — like a real person who's genuinely happy to help, not a robotic phone menu.`,
    `- Keep every reply SHORT: one or two spoken sentences. This is a phone call, not a chat.`,
    `- Plain spoken language only. No markdown, no emojis, no bullet points, no lists.`,
    `- Sound natural: contractions, light warmth. Never over-formal.`,
    ``,
    `LANGUAGE:`,
    `- You are fully bilingual in English and Spanish.`,
    `- Detect the caller's language from what they say and reply ENTIRELY in that language.`,
    `- If they speak Spanish, use natural conversational Latin American Spanish — not translated-sounding phrasing.`,
    `- Once you are in a language, stay in it for the rest of the call unless the caller clearly switches.`,
    `- Never mix both languages in one reply, and never ask which language they want — just match them.`,
    ``,
    `SHOP INFO:`,
    `- Name: ${shop.name}`,
    `- Right now it is ${now} (${tz}).`,
    `- DATE REFERENCE — use these exact dates to resolve "today", "tomorrow", "this Friday", etc. Do NOT calculate dates yourself; look them up here:`,
    dateReference(tz),
    `- Services: ${services}`,
    `- Barbers: ${barbers}`,
    `- Hours: ${daysOfWeekOpen(shop, tz)}`,
    shop.address ? `- Address: ${shop.address}` : ``,
    ``,
    `BOOKING RULES (important):`,
    `- The caller has already been greeted. Do not re-introduce yourself; just keep the conversation going.`,
    `- You MUST collect the caller's name before booking. Always ask "What name should I put it under?" — never guess or reuse a name.`,
    `- Before booking, you need: service, date, time, and the caller's name. A specific barber is optional — if they don't care, book with any available.`,
    `- ALWAYS call check_availability before telling the caller a time works. Never invent or promise a slot the system hasn't confirmed.`,
    `- Read back the full appointment (service, day, time, name) and get a clear "yes" before you call book_appointment.`,
    `- CRITICAL: An appointment is ONLY real after the book_appointment tool has returned success. NEVER tell a caller they are "booked", "all set", "locked in", or "confirmed" unless you actually called book_appointment and it succeeded. The caller saying "yes" is NOT a booking — you must still call the tool. Claiming someone is booked without calling the tool is a serious failure: they will show up to no appointment.`,
    `- Even if the caller gives every detail in one sentence, still call check_availability, then call book_appointment. Do not skip the tools.`,
    `- Only after book_appointment returns success do you warmly confirm and mention a text confirmation is on the way.`,
    `- If a requested time isn't available, offer the nearest options the tool returns.`,
    `- Never offer or agree to a time earlier today that has already passed. If a caller asks for a time that's already gone by, let them know warmly and suggest later today or another day.`,
    `- If the chosen service lists a deposit, mention it naturally before booking (e.g. "there's a $10 deposit to hold the spot"). After booking, the system texts them a payment link — tell them to watch for it, and that the time is held until they pay.`,
    ``,
    `TOOL INPUT FORMAT:`,
    `- Dates must be YYYY-MM-DD. Times must be 24-hour HH:mm (e.g. 4 PM = "16:00").`,
    `- If a caller says a bare hour like "8" and it's unclear whether AM or PM, ask them to clarify before using it.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Check whether a service can be booked on a given date/time (optionally with a specific barber). Always call this before telling the caller a time is open.",
    input_schema: {
      type: "object",
      properties: {
        service_name: { type: "string", description: "Service the caller wants, e.g. Haircut" },
        date: { type: "string", description: "Date in YYYY-MM-DD" },
        time: { type: "string", description: "24-hour time HH:mm, e.g. 16:00" },
        barber_name: {
          type: "string",
          description: "Preferred barber name, or omit for any available",
        },
      },
      required: ["service_name", "date", "time"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book the appointment. Only call after the caller has given their name and clearly confirmed the details.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Name the caller gave for the booking" },
        service_name: { type: "string" },
        date: { type: "string", description: "Date in YYYY-MM-DD" },
        time: { type: "string", description: "24-hour time HH:mm" },
        barber_name: { type: "string", description: "Preferred barber, or omit for any available" },
      },
      required: ["client_name", "service_name", "date", "time"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Cancel the caller's upcoming appointment (found by their phone number). Use when the caller wants to cancel.",
    input_schema: { type: "object", properties: {} },
  },
];

type ToolArgs = {
  service_name?: string;
  date?: string;
  time?: string;
  barber_name?: string;
  client_name?: string;
};

function toAnthropicMessages(
  history: ReceptionistMessage[],
  latest: string
): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [];
  for (const m of history) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const content = m.content?.trim();
    if (!content) continue;
    const role = m.role as "user" | "assistant";
    const last = msgs[msgs.length - 1];
    // Collapse consecutive same-role turns to keep strict alternation.
    if (last && last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n${content}`;
    } else {
      msgs.push({ role, content });
    }
  }
  // Ensure the transcript ends with the caller's newest utterance.
  const last = msgs[msgs.length - 1];
  if (last && last.role === "user" && typeof last.content === "string") {
    last.content = `${last.content}\n${latest}`;
  } else {
    msgs.push({ role: "user", content: latest });
  }
  // The API requires the first message to be from the user.
  while (msgs.length && msgs[0].role !== "user") {
    msgs.shift();
  }
  return msgs;
}

export async function processWithClaude(
  input: ProcessReceptionistInput
): Promise<ReceptionistResponse> {
  const client = getClient();
  if (!client) {
    throw new Error("Anthropic API key not configured");
  }

  const { shop } = input;
  const tz = resolveShopTimezone(shop.timezone);
  const system = buildSystemPrompt(shop);
  const messages = toAnthropicMessages(input.conversationHistory ?? [], input.text);

  // Track what the model actually acted on so the session/dashboard stay in sync.
  const collected: {
    intent: ReceptionistIntent;
    clientName?: string;
    serviceName?: string;
    barberName?: string;
    anyBarber?: boolean;
    preferredDate?: string;
    preferredTime?: string;
  } = { intent: "book_appointment" };

  let bookingResult: ReceptionistResponse["bookingResult"];
  let sessionComplete = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: model(),
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const speak = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();

      return buildResponse({
        speak: speak || "Sorry, could you say that again?",
        collected,
        bookingResult,
        sessionComplete,
        rawText: input.text,
      });
    }

    // Execute every tool the model asked for, then loop back with results.
    messages.push({
      role: "assistant",
      content: response.content as Anthropic.ContentBlockParam[],
    });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const args = (block.input ?? {}) as ToolArgs;
      let resultText: string;

      try {
        if (block.name === "check_availability") {
          collected.intent = "book_appointment";
          if (args.service_name) collected.serviceName = args.service_name;
          if (args.date) collected.preferredDate = args.date;
          if (args.time) collected.preferredTime = args.time;
          if (args.barber_name) collected.barberName = args.barber_name;
          else collected.anyBarber = true;

          const avail = await checkBookingAvailability({
            shop,
            parsed: {
              serviceName: args.service_name,
              preferredDate: args.date,
              preferredTime: args.time,
              barberName: args.barber_name,
              anyBarber: !args.barber_name,
            },
          });
          resultText = avail.available
            ? `Available. Options: ${avail.options
                .slice(0, 3)
                .map(
                  (o) =>
                    `${formatAppointmentTimeForVoice(new Date(o.startTime), tz)} with ${o.barberName}`
                )
                .join("; ")}`
            : `Not available. ${avail.message ?? ""}`.trim();
        } else if (block.name === "book_appointment") {
          collected.intent = "book_appointment";
          if (args.client_name) collected.clientName = args.client_name;
          if (args.service_name) collected.serviceName = args.service_name;
          if (args.date) collected.preferredDate = args.date;
          if (args.time) collected.preferredTime = args.time;
          if (args.barber_name) collected.barberName = args.barber_name;
          else collected.anyBarber = true;

          const result = await executeBooking({
            shop,
            callerPhone: input.callerPhone,
            parsed: {
              intent: "book_appointment",
              clientName: args.client_name,
              serviceName: args.service_name,
              preferredDate: args.date,
              preferredTime: args.time,
              barberName: args.barber_name,
              anyBarber: !args.barber_name,
              confirmed: true,
              rawText: input.text,
              confidence: 1,
              missingFields: [],
            },
          });
          bookingResult = result;
          if (result.success) sessionComplete = true;
          resultText = result.success
            ? `Booked successfully. ${result.message}`
            : `Could not book. ${result.message}`;
        } else if (block.name === "cancel_appointment") {
          collected.intent = "cancel_appointment";
          const result = await cancelUpcomingAppointment({
            shopId: shop.id,
            callerPhone: input.callerPhone,
          });
          bookingResult = result;
          if (result.success) sessionComplete = true;
          resultText = result.message;
        } else {
          resultText = "Unknown tool.";
        }
      } catch (err) {
        console.error("[ai-receptionist/claude] tool error", block.name, err);
        resultText =
          "That didn't go through on my end. Ask the caller to try a different time or continue.";
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: resultText,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Ran out of tool rounds without a final spoken reply — safe fallback.
  return buildResponse({
    speak:
      "Sorry, I got a little tangled up there. What service and day were you hoping for?",
    collected,
    bookingResult,
    sessionComplete,
    rawText: input.text,
  });
}

function buildResponse(args: {
  speak: string;
  collected: {
    intent: ReceptionistIntent;
    clientName?: string;
    serviceName?: string;
    barberName?: string;
    anyBarber?: boolean;
    preferredDate?: string;
    preferredTime?: string;
  };
  bookingResult: ReceptionistResponse["bookingResult"];
  sessionComplete: boolean;
  rawText: string;
}): ReceptionistResponse {
  const { collected } = args;
  const parsed: ParsedBookingRequest = {
    intent: collected.intent,
    clientName: collected.clientName,
    confirmedClientName: Boolean(collected.clientName?.trim()),
    serviceName: collected.serviceName,
    barberName: collected.barberName,
    anyBarber: collected.anyBarber,
    preferredDate: collected.preferredDate,
    preferredTime: collected.preferredTime,
    rawText: args.rawText,
    confidence: 1,
    missingFields: [],
  };

  return {
    speak: args.speak,
    intent: collected.intent,
    parsed,
    shouldContinue: !args.sessionComplete,
    awaitingField: null,
    bookingResult: args.bookingResult,
    sessionComplete: args.sessionComplete,
  };
}
