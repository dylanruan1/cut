import { Decimal } from "@prisma/client/runtime/library";

/**
 * Recursively converts Prisma results into plain JSON-safe values
 * suitable for Server → Client Component props and Server Action returns.
 *
 * - Date → ISO string
 * - Decimal → number
 * - BigInt → string
 */
export type Serialize<T> = T extends Date
  ? string
  : T extends Decimal
    ? number
    : T extends bigint
      ? string
      : T extends Array<infer U>
        ? Serialize<U>[]
        : T extends object
          ? { [K in keyof T]: Serialize<T[K]> }
          : T;

function isDecimal(value: unknown): value is Decimal {
  return Decimal.isDecimal(value);
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isDecimal(value)) {
    return value.toNumber();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = serializeValue(nested);
    }
    return result;
  }

  return value;
}

export function serializeForClient<T>(value: T): Serialize<T> {
  return serializeValue(value) as Serialize<T>;
}

export function toNumber(
  value: Decimal | number | string | null | undefined
): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (isDecimal(value)) return value.toNumber();
  return Number(value);
}

export function toISOString(
  value: Date | string | null | undefined
): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}
