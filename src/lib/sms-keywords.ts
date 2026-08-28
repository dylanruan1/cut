/**
 * Inbound SMS keyword handling.
 *
 * Carriers require STOP and HELP to work. Twilio's Advanced Opt-Out already
 * blocks messages to a number that replied STOP, so compliance does not depend
 * on this file — but without it the application never learns, and keeps
 * queueing sends that Twilio silently discards. That makes SMS logs lie.
 */

export type SmsKeyword = "STOP" | "START" | "HELP" | "NONE";

/** Carrier-standard opt-out words. */
const STOP_WORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);

/** Words that resume messages after an opt-out. */
const START_WORDS = new Set(["START", "YES", "UNSTOP"]);

const HELP_WORDS = new Set(["HELP", "INFO"]);

/**
 * Classifies an inbound message body.
 *
 * Matches only when the keyword is the entire message, ignoring case,
 * surrounding whitespace and trailing punctuation. "Please cancel my
 * appointment" must not opt someone out of all messaging — that is a real
 * failure mode, and the customer would never know it happened.
 */
export function classifyInboundSms(body: string): SmsKeyword {
  const normalised = body
    .trim()
    .replace(/[.!,?]+$/, "")
    .toUpperCase();

  if (STOP_WORDS.has(normalised)) return "STOP";
  if (START_WORDS.has(normalised)) return "START";
  if (HELP_WORDS.has(normalised)) return "HELP";
  return "NONE";
}

/** Reply sent when someone asks for HELP. Kept under 160 characters. */
export function helpReply(shopName?: string | null): string {
  const who = shopName ?? "Cut";
  return `${who} appointment notifications. Help: https://cutchair.com/support. Reply STOP to unsubscribe. Msg & data rates may apply.`;
}
