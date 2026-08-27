"use server";

import { z } from "zod";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, sanitizeInput } from "@/lib/rate-limit";
import { sendEmail, isResendConfigured } from "@/lib/resend";

/**
 * Support requests.
 *
 * Cut sends from noreply@, so there is no inbox for someone to reply into.
 * This form is the way back: it stores the question and emails it on, with
 * reply-to set to the sender so answering is a normal reply.
 */

const SUPPORT_TOPICS = [
  "Getting set up",
  "Bookings or calendar",
  "Payments and payouts",
  "Billing or subscription",
  "Something is broken",
  "Something else",
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

const supportSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(100),
  email: z.string().trim().email("That email doesn't look right").max(200),
  topic: z.enum(SUPPORT_TOPICS),
  message: z
    .string()
    .trim()
    .min(10, "A little more detail helps us actually help you")
    .max(5000),
});

/** Topics offered in the form. Exported as a function — this is a "use server" module. */
export async function getSupportTopics(): Promise<readonly string[]> {
  return SUPPORT_TOPICS;
}

export async function submitSupportRequest(input: {
  name: string;
  email: string;
  topic: string;
  message: string;
}): Promise<{ success: true } | { error: string }> {
  const parsed = supportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Check the form" };
  }

  // Public endpoint, so it needs a limit. Keyed by IP because the form is
  // reachable without an account.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const limited = rateLimit(`support:${ip}`, 5, 10 * 60_000);
  if (!limited.success) {
    return { error: "Too many messages. Try again in a few minutes." };
  }

  const { name, email, topic, message } = parsed.data;

  // Attach account context when we have it, so support doesn't start with
  // "which shop are you?".
  const user = await getCurrentUser().catch(() => null);

  const saved = await prisma.supportMessage.create({
    data: {
      name: sanitizeInput(name),
      email,
      topic,
      message: sanitizeInput(message),
      userId: user?.id ?? null,
      barbershopId: user?.barbershopId ?? null,
      shopName: user?.barbershop?.name ?? null,
    },
  });

  const inbox = process.env.SUPPORT_INBOX?.trim();
  if (!inbox || !isResendConfigured()) {
    // The row exists, so the question isn't lost — but say so loudly, because
    // silently storing messages nobody reads is worse than not having a form.
    console.error("[support] stored but not emailed — SUPPORT_INBOX or RESEND_API_KEY missing", {
      id: saved.id,
    });
    return { success: true };
  }

  const context = user
    ? `Account: ${user.email}${user.barbershop ? ` · Shop: ${user.barbershop.name}` : " · No shop yet"}`
    : "Not signed in";

  const result = await sendEmail({
    to: inbox,
    // Reply goes to the person who asked, so answering is just hitting reply.
    replyTo: email,
    subject: `[Cut support] ${topic} — ${name}`,
    text: [
      message,
      "",
      "—",
      `From: ${name} <${email}>`,
      context,
      `Ref: ${saved.id}`,
    ].join("\n"),
  });

  if (result.ok) {
    await prisma.supportMessage.update({
      where: { id: saved.id },
      data: { emailed: true },
    });
  } else {
    console.error("[support] email failed", { id: saved.id, error: result.error });
  }

  return { success: true };
}
