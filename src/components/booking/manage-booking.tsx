"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelManagedAppointment,
  type ManagedAppointment,
} from "@/actions/manage-booking";
import { FREE_CANCELLATION_HOURS } from "@/lib/cancellation-policy";
import { ReschedulePanel } from "@/components/booking/reschedule-panel";
import {
  CalendarDays,
  Check,
  Clock,
  Loader2,
  User,
  Scissors,
  AlertTriangle,
} from "lucide-react";

export function ManageBooking({
  appointment,
}: {
  appointment: ManagedAppointment;
}) {
  const [confirming, setConfirming] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [movedTo, setMovedTo] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(
    appointment.status === "CANCELLED"
  );
  const [refunded, setRefunded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelManagedAppointment(appointment.token);
      if (res.error) {
        setError(res.error);
        return;
      }
      setRefunded(Boolean(res.refunded));
      setCancelled(true);
      setConfirming(false);
    });
  }

  if (movedTo) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Appointment moved
        </h2>
        <p className="mt-2 text-muted-foreground">
          You&apos;re now booked for {movedTo}.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          We&apos;ve let {appointment.shopName} know.
        </p>
      </div>
    );
  }

  if (rescheduling) {
    return (
      <ReschedulePanel
        token={appointment.token}
        onDone={(when) => {
          setRescheduling(false);
          setMovedTo(when);
        }}
        onCancel={() => setRescheduling(false)}
      />
    );
  }

  if (cancelled) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Check className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Appointment cancelled
        </h2>
        <p className="mt-2 text-muted-foreground">
          {refunded
            ? "Your deposit has been refunded — it may take a few days to appear."
            : appointment.depositPaid
              ? "Your deposit was not refunded because this was a late cancellation. Contact the shop if you have questions."
              : "We've let the shop know."}
        </p>
        {appointment.shopPhone && (
          <p className="mt-6 text-sm text-muted-foreground">
            Want to rebook? Call{" "}
            <a
              href={`tel:${appointment.shopPhone}`}
              className="font-medium underline underline-offset-4"
            >
              {appointment.shopPhone}
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6 shadow-card">
        <h2 className="text-lg font-semibold tracking-tight">
          Your appointment
        </h2>

        <div className="mt-4 space-y-3 text-sm">
          <Detail icon={<Scissors className="h-4 w-4" />} label="Service">
            {appointment.serviceName}
          </Detail>
          <Detail icon={<CalendarDays className="h-4 w-4" />} label="When">
            {appointment.when}
          </Detail>
          <Detail icon={<User className="h-4 w-4" />} label="Barber">
            {appointment.barberName}
          </Detail>
          <Detail icon={<User className="h-4 w-4" />} label="Name">
            {appointment.clientName}
          </Detail>
          {appointment.depositAmount ? (
            <Detail icon={<Clock className="h-4 w-4" />} label="Deposit">
              ${appointment.depositAmount.toFixed(0)}{" "}
              {appointment.depositPaid ? "paid" : "due"}
            </Detail>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {appointment.isPast ? (
        <p className="text-center text-sm text-muted-foreground">
          This appointment has already passed.
        </p>
      ) : !appointment.cancellable ? (
        <p className="text-center text-sm text-muted-foreground">
          This appointment can no longer be changed here. Please call the shop.
        </p>
      ) : !confirming ? (
        <div className="space-y-3">
          {appointment.depositPaid && !appointment.refundIfCancelledNow && (
            <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Cancelling now is within {FREE_CANCELLATION_HOURS} hours of your
                appointment, so your ${appointment.depositAmount?.toFixed(0)}{" "}
                deposit won&apos;t be refunded.
              </span>
            </div>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={() => setRescheduling(true)}
          >
            Reschedule
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setConfirming(true)}
          >
            Cancel appointment
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border bg-card p-6">
          <p className="text-sm">
            Cancel your {appointment.serviceName} on{" "}
            <span className="font-medium">{appointment.when}</span>?
            {appointment.depositPaid &&
              (appointment.refundIfCancelledNow
                ? " Your deposit will be refunded."
                : " Your deposit will not be refunded.")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              disabled={pending}
              onClick={onCancel}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                "Yes, cancel it"
              )}
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Keep it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
