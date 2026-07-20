import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  generateTwimlResponse,
  twimlSay,
  twimlGather,
  sendSms,
  buildBookingConfirmationSms,
} from "@/lib/twilio";
import { addMinutes } from "@/lib/dates";
import { formatTime, formatShortDate } from "@/lib/dates";

type SessionData = {
  action?: string;
  name?: string;
  phone?: string;
  barberId?: string;
  barberName?: string;
  day?: string;
  time?: string;
  serviceId?: string;
};

const STEPS: Record<string, { prompt: string; field: keyof SessionData; next: string }> = {
  book_name: { prompt: "Please say or enter your name.", field: "name", next: "book_phone" },
  book_phone: { prompt: "Please enter your phone number.", field: "phone", next: "book_barber" },
  book_barber: { prompt: "Press 1 for any available barber. Or enter the barber number.", field: "barberId", next: "book_day" },
  book_day: { prompt: "Enter the day you prefer. 1 for today, 2 for tomorrow, 3 for the day after.", field: "day", next: "book_time" },
  book_time: { prompt: "Enter your preferred time. For example, 2 PM.", field: "time", next: "book_confirm" },
};

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const callSid = formData.get("CallSid") as string;
  const digits = formData.get("Digits") as string | null;
  const speechResult = formData.get("SpeechResult") as string | null;
  const input = digits || speechResult || "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const session = await prisma.phoneBookingSession.findUnique({
    where: { callSid },
  });

  if (!session) {
    return twimlResponse(twimlSay("Session not found. Goodbye."));
  }

  const data = (session.data as SessionData) ?? {};
  let step = session.step;
  let content = "";

  if (step === "menu") {
    if (input === "1") {
      step = "book_name";
      data.action = "book";
    } else if (input === "2") {
      step = "book_phone";
      data.action = "reschedule";
      content = twimlSay("Rescheduling. Please enter the phone number on your booking.");
    } else if (input === "3") {
      step = "book_phone";
      data.action = "cancel";
      content = twimlSay("Cancellation. Please enter the phone number on your booking.");
    } else {
      content = twimlGather(
        `${baseUrl}/api/twilio/voice/handle`,
        "Invalid selection. Press 1 to book, 2 to reschedule, or 3 to cancel.",
        1
      );
    }
  }

  const stepConfig = STEPS[step];
  if (stepConfig && input) {
    data[stepConfig.field] = input;
    step = stepConfig.next;

    if (step === "book_confirm") {
      content = await createBookingFromSession(data, callSid);
      step = "complete";
    } else {
      const nextConfig = STEPS[step];
      if (nextConfig) {
        content = twimlGather(`${baseUrl}/api/twilio/voice/handle`, nextConfig.prompt, step === "book_phone" ? 10 : 1);
      }
    }
  } else if (stepConfig && !input) {
    content = twimlGather(`${baseUrl}/api/twilio/voice/handle`, stepConfig.prompt, step === "book_phone" ? 10 : 1);
  }

  if (step === "book_name" && !content) {
    content = twimlGather(`${baseUrl}/api/twilio/voice/handle`, STEPS.book_name.prompt, 10);
  }

  await prisma.phoneBookingSession.update({
    where: { callSid },
    data: { step, data },
  });

  return twimlResponse(content || twimlSay("Thank you for calling. Goodbye."));
}

async function createBookingFromSession(data: SessionData, callSid: string): Promise<string> {
  const { findBarbershopByTwilioTo, findDevFallbackBarbershop } = await import(
    "@/lib/barbershop"
  );
  const toNumber = process.env.TWILIO_PHONE_NUMBER ?? "";
  let shop = toNumber ? await findBarbershopByTwilioTo(toNumber) : null;
  if (!shop) {
    shop = await findDevFallbackBarbershop(toNumber || "(legacy-handle)");
  }
  if (!shop) {
    return twimlSay("Sorry, this phone number is not connected to a barbershop yet. Goodbye.");
  }

  return await bookAppointment(shop.id, data);
}

async function bookAppointment(barbershopId: string, data: SessionData): Promise<string> {
  const barber = await prisma.barber.findFirst({
    where: { barbershopId, isActive: true },
    orderBy: { name: "asc" },
  });
  const service = await prisma.service.findFirst({
    where: { barbershopId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const shop = await prisma.barbershop.findUnique({ where: { id: barbershopId } });

  if (!barber || !service || !shop) {
    return twimlSay("Unable to complete booking. Please call back later.");
  }

  const dayOffset = parseInt(data.day ?? "1") - 1;
  const startTime = new Date();
  startTime.setDate(startTime.getDate() + dayOffset);
  startTime.setHours(14, 0, 0, 0);

  const phone = data.phone ?? "";
  const name = data.name ?? "Phone Customer";

  let client = await prisma.client.findUnique({
    where: { barbershopId_phone: { barbershopId, phone } },
  });

  if (!client) {
    client = await prisma.client.create({
      data: { barbershopId, name, phone },
    });
  } else if (data.name && client.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
    console.log(
      "Caller provided different name than matched client; preserving existing client and storing appointment snapshot.",
      { phone, existingName: client.name, callerProvidedName: name }
    );
  }

  const appointment = await prisma.appointment.create({
    data: {
      barbershopId,
      clientId: client.id,
      barberId: barber.id,
      serviceId: service.id,
      startTime,
      endTime: addMinutes(startTime, service.duration),
      duration: service.duration,
      status: "PENDING",
      source: "phone",
      clientNameSnapshot: name,
      clientPhoneSnapshot: phone,
    },
    include: { barbershop: true },
  });

  const dateTime = `${formatShortDate(startTime, shop.timezone)} at ${formatTime(startTime, shop.timezone)}`;
  await sendSms(
    phone,
    buildBookingConfirmationSms(name, service.name, barber.name, dateTime, shop.name),
    barbershopId,
    "booking_confirmation",
    appointment.id
  );

  return twimlSay(
    `Your appointment for ${service.name} with barber ${barber.name} on ${dateTime} has been booked. You will receive a confirmation text. Goodbye.`
  );
}

function twimlResponse(content: string) {
  return new NextResponse(generateTwimlResponse(content), {
    headers: { "Content-Type": "text/xml" },
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
