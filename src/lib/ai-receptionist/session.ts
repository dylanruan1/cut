import prisma from "@/lib/db";
import type { ReceptionistCallSession, ReceptionistSessionStatus, Prisma } from "@prisma/client";
import type {
  AwaitingField,
  CallSessionContext,
  ParsedBookingRequest,
  ReceptionistIntent,
} from "./types";
import { SESSION_TTL_HOURS } from "./types";

const CONTINUABLE_STATUSES: ReceptionistSessionStatus[] = [
  "ACTIVE",
  "AWAITING_CONFIRMATION",
];

export type SessionUpdate = {
  barbershopId?: string | null;
  intent?: string | null;
  clientName?: string | null;
  serviceName?: string | null;
  barberName?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  awaitingField?: string | null;
  appointmentId?: string | null;
  status?: ReceptionistSessionStatus;
  turnCount?: number;
  context?: CallSessionContext;
  expiresAt?: Date;
};

function defaultExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);
}

function asContext(value: unknown): CallSessionContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as CallSessionContext;
}

export function isContinuableSession(
  session: ReceptionistCallSession | null | undefined
): boolean {
  return Boolean(
    session &&
      CONTINUABLE_STATUSES.includes(session.status) &&
      session.expiresAt >= new Date()
  );
}

export async function getCallSession(
  callSid: string
): Promise<ReceptionistCallSession | null> {
  if (!callSid) return null;

  const session = await prisma.receptionistCallSession.findUnique({
    where: { callSid },
  });

  if (!session) return null;

  if (
    session.expiresAt < new Date() &&
    CONTINUABLE_STATUSES.includes(session.status)
  ) {
    return prisma.receptionistCallSession.update({
      where: { callSid },
      data: { status: "EXPIRED" },
    });
  }

  return session;
}

/**
 * Load existing continuable session or create a fresh one.
 * Never wipes an in-progress ACTIVE / AWAITING_CONFIRMATION session.
 */
export async function createCallSession(
  callSid: string,
  callerPhone: string,
  options?: { barbershopId?: string }
): Promise<ReceptionistCallSession> {
  const existing = await getCallSession(callSid);

  if (existing && isContinuableSession(existing)) {
    // Keep collecting — only refresh phone / shop / expiry.
    return prisma.receptionistCallSession.update({
      where: { callSid },
      data: {
        callerPhone: callerPhone || existing.callerPhone,
        barbershopId: options?.barbershopId ?? existing.barbershopId,
        expiresAt: defaultExpiresAt(),
      },
    });
  }

  if (existing) {
    // Completed / expired / failed — start a clean slate for a new conversation.
    return prisma.receptionistCallSession.update({
      where: { callSid },
      data: {
        callerPhone,
        barbershopId: options?.barbershopId ?? existing.barbershopId,
        intent: null,
        clientName: null,
        serviceName: null,
        barberName: null,
        preferredDate: null,
        preferredTime: null,
        awaitingField: null,
        appointmentId: null,
        status: "ACTIVE",
        turnCount: 0,
        context: {
          turnCount: 0,
          promptRepeatCount: 0,
          awaitingField: null,
          barberAsked: false,
          confirmed: false,
          messages: [],
        } satisfies CallSessionContext as Prisma.InputJsonValue,
        expiresAt: defaultExpiresAt(),
      },
    });
  }

  return prisma.receptionistCallSession.create({
    data: {
      callSid,
      callerPhone,
      barbershopId: options?.barbershopId,
      status: "ACTIVE",
      turnCount: 0,
      awaitingField: null,
      context: {
        turnCount: 0,
        promptRepeatCount: 0,
        awaitingField: null,
        barberAsked: false,
        confirmed: false,
        messages: [],
      } satisfies CallSessionContext as Prisma.InputJsonValue,
      expiresAt: defaultExpiresAt(),
    },
  });
}

export async function updateCallSession(
  callSid: string,
  partialData: SessionUpdate
): Promise<ReceptionistCallSession> {
  const data: Prisma.ReceptionistCallSessionUpdateInput = {
    expiresAt: partialData.expiresAt ?? defaultExpiresAt(),
  };

  if (partialData.barbershopId !== undefined) data.barbershopId = partialData.barbershopId;
  if (partialData.intent !== undefined) data.intent = partialData.intent;
  if (partialData.clientName !== undefined) data.clientName = partialData.clientName;
  if (partialData.serviceName !== undefined) data.serviceName = partialData.serviceName;
  if (partialData.barberName !== undefined) data.barberName = partialData.barberName;
  if (partialData.preferredDate !== undefined) data.preferredDate = partialData.preferredDate;
  if (partialData.preferredTime !== undefined) data.preferredTime = partialData.preferredTime;
  if (partialData.awaitingField !== undefined) data.awaitingField = partialData.awaitingField;
  if (partialData.appointmentId !== undefined) data.appointmentId = partialData.appointmentId;
  if (partialData.status !== undefined) data.status = partialData.status;
  if (partialData.turnCount !== undefined) data.turnCount = partialData.turnCount;
  if (partialData.context !== undefined) {
    data.context = partialData.context as Prisma.InputJsonValue;
  }

  return prisma.receptionistCallSession.update({
    where: { callSid },
    data,
  });
}

