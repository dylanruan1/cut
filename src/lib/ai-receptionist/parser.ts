import { addDays, format, nextDay, type Day } from "date-fns";
import type {
  AwaitingField,
  BookingField,
  ParsedBookingRequest,
  ReceptionistIntent,
  ShopContext,
} from "./types";
import { buildMissingInfoPrompt } from "./prompts";

const BOOK_PATTERNS = [
  /\b(book|booking|schedule|appointment|reserve)\b/i,
  /\bi (want|need|would like)\b/i,
  /\b(haircut|fade|beard|line\s*up|kids?\s*cut)\b/i,
];

const RESCHEDULE_PATTERNS = [
  /\b(reschedule|move|change)\b.*\b(appointment|booking)?\b/i,
  /\b(appointment|booking)\b.*\b(reschedule|move|change)\b/i,
];

const CANCEL_PATTERNS = [/\b(cancel|cancellation)\b/i, /\bcall off\b/i];

const HOURS_PATTERNS = [
  /\b(hours?|open|close|closing|opening)\b/i,
  /\bwhat time (are you|do you)\b/i,
  /\bwhen (are you|do you) open\b/i,
];

const SERVICES_PATTERNS = [
  /\b(services?|menu|what do you offer|what can you do)\b/i,
];

const LOCATION_PATTERNS = [
  /\b(location|address|where (are you|is the shop)|directions)\b/i,
];

