"use client";

import { RouteError } from "@/components/shared/route-error";

/**
 * Covers every signed-in shop screen — dashboard, calendar, clients, services,
 * team, settings, analytics. One boundary at the group root rather than nine
 * copies, since the message is the same everywhere and the layout (sidebar,
 * header) survives either way.
 */
export default function AppError({
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
      title="This screen didn't load"
      description="Your shop's data is safe — this is a display problem, not a lost booking. Try again, and let us know if it keeps happening."
      homeHref="/dashboard"
      homeLabel="Back to dashboard"
    />
  );
}
