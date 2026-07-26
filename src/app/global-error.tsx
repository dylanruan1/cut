"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error.digest ?? error.message);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">Cut. had a problem</h1>
          <p className="text-sm text-muted-foreground">
            Please try again. If this keeps happening, contact support.
          </p>
          <Button onClick={reset}>Reload</Button>
        </div>
      </body>
    </html>
  );
}
