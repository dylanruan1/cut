"use client";

/**
 * Starts Google sign-in by navigating to the server route that owns the flow.
 *
 * Deliberately a plain navigation, not a Supabase client call.
 *
 * PKCE requires that whoever creates the code verifier is the one who
 * exchanges the code. Calling supabase.auth.signInWithOAuth() here would make
 * the browser create a verifier, and Supabase's browser client would then
 * auto-exchange the code on return — racing the server callback for a
 * single-use code. Whichever lost failed with "code challenge does not match
 * previously saved code verifier", which is exactly what happened.
 *
 * /auth/signin/google creates the verifier server-side and /auth/callback
 * consumes it. One owner.
 */
export function startGoogleSignIn(next = "/dashboard"): void {
  window.location.href = `/auth/signin/google?next=${encodeURIComponent(next)}`;
}
