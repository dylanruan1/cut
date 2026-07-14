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

export type AwaitingField = BookingField | null;

export type ParsedBookingRequest = {
  intent: ReceptionistIntent;
  clientName?: string;
  serviceName?: string;
  barberName?: string;
  /** ISO date string YYYY-MM-DD when resolved */
  preferredDate?: string;
  /** 24h time HH:mm when resolved */
  preferredTime?: string;
  /** Explicit confirmation for final booking step */
  confirmed?: boolean;
  /** Skip preferred barber (any available) */
  anyBarber?: boolean;
  rawText: string;
  confidence: number;
  missingFields: BookingField[];
};

export type CallSessionContext = {
  awaitingField?: AwaitingField;
  lastPrompt?: string;
  promptRepeatCount?: number;
  turnCount?: number;
  barberAsked?: boolean;
  anyBarber?: boolean;
  confirmed?: boolean;
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
  };
  conversationHistory?: ReceptionistMessage[];
  /** Override "now" for deterministic tests */
  now?: Date;
  turnCount?: number;
  promptRepeatCount?: number;
  lastPrompt?: string;
};

export type ReceptionistProvider = "rules" | "openai";

export const MAX_TURN_COUNT = 20;
export const MAX_PROMPT_REPEATS = 2;
export const SESSION_TTL_HOURS = 2;
