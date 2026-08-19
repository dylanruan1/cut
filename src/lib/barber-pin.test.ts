import { describe, it, expect } from "vitest";
import { validatePinFormat, hashPin, verifyPin } from "./barber-pin";

describe("validatePinFormat", () => {
  it("accepts a normal 4-digit PIN", () => {
    expect(validatePinFormat("4821")).toEqual({ ok: true });
  });

  it("rejects anything that isn't exactly 4 digits", () => {
    for (const bad of ["", "123", "12345", "abcd", "12a4"]) {
      expect(validatePinFormat(bad).ok).toBe(false);
    }
  });

  it("rejects PINs a customer could guess while holding the phone", () => {
    for (const weak of ["0000", "1111", "1234", "4321", "6969"]) {
      const result = validatePinFormat(weak);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/guess/i);
    }
  });
});

describe("hashPin / verifyPin", () => {
  it("round-trips a correct PIN", async () => {
    const hash = await hashPin("4821");
    expect(await verifyPin("4821", hash)).toBe(true);
  });

  it("never stores the PIN in plain text", async () => {
    const hash = await hashPin("4821");
    expect(hash).not.toContain("4821");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("rejects a wrong PIN", async () => {
    const hash = await hashPin("4821");
    expect(await verifyPin("4822", hash)).toBe(false);
  });

  it("rejects when the barber has no PIN set", async () => {
    expect(await verifyPin("4821", null)).toBe(false);
    expect(await verifyPin("4821", undefined)).toBe(false);
  });

  it("rejects malformed input", async () => {
    const hash = await hashPin("4821");
    expect(await verifyPin("", hash)).toBe(false);
    expect(await verifyPin("48210", hash)).toBe(false);
  });

  it("produces a different hash each time for the same PIN", async () => {
    const a = await hashPin("4821");
    const b = await hashPin("4821");
    expect(a).not.toBe(b);
    expect(await verifyPin("4821", a)).toBe(true);
    expect(await verifyPin("4821", b)).toBe(true);
  });
});
