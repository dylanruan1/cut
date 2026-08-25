import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendSms, buildReminderSms } from "@/lib/twilio";
import { getAppointmentClientName } from "@/lib/utils";
import {
  reminderWindow,
  describeWhen,
  REMINDER_LOG_TYPE,
  type ReminderKind,
} from "@/lib/reminders";
import {
  purgeDeletedAccounts,
  type PurgeResult,
} from "@/lib/purge-deleted-accounts";

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
  const dayBefore = reminderWindow("day_before", now);
  const sameDay = reminderWindow("same_day", now);

  const [appointmentsDayBefore, appointmentsSameDay] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        startTime: { gte: dayBefore.start, lt: dayBefore.end },
        status: { in: ["CONFIRMED", "PENDING"] },
        // Never remind someone whose deposit was never paid.
        NOT: { depositStatus: "PENDING" },
      },
      include: { client: true, service: true, barbershop: true },
    }),
    prisma.appointment.findMany({
      where: {
        startTime: { gte: sameDay.start, lt: sameDay.end },
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

  /**
   * Sends one reminder per appointment per kind.
   *
   * The smsLog check is the only thing preventing duplicates, so it stays
   * inside the loop and runs before every send. Running this endpoint more
   * often must never mean texting the same person twice.
   */
  async function sendReminders(
    appointments: typeof appointmentsDayBefore,
    kind: ReminderKind
  ) {
    const logType = REMINDER_LOG_TYPE[kind];
    for (const apt of appointments) {
      const existing = await prisma.smsLog.findFirst({
        where: { appointmentId: apt.id, type: logType },
      });
      if (existing) continue;

      const whenLabel = describeWhen(
        apt.startTime,
        now,
        apt.barbershop.timezone
      );
      await sendSms(
        apt.clientPhoneSnapshot ?? apt.client.phone,
        buildReminderSms(
          getAppointmentClientName(apt),
          apt.service.name,
          apt.barbershop.name,
          whenLabel,
          apt.manageToken
        ),
        apt.barbershopId,
        logType,
        apt.id
      );
      sent.push(`${logType}:${apt.id}`);
    }
  }

  await sendReminders(appointmentsDayBefore, "day_before");
  await sendReminders(appointmentsSameDay, "same_day");

  // Piggybacks on this job rather than taking its own schedule, because the
  // Vercel Hobby plan allows only one cron. Failures here must not stop the
  // reminders above from being reported as sent.
  let purge: PurgeResult | { failed: string };
  try {
    purge = await purgeDeletedAccounts(now);
    if (purge.errors.length > 0) {
      console.error("[cron/reminders] purge errors", purge.errors);
    }
  } catch (err) {
    console.error("[cron/reminders] purge threw", err);
    purge = { failed: String(err) };
  }

  return NextResponse.json({
    sent,
    count: sent.length,
    releasedHolds: releasedHolds.count,
    purge,
  });
}
