#!/usr/bin/env npx tsx
/**
 * Local test harness for the AI receptionist brain — no phone required.
 *
 * Type messages like a caller and watch the receptionist respond (and really
 * book against your dev database). Uses the same processReceptionistMessage
 * entry point the phone uses, with the Claude provider.
 *
 * Usage:
 *   npx tsx scripts/test-receptionist.ts            # uses shop named "Dev"
 *   npx tsx scripts/test-receptionist.ts "Test Shop 2"
 *
 * Requires ANTHROPIC_API_KEY in .env.local. Type "quit" to exit.
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import prisma from "../src/lib/db";
import {
  processReceptionistMessage,
  getReceptionistGreeting,
} from "../src/lib/ai-receptionist";
import type {
  ReceptionistMessage,
  ShopContext,
} from "../src/lib/ai-receptionist/types";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
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

const CALLER_PHONE = "+15550001234"; // fake caller for testing

async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("ANTHROPIC_API_KEY is not set in .env.local. Add it and rerun.");
    process.exit(1);
  }

  const shopName = process.argv[2] || "Dev";
  const shopRow = await prisma.barbershop.findFirst({
    where: { name: shopName },
    include: {
      services: { where: { isActive: true } },
      barbers: { where: { isActive: true } },
      businessHours: true,
    },
  });

  if (!shopRow) {
    console.error(`No barbershop named "${shopName}" found.`);
    process.exit(1);
  }

  const shop: ShopContext = {
    id: shopRow.id,
    name: shopRow.name,
    address: shopRow.address,
    phone: shopRow.phone,
    timezone: shopRow.timezone,
    services: shopRow.services.map((s) => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
    })),
    barbers: shopRow.barbers.map((b) => ({ id: b.id, name: b.name })),
    businessHours: shopRow.businessHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isClosed: h.isClosed,
    })),
  };

  console.log(`\n=== AI Receptionist test — shop: ${shop.name} ===`);
  console.log(`Services: ${shop.services.map((s) => s.name).join(", ") || "none"}`);
  console.log(`Barbers: ${shop.barbers.map((b) => b.name).join(", ") || "none"}`);
  console.log(`(type "quit" to exit)\n`);
  console.log(`Receptionist: ${getReceptionistGreeting(shop.name)}\n`);

  const history: ReceptionistMessage[] = [];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  let turnCount = 0;
  for (;;) {
    const text = (await ask("You (caller): ")).trim();
    if (!text) continue;
    if (text.toLowerCase() === "quit" || text.toLowerCase() === "exit") break;

    turnCount += 1;
    const response = await processReceptionistMessage(
      {
        text,
        callerPhone: CALLER_PHONE,
        shop,
        conversationHistory: history,
        turnCount,
      },
      { provider: "claude" }
    );

    console.log(`\nReceptionist: ${response.speak}\n`);

    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: response.speak });

    if (response.bookingResult?.success) {
      console.log(
        `  [booked: appointment ${response.bookingResult.appointmentId}]\n`
      );
    }
    if (response.sessionComplete) {
      console.log("  [call complete — starting fresh; type or quit]\n");
      history.length = 0;
      turnCount = 0;
    }
  }

  rl.close();
  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
