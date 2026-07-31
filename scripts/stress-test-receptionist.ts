#!/usr/bin/env npx tsx
/**
 * Automated adversarial stress test for the AI receptionist.
 *
 * A second AI plays a troublesome caller for each scenario and talks to the
 * receptionist until the call ends. Then hard invariants are checked
 * automatically:
 *   - never book a time in the past
 *   - never book on a day the shop is closed
 *   - never book a service/barber that doesn't exist
 *   - never book without a caller-provided name
 *   - scenario-specific "should this end in a booking?" expectations
 *
 * Usage:  npx tsx scripts/stress-test-receptionist.ts
 *         npx tsx scripts/stress-test-receptionist.ts --keep   (keep test bookings)
 *
 * Requires ANTHROPIC_API_KEY in .env.local. Creates temporary appointments in
 * the dev DB and deletes them at the end unless --keep is passed. Twilio is not
 * configured locally, so no real texts are sent.
 */

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { toZonedTime } from "date-fns-tz";
import prisma from "../src/lib/db";
import { processReceptionistMessage } from "../src/lib/ai-receptionist";
import { resolveShopTimezone } from "../src/lib/datetime";
import type {
  ReceptionistMessage,
  ShopContext,
} from "../src/lib/ai-receptionist/types";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const KEEP = process.argv.includes("--keep");
const MODEL = process.env.AI_RECEPTIONIST_MODEL?.trim() || "claude-haiku-4-5-20251001";

type Scenario = {
  name: string;
  persona: string;
  maxTurns?: number;
  shouldBook: boolean;
  expectNameCollected?: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    name: "Past time today",
    persona:
      "You want a haircut TODAY at 3 PM specifically. It is currently evening. Insist on 3 PM today at first. If told it's passed, accept another time today or tomorrow.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "Closed-day insistence",
    persona:
      "You want to book on a day the shop is closed (try Sunday). Insist a couple times. If they truly can't, accept the nearest open day.",
    shouldBook: true,
  },
  {
    name: "Ambiguous bare hour",
    persona:
      "You want a haircut tomorrow. When asked the time, just say '8' and nothing else at first. If they ask AM or PM, say evening. Give your name as Marcus when asked. Confirm.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "Homophone trap (for/four)",
    persona:
      "Open with exactly: 'Hi, I'm calling for a haircut.' Do NOT mean 4 o'clock. Then when asked, say tomorrow around noon. Name is Dev. Confirm.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "Serial mind-changer",
    persona:
      "First ask for a fade tomorrow at 2 PM. Then change to a beard trim. Then change the time to 4 PM. Then give your name as Tony and confirm whatever the final details are.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "No preferences at all",
    persona:
      "You just want any haircut, any barber, as soon as possible. Say you don't care about the day/barber; take the soonest they offer. Name is Sam. Confirm.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "Nonexistent service",
    persona:
      "You want a hot-stone massage and a manicure. Keep asking for those. Do not accept a haircut substitute. End the call politely if they can't.",
    shouldBook: false,
  },
  {
    name: "Nonexistent barber",
    persona:
      "You insist on booking with a barber named 'Giovanni' who does not work there. If they say no Giovanni, ask who is available and book a haircut tomorrow at 1 PM with whoever. Name is Luis.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "Everything in one breath",
    persona:
      "Say in ONE sentence: 'I need a fade tomorrow at 2 PM with any barber, name's Jeff.' Then just confirm when they read it back.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "Name refusal",
    persona:
      "You want a haircut tomorrow at 11 AM but you REFUSE to give your name every time they ask. Never provide a name. Get annoyed but stay on the line.",
    shouldBook: false,
  },
  {
    name: "Off-topic derailer",
    persona:
      "Keep asking unrelated things: the weather, parking, whether they take crypto, football scores. Eventually, if pushed, book a haircut tomorrow at 3 PM, name Chris.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "Gibberish then real",
    persona:
      "First two turns: say total nonsense ('purple bicycle staple'). Then straighten up and book a haircut tomorrow at 10 AM, name Omar, and confirm.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "Impossible date",
    persona:
      "Ask to book on February 30th. When that fails, ask for 'next Blursday'. Finally settle on tomorrow at 12 PM, name Riley, confirm.",
    shouldBook: true,
    expectNameCollected: true,
  },
  {
    name: "Cancel request",
    persona:
      "You want to CANCEL your upcoming appointment. You have no booking on file. Ask to cancel; accept whatever they say.",
    shouldBook: false,
  },
];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });

