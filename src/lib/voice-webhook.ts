/**
 * Public Twilio voice webhook URL for a shop's AI receptionist.
 * Prefer NEXT_PUBLIC_APP_URL so Console setup matches production.
 */
export function getVoiceWebhookUrl(appUrl?: string | null): string {
  const base = (appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!base) return "/api/twilio/voice";
  return `${base}/api/twilio/voice`;
}
