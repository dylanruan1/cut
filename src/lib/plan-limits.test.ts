import { describe, it, expect } from "vitest";
import {
  includedBarbers,
  billableSeats,
  monthlyTotal,
  checkAddBarber,
  aiCallUsageState,
  smsUsageState,
  shouldAnswerCall,
  callsRemaining,
} from "@/lib/plan-limits";
import {
  PER_BARBER_PRICE,
  AI_CALLS_WARN_THRESHOLD,
  AI_CALLS_HARD_CEILING,
  SMS_WARN_THRESHOLD,
} from "@/lib/subscription";

describe("seat counting", () => {
  it("includes 1 barber on Starter and 6 on Pro", () => {
    expect(includedBarbers("STARTER")).toBe(1);
    expect(includedBarbers("PRO")).toBe(6);
    expect(includedBarbers("AI_RECEPTIONIST")).toBe(6);
  });

  it("bills nothing extra at or under the included count", () => {
    expect(billableSeats("PRO", 1)).toBe(0);
    expect(billableSeats("PRO", 6)).toBe(0);
  });

  it("bills each barber past the included count", () => {
    expect(billableSeats("PRO", 7)).toBe(1);
    expect(billableSeats("PRO", 10)).toBe(4);
  });

  it("never returns negative seats for an under-full shop", () => {
    // A Pro shop with two barbers is not owed four seats back.
    expect(billableSeats("PRO", 2)).toBe(0);
    expect(billableSeats("STARTER", 0)).toBe(0);
  });

  it("charges a solo barber on Starter nothing extra", () => {
    expect(billableSeats("STARTER", 1)).toBe(0);
  });

  it("bills a second barber on Starter, which is the upgrade nudge", () => {
    expect(billableSeats("STARTER", 2)).toBe(1);
  });
});

describe("monthly total", () => {
  it("is the base price when under the seat cap", () => {
    expect(monthlyTotal("PRO", 4)).toBe(99);
  });

  it("adds per-seat cost above the cap", () => {
    expect(monthlyTotal("PRO", 9)).toBe(99 + 3 * PER_BARBER_PRICE);
  });

  it("returns null for the placeholder plan with no price", () => {
    expect(monthlyTotal("NONE", 3)).toBeNull();
  });

  it("honours a founding-price override", () => {
    // A founding shop at $199 still pays list price for extra seats.
    expect(monthlyTotal("AI_RECEPTIONIST", 8, 199)).toBe(
      199 + 2 * PER_BARBER_PRICE
    );
  });
});

describe("adding a barber", () => {
  it("is free and unflagged while seats remain", () => {
    expect(checkAddBarber("PRO", 3)).toEqual({ allowed: true, billable: false });
  });

  it("is allowed but priced once the cap is passed", () => {
    // Never blocked. Turning a growing shop away is worse than billing them.
    const r = checkAddBarber("PRO", 6);
    expect(r.allowed).toBe(true);
    expect(r).toMatchObject({ billable: true, seats: 1 });
  });

  it("quotes the cumulative cost, not just the newest seat", () => {
    const r = checkAddBarber("PRO", 8);
    expect(r).toMatchObject({
      billable: true,
      seats: 3,
      additionalCost: 3 * PER_BARBER_PRICE,
    });
  });
});

describe("AI call ceilings", () => {
  it("is ok for a normal month", () => {
    expect(aiCallUsageState(150)).toBe("ok");
  });

  it("warns exactly at the threshold, not one past it", () => {
    expect(aiCallUsageState(AI_CALLS_WARN_THRESHOLD - 1)).toBe("ok");
    expect(aiCallUsageState(AI_CALLS_WARN_THRESHOLD)).toBe("warn");
  });

  it("blocks exactly at the ceiling", () => {
    expect(aiCallUsageState(AI_CALLS_HARD_CEILING - 1)).toBe("warn");
    expect(aiCallUsageState(AI_CALLS_HARD_CEILING)).toBe("blocked");
  });

  it("stays blocked well past the ceiling", () => {
    expect(aiCallUsageState(5000)).toBe("blocked");
  });

  it("answers calls right up to the ceiling", () => {
    expect(shouldAnswerCall(AI_CALLS_HARD_CEILING - 1)).toBe(true);
    expect(shouldAnswerCall(AI_CALLS_HARD_CEILING)).toBe(false);
  });

  it("leaves a busy but legitimate shop untouched", () => {
    // 400 calls a month is a genuinely busy 6-chair shop and still profitable.
    expect(shouldAnswerCall(400)).toBe(true);
    expect(aiCallUsageState(400)).toBe("warn");
  });

  it("reports remaining calls without going negative", () => {
    expect(callsRemaining(0)).toBe(AI_CALLS_HARD_CEILING);
    expect(callsRemaining(AI_CALLS_HARD_CEILING + 500)).toBe(0);
  });
});

describe("SMS ceilings", () => {
  it("warns at the threshold", () => {
    expect(smsUsageState(SMS_WARN_THRESHOLD - 1)).toBe("ok");
    expect(smsUsageState(SMS_WARN_THRESHOLD)).toBe("warn");
  });

  it("never blocks, however high it goes", () => {
    // A reminder that does not send costs the shop a no-show worth more than
    // the message. There is deliberately no hard stop here.
    expect(smsUsageState(100_000)).not.toBe("blocked");
  });
});
