"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getPublicAvailability,
  createPublicBooking,
  type PublicShop,
  type PublicSlot,
} from "@/actions/public-booking";
import {
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  User,
} from "lucide-react";

import { WaitlistPrompt } from "@/components/booking/waitlist-prompt";

type Step = "service" | "barber" | "time" | "details" | "done";

type Booked = {
  id: string;
  when: string;
  serviceName: string;
  barberName: string;
  shopName: string;
  clientName: string;
};

const STEP_ORDER: Step[] = ["service", "barber", "time", "details"];

/** Local YYYY-MM-DD for a date offset from today, in the shop's timezone. */
function shopDateKey(offsetDays: number, timezone: string): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dayLabel(dateKey: string, timezone: string, index: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Noon avoids DST edge cases when formatting.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(dt);
  const dayNum = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    day: "numeric",
  }).format(dt);
  return {
    top: index === 0 ? "Today" : index === 1 ? "Tomorrow" : weekday,
    bottom: dayNum,
  };
}

/** Spoken-form day, e.g. "Saturday, Aug 29" — used where there's room for it. */
function fullDayLabel(dateKey: string, timezone: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(dt);
}

export function BookingWizard({ shop }: { shop: PublicShop }) {
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string>("");
  const [barberId, setBarberId] = useState<string>("any");
  const [dateKey, setDateKey] = useState<string>(() => shopDateKey(0, shop.timezone));
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [pending, startTransition] = useTransition();

  const service = shop.services.find((s) => s.id === serviceId);
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, i) => shopDateKey(i, shop.timezone)),
    [shop.timezone]
  );

  // Load slots whenever the selection that affects them changes.
  useEffect(() => {
    if (step !== "time" || !serviceId) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlots([]);
    setSlot(null);
    getPublicAvailability({ slug: shop.slug, serviceId, date: dateKey, barberId })
      .then((res) => {
        if (cancelled) return;
        if (res.error) setError(res.error);
        setSlots(res.slots ?? []);
      })
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [step, serviceId, dateKey, barberId, shop.slug]);

  function goBack() {
    setError(null);
    const i = STEP_ORDER.indexOf(step);
    if (i > 0) setStep(STEP_ORDER[i - 1]);
  }

  function submit() {
    setError(null);
    if (!slot || !service) return;
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: shop.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(slot.startTime));

    startTransition(async () => {
      const res = await createPublicBooking({
        slug: shop.slug,
        serviceId,
        barberId,
        date: dateKey,
        time,
        name,
        phone,
        email,
        notes,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      // Deposit required — hand off to Stripe Checkout.
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      if (res.success && res.appointment) {
        setBooked(res.appointment);
        setStep("done");
      }
    });
  }

  if (step === "done" && booked) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Check className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">You&apos;re booked!</h2>
        <p className="mt-2 text-muted-foreground">
          We sent a confirmation text to {phone}.
        </p>
        <div className="mt-6 space-y-2 rounded-xl border bg-background p-4 text-left text-sm">
          <Row label="Service" value={booked.serviceName} />
          <Row label="Barber" value={booked.barberName} />
          <Row label="When" value={booked.when} />
          <Row label="Name" value={booked.clientName} />
          <Row label="Where" value={booked.shopName} />
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Need to change it? Give the shop a call
          {shop.phone ? ` at ${shop.phone}` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === "service" && (
        <Section title="Choose a service">
          <div className="space-y-2">
            {shop.services.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setServiceId(s.id);
                  setStep(shop.barbers.length > 1 ? "barber" : "time");
                }}
                className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium">{s.name}</div>
                    {s.description && (
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">
                        {s.description}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {s.duration} min
                      </span>
                      {s.depositAmount && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                          ${Number(s.depositAmount).toFixed(0)} deposit
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 font-semibold">
                    ${Number(s.price).toFixed(0)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {step === "barber" && (
        <Section title="Choose a barber" onBack={goBack}>
          <div className="space-y-2">
            <button
              onClick={() => {
                setBarberId("any");
                setStep("time");
              }}
              className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
            >
              <div className="font-medium">Any available</div>
              <div className="text-sm text-muted-foreground">
                Fastest way to get an appointment
              </div>
            </button>
            {shop.barbers.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setBarberId(b.id);
                  setStep("time");
                }}
                className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-medium">{b.name}</span>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {step === "time" && (
        <Section title="Pick a time" onBack={goBack}>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {days.map((d, i) => {
              const { top, bottom } = dayLabel(d, shop.timezone, i);
              const active = d === dateKey;
              return (
                <button
                  key={d}
                  onClick={() => setDateKey(d)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-center transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:border-primary"
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-wide opacity-80">
                    {top}
                  </div>
                  <div className="text-base font-semibold">{bottom}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            {loadingSlots ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Finding open times…
              </div>
            ) : slots.length === 0 ? (
              // A full day used to be a dead end. Offering the waitlist here
              // turns the moment of disappointment into a captured lead, and
              // a later cancellation into a filled chair.
              <WaitlistPrompt
                slug={shop.slug}
                serviceId={serviceId}
                barberId={barberId === "any" ? undefined : barberId}
                date={dateKey}
                dayLabel={fullDayLabel(dateKey, shop.timezone)}
              />
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s.startTime}
                    onClick={() => {
                      setSlot(s);
                      setStep("details");
                    }}
                    className="rounded-xl border bg-card px-2 py-3 text-sm font-medium transition-colors hover:border-primary hover:bg-accent"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {step === "details" && slot && service && (
        <Section title="Your details" onBack={goBack}>
          <div className="mb-4 rounded-xl border bg-accent/40 p-4 text-sm">
            <div className="font-medium">{service.name}</div>
            <div className="text-muted-foreground">
              {slot.label} · {slot.barberName}
            </div>
            {service.depositAmount && (
              <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                A{" "}
                <span className="font-medium text-foreground">
                  ${Number(service.depositAmount).toFixed(0)} deposit
                </span>{" "}
                is required to hold this time. It goes toward your $
                {Number(service.price).toFixed(0)} total.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
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
              {/* This is the A2P 10DLC "call to action". Carriers review the
                  page where consent is collected and reject the campaign if
                  they cannot see it — which is exactly why this registration
                  failed before. It must stay visible, next to the phone field,
                  and keep the frequency, rates, STOP/HELP and policy links. */}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                By booking, you agree to receive appointment text messages from{" "}
                {shop.name} at this number — confirmations, reminders, and
                changes. Message frequency varies. Message and data rates may
                apply. Reply STOP to opt out or HELP for help. See our{" "}
                <a
                  href="/privacy"
                  className="underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Privacy Policy
                </a>{" "}
                and{" "}
                <a
                  href="/terms"
                  className="underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Terms
                </a>
                .
              </p>
            </div>
            <div>
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                inputMode="email"
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the barber should know?"
                rows={3}
              />
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
                  {service.depositAmount ? "Redirecting to payment…" : "Booking…"}
                </>
              ) : service.depositAmount ? (
                `Pay $${Number(service.depositAmount).toFixed(0)} deposit & book`
              ) : (
                "Confirm booking"
              )}
            </Button>
          </div>
        </Section>
      )}
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

function Section({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const index = STEP_ORDER.indexOf(step);
  return (
    <div className="flex items-center gap-2">
      {STEP_ORDER.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= index ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}
