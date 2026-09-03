import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sanitizeInternalRedirect } from "@/lib/safe-redirect";

/**
 * Starts Google sign-in.
 *
 * A route handler, not a server action and not the browser client. That is the
 * whole point: PKCE generates a code verifier when the flow starts, and
 * whoever generates it must be the one to exchange the code afterwards.
 *
 * Previous attempts had two owners at once — the browser generated a verifier
 * and Supabase's client auto-exchanged on return, while /auth/callback tried
 * to exchange the same single-use code server-side. One of them always lost
 * with "code challenge does not match previously saved code verifier", and the
 * user landed back on /login with no explanation.
 *
 * Here the server writes the verifier cookie onto the redirect response it
 * returns, and /auth/callback reads that same cookie. One owner, no race.
 *
 * Cookies are set directly on the response rather than through next/headers,
 * because NextResponse.redirect() builds a fresh response that does not
 * inherit them.
 */
export async function GET(request: NextRequest) {
  const next = sanitizeInternalRedirect(
    request.nextUrl.searchParams.get("next"),
    "/dashboard"
  );

  // Use the host the browser actually asked for, so this works on the custom
  // domain, on Vercel previews and on localhost without configuration.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin =
    forwardedHost && forwardedProto
      ? `${forwardedProto}://${forwardedHost}`
      : request.nextUrl.origin;

  // Built up front so the Supabase client can attach the verifier cookie to it.
  const response = NextResponse.redirect(`${origin}/login?error=auth_callback_error`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    console.error("[auth/signin/google] could not start OAuth", error?.message);
    return response;
  }

  // Same response object, so the verifier cookie set above rides along.
  return NextResponse.redirect(data.url, { headers: response.headers });
}
