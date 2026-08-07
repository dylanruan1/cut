import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendSms, buildReminderSms } from "@/lib/twilio";
import { formatTime } from "@/lib/dates";
import { getAppointmentClientName } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret || cronSecret.startsWith("your-")) {
    console.error("[cron/reminders] CRON_SECRET is not configured — rejecting");
    return NextResponse.json(
      { error: "Cron is not configured. Set CRON_SECRET." },
      { status: 503 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
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
        // Never remind someone whose deposit was never paid.
        NOT: { depositStatus: "PENDING" },
      },
      include: { client: true, service: true, barbershop: true },
    }),
    prisma.appointment.findMany({
      where: {
        startTime: { gte: window2Start, lte: window2End },
        status: { in: ["CONFIRMED", "PENDING"] },
        NOT: { depositStatus: "PENDING" },
      },
      include: { client: true, service: true, barbershop: true },
    }),
  ]);

  // Safety net: release deposit holds whose checkout lapsed. Stripe normally
  // sends checkout.session.expired, but this guarantees abandoned holds never
  // linger on a shop's calendar even if that event is missed or delayed.
  const releasedHolds = await prisma.appointment.updateMany({
    where: {
      depositStatus: "PENDING",
      holdExpiresAt: { lt: new Date() },
      status: { notIn: ["CANCELLED"] },
    },
    data: { status: "CANCELLED", depositStatus: "FAILED", holdExpiresAt: null },
  });

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

  return NextResponse.json({
    sent,
    count: sent.length,
    releasedHolds: releasedHolds.count,
  });
}
