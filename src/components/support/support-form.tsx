"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitSupportRequest } from "@/actions/support";

const TOPICS = [
  "Getting set up",
  "Bookings or calendar",
  "Payments and payouts",
  "Billing or subscription",
  "Something is broken",
  "Something else",
];

export function SupportForm({
  defaultName,
  defaultEmail,
  shopName,
}: {
  defaultName: string;
  defaultEmail: string;
  shopName: string | null;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await submitSupportRequest({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        topic: String(data.get("topic") ?? ""),
        message: String(data.get("message") ?? ""),
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Message sent</h2>
        {/* Deliberately does not promise a response time we haven't committed
            to. A specific promise we miss is worse than a vague honest one. */}
        <p className="mt-2 text-muted-foreground">
          We&apos;ll reply to the email address you gave us. If it&apos;s
          urgent and you have your shop&apos;s phone number, calling is faster.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
        >
          Back to Cut
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border bg-card p-6 shadow-card">
      {shopName && (
        <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          Sending as <span className="font-medium text-foreground">{shopName}</span> — we&apos;ll
          see your account details, so no need to explain who you are.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" defaultValue={defaultName} required maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={defaultEmail}
            required
            maxLength={200}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="topic">What&apos;s this about?</Label>
        <select
          id="topic"
          name="topic"
          defaultValue={TOPICS[0]}
          className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
          required
        >
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">What happened?</Label>
        <Textarea
          id="message"
          name="message"
          rows={6}
          required
          minLength={10}
          maxLength={5000}
          placeholder="I tried to… and instead…"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          "Send message"
        )}
      </Button>
    </form>
  );
}
