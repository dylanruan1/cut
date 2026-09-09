"use server";

import prisma from "@/lib/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { rateLimit, sanitizeInput } from "@/lib/rate-limit";
import { normalizePhone, sendSms } from "@/lib/twilio";
import { recordSmsConsent } from "@/lib/sms-consent";
import { canUseCalendar } from "@/lib/subscription";
import { verifyPin } from "@/lib/barber-pin";
import { getStripe, getAppUrl } from "@/lib/stripe";
import { applicationFeeCents, toCents } from "@/lib/stripe-connect";
import {
  ACTIVE_QUEUE_STATUSES,
  estimateWaitMinutes,
  queuePosition,
  formatWait,
  autoCompleteAt,
  shouldAutoComplete,
  type QueueItem,
} from "@/lib/queue";

/**
 * Walk-in queue — public actions reached by scanning the shop's QR code.
 *
 * No login anywhere in here. Guarded the same way as public booking: rate
 * limited per IP, shop resolved by slug only, and a per-entry unguessable
 * token for the customer's own status page.
 */

export type QueueShop = {
  id: string;
  name: string;
  slug: string;
  services: Array<{ id: string; name: string; duration: number; price: string }>;
  barbers: Array<{ id: string; name: string }>;
  /** Live wait for someone joining right now. */
  currentWaitLabel: string;
  peopleWaiting: number;
  open: boolean;
};


/**
 * Stripe Checkout for an in-person walk-in payment.
 *
 * Destination charge, so the money lands in the barbershop's own account —
 * Cut only takes its platform fee. The entry is NOT marked paid here; the
 * webhook does that once Stripe confirms.
 */
async function createQueueCheckout(input: {
  entryId: string;
  barbershopId: string;
  connectAccountId: string;
  shopName: string;
  shopSlug: string;
  serviceName: string;
  token: string;
  amountDollars: number;
}): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const amount = toCents(input.amountDollars);
  const fee = applicationFeeCents(amount);
  const base = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${base}/q/status/${input.token}?paid=1`,
    cancel_url: `${base}/q/status/${input.token}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: `${input.serviceName} at ${input.shopName}`,
          },
        },
      },
    ],
    payment_intent_data: {
      ...(fee > 0 ? { application_fee_amount: fee } : {}),
      transfer_data: { destination: input.connectAccountId },
      metadata: {
        queueEntryId: input.entryId,
        barbershopId: input.barbershopId,
        kind: "queue_payment",
      },
    },
    metadata: {
      queueEntryId: input.entryId,
      barbershopId: input.barbershopId,
      kind: "queue_payment",
    },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return `${prefix}:${ip}`;
}

/** Loads active queue rows for a shop, shaped for the pure queue helpers. */
async function loadQueue(barbershopId: string): Promise<
  Array<QueueItem & { name: string; phone: string; token: string; notifiedAt: Date | null; autoCompleteAtValue: Date | null }>
