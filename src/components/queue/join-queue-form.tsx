"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinQueue, type QueueShop } from "@/actions/queue";
import { SmsConsentCheckbox } from "@/components/shared/sms-consent-checkbox";
import { Clock, Loader2 } from "lucide-react";

export function JoinQueueForm({ shop }: { shop: QueueShop }) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState<string>("");
  const [barberId, setBarberId] = useState<string>("any");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const service = shop.services.find((s) => s.id === serviceId);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await joinQueue({
        slug: shop.slug,
        serviceId,
        barberId,
        name,
        phone,
        smsConsent,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.token) router.push(`/q/status/${res.token}`);
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          What do you need?
        </h2>
        <div className="space-y-2">
          {shop.services.map((s) => (
            <button
              key={s.id}
              onClick={() => setServiceId(s.id)}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                serviceId === s.id
                  ? "border-primary bg-accent"
                  : "bg-card hover:border-primary"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {s.duration} min
                  </div>
                </div>
                <div className="shrink-0 font-semibold">
                  ${Number(s.price).toFixed(0)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {serviceId && shop.barbers.length > 1 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Anyone in particular?
          </h2>
          <div className="flex flex-wrap gap-2">
            <Chip
              active={barberId === "any"}
              onClick={() => setBarberId("any")}
            >
              First available
            </Chip>
            {shop.barbers.map((b) => (
              <Chip
                key={b.id}
                active={barberId === b.id}
                onClick={() => setBarberId(b.id)}
              >
                {b.name}
              </Chip>
            ))}
          </div>
          {barberId !== "any" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Asking for a specific barber may mean a longer wait.
            </p>
          )}
        </section>
      )}

      {serviceId && (
        <section className="space-y-4">
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name is fine"
              autoComplete="given-name"
            />
          </div>
          <div>
            <Label htmlFor="phone">Mobile number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              inputMode="tel"
              autoComplete="tel"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Tick below and we&apos;ll text you when you&apos;re nearly up — go
              grab a coffee.
            </p>
            {/* A2P 10DLC call to action. Every place Cut collects a number for
                texting needs an affirmative opt-in, or carriers reject the
                campaign and no SMS sends at all. Never required to join — see
                booking-wizard.tsx for the twin. */}
            <div className="mt-3">
              <SmsConsentCheckbox
                checked={smsConsent}
                onChange={setSmsConsent}
                shopName={shop.name}
                context="queue"
                id="sms-consent-queue"
              />
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={pending || !name.trim() || phone.trim().length < 10}
            onClick={submit}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Joining…
              </>
            ) : (
              `Join the line${service ? ` — ${shop.currentWaitLabel.toLowerCase()}` : ""}`
            )}
          </Button>
        </section>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:border-primary"
      }`}
    >
      {children}
    </button>
  );
}
