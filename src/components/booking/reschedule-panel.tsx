"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  getRescheduleOptions,
  rescheduleManagedAppointment,
  type RescheduleSlot,
} from "@/actions/manage-booking";
import { CalendarDays, Loader2 } from "lucide-react";

/** Local YYYY-MM-DD, offset from today. */
function dateKey(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dayLabel(key: string, index: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return {
    top:
      index === 0
        ? "Today"
        : index === 1
          ? "Tomorrow"
          : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(dt),
    bottom: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(dt),
  };
}

export function ReschedulePanel({
  token,
  onDone,
  onCancel,
}: {
  token: string;
  onDone: (when: string) => void;
  onCancel: () => void;
}) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => dateKey(i)), []);
  const [selectedDay, setSelectedDay] = useState(days[0]);
  const [slots, setSlots] = useState<RescheduleSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSlots([]);
    getRescheduleOptions(token, selectedDay)
      .then((res) => {
        if (cancelled) return;
        if (res.error) setError(res.error);
        setSlots(res.slots ?? []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, selectedDay]);

  function pick(slot: RescheduleSlot) {
    setError(null);
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(slot.startTime));

    startTransition(async () => {
      const res = await rescheduleManagedAppointment({
        token,
        date: selectedDay,
        time,
      });
      if (res.error) return setError(res.error);
      if (res.when) onDone(res.when);
    });
  }

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h3 className="text-lg font-semibold tracking-tight">Pick a new time</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Your appointment and any deposit move with you.
      </p>

      <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
        {days.map((d, i) => {
          const { top, bottom } = dayLabel(d, i);
          const active = d === selectedDay;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`shrink-0 rounded-xl border px-3 py-2 text-center transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:border-primary"
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

      {error && (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Finding open times…
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-xl border bg-background p-6 text-center">
            <CalendarDays className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing open that day. Try another date.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <button
                key={s.startTime}
                disabled={pending}
                onClick={() => pick(s)}
                className="rounded-xl border bg-background px-2 py-3 text-sm font-medium transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        className="mt-4 w-full"
        disabled={pending}
        onClick={onCancel}
      >
        Keep my current time
      </Button>
    </div>
  );
}