> {
  const rows = await prisma.queueEntry.findMany({
    where: { barbershopId, status: { in: ACTIVE_QUEUE_STATUSES } },
    include: { service: { select: { duration: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    status: r.status as QueueItem["status"],
    serviceDuration: r.service.duration,
    barberId: r.barberId,
    joinedAt: r.joinedAt,
    seatedAt: r.seatedAt,
    name: r.name,
    phone: r.phone,
    token: r.token,
    notifiedAt: r.notifiedAt,
    autoCompleteAtValue: r.autoCompleteAt,
  }));
}

/**
 * Closes out any in-chair entries whose timer has lapsed.
 *
 * This is what makes the queue safe in a cash-heavy shop: if nobody ever taps
 * checkout, the line still moves. Runs opportunistically on reads.
 */
async function sweepExpired(barbershopId: string): Promise<void> {
  const stale = await prisma.queueEntry.findMany({
    where: {
      barbershopId,
      status: "IN_CHAIR",
      autoCompleteAt: { lt: new Date() },
    },
    select: { id: true, status: true, autoCompleteAt: true },
  });

  const expired = stale.filter((s) =>
    shouldAutoComplete({
      status: s.status as QueueItem["status"],
      autoCompleteAt: s.autoCompleteAt,
    })
  );
  if (expired.length === 0) return;

  await prisma.queueEntry.updateMany({
    where: { id: { in: expired.map((e) => e.id) } },
    data: { status: "DONE", completedAt: new Date() },
  });
}

/** Public shop profile for the QR landing page. */
export async function getQueueShop(slug: string): Promise<QueueShop | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;

  const shop = await prisma.barbershop.findUnique({
    where: { slug: clean },
    include: {
      services: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      barbers: { where: { isActive: true }, orderBy: { name: "asc" } },
      businessHours: true,
    },
  });
  if (!shop || !canUseCalendar(shop)) return null;
  if (shop.services.length === 0 || shop.barbers.length === 0) return null;

  await sweepExpired(shop.id);
  const queue = await loadQueue(shop.id);
  const barberIds = shop.barbers.map((b) => b.id);

  // Wait for a hypothetical person joining at the back of the line.
  const probe: QueueItem = {
    id: "__probe__",
    status: "WAITING",
    serviceDuration: shop.services[0]?.duration ?? 30,
    barberId: null,
    joinedAt: new Date(),
    seatedAt: null,
  };
  const wait = estimateWaitMinutes({
    queue: [...queue, probe],
    entryId: "__probe__",
    barberIds,
  });

  const day = new Date().getDay();
  const hours = shop.businessHours.find((h) => h.dayOfWeek === day);

  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    services: shop.services.map((s) => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
      price: s.price.toString(),
    })),
    barbers: shop.barbers.map((b) => ({ id: b.id, name: b.name })),
    currentWaitLabel: formatWait(wait),
    peopleWaiting: queue.filter(
      (q) => q.status === "WAITING" || q.status === "NOTIFIED"
    ).length,
    open: Boolean(hours && !hours.isClosed),
  };
}

export type JoinResult = { token?: string; error?: string };

/** Adds a walk-in to the queue. Returns their personal status-page token. */
export async function joinQueue(input: {
  slug: string;
  serviceId: string;
  barberId?: string | null;
  name: string;
  phone: string;
  /** Did they tick the SMS opt-in? Never required — the line works either way. */
  smsConsent?: boolean;
}): Promise<JoinResult> {
  const limited = rateLimit(await clientKey("queue:join"), 10, 60_000);
  if (!limited.success) {
    return { error: "Too many requests. Please try again in a minute." };
  }

  const name = sanitizeInput(input.name ?? "").trim();
  const phoneRaw = (input.phone ?? "").trim();
  if (!name) return { error: "Please enter your name." };
  if (phoneRaw.replace(/\D/g, "").length < 10) {
    return { error: "Please enter a valid mobile number." };
  }

  const shop = await prisma.barbershop.findUnique({
    where: { slug: input.slug.trim().toLowerCase() },
    select: {
      id: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      currentPeriodEnd: true,
    },
  });
  if (!shop || !canUseCalendar(shop)) {
    return { error: "This shop isn't accepting walk-ins right now." };
  }

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, barbershopId: shop.id, isActive: true },
    select: { id: true, duration: true },
  });
  if (!service) return { error: "Please choose a service." };

  const barberId =
    input.barberId && input.barberId !== "any" ? input.barberId : null;
  if (barberId) {
    const barber = await prisma.barber.findFirst({
      where: { id: barberId, barbershopId: shop.id, isActive: true },
      select: { id: true },
    });
    if (!barber) return { error: "That barber isn't available." };
  }

  const phone = normalizePhone(phoneRaw);

  // Strict true only — anything else from an unauthenticated caller is not a
  // tick. Recorded before the duplicate check below so someone who rejoins and
  // ticks the box this time still gets their consent written down.
  if (input.smsConsent === true) {
    await recordSmsConsent(shop.id, phone, "queue");
  }

  // Don't let one person stack multiple places in line.
  const existing = await prisma.queueEntry.findFirst({
    where: { barbershopId: shop.id, phone, status: { in: ACTIVE_QUEUE_STATUSES } },
    select: { token: true },
  });
  if (existing) return { token: existing.token };

  // Recognise a returning customer so their history links up.
  const client = await prisma.client.findUnique({
    where: { barbershopId_phone: { barbershopId: shop.id, phone } },
    select: { id: true },
  });

  const entry = await prisma.queueEntry.create({
    data: {
      barbershopId: shop.id,
      clientId: client?.id ?? null,
      serviceId: service.id,
      barberId,
      name,
      phone,
    },
    select: { token: true },
  });

  revalidatePath("/dashboard");
  return { token: entry.token };
}

