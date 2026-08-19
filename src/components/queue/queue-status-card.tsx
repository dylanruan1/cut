"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  leaveQueue,
  checkOutQueueEntry,
  type QueueStatusView,
} from "@/actions/queue";
import {
  Check,
  Loader2,
  Users,
  AlertTriangle,
  Smartphone,
} from "lucide-react";

const TIP_PERCENTS = [0, 15, 20, 25];

export function QueueStatusCard({ status }: { status: QueueStatusView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const [paid, setPaid] = useState(status.paid);
  const [tipPercent, setTipPercent] = useState(20);
  const [payingCash, setPayingCash] = useState(false);
  const [barberPin, setBarberPin] = useState("");
  const [verifiedBy, setVerifiedBy] = useState<string | undefined>();
  const [wasVerified, setWasVerified] = useState(false);

  // Keep the wait estimate honest without the customer refreshing.
  useEffect(() => {
    if (paid || left) return;
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router, paid, left]);

  const price = Number(status.servicePrice);
  const tip = Math.round(price * (tipPercent / 100) * 100) / 100;
  const total = price + tip;

  function onLeave() {
    setError(null);
    startTransition(async () => {
      const res = await leaveQueue(status.token);
      if (res.error) return setError(res.error);
      setLeft(true);
    });
  }

  function onCheckOut(method: "CARD" | "CASH") {
    setError(null);
    startTransition(async () => {
      const res = await checkOutQueueEntry({
        token: status.token,
        method,
        tipAmount: tip,
        barberPin: method === "CASH" ? barberPin : undefined,
      });
      if (res.error) return setError(res.error);
      setVerifiedBy(res.verifiedBy);
      setWasVerified(Boolean(res.cashVerified));
      setPaid(true);
    });
  }

  if (left) {
    return (
      <Card>
        <h2 className="text-xl font-semibold tracking-tight">
          You&apos;ve left the line
        </h2>
        <p className="mt-2 text-muted-foreground">
          No problem — scan the code again any time.
        </p>
      </Card>
    );
  }

  if (paid) {
    // A genuine receipt — either Stripe moved the money, or a barber entered
    // their PIN. Shows who confirmed it and when, which is exactly what a
    // customer could NOT produce by tapping buttons.
    if (wasVerified) {
      return (
        <Card>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Paid ${total.toFixed(2)}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {verifiedBy
              ? `Confirmed by ${verifiedBy} · ${new Date().toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "Payment received"}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Thanks for coming to {status.shopName}. See you next time.
          </p>
        </Card>
      );
    }

    // NOT a receipt. Self-reported cash with no barber confirmation must never
    // look like proof of payment — otherwise the app becomes the thing someone
    // waves at a barber on the way out the door.
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
          <AlertTriangle className="h-7 w-7 text-amber-600" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          ${total.toFixed(2)} due in cash
        </h2>
        <p className="mt-2 text-sm">
          Not confirmed yet — please pay your barber before you go.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Your spot is closed out so the next person can be seated. Ask your
          barber to enter their PIN if you&apos;d like a receipt.
        </p>
      </div>
    );
  }

  // In the chair — time to check out.
  if (status.canCheckOut) {
    return (
      <div className="space-y-6">
        <Card>
          <h2 className="text-xl font-semibold tracking-tight">
            You&apos;re all done
          </h2>
          <p className="mt-1 text-muted-foreground">
            {status.serviceName}
            {status.barberName ? ` with ${status.barberName}` : ""}
          </p>
        </Card>

        <div className="rounded-2xl border bg-card p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Add a tip?
          </h3>
          <div className="mt-3 flex gap-2">
            {TIP_PERCENTS.map((p) => (
              <button
                key={p}
                onClick={() => setTipPercent(p)}
                className={`flex-1 rounded-xl border py-3 text-sm font-medium transition-colors ${
                  tipPercent === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:border-primary"
                }`}
              >
                {p === 0 ? "None" : `${p}%`}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-1 border-t pt-4 text-sm">
            <Row label={status.serviceName} value={`$${price.toFixed(2)}`} />
            {tip > 0 && <Row label="Tip" value={`$${tip.toFixed(2)}`} />}
            <div className="flex justify-between pt-1 text-base font-semibold">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!payingCash ? (
            <>
              <div className="mt-5 space-y-2">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={pending}
                  onClick={() => onCheckOut("CARD")}
                >
                  {pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Pay ${total.toFixed(2)} by card
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  disabled={pending}
                  onClick={() => setPayingCash(true)}
                >
                  I&apos;m paying cash
                </Button>
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Paying cash? Tap that so we know you&apos;re finished.
              </p>
            </>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border bg-background p-4 text-center">
                <Smartphone className="mx-auto mb-2 h-6 w-6 text-primary" />
                <p className="font-medium">Hand your phone to your barber</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pay them ${total.toFixed(2)}, then they&apos;ll enter their
                  PIN to confirm.
                </p>
              </div>

              <div>
                <label htmlFor="barberPin" className="text-sm font-medium">
                  Barber PIN
                </label>
                <Input
                  id="barberPin"
                  value={barberPin}
                  onChange={(e) =>
                    setBarberPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="••••"
                  inputMode="numeric"
                  type="password"
                  autoComplete="off"
                  className="mt-2 text-center text-2xl tracking-[0.5em]"
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={pending || barberPin.length !== 4}
                onClick={() => onCheckOut("CASH")}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Confirm ${total.toFixed(2)} cash
              </Button>

              <button
                className="w-full text-center text-xs text-muted-foreground underline underline-offset-4"
                disabled={pending}
                onClick={() => onCheckOut("CASH")}
              >
                Barber isn&apos;t available — close out without a receipt
              </button>

              <Button
                variant="ghost"
                className="w-full"
                disabled={pending}
                onClick={() => setPayingCash(false)}
              >
                Back
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Still waiting.
  return (
    <div className="space-y-6">
      <Card>
        <div className="text-sm text-muted-foreground">{status.shopName}</div>
        <div className="mt-4 text-4xl font-semibold tracking-tight">
          {status.waitLabel}
        </div>
        {status.position !== null && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {status.position === 1
              ? "You're next in line"
              : `You're #${status.position} in line`}
          </div>
        )}
        <div className="mt-6 space-y-1 border-t pt-4 text-left text-sm">
          <Row label="Name" value={status.name} />
          <Row label="Service" value={status.serviceName} />
          {status.barberName && <Row label="Barber" value={status.barberName} />}
        </div>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        We&apos;ll text you when you&apos;re nearly up. Feel free to step out.
      </p>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        variant="ghost"
        className="w-full"
        disabled={pending}
        onClick={onLeave}
      >
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Leave the line
      </Button>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
