"use server";

import prisma from "@/lib/db";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  onboardingSchema,
  magicLinkSchema,
} from "@/lib/validators";
import { createBarbershopWithOwner, createDevTestShop2ForUser } from "@/lib/barbershop";
import { DEFAULT_SERVICES } from "@/lib/dates";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUser, switchActiveBarbershop } from "@/lib/auth";
import { sanitizeInternalRedirect } from "@/lib/safe-redirect";
import { rateLimit } from "@/lib/rate-limit";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

/**
 * The origin the browser actually requested, from the proxy headers.
 *
 * Preferred over NEXT_PUBLIC_APP_URL for auth redirects: a stale or wrong env
 * var there sends the session cookie to a different host, which looks to the
 * user like sign-in silently doing nothing. Falls back to the env var when the
 * headers are unavailable.
 */
async function requestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return appUrl();
    const proto =
      h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return appUrl();
  }
}

/** Resolve where a user should land after auth. */
export async function resolvePostAuthRedirect(
  preferred?: string | null
): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return "/login";
  if (!user.barbershopId || user.memberships.length === 0) {
    return "/onboarding";
  }
  return sanitizeInternalRedirect(preferred, "/dashboard");
}

export async function signUp(formData: FormData) {
  const raw = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const limited = rateLimit(`auth:signup:${parsed.data.email.toLowerCase()}`, 5, 60_000);
  if (!limited.success) {
    return { error: "Too many signup attempts. Please wait a minute and try again." };
  }

  const { name, email, password } = parsed.data;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${appUrl()}/auth/callback?next=/onboarding`,
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create account" };
  }

  await prisma.user.upsert({
    where: { id: authData.user.id },
    create: {
      id: authData.user.id,
      email,
      name,
      role: UserRole.OWNER,
      barbershopId: null,
    },
    update: { email, name },
  });

  return { success: true, message: "Check your email to verify your account" };
}

const SERVICE_PRESETS = {
  haircut: DEFAULT_SERVICES.find((s) => s.name === "Haircut")!,
  beard: DEFAULT_SERVICES.find((s) => s.name === "Beard Trim")!,
  lineup: DEFAULT_SERVICES.find((s) => s.name === "Line Up")!,
};

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();

  if (user.barbershopId && user.memberships.length > 0) {
    redirect("/dashboard");
  }

  const selectedServices = formData.getAll("services").map(String);
  const raw = {
    shopName: formData.get("shopName") as string,
    timezone: (formData.get("timezone") as string) || "America/Los_Angeles",
    address: (formData.get("address") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    firstBarberName: (formData.get("firstBarberName") as string) || undefined,
    services: selectedServices.length > 0 ? selectedServices : ["haircut", "beard", "lineup"],
    customServiceName: (formData.get("customServiceName") as string) || undefined,
  };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const startingServices = parsed.data.services.flatMap((key) => {
    if (key === "custom") {
      const name = parsed.data.customServiceName?.trim() || "Custom service";
      return [
        {
          name,
          description: "Custom service",
          duration: 30,
          price: 40,
          color: "#5AC8FA",
        },
      ];
    }
    const preset = SERVICE_PRESETS[key];
    return preset
      ? [
          {
            name: preset.name,
            description: preset.description,
            duration: preset.duration,
            price: preset.price,
            color: preset.color,
          },
        ]
      : [];
  });

  await createBarbershopWithOwner({
    name: parsed.data.shopName,
    timezone: parsed.data.timezone,
    address: parsed.data.address,
    phone: parsed.data.phone,
    ownerUserId: user.id,
    ownerName: user.name ?? user.email.split("@")[0],
    ownerEmail: user.email,
    firstBarberName: parsed.data.firstBarberName,
    startingServices:
      startingServices.length > 0 ? startingServices : undefined,
    startTrial: true,
  });

  revalidatePath("/");
  redirect("/dashboard");
}

export async function setActiveShop(barbershopId: string) {
  const result = await switchActiveBarbershop(barbershopId);
  if ("error" in result) return result;
  // Bust all shop-scoped pages so stale tenant data never flashes.
  for (const path of [
    "/",
    "/dashboard",
    "/calendar",
    "/clients",
    "/services",
    "/team",
    "/analytics",
    "/settings",
    "/settings/billing",
    "/pricing",
  ]) {
    revalidatePath(path);
  }
  return { success: true as const };
}

/** Development-only: create "Test Shop 2" for multi-shop testing without switching active shop. */
export async function createDevTestShop2() {
  const user = await requireUser();
  const result = await createDevTestShop2ForUser(user);
  if ("error" in result) return { error: result.error };
  revalidatePath("/");
  return {
    success: true as const,
    shopId: result.shop.id,
    shopName: result.shop.name,
    created: result.created,
  };
}

export async function signIn(formData: FormData) {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const limited = rateLimit(`auth:signin:${parsed.data.email.toLowerCase()}`, 10, 60_000);
  if (!limited.success) {
    return { error: "Too many sign-in attempts. Please wait a minute and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: error.message };
  }

  const redirectTo = await resolvePostAuthRedirect(
    (formData.get("redirect") as string) || "/dashboard"
  );

  return { success: true as const, redirectTo };
}

export async function signInWithMagicLink(formData: FormData) {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email") as string,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid email" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true as const,
    message: "Check your email for a magic link to sign in.",
  };
}

export async function signInWithOAuth(provider: "google") {
  const supabase = await createClient();

  // Return to the domain the user is actually on, not whatever
  // NEXT_PUBLIC_APP_URL happens to say.
  //
  // That env var pointed at the Vercel preview domain, so OAuth completed
  // successfully and then handed the session cookie to a different host — the
  // user landed back on cutchair.com with no session and no error, apparently
  // "not signed in". Deriving the origin from the request makes the redirect
  // correct on the custom domain, on preview URLs, and on localhost, with
  // nothing to configure.
  const origin = await requestOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return {
      error:
        error.message.includes("provider is not enabled") ||
        error.message.toLowerCase().includes("not enabled")
          ? "Google sign-in is not configured yet. Enable the Google provider in your Supabase Auth settings, then try again."
          : error.message,
    };
  }

  if (!data.url) {
    return {
      error:
        "Google sign-in is not configured yet. Enable the Google provider in your Supabase Auth settings.",
    };
  }

  return { url: data.url };
}

export async function forgotPassword(formData: FormData) {
  const raw = { email: formData.get("email") as string };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl()}/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true, message: "Password reset link sent to your email" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function acceptInvite(token: string, name: string, password: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { barbershop: true },
  });

  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    return { error: "Invalid or expired invitation" };
  }

  const supabase = await createServiceClient();
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (authError || !authData.user) {
    return { error: authError?.message ?? "Failed to create account" };
  }

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: authData.user.id,
        email: invitation.email,
        name,
        role: invitation.role,
        barbershopId: invitation.barbershopId,
      },
    }),
    prisma.barbershopMembership.create({
      data: {
        userId: authData.user.id,
        barbershopId: invitation.barbershopId,
        role: invitation.role,
      },
    }),
    prisma.barber.create({
      data: {
        barbershopId: invitation.barbershopId,
        userId: authData.user.id,
        name,
        email: invitation.email,
        color: "#34C759",
        workingHours: {
          create: Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i,
            startTime: i === 0 ? "00:00" : "09:00",
            endTime: i === 0 ? "00:00" : "18:00",
            isOff: i === 0,
          })),
        },
      },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    }),
  ]);

  return { success: true };
}
