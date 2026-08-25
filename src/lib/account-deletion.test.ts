import { describe, it, expect } from "vitest";
import {
  DELETION_GRACE_DAYS,
  purgeDueAt,
  isPurgeDue,
  daysUntilPurge,
  isPendingDeletion,
  confirmationMatches,
} from "./account-deletion";

const REQUESTED = new Date("2026-08-01T12:00:00Z");
const DAY = 86_400_000;

describe("purgeDueAt", () => {
  it("is the grace window after the request", () => {
    expect(purgeDueAt(REQUESTED).toISOString()).toBe("2026-08-31T12:00:00.000Z");
  });
});

describe("isPurgeDue", () => {
  it("is false the moment deletion is requested", () => {
    expect(isPurgeDue(REQUESTED, REQUESTED)).toBe(false);
  });

  it("is false one second before the window closes", () => {
    const almost = new Date(purgeDueAt(REQUESTED).getTime() - 1000);
    expect(isPurgeDue(REQUESTED, almost)).toBe(false);
  });

  it("is true exactly when the window closes", () => {
    expect(isPurgeDue(REQUESTED, purgeDueAt(REQUESTED))).toBe(true);
  });

  it("is true long after", () => {
    const later = new Date(REQUESTED.getTime() + 400 * DAY);
    expect(isPurgeDue(REQUESTED, later)).toBe(true);
  });
});

describe("daysUntilPurge", () => {
  it("reports the full window on day zero", () => {
    expect(daysUntilPurge(REQUESTED, REQUESTED)).toBe(DELETION_GRACE_DAYS);
  });

  it("counts down", () => {
    const tenDaysIn = new Date(REQUESTED.getTime() + 10 * DAY);
    expect(daysUntilPurge(REQUESTED, tenDaysIn)).toBe(20);
  });

  it("still says 1 while a partial day remains", () => {
    // Half a day left: the data exists, so it must not read as 0.
    const nearlyDue = new Date(purgeDueAt(REQUESTED).getTime() - DAY / 2);
    expect(daysUntilPurge(REQUESTED, nearlyDue)).toBe(1);
  });

  it("floors at 0 once overdue", () => {
    const overdue = new Date(purgeDueAt(REQUESTED).getTime() + 5 * DAY);
    expect(daysUntilPurge(REQUESTED, overdue)).toBe(0);
  });
});

describe("isPendingDeletion", () => {
  it("is false for null and undefined", () => {
    expect(isPendingDeletion(null)).toBe(false);
    expect(isPendingDeletion(undefined)).toBe(false);
  });

  it("is true for a date", () => {
    expect(isPendingDeletion(REQUESTED)).toBe(true);
  });
});

describe("confirmationMatches", () => {
  it("accepts the exact shop name", () => {
    expect(confirmationMatches("Fades", "Fades")).toBe(true);
  });

  it("ignores case and surrounding space", () => {
    expect(confirmationMatches("  fades  ", "Fades")).toBe(true);
  });

  it("collapses repeated inner whitespace", () => {
    expect(confirmationMatches("fresh   cuts", "Fresh Cuts")).toBe(true);
  });

  it("rejects a near miss", () => {
    expect(confirmationMatches("Fade", "Fades")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(confirmationMatches("", "Fades")).toBe(false);
  });

  it("is never satisfiable when the shop name is blank", () => {
    // Otherwise an unnamed shop could be destroyed by submitting nothing.
    expect(confirmationMatches("", "")).toBe(false);
    expect(confirmationMatches("   ", "   ")).toBe(false);
  });
});
