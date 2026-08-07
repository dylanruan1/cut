import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const onboardingSchema = z.object({
  shopName: z.string().min(2, "Shop name must be at least 2 characters"),
  timezone: z.string().min(1, "Timezone is required").default("America/Los_Angeles"),
  address: z.string().optional(),
  phone: z.string().optional(),
  firstBarberName: z.string().optional(),
  services: z
    .array(z.enum(["haircut", "beard", "lineup", "custom"]))
    .min(1, "Select at least one starting service")
    .default(["haircut", "beard", "lineup"]),
  customServiceName: z.string().optional(),
});

export const magicLinkSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const appointmentSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  clientPhone: z.string().min(10, "Valid phone number required"),
  clientEmail: z.string().email().optional().or(z.literal("")),
  serviceId: z.string().min(1, "Service is required"),
  barberId: z.string().min(1, "Barber is required"),
  startTime: z.string().min(1, "Start time is required"),
  notes: z.string().optional(),
  status: z.enum(["CONFIRMED", "PENDING", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  depositStatus: z.enum(["NONE", "PENDING", "PAID", "REFUNDED"]).optional(),
});

export const serviceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  duration: z.coerce.number().min(5, "Minimum 5 minutes"),
  price: z.coerce.number().min(0, "Price must be positive"),
  color: z.string().optional(),
  /** Optional upfront deposit. 0 / empty means no deposit required. */
  depositAmount: z.coerce.number().min(0).optional().nullable(),
});

export const barberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  color: z.string().optional(),
});

export const phoneSetupMethodSchema = z.enum([
  "NEW_TWILIO",
  "FORWARD_EXISTING",
  "PORT_TO_TWILIO",
]);

export const phoneSetupStatusSchema = z.enum([
  "NOT_STARTED",
  "PENDING",
  "CONNECTED",
  "ERROR",
]);

export const shopSettingsSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  instagram: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  twilioPhone: z.string().optional(),
  phoneSetupMethod: phoneSetupMethodSchema.optional().nullable(),
  phoneSetupStatus: phoneSetupStatusSchema.optional(),
  phonePortingNotes: z.string().optional().nullable(),
});

export const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.enum(["BARBER", "RECEPTIONIST"]),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type BarberInput = z.infer<typeof barberSchema>;
export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
