"use server";

import prisma from "@/lib/db";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  onboardingSchema,
} from "@/lib/validators";
import { createBarbershopWithOwner } from "@/lib/barbershop";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, switchActiveBarbershop } from "@/lib/auth";

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

  const { name, email, password } = parsed.data;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create account" };
  }

  // Account only — shop is created during onboarding.
  await prisma.user.create({
    data: {
      id: authData.user.id,
      email,
      name,
      role: UserRole.OWNER,
      barbershopId: null,
    },
  });

  return { success: true, message: "Check your email to verify your account" };
}

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();

  if (user.barbershopId && user.memberships.length > 0) {
    redirect("/dashboard");
  }

  const raw = {
    shopName: formData.get("shopName") as string,
    timezone: (formData.get("timezone") as string) || "America/Los_Angeles",
  };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  await createBarbershopWithOwner({
    name: parsed.data.shopName,
    timezone: parsed.data.timezone,
    ownerUserId: user.id,
    ownerName: user.name ?? user.email.split("@")[0],
    ownerEmail: user.email,
  });

  revalidatePath("/");
  redirect("/dashboard");
}

export async function setActiveShop(barbershopId: string) {
  const result = await switchActiveBarbershop(barbershopId);
  if ("error" in result) return result;
  revalidatePath("/");
  return { success: true as const };
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function forgotPassword(formData: FormData) {
  const raw = { email: formData.get("email") as string };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
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
