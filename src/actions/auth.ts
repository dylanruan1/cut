"use server";

import prisma from "@/lib/db";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { signupSchema, loginSchema, forgotPasswordSchema } from "@/lib/validators";
import { DEFAULT_SERVICES } from "@/lib/dates";
import { generateSlug } from "@/lib/utils";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

export async function signUp(formData: FormData) {
  const raw = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    shopName: formData.get("shopName") as string,
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { name, email, password, shopName } = parsed.data;
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

  const slug = generateSlug(shopName);
  const existingShop = await prisma.barbershop.findUnique({ where: { slug } });
  const finalSlug = existingShop ? `${slug}-${Date.now()}` : slug;

  const barbershop = await prisma.barbershop.create({
    data: {
      name: shopName,
      slug: finalSlug,
      timezone: "America/Los_Angeles",
      businessHours: {
        create: Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          openTime: i === 0 ? "00:00" : "09:00",
          closeTime: i === 0 ? "00:00" : "18:00",
          isClosed: i === 0,
        })),
      },
      services: {
        create: DEFAULT_SERVICES.map((s, i) => ({
          name: s.name,
          description: s.description,
          duration: s.duration,
          price: s.price,
          color: s.color,
          sortOrder: i,
        })),
      },
    },
  });

  await prisma.user.create({
    data: {
      id: authData.user.id,
      email,
      name,
      role: UserRole.OWNER,
      barbershopId: barbershop.id,
    },
  });

  const ownerBarber = await prisma.barber.create({
    data: {
      barbershopId: barbershop.id,
      userId: authData.user.id,
      name,
      email,
      color: "#007AFF",
      workingHours: {
        create: Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          startTime: i === 0 ? "00:00" : "09:00",
          endTime: i === 0 ? "00:00" : "18:00",
          isOff: i === 0,
        })),
      },
    },
  });

  const services = await prisma.service.findMany({
    where: { barbershopId: barbershop.id },
  });

  await prisma.barberService.createMany({
    data: services.map((s) => ({
      barberId: ownerBarber.id,
      serviceId: s.id,
    })),
  });

  return { success: true, message: "Check your email to verify your account" };
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
