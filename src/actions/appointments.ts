"use server";

import prisma from "@/lib/db";
import { requireShopUser, canManageShop } from "@/lib/auth";
import { appointmentSchema, serviceSchema, shopSettingsSchema, inviteSchema } from "@/lib/validators";
import { addMinutes } from "@/lib/dates";
import { revalidatePath } from "next/cache";
import {
  sendSms,
  buildBookingConfirmationSms,
  buildCancellationSms,
  buildRescheduleSms,
  normalizePhone,
} from "@/lib/twilio";
import { formatTime, formatShortDate } from "@/lib/dates";
import {
  parseAppointmentInputDateTime,
  resolveShopTimezone,
} from "@/lib/datetime";
import { sanitizeInput } from "@/lib/rate-limit";
import { serializeForClient } from "@/lib/serializers";
import { getAppointmentClientName } from "@/lib/utils";
import { UserRole } from "@prisma/client";

export async function createAppointment(data: unknown) {
  const user = await requireShopUser();
  const parsed = appointmentSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }

  const { clientName, clientPhone, clientEmail, serviceId, barberId, startTime, notes, status } = parsed.data;

  const service = await prisma.service.findFirst({
    where: { id: serviceId, barbershopId: user.barbershopId },
  });
  if (!service) return { error: "Service not found" };

  const barber = await prisma.barber.findFirst({
    where: { id: barberId, barbershopId: user.barbershopId },
  });
  if (!barber) return { error: "Barber not found" };

  if (user.role === UserRole.BARBER && user.barberId !== barberId) {
    return { error: "You can only create appointments for yourself" };
  }

  const timezone = resolveShopTimezone(user.barbershop.timezone);
  const start = parseAppointmentInputDateTime(startTime, timezone);
  const end = addMinutes(start, service.duration);

  let client = await prisma.client.findUnique({
    where: { barbershopId_phone: { barbershopId: user.barbershopId, phone: clientPhone } },
  });

  const sanitizedName = sanitizeInput(clientName);
  const sanitizedEmail = clientEmail ? sanitizeInput(clientEmail) : null;

  if (!client) {
    client = await prisma.client.create({
      data: {
        barbershopId: user.barbershopId,
        name: sanitizedName,
        phone: clientPhone,
        email: sanitizedEmail,
      },
    });
  } else {
    // Shop-owner booking may update the Client profile for future use; history uses snapshots.
    client = await prisma.client.update({
      where: { id: client.id },
      data: {
        name: sanitizedName,
        email: sanitizedEmail || client.email,
      },
    });
  }

  const appointment = await prisma.appointment.create({
    data: {
      barbershopId: user.barbershopId,
      clientId: client.id,
      barberId,
      serviceId,
      startTime: start,
      endTime: end,
      duration: service.duration,
      notes: notes ? sanitizeInput(notes) : null,
      status: status ?? "PENDING",
      clientNameSnapshot: sanitizedName,
      clientPhoneSnapshot: clientPhone,
      clientEmailSnapshot: sanitizedEmail,
    },
    include: {
      client: true,
      barber: true,
      service: true,
      barbershop: true,
    },
  });

  const dateTime = `${formatShortDate(start, user.barbershop.timezone)} at ${formatTime(start, user.barbershop.timezone)}`;
  await sendSms(
    client.phone,
    buildBookingConfirmationSms(sanitizedName, service.name, barber.name, dateTime, appointment.barbershop.name),
    user.barbershopId,
    "booking_confirmation",
    appointment.id
  );

  await prisma.notification.create({
    data: {
      barbershopId: user.barbershopId,
      title: "New Appointment",
      message: `${sanitizedName} booked ${service.name} with ${barber.name}`,
      type: "APPOINTMENT",
      metadata: { appointmentId: appointment.id },
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { success: true, appointment: serializeForClient(appointment) };
}

export async function updateAppointment(id: string, data: unknown) {
  const user = await requireShopUser();
  const parsed = appointmentSchema.partial().safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }

  const existing = await prisma.appointment.findFirst({
    where: { id, barbershopId: user.barbershopId },
    include: { client: true, barber: true, service: true, barbershop: true },
  });
  if (!existing) return { error: "Appointment not found" };

  if (user.role === UserRole.BARBER && existing.barberId !== user.barberId) {
    return { error: "Unauthorized" };
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.startTime) {
    const timezone = resolveShopTimezone(user.barbershop.timezone);
    const start = parseAppointmentInputDateTime(parsed.data.startTime, timezone);
    const duration = parsed.data.serviceId
      ? (await prisma.service.findUnique({ where: { id: parsed.data.serviceId } }))?.duration ?? existing.duration
      : existing.duration;
    updateData.startTime = start;
    updateData.endTime = addMinutes(start, duration);
    updateData.duration = duration;
  }
  if (parsed.data.serviceId) updateData.serviceId = parsed.data.serviceId;
  if (parsed.data.barberId) updateData.barberId = parsed.data.barberId;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes ? sanitizeInput(parsed.data.notes) : null;
  if (parsed.data.status) updateData.status = parsed.data.status;
  if (parsed.data.depositStatus) updateData.depositStatus = parsed.data.depositStatus;

  const appointment = await prisma.appointment.update({
    where: { id },
    data: updateData,
    include: { client: true, barber: true, service: true, barbershop: true },
  });

  if (parsed.data.status === "CANCELLED") {
    const dateTime = `${formatShortDate(existing.startTime, user.barbershop.timezone)} at ${formatTime(existing.startTime, user.barbershop.timezone)}`;
    await sendSms(
      existing.clientPhoneSnapshot ?? existing.client.phone,
      buildCancellationSms(
        getAppointmentClientName(existing),
        existing.service.name,
        dateTime,
        existing.barbershop.name
      ),
      user.barbershopId,
      "cancellation",
      id
    );
  } else if (parsed.data.startTime) {
    const newDateTime = `${formatShortDate(appointment.startTime, user.barbershop.timezone)} at ${formatTime(appointment.startTime, user.barbershop.timezone)}`;
    await sendSms(
      existing.clientPhoneSnapshot ?? existing.client.phone,
      buildRescheduleSms(
        getAppointmentClientName(existing),
        existing.service.name,
        newDateTime,
        existing.barbershop.name
      ),
      user.barbershopId,
      "reschedule",
      id
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { success: true, appointment: serializeForClient(appointment) };
}

export async function deleteAppointment(id: string) {
  const user = await requireShopUser();
  const existing = await prisma.appointment.findFirst({
    where: { id, barbershopId: user.barbershopId },
  });
  if (!existing) return { error: "Appointment not found" };

  if (user.role === UserRole.BARBER && existing.barberId !== user.barberId) {
    return { error: "Unauthorized" };
  }

  await prisma.appointment.delete({ where: { id } });
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { success: true };
}

export async function getAppointments(start: string, end: string, barberId?: string) {
  const user = await requireShopUser();

  const where: Record<string, unknown> = {
    barbershopId: user.barbershopId,
    startTime: { gte: new Date(start), lte: new Date(end) },
    status: { not: "CANCELLED" },
  };

  if (barberId) {
    where.barberId = barberId;
  } else if (user.role === UserRole.BARBER && user.barberId) {
    // Barbers see all by default in calendar but can filter
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      client: true,
      barber: true,
      service: true,
    },
    orderBy: { startTime: "asc" },
  });

  return serializeForClient(appointments);
}

export async function createService(data: unknown) {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) return { error: "Unauthorized" };

  const parsed = serviceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const service = await prisma.service.create({
    data: {
      barbershopId: user.barbershopId,
      ...parsed.data,
    },
  });

  revalidatePath("/services");
  return { success: true, service: serializeForClient(service) };
}

