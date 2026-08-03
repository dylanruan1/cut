#!/usr/bin/env npx tsx
/**
 * Simulate a full phone call against the LIVE deployment — no phone needed.
 *
 * Sends properly Twilio-signed webhook requests to /api/twilio/voice and
 * /api/twilio/voice/process, exactly like Twilio does, and prints what the
 * receptionist says back (parsed out of the TwiML), plus which voice and
 * speech locale were used.
 *
 * Usage:
 *   npx tsx scripts/simulate-call.ts en     # English booking conversation
 *   npx tsx scripts/simulate-call.ts es     # Spanish booking conversation
 *   npx tsx scripts/simulate-call.ts en "custom line" "another line"
 *
 * Requires TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in .env.local, and
 * PROD_URL (defaults to the known production domain).
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

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

const BASE =
  process.env.PROD_URL?.replace(/\/$/, "") ||
  "https://4u5y3i5befigbaeighasbfghiasbifsbifg.vercel.app";
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
const TO = process.env.TWILIO_PHONE_NUMBER?.trim() || "+14243907235";
const FROM = process.env.SIM_FROM?.trim() || "+15558675309";

if (!AUTH_TOKEN) {
  console.error("TWILIO_AUTH_TOKEN missing in .env.local — cannot sign requests.");
  process.exit(1);
}

/** Twilio signature: HMAC-SHA1 of url + sorted key/value pairs. */
function sign(url: string, params: Record<string, string>): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return crypto.createHmac("sha1", AUTH_TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
}

async function post(pathname: string, params: Record<string, string>) {
  const url = `${BASE}${pathname}`;
  const signature = sign(url, params);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": signature,
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  return { status: res.status, text };
}

function parseTwiml(xml: string) {
  const says = [...xml.matchAll(/<Say voice="([^"]*)">([\s\S]*?)<\/Say>/g)].map((m) => ({
    voice: m[1],
    text: decode(m[2]),
  }));
  const gather = xml.match(/<Gather[^>]*language="([^"]*)"/);
  const ended = !/<Gather/.test(xml);
  return { says, locale: gather?.[1] ?? null, ended };
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

const SCRIPTS: Record<string, string[]> = {
  en: [
    "Hi, I'd like to book a haircut",
    "Tomorrow afternoon around 2",
    "Any barber is fine",
    "Marcus",
    "Yes that's right",
  ],
  es: [
    "Hola, quiero una cita para un corte de pelo",
    "Mañana por la tarde a las dos",
    "Cualquier barbero está bien",
    "Me llamo Carlos",
    "Sí, está correcto",
  ],
};

async function main() {
  const lang = (process.argv[2] || "en").toLowerCase();
  const custom = process.argv.slice(3);
  const lines = custom.length ? custom : SCRIPTS[lang] || SCRIPTS.en;
  const callSid = `CAsim${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

  console.log(`\n=== Simulated call (${lang}) ===`);
  console.log(`Target: ${BASE}`);
  console.log(`CallSid: ${callSid}\n`);

  // 1) Inbound call → greeting
  const first = await post("/api/twilio/voice", {
    CallSid: callSid,
    From: FROM,
    To: TO,
    AccountSid: process.env.TWILIO_ACCOUNT_SID || "ACsimulated",
    Direction: "inbound",
  });

  if (first.status !== 200) {
    console.log(`[voice] HTTP ${first.status}`);
    console.log(first.text.slice(0, 500));
    return;
  }
  const g = parseTwiml(first.text);
  for (const s of g.says) console.log(`Receptionist [${s.voice}]: ${s.text}`);
  console.log(`  (listening in: ${g.locale})\n`);

  // 2) Each caller turn
  for (const line of lines) {
    console.log(`Caller: ${line}`);
    const r = await post("/api/twilio/voice/process", {
      CallSid: callSid,
      From: FROM,
      To: TO,
      AccountSid: process.env.TWILIO_ACCOUNT_SID || "ACsimulated",
      SpeechResult: line,
    });
    if (r.status !== 200) {
      console.log(`  [HTTP ${r.status}] ${r.text.slice(0, 300)}`);
      break;
    }
    const p = parseTwiml(r.text);
    for (const s of p.says) console.log(`Receptionist [${s.voice}]: ${s.text}`);
    if (p.locale) console.log(`  (listening in: ${p.locale})`);
    console.log("");
    if (p.ended) {
      console.log("[call ended]");
      break;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
