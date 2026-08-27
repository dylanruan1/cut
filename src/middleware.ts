import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const publicRoutes = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invite",
  "/pricing",
  // Customer-facing booking pages must work without an account.
  "/book",
  // Token-based appointment management (link sent in confirmation texts).
  "/appointment",
  // Walk-in queue: QR landing page and the customer's own status page.
  "/q",
  // Legal pages are referenced publicly (incl. A2P/carrier review).
  "/privacy",
  "/terms",
  // Support must work for people who cannot sign in — that's most of the
  // people who need it.
  "/support",
  "/api/twilio",
  "/api/health",
  "/api/billing/webhook",
];

const authRoutes = ["/login", "/signup", "/forgot-password"];
const onboardingRoute = "/onboarding";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isTwilioRoute = pathname.startsWith("/api/twilio");

  // Voice/SMS webhooks must never depend on auth cookies or Supabase session.
  if (isTwilioRoute) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  const isApiRoute = pathname.startsWith("/api/");

  if (!user && !isPublic && !isApiRoute && pathname !== onboardingRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (!user && pathname === onboardingRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", "/onboarding");
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    // Landing after login; app layout redirects to onboarding when no shop.
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
