"use client";

import { RouteError } from "@/components/shared/route-error";

/**
 * Reached from the link in a confirmation text, usually because someone is
 * trying to cancel or reschedule. Failing silently here means they give up and
 * simply do not show, which costs the shop the slot.
 */
export default function AppointmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="We couldn't load your appointment"
      description="Your booking is still there — this page just failed to load. Try again, or call the shop to change or cancel it."
    />
  );
}
