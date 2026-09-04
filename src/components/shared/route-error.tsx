"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Shared body for route-level error boundaries.
 *
 * Without an error.tsx on a route, a thrown server error falls all the way
 * through to global-error.tsx, which replaces the entire document — the person
 * loses the header, the nav, and any sense of where they were. On the customer
 * booking pages it is worse still: a blank apology page is indistinguishable
 * from a dead link, and the shop just loses the booking.
 *
 * A route boundary keeps the surrounding layout intact and leaves the person
 * somewhere they can act from.
 */
export function RouteError({
  error,
  reset,
  title,
  description,
  homeHref = "/",
  homeLabel = "Go to homepage",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    // digest is the only identifier that ties this screen to a server log —
    // the real message never reaches the browser in production.
    console.error("[route error]", error.digest ?? error.message);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>
        {error.digest && (
          // Shown so someone reporting the problem can quote it. Deliberately
          // the digest and not error.message: the message can carry internals.
          <p className="text-xs text-muted-foreground">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
