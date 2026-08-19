import { describe, it, expect } from "vitest";
import {
  shouldRefundDeposit,
  isCancellable,
  hoursUntil,
  FREE_CANCELLATION_HOURS,
} from "./cancellation-policy";

const NOW = new Date("2026-08-10T12:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("hoursUntil", () => {
  it("is positive for future and negative for past", () => {
    expect(hoursUntil(inHours(5), NOW)).toBeCloseTo(5);
    expect(hoursUntil(inHours(-3), NOW)).toBeCloseTo(-3);
  });
});

describe("shouldRefundDeposit", () => {
  it("refunds when cancelling well ahead", () => {
    expect(
      shouldRefundDeposit({ depositStatus: "PAID", startTime: inHours(48), now: NOW })
    ).toBe(true);
  });

  it("refunds exactly at the cutoff", () => {
    expect(
      shouldRefundDeposit({
        depositStatus: "PAID",
        startTime: inHours(FREE_CANCELLATION_HOURS),
        now: NOW,
      })
    ).toBe(true);
  });

  it("does not refund just inside the cutoff", () => {
    expect(
      shouldRefundDeposit({
        depositStatus: "PAID",
        startTime: inHours(FREE_CANCELLATION_HOURS - 0.5),
        now: NOW,
      })
    ).toBe(false);
  });

  it("does not refund a last-minute cancellation", () => {
    expect(
      shouldRefundDeposit({ depositStatus: "PAID", startTime: inHours(2), now: NOW })
    ).toBe(false);
  });

  it("never refunds when no deposit was paid", () => {
    for (const status of ["NONE", "PENDING", "FAILED", "REFUNDED"]) {
      expect(
        shouldRefundDeposit({ depositStatus: status, startTime: inHours(72), now: NOW })
      ).toBe(false);
    }
  });

  it("does not refund an appointment already in the past", () => {
    expect(
      shouldRefundDeposit({ depositStatus: "PAID", startTime: inHours(-1), now: NOW })
    ).toBe(false);
  });
});

describe("isCancellable", () => {
  it("allows cancelling an upcoming confirmed booking", () => {
    expect(
      isCancellable({ status: "CONFIRMED", startTime: inHours(3), now: NOW })
    ).toBe(true);
  });

  it("allows cancelling shortly before, even without a refund", () => {
    expect(
      isCancellable({ status: "CONFIRMED", startTime: inHours(0.5), now: NOW })
    ).toBe(true);
  });

  it("blocks appointments that already started", () => {
    expect(
      isCancellable({ status: "CONFIRMED", startTime: inHours(-0.5), now: NOW })
    ).toBe(false);
  });

  it("blocks already cancelled or completed bookings", () => {
    expect(
      isCancellable({ status: "CANCELLED", startTime: inHours(5), now: NOW })
    ).toBe(false);
    expect(
      isCancellable({ status: "COMPLETED", startTime: inHours(5), now: NOW })
    ).toBe(false);
  });
});