const WEEKDAYS: Record<string, Day> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const YES_PATTERNS = /^(yes|yeah|yep|yup|sure|ok|okay|confirm|correct|please|go ahead|book it)\b/i;
const NO_PATTERNS = /^(no|nope|nah|cancel|stop|don't|do not)\b/i;
const ANY_BARBER_PATTERNS =
  /\b(any|anyone|anybody|no preference|doesn't matter|dont care|don't care|whatever|no preferred)\b/i;

/**
 * Rule-based parser for the MVP. Deterministic and free to run in tests.
 * Supports contextual short answers via `awaitingField`.
 */
export function parseReceptionistMessage(
  text: string,
  options?: {
    shop?: Pick<ShopContext, "services" | "barbers">;
    session?: Partial<ParsedBookingRequest> & {
      awaitingField?: AwaitingField;
      anyBarber?: boolean;
      confirmed?: boolean;
      barberAsked?: boolean;
    };
    now?: Date;
  }
): ParsedBookingRequest {
  const rawText = text.trim();
  const normalized = rawText.toLowerCase().trim();
  const now = options?.now ?? new Date();
  const session = options?.session ?? {};
  const awaitingField = session.awaitingField ?? null;
  const serviceCatalog = options?.shop?.services.map((s) => s.name) ?? [];
  const barberCatalog = options?.shop?.barbers.map((b) => b.name) ?? [];

  // Contextual short-answer handling takes priority over free-form intent detection.
  if (awaitingField) {
    const contextual = parseContextualAnswer(rawText, normalized, awaitingField, {
      serviceCatalog,
      barberCatalog,
      now,
      session,
    });
    if (contextual) {
      return finalizeParsed(contextual, session, rawText);
    }
  }

  const detected = detectIntent(normalized);
  const intent: ReceptionistIntent =
    detected !== "unknown"
      ? detected
      : session.intent && session.intent !== "unknown"
        ? session.intent
        : "unknown";

  const serviceName =
    extractServiceName(normalized, serviceCatalog) ?? session.serviceName;
  const barberName =
    extractBarberName(normalized, barberCatalog) ?? session.barberName;
  const clientName = extractClientName(rawText) ?? session.clientName;
  const preferredDate =
    extractPreferredDate(normalized, now) ?? session.preferredDate;
  const preferredTime =
    extractPreferredTime(normalized) ?? session.preferredTime;

  const anyBarber =
    session.anyBarber ||
    (Boolean(barberName) ? false : ANY_BARBER_PATTERNS.test(normalized) ? true : session.anyBarber);

  let confirmed = session.confirmed;
  if (awaitingField === "confirmation" || /\b(yes|confirm|book it)\b/i.test(normalized)) {
    if (YES_PATTERNS.test(normalized)) confirmed = true;
    if (NO_PATTERNS.test(normalized)) confirmed = false;
  }

  return finalizeParsed(
    {
      intent,
      clientName,
      serviceName,
      barberName,
      preferredDate,
      preferredTime,
      confirmed,
      anyBarber,
      confidence: scoreConfidence(intent, {
        serviceName,
        barberName,
        preferredDate,
        preferredTime,
        clientName,
      }),
    },
    session,
    rawText
  );
}

function parseContextualAnswer(
  rawText: string,
  normalized: string,
  awaitingField: BookingField,
  opts: {
    serviceCatalog: string[];
    barberCatalog: string[];
    now: Date;
    session: Partial<ParsedBookingRequest> & {
      anyBarber?: boolean;
      confirmed?: boolean;
      barberAsked?: boolean;
    };
  }
): Omit<ParsedBookingRequest, "rawText" | "missingFields"> | null {
  const baseIntent =
    (opts.session.intent as ReceptionistIntent | undefined) &&
    opts.session.intent !== "unknown"
      ? (opts.session.intent as ReceptionistIntent)
      : "book_appointment";

  switch (awaitingField) {
    case "clientName": {
      const name =
        extractClientName(rawText) ??
        extractBareName(rawText) ??
        undefined;
      if (!name) return null;
      return {
        intent: baseIntent,
        clientName: name,
        serviceName: opts.session.serviceName,
        barberName: opts.session.barberName,
        preferredDate: opts.session.preferredDate,
        preferredTime: opts.session.preferredTime,
        anyBarber: opts.session.anyBarber,
        confirmed: opts.session.confirmed,
        confidence: 0.9,
      };
    }
    case "serviceName": {
      const serviceName =
        extractServiceName(normalized, opts.serviceCatalog) ??
        titleCase(normalized.replace(/^a\s+/, ""));
      return {
        intent: baseIntent,
        clientName: opts.session.clientName,
        serviceName,
        barberName: opts.session.barberName,
        preferredDate: opts.session.preferredDate,
        preferredTime: opts.session.preferredTime,
        anyBarber: opts.session.anyBarber,
        confirmed: opts.session.confirmed,
        confidence: 0.85,
      };
    }
    case "preferredDate": {
      const preferredDate = extractPreferredDate(normalized, opts.now);
      if (!preferredDate) return null;
      return {
        intent: baseIntent,
        clientName: opts.session.clientName,
        serviceName: opts.session.serviceName,
        barberName: opts.session.barberName,
        preferredDate,
        preferredTime: opts.session.preferredTime,
        anyBarber: opts.session.anyBarber,
        confirmed: opts.session.confirmed,
        confidence: 0.9,
      };
    }
    case "preferredTime": {
      const preferredTime = extractPreferredTime(normalized);
      if (!preferredTime) return null;
      return {
        intent: baseIntent,
        clientName: opts.session.clientName,
        serviceName: opts.session.serviceName,
        barberName: opts.session.barberName,
        preferredDate: opts.session.preferredDate,
        preferredTime,
        anyBarber: opts.session.anyBarber,
        confirmed: opts.session.confirmed,
        confidence: 0.9,
      };
    }
    case "barberName": {
      if (ANY_BARBER_PATTERNS.test(normalized) || normalized === "any") {
        return {
          intent: baseIntent,
          clientName: opts.session.clientName,
          serviceName: opts.session.serviceName,
          preferredDate: opts.session.preferredDate,
          preferredTime: opts.session.preferredTime,
          anyBarber: true,
          barberName: undefined,
          confirmed: opts.session.confirmed,
          confidence: 0.9,
        };
      }
      const barberName =
        extractBarberName(normalized, opts.barberCatalog) ??
        extractBareName(rawText);
      if (!barberName) return null;
      return {
        intent: baseIntent,
        clientName: opts.session.clientName,
        serviceName: opts.session.serviceName,
        barberName,
        preferredDate: opts.session.preferredDate,
        preferredTime: opts.session.preferredTime,
        anyBarber: false,
        confirmed: opts.session.confirmed,
        confidence: 0.9,
      };
    }
    case "confirmation": {
      if (YES_PATTERNS.test(normalized)) {
        return {
          intent: baseIntent,
          clientName: opts.session.clientName,
          serviceName: opts.session.serviceName,
          barberName: opts.session.barberName,
          preferredDate: opts.session.preferredDate,
          preferredTime: opts.session.preferredTime,
          anyBarber: opts.session.anyBarber,
          confirmed: true,
          confidence: 0.95,
        };
      }
      if (NO_PATTERNS.test(normalized)) {
        return {
          intent: baseIntent,
          clientName: opts.session.clientName,
          serviceName: opts.session.serviceName,
          barberName: opts.session.barberName,
          preferredDate: opts.session.preferredDate,
          preferredTime: opts.session.preferredTime,
          anyBarber: opts.session.anyBarber,
          confirmed: false,
          confidence: 0.95,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

function finalizeParsed(
  partial: {
    intent: ReceptionistIntent;
    clientName?: string;
    serviceName?: string;
    barberName?: string;
    preferredDate?: string;
    preferredTime?: string;
    confirmed?: boolean;
    anyBarber?: boolean;
    confidence: number;
  },
  session: Partial<ParsedBookingRequest> & {
    anyBarber?: boolean;
    barberAsked?: boolean;
  },
  rawText: string
): ParsedBookingRequest {
  const clientName = partial.clientName ?? session.clientName;
  const serviceName = partial.serviceName ?? session.serviceName;
  const barberName = partial.anyBarber
    ? undefined
    : partial.barberName ?? session.barberName;
  const preferredDate = partial.preferredDate ?? session.preferredDate;
  const preferredTime = partial.preferredTime ?? session.preferredTime;
  const anyBarber = partial.anyBarber ?? session.anyBarber;
  const confirmed = partial.confirmed ?? session.confirmed;

  const missingFields = getMissingFields(partial.intent, {
    clientName,
    serviceName,
    preferredDate,
    preferredTime,
    barberName,
    anyBarber,
    confirmed,
    barberAsked: session.barberAsked || Boolean(barberName) || Boolean(anyBarber),
  });

  return {
    intent: partial.intent,
    clientName,
    serviceName,
    barberName,
    preferredDate,
    preferredTime,
    confirmed,
    anyBarber,
    rawText,
    confidence: partial.confidence,
    missingFields,
  };
}

export function detectIntent(text: string): ReceptionistIntent {
  const normalized = text.toLowerCase();

  if (CANCEL_PATTERNS.some((p) => p.test(normalized))) {
    return "cancel_appointment";
  }
  if (RESCHEDULE_PATTERNS.some((p) => p.test(normalized))) {
    return "reschedule_appointment";
  }
  if (HOURS_PATTERNS.some((p) => p.test(normalized))) {
    return "ask_hours";
  }
  if (SERVICES_PATTERNS.some((p) => p.test(normalized))) {
    return "ask_services";
  }
  if (LOCATION_PATTERNS.some((p) => p.test(normalized))) {
    return "ask_location";
  }
  if (BOOK_PATTERNS.some((p) => p.test(normalized))) {
    return "book_appointment";
  }
  return "unknown";
}

/**
 * Required booking fields in conversation order.
 * Barber is optional — once asked (barberAsked), it is no longer missing.
 * Confirmation is required after all other fields.
 */
export function getMissingFields(
  intent: ReceptionistIntent,
  fields: {
    clientName?: string;
    serviceName?: string;
    preferredDate?: string;
    preferredTime?: string;
    barberName?: string;
    anyBarber?: boolean;
    confirmed?: boolean;
    barberAsked?: boolean;
  }
): BookingField[] {
  if (intent !== "book_appointment" && intent !== "reschedule_appointment") {
    return [];
  }

  const missing: BookingField[] = [];
  if (!fields.clientName) missing.push("clientName");
  if (!fields.serviceName) missing.push("serviceName");
  if (!fields.preferredDate) missing.push("preferredDate");
  if (!fields.preferredTime) missing.push("preferredTime");

  if (missing.length === 0) {
    if (!fields.barberAsked && !fields.barberName && !fields.anyBarber) {
      missing.push("barberName");
    } else if (!fields.confirmed) {
      missing.push("confirmation");
    }
  }

  return missing;
}

export function nextFollowUpQuestion(parsed: ParsedBookingRequest): string | null {
  if (parsed.missingFields.length === 0) return null;
  return buildMissingInfoPrompt(parsed.missingFields);
}

export function nextAwaitingField(parsed: ParsedBookingRequest): AwaitingField {
  return parsed.missingFields[0] ?? null;
}

function extractServiceName(text: string, catalog: string[]): string | undefined {
  const defaults = [
    "kids cut",
    "line up",
    "lineup",
    "beard trim",
    "beard",
    "haircut",
    "fade",
  ];

  for (const name of catalog) {
    if (text.includes(name.toLowerCase())) {
      return name;
    }
  }

  for (const name of defaults) {
    if (text.includes(name)) {
      if (name === "lineup") return "Line Up";
      if (name === "beard") return "Beard Trim";
      if (name === "kids cut") return "Kids Cut";
      return titleCase(name);
    }
  }

  return undefined;
}

function extractBarberName(text: string, barbers: string[]): string | undefined {
  const withMatch = text.match(/\bwith\s+([a-z][a-z'-]+)/i);
  if (withMatch) {
    const candidate = withMatch[1];
    const found = barbers.find((b) => b.toLowerCase() === candidate.toLowerCase());
    if (found) return found;
    if (candidate.length >= 3) {
      return titleCase(candidate);
    }
  }

  for (const name of barbers) {
    if (text.includes(name.toLowerCase())) {
      return name;
    }
  }

  return undefined;
}

function extractClientName(rawText: string): string | undefined {
  const patterns = [
    /\b(?:my name is|i am|i'm|this is)\s+([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match?.[1]) {
      return titleCase(match[1]);
    }
  }

  return undefined;
}

/** Accepts short answers like "Dylan" when awaiting a name. */
function extractBareName(rawText: string): string | undefined {
  const cleaned = rawText.trim().replace(/[^\p{L}\s'-]/gu, "");
  if (!cleaned) return undefined;

  // Reject obvious non-names
  if (
    /\b(yes|no|tomorrow|today|haircut|fade|beard|book|cancel|hello|hi|hmm|uh|um|huh|what|sorry|please)\b/i.test(
      cleaned
    )
  ) {
    return undefined;
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return undefined;
  if (parts.some((p) => p.length < 2)) return undefined;
  if (parts.every((p) => /^\d+$/.test(p))) return undefined;

  return parts.map((p) => titleCase(p)).join(" ");
}

export function extractPreferredDate(text: string, now: Date): string | undefined {
  if (/\btoday\b/i.test(text)) {
    return format(now, "yyyy-MM-dd");
  }
  if (/\btomorrow\b/i.test(text)) {
    return format(addDays(now, 1), "yyyy-MM-dd");
  }

  for (const [label, day] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${label}\\b`, "i").test(text)) {
      const current = now.getDay() as Day;
      if (current === day) {
        return format(now, "yyyy-MM-dd");
      }
      return format(nextDay(now, day), "yyyy-MM-dd");
    }
  }

  return undefined;
}

export function extractPreferredTime(text: string): string | undefined {
  const amPm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (amPm) {
    let hour = parseInt(amPm[1], 10);
    const minute = amPm[2] ? parseInt(amPm[2], 10) : 0;
    const meridiem = amPm[3].toLowerCase().replace(/\./g, "");
    if (meridiem.startsWith("p") && hour < 12) hour += 12;
    if (meridiem.startsWith("a") && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // "3:30" or "at 3:30"
  const clock = text.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
  if (clock) {
    let hour = parseInt(clock[1], 10);
    const minute = parseInt(clock[2], 10);
    if (hour >= 1 && hour <= 7) hour += 12;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const bareHour = text.match(/\b(?:at\s+)?(\d{1,2})\b(?!\s*:)/);
  if (bareHour) {
    let hour = parseInt(bareHour[1], 10);
    if (hour >= 1 && hour <= 7) hour += 12;
    if (hour >= 8 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  return undefined;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function scoreConfidence(
  intent: ReceptionistIntent,
  fields: {
    serviceName?: string;
    barberName?: string;
    preferredDate?: string;
    preferredTime?: string;
    clientName?: string;
  }
): number {
  if (intent === "unknown") return 0.2;
  let score = 0.55;
  if (fields.serviceName) score += 0.1;
  if (fields.barberName) score += 0.05;
  if (fields.preferredDate) score += 0.1;
  if (fields.preferredTime) score += 0.1;
  if (fields.clientName) score += 0.05;
  return Math.min(score, 0.99);
}