export type QueueStatusView = {
  token: string;
  shopName: string;
  shopSlug: string;
  name: string;
  serviceName: string;
  servicePrice: string;
  barberName: string | null;
  status: string;
  position: number | null;
  waitLabel: string;
  /** True once they're in the chair and can check out. */
  canCheckOut: boolean;
  paid: boolean;
  paymentMethod: string;
  /** True only when money genuinely moved (card) or a barber confirmed cash. */
  verified: boolean;
  verifiedByName?: string;
};

/** Live status for the customer's own page. */
export async function getQueueStatus(
  token: string
): Promise<QueueStatusView | null> {
  const clean = token?.trim();
  if (!clean) return null;

  const limited = rateLimit(await clientKey("queue:status"), 120, 60_000);
  if (!limited.success) return null;

  const entry = await prisma.queueEntry.findUnique({
    where: { token: clean },
    include: {
      barbershop: { select: { name: true, slug: true, id: true } },
      service: { select: { name: true, duration: true, price: true } },
      barber: { select: { name: true } },
    },
  });
  if (!entry) return null;

  await sweepExpired(entry.barbershop.id);

  const [queue, barbers] = await Promise.all([
    loadQueue(entry.barbershop.id),
    prisma.barber.findMany({
      where: { barbershopId: entry.barbershop.id, isActive: true },
      select: { id: true },
    }),
  ]);

  const wait = estimateWaitMinutes({
    queue,
    entryId: entry.id,
    barberIds: barbers.map((b) => b.id),
  });

  const verifier = entry.verifiedByBarberId
    ? await prisma.barber.findUnique({
        where: { id: entry.verifiedByBarberId },
        select: { name: true },
      })
    : null;

  return {
    token: clean,
    shopName: entry.barbershop.name,
    shopSlug: entry.barbershop.slug,
    name: entry.name,
    serviceName: entry.service.name,
    servicePrice: entry.service.price.toString(),
    barberName: entry.barber?.name ?? null,
    status: entry.status,
    position: queuePosition(queue, entry.id),
    waitLabel: formatWait(wait),
    canCheckOut: entry.status === "IN_CHAIR",
    paid: entry.paymentMethod !== "UNPAID",
    paymentMethod: entry.paymentMethod,
    verified: entry.cashVerified,
    verifiedByName: verifier?.name,
  };
}

/**
 * The customer marks themselves as seated.
 *
 * Deliberately customer-driven: the barber's hands are full, and the person
 * sitting down is the one with a phone in their hand. This starts the service
 * timer (the backstop that keeps the queue moving) and frees their place in
 * line for whoever is behind them.
 */
export async function markSeated(
  token: string
): Promise<{ success?: true; error?: string }> {
  const clean = token?.trim();
  if (!clean) return { error: "Invalid link." };

  const limited = rateLimit(await clientKey("queue:seat"), 20, 60_000);
  if (!limited.success) return { error: "Too many requests." };

  const entry = await prisma.queueEntry.findUnique({
    where: { token: clean },
    include: { service: { select: { duration: true } } },
  });
  if (!entry) return { error: "We couldn't find your spot in line." };
  if (entry.status === "IN_CHAIR") return { success: true };
  if (entry.status === "DONE" || entry.status === "LEFT") {
    return { error: "This visit is already finished." };
  }

  // If they didn't pick a barber, attribute the visit to whoever is free so
  // the shop's numbers stay meaningful.
  let barberId = entry.barberId;
  if (!barberId) {
    const busy = await prisma.queueEntry.findMany({
      where: { barbershopId: entry.barbershopId, status: "IN_CHAIR" },
      select: { barberId: true },
    });
    const busyIds = new Set(busy.map((b) => b.barberId).filter(Boolean));
    const free = await prisma.barber.findFirst({
      where: {
        barbershopId: entry.barbershopId,
        isActive: true,
        id: { notIn: [...busyIds] as string[] },
      },
      select: { id: true },
    });
    barberId = free?.id ?? null;
  }

  const seatedAt = new Date();
  await prisma.queueEntry.update({
    where: { id: entry.id },
    data: {
      status: "IN_CHAIR",
      barberId,
      seatedAt,
      autoCompleteAt: autoCompleteAt(seatedAt, entry.service.duration),
    },
  });

  await notifyNextInLine(entry.barbershopId);
  revalidatePath("/dashboard");
  return { success: true };
}

