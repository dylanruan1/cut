export type ReceptionistIntent =
  | "book_appointment"
  | "reschedule_appointment"
  | "cancel_appointment"
  | "ask_hours"
  | "ask_services"
  | "ask_location"
  | "unknown";

export type ReceptionistMessageRole = "user" | "assistant" | "system";

export type ReceptionistMessage = {
  role: ReceptionistMessageRole;
  content: string;
  timestamp?: string;
};

export type BookingField =
  | "clientName"
  | "serviceName"
  | "preferredDate"
  | "preferredTime"
  | "barberName"
  | "confirmation";

/** Includes timeMeridiem for AM/PM disambiguation mid-flow. */
export type AwaitingField = BookingField | "timeMeridiem" | null;

/** Ambiguous hour-only time awaiting AM/PM (1–12 clock hour). */
export type AmbiguousTime = {
  hour: number;
  minute: number;
};

export type ParsedBookingRequest = {
  intent: ReceptionistIntent;
  /**
   * Name the caller gave on THIS call. NEVER auto-filled from a matched
   * Client record, a previous call session, or an appointment snapshot —
   * the receptionist always asks "What name should I put the appointment
   * under?" when this is empty.
   */
  clientName?: string;
  /** True once the caller has spoken a name on this call. */
  confirmedClientName?: boolean;
  serviceName?: string;
  barberName?: string;
  /** ISO date string YYYY-MM-DD when resolved */
  preferredDate?: string;
  /** 24h time HH:mm when resolved */
  preferredTime?: string;
  /** Original spoken time fragment, e.g. "8" or "8 PM" */
  preferredTimeRaw?: string;
  /** True only when the caller explicitly said AM/PM */
  hasExplicitMeridiem?: boolean;
  /** True for unresolved bare 1-12 hour requests */
  isAmbiguousHour?: boolean;
  /** Hour-only preference pending AM/PM choice */
  ambiguousTime?: AmbiguousTime;
  /** Explicit confirmation for final booking step */
  confirmed?: boolean;
  /** Skip preferred barber (any available) */
  anyBarber?: boolean;
  rawText: string;
  confidence: number;
  missingFields: BookingField[];
};

export type CallSessionContext = {
  /** Spoken language for this call ("en" | "es") — sticks once detected. */
  language?: string;
  awaitingField?: AwaitingField;
  lastPrompt?: string;
  promptRepeatCount?: number;
  turnCount?: number;
  barberAsked?: boolean;
  anyBarber?: boolean;
  confirmed?: boolean;
  preferredTimeRaw?: string;
  hasExplicitMeridiem?: boolean;
  isAmbiguousHour?: boolean;
  /** Pending ambiguous clock hour while awaitingField is timeMeridiem */
  pendingAmbiguousHour?: number;
  pendingAmbiguousMinute?: number;
  messages?: ReceptionistMessage[];
};

export type AvailabilityOption = {
  startTime: string;
  endTime: string;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
};

export type BookingResult = {
  success: boolean;
  appointmentId?: string;
  message: string;
  error?: string;
};

export type ReceptionistResponse = {
  speak: string;
  intent: ReceptionistIntent;
  parsed: ParsedBookingRequest;
  shouldContinue: boolean;
  awaitingField?: AwaitingField;
  bookingResult?: BookingResult;
  availabilityOptions?: AvailabilityOption[];
  sessionComplete?: boolean;
};

export type ShopContext = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  services: Array<{ id: string; name: string; duration: number }>;
  barbers: Array<{ id: string; name: string }>;
  businessHours: Array<{
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }>;
};

export type ProcessReceptionistInput = {
  text: string;
  callerPhone: string;
  shop: ShopContext;
  /** Prior partial booking state from the call session */
  session?: Partial<ParsedBookingRequest> & {
    awaitingField?: AwaitingField;
    anyBarber?: boolean;
    confirmed?: boolean;
    barberAsked?: boolean;
    ambiguousTime?: AmbiguousTime;
  };
  conversationHistory?: ReceptionistMessage[];
  /** Override "now" for deterministic tests */
  now?: Date;
  turnCount?: number;
  promptRepeatCount?: number;
  lastPrompt?: string;
};

export type ReceptionistProvider = "rules" | "openai" | "claude";

export const MAX_TURN_COUNT = 20;
export const MAX_PROMPT_REPEATS = 2;
export const SESSION_TTL_HOURS = 2;
