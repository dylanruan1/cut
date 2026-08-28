"use client";

import { useState, useTransition } from "react";
import { BellRing, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinWaitlist } from "@/actions/waitlist";
import { TIME_PREFERENCE_LABELS } from "@/lib/waitlist";

/**
 * Offered when a chosen day has no times left.
 *
 * Shown at the point of disappointment rather than as a separate feature —
 * that's the only moment someone is motivated to leave their number.
 */
export function WaitlistPrompt({
  slug,
  serviceId,
  barberId,
  date,
  dayLabel,
  defaultName = "",
  defaultPhone = "",
}: {
  slug: string;
  serviceId: string;
  barberId?: string;
  /** Shop-local YYYY-MM-DD. */
  date: string;
  /** Human wording for the chosen day, e.g. "Saturday, Aug 29". */
  dayLabel: string;
  defaultName?: string;
  defaultPhone?: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await joinWaitlist({
        slug,
        serviceId,
        barberId,
        date,
        timePreference: String(data.get("timePreference") ?? "ANY"),
        clientName: String(data.get("clientName") ?? ""),
        clientPhone: String(data.get("clientPhone") ?? ""),
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">You&apos;re on the list</p>
            <p className="mt-1 text-sm text-muted-foreground">
              If something opens on {dayLabel}, we&apos;ll text you. Several
              people may get the same message, so book quickly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rounded-2xl border bg-card p-5 text-center">
        <BellRing className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">Fully booked on {dayLabel}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cancellations happen. We can text you if a spot opens.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => setOpen(true)}>
          Notify me if a spot opens
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border bg-card p-5">
      <div>
        <p className="text-sm font-medium">Get a text if {dayLabel} opens up</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We only message you about this day, once something is actually free.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="wl-name">Your name</Label>
          <Input id="wl-name" name="clientName" defaultValue={defaultName} required maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wl-phone">Mobile number</Label>
          <Input
            id="wl-phone"
            name="clientPhone"
            type="tel"
            defaultValue={defaultPhone}
            required
            placeholder="(424) 555 0142"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="wl-pref">What time suits you?</Label>
        <select
          id="wl-pref"
          name="timePreference"
          defaultValue="ANY"
          className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
        >
          {(["ANY", "MORNING", "AFTERNOON", "EVENING"] as const).map((p) => (
            <option key={p} value={p}>
              {TIME_PREFERENCE_LABELS[p]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Wider is better — you&apos;ll hear about more openings.
        </p>
      </div>

      {/* A2P 10DLC call to action — required anywhere a number is collected
          for texting. */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        By joining the list, you agree to receive a text if a spot opens.
        Message frequency varies. Message and data rates may apply. Reply STOP
        to opt out or HELP for help. See our{" "}
        <a href="/privacy" className="underline underline-offset-2" target="_blank" rel="noreferrer">
          Privacy Policy
        </a>{" "}
        and{" "}
        <a href="/terms" className="underline underline-offset-2" target="_blank" rel="noreferrer">
          Terms
        </a>
        .
      </p>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding you…
            </>
          ) : (
            "Text me if it opens"
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