/**
 * Merges newly parsed fields into the persistent session without wiping
 * previously collected values.
 */
export async function mergeParsedRequestIntoSession(
  callSid: string,
  parsedRequest: ParsedBookingRequest,
  extras?: {
    awaitingField?: AwaitingField;
    contextPatch?: Partial<CallSessionContext>;
    status?: ReceptionistSessionStatus;
    appointmentId?: string;
    barbershopId?: string;
    turnCount?: number;
    clearBarberName?: boolean;
  }
): Promise<ReceptionistCallSession> {
  const current = await getCallSession(callSid);
  if (!current || !isContinuableSession(current)) {
    throw new Error(`Call session not found or not continuable for ${callSid}`);
  }

  const context: CallSessionContext = {
    ...asContext(current.context),
    ...extras?.contextPatch,
  };

  if (extras?.awaitingField !== undefined) {
    context.awaitingField = extras.awaitingField;
  }

  const nextBarberName = extras?.clearBarberName
    ? null
    : parsedRequest.anyBarber
      ? null
      : parsedRequest.barberName ?? current.barberName;

  return updateCallSession(callSid, {
    barbershopId: extras?.barbershopId ?? current.barbershopId,
    intent:
      parsedRequest.intent !== "unknown" ? parsedRequest.intent : current.intent,
    clientName: parsedRequest.clientName ?? current.clientName,
    serviceName: parsedRequest.serviceName ?? current.serviceName,
    barberName: nextBarberName,
    preferredDate: parsedRequest.preferredDate ?? current.preferredDate,
    preferredTime: parsedRequest.preferredTime ?? current.preferredTime,
    awaitingField:
      extras?.awaitingField !== undefined
        ? extras.awaitingField
        : current.awaitingField,
    appointmentId: extras?.appointmentId ?? current.appointmentId ?? undefined,
    status: extras?.status,
    turnCount: extras?.turnCount,
    context,
  });
}

export async function clearCallSession(callSid: string): Promise<void> {
  const existing = await getCallSession(callSid);
  if (!existing) return;

  await updateCallSession(callSid, {
    status: "COMPLETED",
    awaitingField: null,
    context: {
      ...asContext(existing.context),
      awaitingField: null,
      lastPrompt: undefined,
      promptRepeatCount: 0,
    },
  });
}

export async function expireOldCallSessions(): Promise<number> {
  const result = await prisma.receptionistCallSession.updateMany({
    where: {
      status: { in: ["ACTIVE", "AWAITING_CONFIRMATION"] },
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

export function sessionToParsedState(
  session: ReceptionistCallSession
): Partial<ParsedBookingRequest> & {
  awaitingField?: AwaitingField;
  anyBarber?: boolean;
  confirmed?: boolean;
  barberAsked?: boolean;
} {
  const context = asContext(session.context);
  const awaitingField =
    (session.awaitingField as AwaitingField | null) ??
    context.awaitingField ??
    null;

  const barberAsked = Boolean(
    context.barberAsked ||
      session.barberName ||
      (context.anyBarber as boolean | undefined) ||
      awaitingField === "confirmation" ||
      session.status === "AWAITING_CONFIRMATION"
  );

  return {
    intent: (session.intent as ReceptionistIntent | null) ?? undefined,
    clientName: session.clientName ?? undefined,
    serviceName: session.serviceName ?? undefined,
    barberName: session.barberName ?? undefined,
    preferredDate: session.preferredDate ?? undefined,
    preferredTime: session.preferredTime ?? undefined,
    awaitingField,
    confirmed: context.confirmed,
    barberAsked,
    anyBarber: Boolean(
      (context.anyBarber as boolean | undefined) ||
        (barberAsked && !session.barberName)
    ),
  };
}

export function getSessionContext(session: ReceptionistCallSession): CallSessionContext {
  return asContext(session.context);
}

export function summarizeSession(session: ReceptionistCallSession) {
  return {
    callSid: session.callSid,
    status: session.status,
    intent: session.intent,
    clientName: session.clientName,
    serviceName: session.serviceName,
    barberName: session.barberName,
    preferredDate: session.preferredDate,
    preferredTime: session.preferredTime,
    awaitingField: session.awaitingField,
    turnCount: session.turnCount,
    appointmentId: session.appointmentId,
  };
}