type Turn = { who: "caller" | "receptionist"; text: string };

async function callerSay(persona: string, transcript: Turn[]): Promise<string> {
  const system = [
    "You are role-playing a customer phoning a barbershop. Stay fully in character.",
    "Reply with ONLY what you would say out loud on the phone — one short, natural sentence.",
    "No stage directions, no quotes, no explanations.",
    "When your goal is done (booked, or clearly cannot be), say a brief goodbye like 'okay thanks, bye'.",
    "",
    "YOUR CHARACTER & GOAL:",
    persona,
  ].join("\n");

  // From the caller's POV, the receptionist's lines are the "user" turns.
  const messages: Anthropic.MessageParam[] = [];
  for (const t of transcript) {
    const role = t.who === "receptionist" ? "user" : "assistant";
    const last = messages[messages.length - 1];
    if (last && last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n${t.text}`;
    } else {
      messages.push({ role, content: t.text });
    }
  }
  if (messages.length === 0 || messages[0].role !== "user") {
    // Caller opens the call.
    messages.unshift({ role: "user", content: "(the receptionist has just greeted you)" });
  }

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 150,
    system,
    messages,
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
  return text || "okay thanks, bye";
}

function isGoodbye(text: string): boolean {
  return /\b(bye|goodbye|that'?s all|have a good|take care)\b/i.test(text);
}

async function loadShop(name: string): Promise<ShopContext> {
  const row = await prisma.barbershop.findFirst({
    where: { name },
    include: {
      services: { where: { isActive: true } },
      barbers: { where: { isActive: true } },
      businessHours: true,
    },
  });
  if (!row) throw new Error(`No barbershop named "${name}"`);
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    timezone: row.timezone,
    services: row.services.map((s) => ({ id: s.id, name: s.name, duration: s.duration })),
    barbers: row.barbers.map((b) => ({ id: b.id, name: b.name })),
    businessHours: row.businessHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isClosed: h.isClosed,
    })),
  };
}

async function runScenario(
  scenario: Scenario,
  shop: ShopContext,
  startedAt: Date,
  callerPhone: string
): Promise<{ transcript: Turn[]; failures: string[]; bookingIds: string[] }> {
  const maxTurns = scenario.maxTurns ?? 14;
  const history: ReceptionistMessage[] = [];
  const transcript: Turn[] = [];
  const bookingIds: string[] = [];
  const failures: string[] = [];
  const tz = resolveShopTimezone(shop.timezone);

  let turn = 0;
  let callerLine = await callerSay(scenario.persona, transcript);

  while (turn < maxTurns) {
    turn += 1;
    transcript.push({ who: "caller", text: callerLine });

    const resp = await processReceptionistMessage(
      {
        text: callerLine,
        callerPhone,
        shop,
        conversationHistory: history,
        turnCount: turn,
      },
      { provider: "claude" }
    );

    transcript.push({ who: "receptionist", text: resp.speak });
    history.push({ role: "user", content: callerLine });
    history.push({ role: "assistant", content: resp.speak });

    // Count real bookings only — a cancel also returns a successful result.
    if (
      resp.bookingResult?.success &&
      resp.bookingResult.appointmentId &&
      resp.intent !== "cancel_appointment"
    ) {
      bookingIds.push(resp.bookingResult.appointmentId);
    }

    // Break AFTER processing this turn, so a "yes, thanks bye" confirmation
    // still executes the booking before the call ends.
    if (resp.sessionComplete) break;
    if (isGoodbye(callerLine)) break;

    callerLine = await callerSay(scenario.persona, transcript);
  }

  // --- Automated invariant checks ---
  const booked = await prisma.appointment.findMany({
    where: { id: { in: bookingIds.length ? bookingIds : ["__none__"] } },
    include: { service: true, barber: true },
  });

  for (const apt of booked) {
    if (apt.startTime.getTime() < startedAt.getTime()) {
      failures.push(
        `Booked a PAST time (${apt.startTime.toISOString()} < now ${startedAt.toISOString()})`
      );
    }
    const day = toZonedTime(apt.startTime, tz).getDay();
    const hours = shop.businessHours.find((h) => h.dayOfWeek === day);
    if (!hours || hours.isClosed) {
      failures.push(`Booked on a CLOSED day (weekday ${day})`);
    }
    const nameSnap = (apt.clientNameSnapshot ?? "").trim();
    if (!nameSnap || nameSnap.toLowerCase() === "phone customer") {
      failures.push(`Booked without a real caller name (snapshot: "${nameSnap}")`);
    }
    const validService = shop.services.some((s) => s.id === apt.serviceId);
    if (!validService) failures.push("Booked a nonexistent service");
    const validBarber = shop.barbers.some((b) => b.id === apt.barberId);
    if (!validBarber) failures.push("Booked a nonexistent barber");
  }

  if (scenario.shouldBook && booked.length === 0) {
    failures.push("Expected a booking but none was made");
  }
  if (!scenario.shouldBook && booked.length > 0) {
    failures.push("Made a booking that should NOT have happened");
  }
  if (scenario.expectNameCollected && booked.length > 0) {
    // already covered by name check above; kept for clarity
  }

  return { transcript, failures, bookingIds };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("ANTHROPIC_API_KEY missing in .env.local.");
    process.exit(1);
  }
  const shop = await loadShop(process.argv.find((a) => a.startsWith("shop="))?.slice(5) || "Dev");
  const startedAt = new Date();
  const allBookingIds: string[] = [];
  let passCount = 0;

  console.log(`\n=== Receptionist stress test — shop: ${shop.name} ===`);
  console.log(`Services: ${shop.services.map((s) => s.name).join(", ")}`);
  console.log(`Barbers: ${shop.barbers.map((b) => b.name).join(", ")}`);
  console.log(`Running ${SCENARIOS.length} adversarial scenarios...\n`);

  let scenarioIndex = 0;
  for (const scenario of SCENARIOS) {
    scenarioIndex += 1;
    // Unique caller phone per scenario so appointments never collide across runs.
    const callerPhone = `+1555${String(1000000 + scenarioIndex).slice(-7)}`;
    process.stdout.write(`▶ ${scenario.name} ... `);
    let result;
    try {
      result = await runScenario(scenario, shop, startedAt, callerPhone);
    } catch (err) {
      console.log("ERROR");
      console.log(`   ${err instanceof Error ? err.message : err}\n`);
      continue;
    }
    allBookingIds.push(...result.bookingIds);
    const pass = result.failures.length === 0;
    if (pass) passCount += 1;
    console.log(pass ? "PASS" : "FAIL");
    for (const f of result.failures) console.log(`   ✗ ${f}`);
    for (const t of result.transcript) {
      const who = t.who === "caller" ? "  Caller     " : "  Receptionist";
      console.log(`${who}: ${t.text}`);
    }
    console.log("");
  }

  // Cleanup test bookings
  if (!KEEP && allBookingIds.length) {
    await prisma.appointment.deleteMany({ where: { id: { in: allBookingIds } } });
    console.log(`Cleaned up ${allBookingIds.length} test booking(s).`);
  } else if (KEEP && allBookingIds.length) {
    console.log(`Kept ${allBookingIds.length} test booking(s) (--keep).`);
  }

  console.log(`\n=== RESULT: ${passCount}/${SCENARIOS.length} scenarios passed ===\n`);
  await prisma.$disconnect();
  process.exit(passCount === SCENARIOS.length ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
