"use client";

import { Suspense } from "react";
import LoginPageInner from "./login-inner";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
