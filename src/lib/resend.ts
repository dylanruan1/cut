/**
 * Minimal Resend client.
 *
 * Uses the REST API directly rather than the `resend` npm package — the only
 * thing needed here is one POST, and avoiding the dependency keeps the install
 * unchanged.
 *
 * Resend is already the SMTP provider behind Supabase Auth emails; this is the
 * same account, used for mail the app sends itself.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string;
  subject: string;
  /** Plain text. Kept text-only on purpose: nothing here needs HTML, and
   *  text bodies are far less likely to be filtered as spam. */
  text: string;
  /** Where a reply should go. Lets support replies reach the person who asked. */
  replyTo?: string;
  from?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export function isResendConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  return Boolean(key) && !key!.startsWith("your-");
}

/** The address Cut sends from. Must be on a domain verified in Resend. */
export function defaultFromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "Cut <noreply@cutchair.com>";
}

/**
 * Sends one email.
 *
 * Never throws — callers are usually in a request path where a failed
 * notification must not take down the thing the user was actually doing.
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? defaultFromAddress(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      // Resend returns a JSON body describing the problem; surface it rather
      // than a bare status code, which is unactionable in logs.
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? null };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
