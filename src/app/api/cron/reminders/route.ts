import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendSms, buildReminderSms } from "@/lib/twilio";
import { formatTime } from "@/lib/dates";
import { getAppointmentClientName } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const window24Start = new Date(in24Hours.getTime() - 15 * 60 * 1000);
  const window24End = new Date(in24Hours.getTime() + 15 * 60 * 1000);
  const window2Start = new Date(in2Hours.getTime() - 15 * 60 * 1000);
  const window2End = new Date(in2Hours.getTime() + 15 * 60 * 1000);

  const [appointments24h, appointments2h] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        startTime: { gte: window24Start, lte: window24End },
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      include: { client: true, service: true, barbershop: true },
    }),
    prisma.appointment.findMany({
      where: {
        startTime: { gte: window2Start, lte: window2End },
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      include: { client: true, service: true, barbershop: true },
    }),
  ]);

  const sent: string[] = [];

  for (const apt of appointments24h) {
    const existing = await prisma.smsLog.findFirst({
      where: { appointmentId: apt.id, type: "reminder_24h" },
    });
    if (existing) continue;

    const dateTime = formatTime(apt.startTime, apt.barbershop.timezone);
    await sendSms(
      apt.clientPhoneSnapshot ?? apt.client.phone,
      buildReminderSms(
        getAppointmentClientName(apt),
        apt.service.name,
        dateTime,
        apt.barbershop.name,
        24
      ),
      apt.barbershopId,
      "reminder_24h",
      apt.id
    );
    sent.push(`24h:${apt.id}`);
  }

  for (const apt of appointments2h) {
    const existing = await prisma.smsLog.findFirst({
      where: { appointmentId: apt.id, type: "reminder_2h" },
    });
    if (existing) continue;

    const dateTime = formatTime(apt.startTime, apt.barbershop.timezone);
    await sendSms(
      apt.clientPhoneSnapshot ?? apt.client.phone,
      buildReminderSms(
        getAppointmentClientName(apt),
        apt.service.name,
        dateTime,
        apt.barbershop.name,
        2
      ),
      apt.barbershopId,
      "reminder_2h",
      apt.id
    );
    sent.push(`2h:${apt.id}`);
  }

  return NextResponse.json({ sent, count: sent.length });
}
