"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Starts Google sign-in from the browser.
 *
 * This deliberately does NOT go through a server action.
 *
 * OAuth here uses PKCE: a code verifier is generated when the flow starts and
 * must still be available when /auth/callback exchanges the code. Starting the
 * flow in a server action generated that verifier on the server and tried to
 * hand it back as a cookie, which did not survive the redirect to Google — so
 * Google authenticated the user, the callback had nothing to exchange with,
 * and the app bounced back to /login. Repeatedly, in a loop.
 *
 * Started from the browser, the Supabase client stores the verifier itself
 * before navigating, and the callback finds it. The redirect target is derived
 * from window.location.origin, so this is correct on the custom domain, on
 * Vercel previews, and on localhost with nothing to configure.
 */
export async function startGoogleSignIn(
  next = "/dashboard"
): Promise<{ error: string } | void> {
  const supabase = createClient();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return {
      error: error.message.toLowerCase().includes("not enabled")
        ? "Google sign-in isn't set up yet. Enable the Google provider in Supabase."
        : error.message,
    };
  }

  // On success the client navigates to Google itself; nothing to return.
}
