import { addDays, format, nextDay, type Day } from "date-fns";
import type {
  AmbiguousTime,
  AwaitingField,
  BookingField,
  ParsedBookingRequest,
  ReceptionistIntent,
  ShopContext,
} from "./types";
import { buildMissingInfoPrompt } from "./prompts";
import { clockToHHmm } from "./time-disambiguation";

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
      ambiguousTime?: AmbiguousTime;
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

  const timeExtract = extractTimePreference(normalized);
  let preferredTime = session.preferredTime;
  let preferredTimeRaw = session.preferredTimeRaw;
  let hasExplicitMeridiem = session.hasExplicitMeridiem;
  let isAmbiguousHour = session.isAmbiguousHour;
  let ambiguousTime = session.ambiguousTime;
  if (timeExtract.status === "resolved") {
    preferredTime = timeExtract.time;
    preferredTimeRaw = timeExtract.raw;
    hasExplicitMeridiem = timeExtract.hasExplicitMeridiem;
    isAmbiguousHour = false;
    ambiguousTime = undefined;
  } else if (timeExtract.status === "ambiguous") {
    preferredTime = undefined;
    preferredTimeRaw = timeExtract.raw;
    hasExplicitMeridiem = false;
    isAmbiguousHour = true;
    ambiguousTime = { hour: timeExtract.hour, minute: timeExtract.minute };
  }

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
      preferredTimeRaw,
      hasExplicitMeridiem,
      isAmbiguousHour,
      ambiguousTime,
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
  awaitingField: AwaitingField,
  opts: {
    serviceCatalog: string[];
    barberCatalog: string[];
    now: Date;
    session: Partial<ParsedBookingRequest> & {
      anyBarber?: boolean;
      confirmed?: boolean;
      barberAsked?: boolean;
      ambiguousTime?: AmbiguousTime;
    };
  }
): Omit<ParsedBookingRequest, "rawText" | "missingFields"> | null {
  if (!awaitingField) return null;

  const baseIntent =
    (opts.session.intent as ReceptionistIntent | undefined) &&
    opts.session.intent !== "unknown"
      ? (opts.session.intent as ReceptionistIntent)
      : "book_appointment";

  const keep = {
    intent: baseIntent,
    clientName: opts.session.clientName,
    serviceName: opts.session.serviceName,
    barberName: opts.session.barberName,
    preferredDate: opts.session.preferredDate,
    preferredTime: opts.session.preferredTime,
    preferredTimeRaw: opts.session.preferredTimeRaw,
    hasExplicitMeridiem: opts.session.hasExplicitMeridiem,
    isAmbiguousHour: opts.session.isAmbiguousHour,
    ambiguousTime: opts.session.ambiguousTime,
    anyBarber: opts.session.anyBarber,
    confirmed: opts.session.confirmed,
  };

  switch (awaitingField) {
    case "clientName": {
      const name =
        extractClientName(rawText) ??
        extractBareName(rawText) ??
        undefined;
      if (!name) return null;
      return { ...keep, clientName: name, confidence: 0.9 };
    }
    case "serviceName": {
      const serviceName =
        extractServiceName(normalized, opts.serviceCatalog) ??
        titleCase(normalized.replace(/^a\s+/, ""));
      return { ...keep, serviceName, confidence: 0.85 };
    }
    case "preferredDate": {
      const preferredDate = extractPreferredDate(normalized, opts.now);
      if (!preferredDate) return null;
      return { ...keep, preferredDate, confidence: 0.9 };
    }
    case "preferredTime": {
      // Answering "What time works best?" — a bare "4"/"four" is a time here.
      const timeExtract = extractTimePreference(normalized, { assumeTime: true });
      if (timeExtract.status === "resolved") {
        return {
          ...keep,
          preferredTime: timeExtract.time,
          preferredTimeRaw: timeExtract.raw,
          hasExplicitMeridiem: timeExtract.hasExplicitMeridiem,
          isAmbiguousHour: false,
          ambiguousTime: undefined,
          confidence: 0.9,
        };
      }
      if (timeExtract.status === "ambiguous") {
        return {
          ...keep,
          preferredTime: undefined,
          preferredTimeRaw: timeExtract.raw,
          hasExplicitMeridiem: false,
          isAmbiguousHour: true,
          ambiguousTime: {
            hour: timeExtract.hour,
            minute: timeExtract.minute,
          },
          confidence: 0.9,
        };
      }
      return null;
    }
    case "timeMeridiem": {
      const pending = opts.session.ambiguousTime;
      if (!pending) return null;

      const resolved = extractPreferredTime(normalized, { assumeTime: true });
      if (resolved) {
        return {
          ...keep,
          preferredTime: resolved,
          preferredTimeRaw: normalized,
          hasExplicitMeridiem: /\b[ap]\.?m\.?\b/i.test(normalized),
          isAmbiguousHour: false,
          ambiguousTime: undefined,
          confidence: 0.95,
        };
      }

      const meridiem = extractMeridiemAnswer(normalized);
      if (!meridiem) return null;

      return {
        ...keep,
        preferredTime: clockToHHmm(pending.hour, pending.minute, meridiem),
        preferredTimeRaw: normalized,
        hasExplicitMeridiem: /\b[ap]\.?m\.?\b/i.test(normalized),
        isAmbiguousHour: false,
        ambiguousTime: undefined,
        confidence: 0.95,
      };
    }
    case "barberName": {
      if (ANY_BARBER_PATTERNS.test(normalized) || normalized === "any") {
        return {
          ...keep,
          anyBarber: true,
          barberName: undefined,
          confidence: 0.9,
        };
      }
      const barberName =
        extractBarberName(normalized, opts.barberCatalog) ??
        extractBareName(rawText);
      if (!barberName) return null;
      return { ...keep, barberName, anyBarber: false, confidence: 0.9 };
    }
    case "confirmation": {
      if (YES_PATTERNS.test(normalized)) {
        return { ...keep, confirmed: true, confidence: 0.95 };
      }
      if (NO_PATTERNS.test(normalized)) {
        return { ...keep, confirmed: false, confidence: 0.95 };
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
    preferredTimeRaw?: string;
    hasExplicitMeridiem?: boolean;
    isAmbiguousHour?: boolean;
    ambiguousTime?: AmbiguousTime;
    confirmed?: boolean;
    anyBarber?: boolean;
    confidence: number;
  },
  session: Partial<ParsedBookingRequest> & {
    anyBarber?: boolean;
    barberAsked?: boolean;
    ambiguousTime?: AmbiguousTime;
  },
  rawText: string
): ParsedBookingRequest {
  // Normalize so empty/whitespace names count as absent everywhere downstream.
  const clientName =
    (partial.clientName ?? session.clientName)?.trim() || undefined;
  const serviceName = partial.serviceName ?? session.serviceName;
  const barberName = partial.anyBarber
    ? undefined
    : partial.barberName ?? session.barberName;
  const preferredDate = partial.preferredDate ?? session.preferredDate;
  const preferredTime =
    "preferredTime" in partial ? partial.preferredTime : session.preferredTime;
  const preferredTimeRaw =
    "preferredTimeRaw" in partial ? partial.preferredTimeRaw : session.preferredTimeRaw;
  const hasExplicitMeridiem =
    "hasExplicitMeridiem" in partial
      ? partial.hasExplicitMeridiem
      : session.hasExplicitMeridiem;
  const isAmbiguousHour =
    "isAmbiguousHour" in partial ? partial.isAmbiguousHour : session.isAmbiguousHour;
  const ambiguousTime =
    preferredTime != null
      ? undefined
      : "ambiguousTime" in partial
        ? partial.ambiguousTime
        : session.ambiguousTime;
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
    preferredTimeRaw,
    hasExplicitMeridiem,
    isAmbiguousHour,
    ambiguousTime,
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
  // Whitespace-only is missing — a blank name must never reach confirmation.
  if (!fields.clientName?.trim()) missing.push("clientName");
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

export type TimePreferenceExtract =
  | {
      status: "resolved";
      time: string;
      raw: string;
      hasExplicitMeridiem: boolean;
      isAmbiguousHour: false;
    }
  | {
      status: "ambiguous";
      raw: string;
      hour: number;
      minute: number;
      hasExplicitMeridiem: false;
      isAmbiguousHour: true;
    }
  | { status: "none"; hasExplicitMeridiem: false; isAmbiguousHour: false };

const CONTEXT_AM = /\b(in the morning|this morning|morning)\b/i;
const CONTEXT_PM =
  /\b(in the afternoon|this afternoon|afternoon|in the evening|this evening|evening|tonight|at night)\b/i;

/** Spelled-out clock hours ("at four" / "four PM"). "for" is NEVER a number. */
const HOUR_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const HOUR_TOKEN = `\\d{1,2}|${Object.keys(HOUR_WORDS).join("|")}`;

function parseHourToken(token: string): number {
  return HOUR_WORDS[token.toLowerCase()] ?? parseInt(token, 10);
}

/**
 * Speech-to-text can transcribe "for a haircut" as "4 a haircut" /
 * "four a haircut" (and "for an appointment" as "4 an appointment").
 * A number immediately followed by an article is not a time.
 */
function hourFollowedByArticle(text: string, match: RegExpMatchArray): boolean {
  const rest = text.slice((match.index ?? 0) + match[0].length);
  return /^\s+an?\s+[a-z]/i.test(rest);
}

export type ExtractTimeOptions = {
  /**
   * True when the caller is answering a time question (awaitingField is
   * preferredTime / timeMeridiem) — a bare "4" or "four" is then a valid
   * (ambiguous) time answer even without "at"/"around"/AM/PM context.
   */
  assumeTime?: boolean;
};

/**
 * Detects explicit AM/PM, contextual meridiem ("8 tonight"), or ambiguous hour-only.
 * Does not guess AM/PM for bare hours; callers ask the caller to choose.
 *
 * A number is only treated as a time with clear time context: "at 4",
 * "around four", "4 PM", "4:30", "4 o'clock", "8 in the morning",
 * "book me for 6", noon/midnight — or when `assumeTime` says the caller is
 * answering a time question. Free-floating digits (e.g. STT turning
 * "for a haircut" into "4 a haircut") are never times.
 */
export function extractTimePreference(
  text: string,
  options?: ExtractTimeOptions
): TimePreferenceExtract {
  const assumeTime = options?.assumeTime ?? false;
  const { result, source } = extractTimePreferenceInternal(text, assumeTime);
  console.log("[ai-receptionist/parser] time extraction", {
    transcript: text,
    assumeTime,
    status: result.status,
    time: result.status === "resolved" ? result.time : null,
    ambiguousHour: result.status === "ambiguous" ? result.hour : null,
    hasExplicitMeridiem: result.hasExplicitMeridiem,
    // Why a time was or was not extracted (e.g. explicit_meridiem,
    // time_context_prefix, no_time_context, article_after_number).
    source,
  });
  return result;
}

function extractTimePreferenceInternal(
  text: string,
  assumeTime: boolean
): { result: TimePreferenceExtract; source: string } {
  const none = (source: string) => ({
    result: {
      status: "none" as const,
      hasExplicitMeridiem: false as const,
      isAmbiguousHour: false as const,
    },
    source,
  });

  if (/\bnoon\b/i.test(text)) {
    return {
      result: {
        status: "resolved",
        time: "12:00",
        raw: "noon",
        hasExplicitMeridiem: false,
        isAmbiguousHour: false,
      },
      source: "noon_keyword",
    };
  }

  if (/\bmidnight\b/i.test(text)) {
    return {
      result: {
        status: "resolved",
        time: "00:00",
        raw: "midnight",
        hasExplicitMeridiem: false,
        isAmbiguousHour: false,
      },
      source: "midnight_keyword",
    };
  }

  // "4 PM" / "four PM" / "4:30 pm" — explicit meridiem is time context.
  const explicit = text.match(
    new RegExp(
      `\\b(${HOUR_TOKEN})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)\\b`,
      "i"
    )
  );
  if (explicit) {
    const hour = parseHourToken(explicit[1]);
    const minute = explicit[2] ? parseInt(explicit[2], 10) : 0;
    if (!isValidClock(hour, minute) || hour < 1 || hour > 12) {
      return none("explicit_meridiem_invalid_clock");
    }
    const meridiem = explicit[3].toLowerCase().replace(/\./g, "").startsWith("p")
      ? "pm"
      : "am";
    return {
      result: {
        status: "resolved",
        time: clockToHHmm(hour, minute, meridiem),
        raw: explicit[0],
        hasExplicitMeridiem: true,
        isAmbiguousHour: false,
      },
      source: "explicit_meridiem",
    };
  }

  // "4:30" — a colon is inherently time-shaped.
  const clockMatch = text.match(/\b(?:at\s+|around\s+)?(\d{1,2}):(\d{2})\b/);
  // "at 4" / "around four" / "book me for 6" — preposition is time context.
  // ("for" only counts with a real number AFTER it; the word "for" itself is
  // never the number four.)
  const prefixMatch = text.match(
    new RegExp(`\\b(?:at|around|for)\\s+(${HOUR_TOKEN})\\b(?!\\s*:)`, "i")
  );
  // "4 o'clock" / "four o'clock".
  const oclockMatch = text.match(
    new RegExp(`\\b(${HOUR_TOKEN})\\s*o'?clock\\b`, "i")
  );
  // Bare number: only a time when answering a time question, or when the
  // sentence carries meridiem words ("8 tonight", "8 in the morning").
  const bareAllowed =
    assumeTime || CONTEXT_AM.test(text) || CONTEXT_PM.test(text);
  const bareMatch = bareAllowed
    ? text.match(new RegExp(`\\b(${HOUR_TOKEN})\\b(?!\\s*:)`, "i"))
    : null;

  let hour: number | undefined;
  let minute = 0;
  let raw: string | undefined;
  let source: string;
  if (clockMatch) {
    hour = parseInt(clockMatch[1], 10);
    minute = parseInt(clockMatch[2], 10);
    raw = clockMatch[0].trim();
    source = "clock_colon";
  } else if (prefixMatch) {
    if (hourFollowedByArticle(text, prefixMatch)) {
      return none("article_after_number");
    }
    hour = parseHourToken(prefixMatch[1]);
    raw = prefixMatch[1];
    source = "time_context_prefix";
  } else if (oclockMatch) {
    hour = parseHourToken(oclockMatch[1]);
    raw = oclockMatch[1];
    source = "oclock_suffix";
  } else if (bareMatch) {
    if (hourFollowedByArticle(text, bareMatch)) {
      return none("article_after_number");
    }
    hour = parseHourToken(bareMatch[1]);
    raw = bareMatch[1];
    source = assumeTime ? "assumed_time_answer" : "context_meridiem_words";
  } else {
    return none("no_time_context");
  }

  if (hour === undefined || !isValidClock(hour, minute)) {
    return none("invalid_clock");
  }

  // 24h times like "15" / "15:30" are already unambiguous.
  if (hour > 12) {
    return {
      result: {
        status: "resolved",
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        raw: raw ?? String(hour),
        hasExplicitMeridiem: false,
        isAmbiguousHour: false,
      },
      source: `${source}_24h`,
    };
  }

  const hasAm = CONTEXT_AM.test(text);
  const hasPm = CONTEXT_PM.test(text);
  if (hasAm && !hasPm) {
    return {
      result: {
        status: "resolved",
        time: clockToHHmm(hour, minute, "am"),
        raw: raw ?? String(hour),
        hasExplicitMeridiem: false,
        isAmbiguousHour: false,
      },
      source: `${source}_context_am`,
    };
  }
  if (hasPm && !hasAm) {
    return {
      result: {
        status: "resolved",
        time: clockToHHmm(hour, minute, "pm"),
        raw: raw ?? String(hour),
        hasExplicitMeridiem: false,
        isAmbiguousHour: false,
      },
      source: `${source}_context_pm`,
    };
  }

  // 0 only makes sense as midnight (12 AM) — treat as ambiguous 12-clock via hour 12
  const clockHour = hour === 0 ? 12 : hour;
  return {
    result: {
      status: "ambiguous",
      raw: raw ?? String(clockHour),
      hour: clockHour,
      minute,
      hasExplicitMeridiem: false,
      isAmbiguousHour: true,
    },
    source: `${source}_ambiguous`,
  };
}

/** Resolved HH:mm only when the utterance is unambiguous. */
export function extractPreferredTime(
  text: string,
  options?: ExtractTimeOptions
): string | undefined {
  const result = extractTimePreference(text, options);
  return result.status === "resolved" ? result.time : undefined;
}

/** Parses AM/PM answers while awaitingField is timeMeridiem. */
export function extractMeridiemAnswer(text: string): "am" | "pm" | null {
  const normalized = text.toLowerCase().trim();

  if (/\bp\.?m\.?\b/i.test(normalized)) return "pm";
  if (/\ba\.?m\.?\b/i.test(normalized)) return "am";
  if (/\b(evening|tonight|afternoon|night)\b/i.test(normalized)) return "pm";
  if (/\bmorning\b/i.test(normalized)) return "am";

  return null;
}

function isValidClock(hour: number, minute: number): boolean {
  return (
    Number.isFinite(hour) &&
    Number.isFinite(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
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
