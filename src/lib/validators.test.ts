import { describe, it, expect } from "vitest";
import { loginSchema, signupSchema, appointmentSchema } from "@/lib/validators";

describe("validators", () => {
  it("loginSchema validates email and password", () => {
    const valid = loginSchema.safeParse({ email: "test@example.com", password: "password123" });
    expect(valid.success).toBe(true);

    const invalid = loginSchema.safeParse({ email: "bad", password: "short" });
    expect(invalid.success).toBe(false);
  });

  it("signupSchema validates signup fields", () => {
    const valid = signupSchema.safeParse({
      name: "John",
      email: "john@example.com",
      password: "password123",
    });
    expect(valid.success).toBe(true);

    const stillAllowsExtraShopName = signupSchema.safeParse({
      name: "John",
      email: "john@example.com",
      password: "password123",
      shopName: "Ignored by schema",
    });
    expect(stillAllowsExtraShopName.success).toBe(true);
  });

  it("appointmentSchema validates appointment data", () => {
    const valid = appointmentSchema.safeParse({
      clientName: "Jane Doe",
      clientPhone: "5551234567",
      serviceId: "svc_1",
      barberId: "barber_1",
      startTime: "2026-01-15T10:00:00",
    });
    expect(valid.success).toBe(true);

    const invalid = appointmentSchema.safeParse({
      clientName: "",
      clientPhone: "123",
      serviceId: "",
      barberId: "",
      startTime: "",
    });
    expect(invalid.success).toBe(false);
  });
});
