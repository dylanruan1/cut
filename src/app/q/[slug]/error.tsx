"use client";

import { RouteError } from "@/components/shared/route-error";

/**
 * Scanned from the QR code on the wall, usually by someone standing in the
 * shop right now. They can always ask the barber instead, so the copy points
 * them there rather than leaving them tapping a dead page.
 */
export default function QueueError({
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
      title="We couldn't load the waitlist"
      description="Try again in a moment. If you're in the shop, ask the barber to add you to the queue."
    />
  );
}