/** Customer leaves the line voluntarily. */
export async function leaveQueue(token: string): Promise<{ success?: true; error?: string }> {
  const clean = token?.trim();
  if (!clean) return { error: "Invalid link." };

  const limited = rateLimit(await clientKey("queue:leave"), 20, 60_000);
  if (!limited.success) return { error: "Too many requests." };

  const entry = await prisma.queueEntry.findUnique({
    where: { token: clean },
    select: { id: true, status: true },
  });
  if (!entry) return { error: "We couldn't find your spot in line." };
  if (!ACTIVE_QUEUE_STATUSES.includes(entry.status as QueueItem["status"])) {
    return { success: true };
  }

  await prisma.queueEntry.update({
    where: { id: entry.id },
    data: { status: "LEFT", completedAt: new Date() },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Customer checkout. Recording cash counts exactly like paying by card — both
 * complete the entry and free the chair, which is what keeps the queue moving
 * in shops where most people pay cash.
 */
export async function checkOutQueueEntry(input: {
  token: string;
  method: "CARD" | "CASH";
  tipAmount?: number;
  /**
   * The barber's own PIN, typed by them on the customer's phone. This is what
   * makes a cash payment verifiable without any device at the station — the
   * customer can't produce it by tapping.
   */
  barberPin?: string;
}): Promise<{
  success?: true;
  error?: string;
  cashVerified?: boolean;
  verifiedBy?: string;
  /** Present for card payments — the client redirects here to actually pay. */
  checkoutUrl?: string;
}> {
  const clean = input.token?.trim();
  if (!clean) return { error: "Invalid link." };

  const limited = rateLimit(await clientKey("queue:checkout"), 20, 60_000);
  if (!limited.success) return { error: "Too many requests." };

  const entry = await prisma.queueEntry.findUnique({
    where: { token: clean },
    include: { service: { select: { price: true, name: true } } },
  });
  if (!entry) return { error: "We couldn't find your visit." };
  if (entry.paymentMethod !== "UNPAID") return { success: true };

  const tip =
    typeof input.tipAmount === "number" && input.tipAmount > 0
      ? Math.min(input.tipAmount, 500)
      : 0;
  const total = Number(entry.service.price) + tip;

  // CARD: hand off to Stripe. Nothing is marked paid here — the webhook
  // confirms it only after money actually moves.
  if (input.method === "CARD") {
    const shop = await prisma.barbershop.findUnique({
      where: { id: entry.barbershopId },
      select: {
        name: true,
        slug: true,
        connectStatus: true,
        stripeConnectAccountId: true,
      },
    });

    if (
      !shop?.stripeConnectAccountId ||
      shop.connectStatus !== "ACTIVE"
    ) {
      return {
        error:
          "This shop isn't set up to take card payments yet. Please pay your barber directly.",
      };
    }

    try {
      const url = await createQueueCheckout({
        entryId: entry.id,
        barbershopId: entry.barbershopId,
        connectAccountId: shop.stripeConnectAccountId,
        shopName: shop.name,
        shopSlug: shop.slug,
        serviceName: entry.service.name,
        token: clean,
        amountDollars: total,
      });
      return { success: true, checkoutUrl: url };
    } catch (error) {
      console.error("[queue] card checkout failed", error);
      return {
        error: "We couldn't start the payment. Please pay your barber directly.",
      };
    }
  }

  // CASH is only verified when a barber at this shop typed their own PIN on
  // the customer's phone. An unverified claim still completes the visit (the
  // line must keep moving) but is never rendered as proof of payment.
  let cashVerified = false;
  let verifiedByBarberId: string | null = null;
  let verifiedByName: string | undefined;

  if (input.method === "CASH" && input.barberPin?.trim()) {
    const barbers = await prisma.barber.findMany({
      where: {
        barbershopId: entry.barbershopId,
        isActive: true,
        verifyPinHash: { not: null },
      },
      select: { id: true, name: true, verifyPinHash: true },
    });

    for (const barber of barbers) {
      if (await verifyPin(input.barberPin, barber.verifyPinHash)) {
        cashVerified = true;
        verifiedByBarberId = barber.id;
        verifiedByName = barber.name;
        break;
      }
    }

    if (!cashVerified) {
      // Wrong PIN is a mistake worth surfacing, not a silent downgrade —
      // otherwise the barber thinks they confirmed something they didn't.
      return { error: "That PIN wasn't recognised. Try again." };
    }
  }

  await prisma.queueEntry.update({
    where: { id: entry.id },
    data: {
      paymentMethod: input.method,
      paidAmount: total,
      tipAmount: tip > 0 ? tip : null,
      cashVerified,
      verifiedByBarberId,
      verifiedAt: cashVerified ? new Date() : null,
      status: "DONE",
      completedAt: new Date(),
    },
  });

  // Self-reported cash without the barber's code — surface it so the shop can
  // reconcile at close-out rather than silently trusting it.
  if (input.method === "CASH" && !cashVerified) {
    await prisma.notification.create({
      data: {
        barbershopId: entry.barbershopId,
        title: "Unverified cash payment",
        message: `${entry.name} marked $${total.toFixed(2)} as paid in cash without a code — please confirm.`,
        type: "SYSTEM",
        metadata: { queueEntryId: entry.id, amount: total },
      },
    }).catch(() => {});
  }

  // Freeing the chair may mean the next person is now up.
  await notifyNextInLine(entry.barbershopId);

  revalidatePath("/dashboard");
  return { success: true, cashVerified, verifiedBy: verifiedByName };
}

/**
 * Texts anyone who has become "nearly up". Called after the queue changes.
 * Silent no-op while SMS is unavailable.
 */
async function notifyNextInLine(barbershopId: string): Promise<void> {
  try {
    const [queue, barbers, shop] = await Promise.all([
      loadQueue(barbershopId),
      prisma.barber.findMany({
        where: { barbershopId, isActive: true },
        select: { id: true },
      }),
      prisma.barbershop.findUnique({
        where: { id: barbershopId },
        select: { name: true },
      }),
    ]);
    if (!shop) return;

    const barberIds = barbers.map((b) => b.id);

    for (const item of queue) {
      if (item.status !== "WAITING" || item.notifiedAt) continue;
      const wait = estimateWaitMinutes({ queue, entryId: item.id, barberIds });
      if (wait > 10) continue;

      await prisma.queueEntry.update({
        where: { id: item.id },
        data: { status: "NOTIFIED", notifiedAt: new Date() },
      });

      await sendSms(
        item.phone,
        `${shop.name}: you're up next! Head back in — we'll be ready in about ${Math.max(
          5,
          wait
        )} minutes.`,
        barbershopId,
        "reminder_2h"
      );
    }
  } catch (error) {
    console.error("[queue] notify failed", error);
  }
}

/** Marks the next person as seated. Used by the shop's queue screen. */
export async function seatQueueEntry(
  entryId: string,
  barberId: string
): Promise<{ success?: true; error?: string }> {
  const entry = await prisma.queueEntry.findUnique({
    where: { id: entryId },
    include: { service: { select: { duration: true } } },
  });
  if (!entry) return { error: "Entry not found." };

  const seatedAt = new Date();
  await prisma.queueEntry.update({
    where: { id: entry.id },
    data: {
      status: "IN_CHAIR",
      barberId,
      seatedAt,
      // Timer backstop so a cash customer can't jam the queue.
      autoCompleteAt: autoCompleteAt(seatedAt, entry.service.duration),
    },
  });

  await notifyNextInLine(entry.barbershopId);
  revalidatePath("/dashboard");
  return { success: true };
}
