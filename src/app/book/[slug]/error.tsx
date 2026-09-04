"use client";

import { RouteError } from "@/components/shared/route-error";

/**
 * The booking page is the one screen a paying customer of a paying customer
 * sees. A blank error page here reads as "this shop's link is broken" and the
 * booking is simply lost, so this says who is at fault and offers the phone.
 */
export default function BookingError({
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
      title="We couldn't load this booking page"
      description="Something went wrong on our end — the shop's link is fine. Try again in a moment, or call the shop directly to book."
    />
  );
}
