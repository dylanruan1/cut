import bcrypt from "bcryptjs";

/**
 * Barber verification PINs.
 *
 * The barber memorises a 4-digit PIN and types it on the *customer's* phone to
 * confirm a cash payment. That's deliberate: it needs no device at the station,
 * no app open, and no account — just something the barber knows and the
 * customer doesn't.
 *
 * PINs are bcrypt-hashed and never returned in plain text after being set.
 */

const PIN_LENGTH = 4;
const BCRYPT_ROUNDS = 10;

/** PINs that are trivially guessable by a customer holding the phone. */
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "0123", "1212", "6969", "1004", "2000", "1122",
]);

export type PinValidation = { ok: true } | { ok: false; error: string };

export function validatePinFormat(pin: string): PinValidation {
  const clean = (pin ?? "").trim();
  if (!/^\d{4}$/.test(clean)) {
    return { ok: false, error: "PIN must be exactly 4 digits." };
  }
  if (WEAK_PINS.has(clean)) {
    return {
      ok: false,
      error: "That PIN is too easy to guess. Pick something less obvious.",
    };
  }
  return { ok: true };
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin.trim(), BCRYPT_ROUNDS);
}

export async function verifyPin(
  pin: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) return false;
  const clean = (pin ?? "").trim();
  if (!/^\d{4}$/.test(clean)) return false;
  return bcrypt.compare(clean, hash);
}

export { PIN_LENGTH };
