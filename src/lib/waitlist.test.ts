import { describe, it, expect } from "vitest";
import {
  matchesTimePreference,
  matchingWaiters,
  localDateKey,
  buildWaitlistSms,
  type WaitlistCandidate,
} from "./waitlist";

const LA = "America/Los_Angeles";
const NY = "America/New_York";

/** 2026-08-29 is a Saturday. Times below are Pacific unless noted. */
const SAT_9AM = new Date("2026-08-29T16:00:00Z"); // 9am PT
const SAT_NOON = new Date("2026-08-29T19:00:00Z"); // 12pm PT
const SAT_3PM = new Date("2026-08-29T22:00:00Z"); // 3pm PT
const SAT_6PM = new Date("2026-08-30T01:00:00Z"); // 6pm PT (next day in UTC)

describe("matchesTimePreference", () => {
  it("ANY matches everything", () => {
    for (const t of [SAT_9AM, SAT_NOON, SAT_3PM, SAT_6PM]) {
      expect(matchesTimePreference(t, "ANY", LA)).toBe(true);
    }
  });

  it("puts 9am in the morning only", () => {
    expect(matchesTimePreference(SAT_9AM, "MORNING", LA)).toBe(true);
    expect(matchesTimePreference(SAT_9AM, "AFTERNOON", LA)).toBe(false);
    expect(matchesTimePreference(SAT_9AM, "EVENING", LA)).toBe(false);
  });

  it("counts noon as afternoon, not morning", () => {
    // Someone who said "afternoon" should not miss a 12:00 slot.
    expect(matchesTimePreference(SAT_NOON, "AFTERNOON", LA)).toBe(true);
    expect(matchesTimePreference(SAT_NOON, "MORNING", LA)).toBe(false);
  });

  it("puts 3pm in the afternoon and 6pm in the evening", () => {
    expect(matchesTimePreference(SAT_3PM, "AFTERNOON", LA)).toBe(true);
    expect(matchesTimePreference(SAT_6PM, "EVENING", LA)).toBe(true);
    expect(matchesTimePreference(SAT_6PM, "AFTERNOON", LA)).toBe(false);
  });

  it("judges by the shop's clock, not UTC", () => {
    // 6pm Pacific is already the next calendar day in UTC and 9pm in New York.
    expect(matchesTimePreference(SAT_6PM, "EVENING", LA)).toBe(true);
    expect(matchesTimePreference(SAT_6PM, "EVENING", NY)).toBe(true);
    // 9am Pacific is noon in New York — afternoon there, morning here.
    expect(matchesTimePreference(SAT_9AM, "MORNING", LA)).toBe(true);
    expect(matchesTimePreference(SAT_9AM, "MORNING", NY)).toBe(false);
    expect(matchesTimePreference(SAT_9AM, "AFTERNOON", NY)).toBe(true);
  });
});

describe("localDateKey", () => {
  it("keeps a late-evening slot on the shop's calendar day", () => {
    // The classic off-by-one: 6pm Saturday PT is Sunday in UTC.
    expect(localDateKey(SAT_6PM, LA)).toBe("2026-08-29");
    expect(SAT_6PM.toISOString().slice(0, 10)).toBe("2026-08-30");
  });
});

const base: WaitlistCandidate = {
  id: "w1",
  barberId: null,
  serviceId: "svc-haircut",
  date: "2026-08-29",
  timePreference: "ANY",
};

describe("matchingWaiters", () => {
  const slot = {
    startTime: SAT_3PM,
    barberId: "mike",
    serviceId: "svc-haircut",
  };

  it("matches an any-barber, any-time waiter on the right day", () => {
    expect(matchingWaiters(slot, [base], LA).map((w) => w.id)).toEqual(["w1"]);
  });

  it("excludes a different day", () => {
    const other = { ...base, id: "w2", date: "2026-08-30" };
    expect(matchingWaiters(slot, [other], LA)).toEqual([]);
  });

  it("excludes a waiter who wanted a different barber", () => {
    const wantsChris = { ...base, id: "w3", barberId: "chris" };
    expect(matchingWaiters(slot, [wantsChris], LA)).toEqual([]);
  });

  it("includes a waiter who named the same barber", () => {
    const wantsMike = { ...base, id: "w4", barberId: "mike" };
    expect(matchingWaiters(slot, [wantsMike], LA).map((w) => w.id)).toEqual(["w4"]);
  });

  it("excludes a time preference that doesn't cover the slot", () => {
    const morningOnly = { ...base, id: "w5", timePreference: "MORNING" as const };
    expect(matchingWaiters(slot, [morningOnly], LA)).toEqual([]);
  });

  it("matches across services — a filled chair beats an exact match", () => {
    const wantsBeard = { ...base, id: "w6", serviceId: "svc-beard" };
    expect(matchingWaiters(slot, [wantsBeard], LA).map((w) => w.id)).toEqual(["w6"]);
  });

  it("returns everyone who qualifies, not just the first", () => {
    const many = [
      base,
      { ...base, id: "w7", timePreference: "AFTERNOON" as const },
      { ...base, id: "w8", barberId: "mike" },
    ];
    expect(matchingWaiters(slot, many, LA).map((w) => w.id)).toEqual([
      "w1",
      "w7",
      "w8",
    ]);
  });

  it("uses the shop's day boundary for an evening slot", () => {
    const eveningSlot = { ...slot, startTime: SAT_6PM };
    // Entry is for Saturday; the slot is Sunday in UTC but Saturday locally.
    expect(matchingWaiters(eveningSlot, [base], LA).map((w) => w.id)).toEqual([
      "w1",
    ]);
  });
});

describe("buildWaitlistSms", () => {
  it("says plainly that it is first-come", () => {
    const msg = buildWaitlistSms(
      "Marcus",
      "Fades",
      "Saturday at 3:00 PM",
      "https://cutchair.com/book/fades"
    );
    expect(msg).toContain("Marcus");
    expect(msg).toContain("Fades");
    expect(msg).toContain("Saturday at 3:00 PM");
    // Several people get this at once; nobody should be surprised to lose.
    expect(msg.toLowerCase()).toContain("first to book");
  });
});
