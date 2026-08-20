import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock } from "lucide-react";

/**
 * Trial / billing status banner.
 *
 * Without this a shop works happily for two weeks and is then bounced to the
 * pricing page with no warning — bad for them, and it wastes the moment when
 * they're most likely to convert. Gets louder as the trial runs out.
 */
export function TrialBanner({
  status,
  trialEndsAt,
}: {
  status: string;
  trialEndsAt: string | Date | null;
}) {
  if (status === "PAST_DUE") {
    return (
      <Banner urgent>
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          <strong>Payment failed.</strong> Update your card to keep taking
          bookings.
        </span>
        <Button size="sm" asChild>
          <Link href="/settings/billing">Fix billing</Link>
        </Button>
      </Banner>
    );
  }

  if (status !== "TRIALING" || !trialEndsAt) return null;

  const ends = new Date(trialEndsAt);
  const daysLeft = Math.ceil((ends.getTime() - Date.now()) / 86_400_000);
  if (daysLeft > 14) return null;

  const urgent = daysLeft <= 3;

  return (
    <Banner urgent={urgent}>
      <Clock className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {daysLeft <= 0 ? (
          <>
            <strong>Your trial ends today.</strong> Add a payment method to keep
            your calendar, clients, and booking link.
          </>
        ) : (
          <>
            <strong>
              {daysLeft} {daysLeft === 1 ? "day" : "days"} left
            </strong>{" "}
            on your free trial.
          </>
        )}
      </span>
      <Button size="sm" variant={urgent ? "default" : "outline"} asChild>
        <Link href="/pricing">Choose a plan</Link>
      </Button>
    </Banner>
  );
}

function Banner({
  urgent,
  children,
}: {
  urgent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
        urgent
          ? "border-destructive/30 bg-destructive/10"
          : "border-primary/30 bg-primary/5"
      }`}
    >
      {children}
    </div>
  );
}