export async function updateService(id: string, data: unknown) {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) return { error: "Unauthorized" };

  const parsed = serviceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const service = await prisma.service.update({
    where: { id, barbershopId: user.barbershopId },
    data: parsed.data,
  });

  revalidatePath("/services");
  return { success: true, service: serializeForClient(service) };
}

export async function deleteService(id: string) {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) return { error: "Unauthorized" };

  await prisma.service.update({
    where: { id, barbershopId: user.barbershopId },
    data: { isActive: false },
  });

  revalidatePath("/services");
  return { success: true };
}

export async function updateShopSettings(data: unknown) {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) return { error: "Unauthorized" };

  const parsed = shopSettingsSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const twilioPhone = parsed.data.twilioPhone?.trim()
    ? normalizePhone(parsed.data.twilioPhone)
    : null;

  const shop = await prisma.barbershop.update({
    where: { id: user.barbershopId },
    data: {
      name: parsed.data.name,
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
      instagram: parsed.data.instagram || null,
      timezone: parsed.data.timezone,
      twilioPhone,
    },
  });

  revalidatePath("/settings");
  return { success: true, shop: serializeForClient(shop) };
}

export async function inviteTeamMember(data: unknown) {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) return { error: "Unauthorized" };

  const parsed = inviteSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "User already exists" };

  const invitation = await prisma.invitation.create({
    data: {
      barbershopId: user.barbershopId,
      email: parsed.data.email,
      role: parsed.data.role as UserRole,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  revalidatePath("/team");
  return {
    success: true,
    inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`,
  };
}

export async function removeBarber(barberId: string) {
  const user = await requireShopUser();
  if (!canManageShop(user.role)) return { error: "Unauthorized" };

  await prisma.barber.update({
    where: { id: barberId, barbershopId: user.barbershopId },
    data: { isActive: false },
  });

  revalidatePath("/team");
  return { success: true };
}

export async function searchClients(query: string) {
  const user = await requireShopUser();
  const q = query.trim();
  if (!q) return [];

  const clients = await prisma.client.findMany({
    where: {
      barbershopId: user.barbershopId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q.replace(/\D/g, "") } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    include: {
      favoriteBarber: true,
      appointments: {
        orderBy: { startTime: "desc" },
        take: 5,
        include: { service: true, barber: true },
      },
    },
    take: 20,
  });

  return serializeForClient(clients);
}

export async function getDashboardData() {
  const user = await requireShopUser();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const [todayAppointments, upcomingAppointments, notifications, barbers, services] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        barbershopId: user.barbershopId,
        startTime: { gte: startOfToday, lte: endOfToday },
        status: { notIn: ["CANCELLED"] },
        ...(user.role === UserRole.BARBER && user.barberId ? { barberId: user.barberId } : {}),
      },
      include: { client: true, barber: true, service: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        barbershopId: user.barbershopId,
        startTime: { gt: endOfToday },
        status: { in: ["CONFIRMED", "PENDING"] },
        ...(user.role === UserRole.BARBER && user.barberId ? { barberId: user.barberId } : {}),
      },
      include: { client: true, barber: true, service: true },
      orderBy: { startTime: "asc" },
      take: 10,
    }),
    prisma.notification.findMany({
      where: { barbershopId: user.barbershopId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.barber.findMany({
      where: { barbershopId: user.barbershopId, isActive: true },
    }),
    prisma.service.findMany({
      where: { barbershopId: user.barbershopId, isActive: true },
    }),
  ]);

  const completedToday = todayAppointments.filter((a) => a.status === "COMPLETED");
  const revenue = completedToday.reduce((sum, a) => sum + Number(a.service?.price ?? 0), 0);

  return serializeForClient({
    todayAppointments,
    upcomingAppointments,
    notifications,
    barbers,
    services,
    revenue,
    stats: {
      todayCount: todayAppointments.length,
      upcomingCount: upcomingAppointments.length,
      completedCount: completedToday.length,
    },
  });
}
