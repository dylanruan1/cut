import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/db";
import { UserRole } from "@prisma/client";
import { sanitizeInternalRedirect } from "@/lib/safe-redirect";

/**
 * Auth callback for email verification, magic links, and OAuth.
 * Ensures a Prisma User row exists for OAuth / magic-link first logins.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeInternalRedirect(searchParams.get("next"), "/dashboard");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    // Log the real reason. This used to fail silently and bounce to /login
    // with a generic flag, which made a PKCE verifier problem look like
    // "Google sign-in just doesn't work".
    if (error) {
      console.error("[auth/callback] code exchange failed", {
        message: error.message,
        status: error.status,
      });
    }

    if (!error && data.user) {
      const email = data.user.email;
      if (email) {
        await prisma.user.upsert({
          where: { id: data.user.id },
          create: {
            id: data.user.id,
            email,
            name:
              (data.user.user_metadata?.name as string | undefined) ||
              email.split("@")[0],
            role: UserRole.OWNER,
            barbershopId: null,
          },
          update: {},
        });
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: data.user.id },
        include: { memberships: { take: 1 } },
      });
      const destination =
        !dbUser?.barbershopId && (!dbUser?.memberships || dbUser.memberships.length === 0)
          ? "/onboarding"
          : next;

      // Carry a flag so the landing page can acknowledge the verification.
      // Without it the click just dumps someone on a form with no sign that
      // the thing they were asked to do actually worked.
      const url = new URL(`${origin}${destination}`);
      url.searchParams.set("verified", "1");
      return NextResponse.redirect(url.toString());
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
