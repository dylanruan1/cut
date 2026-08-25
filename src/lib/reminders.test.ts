import { describe, it, expect } from "vitest";
import {
  reminderWindow,
  describeWhen,
  hoursUntil,
  REMINDER_LOG_TYPE,
} from "./reminders";

const LA = "America/Los_Angeles";
const HOUR = 3_600_000;

// 9:00am Pacific on a Monday — the time the daily cron actually runs.
const NINE_AM_PT = new Date("2026-08-17T16:00:00Z");

function inWindow(kind: "day_before" | "same_day", start: Date, now: Date) {
  const w = reminderWindow(kind, now);
  return start >= w.start && start < w.end;
}

describe("reminderWindow — the daily 9am run", () => {
  it("catches an appointment tomorrow morning", () => {
    const start = new Date("2026-08-18T16:00:00Z"); // 9am PT tomorrow, 24h out
    expect(inWindow("day_before", start, NINE_AM_PT)).toBe(true);
  });

  it("catches an appointment late tomorrow afternoon", () => {
    // 5pm PT tomorrow = 32h out. The old ±15min window missed this entirely.
    const start = new Date("2026-08-19T00:00:00Z");
    expect(inWindow("day_before", start, NINE_AM_PT)).toBe(true);
  });

  it("catches an appointment later today", () => {
    const start = new Date("2026-08-17T22:00:00Z"); // 3pm PT, 6h out
    expect(inWindow("same_day", start, NINE_AM_PT)).toBe(true);
  });

  it("never puts one appointment in both windows", () => {
    for (let h = 0; h <= 40; h++) {
      const start = new Date(NINE_AM_PT.getTime() + h * HOUR);
      const both =
        inWindow("day_before", start, NINE_AM_PT) &&
        inWindow("same_day", start, NINE_AM_PT);
      expect(both).toBe(false);
    }
  });

  it("covers every appointment in the next 36 hours", () => {
    // The point of the change: nobody in range falls through the gap.
    for (let h = 1; h <= 35; h++) {
      const start = new Date(NINE_AM_PT.getTime() + h * HOUR);
      const covered =
        inWindow("day_before", start, NINE_AM_PT) ||
        inWindow("same_day", start, NINE_AM_PT);
      expect(covered, `${h}h out was not covered`).toBe(true);
    }
  });

  it("ignores appointments that already started", () => {
    const past = new Date(NINE_AM_PT.getTime() - HOUR);
    expect(inWindow("same_day", past, NINE_AM_PT)).toBe(false);
    expect(inWindow("day_before", past, NINE_AM_PT)).toBe(false);
  });
});

describe("hoursUntil", () => {
  it("is negative once the appointment has begun", () => {
    expect(hoursUntil(new Date(NINE_AM_PT.getTime() - HOUR), NINE_AM_PT)).toBe(-1);
  });
});

describe("describeWhen", () => {
  it("says 'in under an hour' when it's imminent", () => {
    const start = new Date(NINE_AM_PT.getTime() + 30 * 60 * 1000);
    expect(describeWhen(start, NINE_AM_PT, LA)).toBe("in under an hour");
  });

  it("counts hours when it's close", () => {
    const start = new Date(NINE_AM_PT.getTime() + 2 * HOUR);
    expect(describeWhen(start, NINE_AM_PT, LA)).toBe("in about 2 hours");
  });

  it("says 'today' with a clock time for later the same day", () => {
    const start = new Date("2026-08-17T22:00:00Z"); // 3pm PT
    expect(describeWhen(start, NINE_AM_PT, LA)).toBe("today at 3:00 PM");
  });

  it("says 'tomorrow' with a clock time", () => {
    const start = new Date("2026-08-18T17:30:00Z"); // 10:30am PT tomorrow
    expect(describeWhen(start, NINE_AM_PT, LA)).toBe("tomorrow at 10:30 AM");
  });

  it("names the weekday when it's further out", () => {
    const start = new Date("2026-08-20T17:00:00Z"); // Thursday 10am PT
    expect(describeWhen(start, NINE_AM_PT, LA)).toBe("on Thursday at 10:00 AM");
  });

  it("uses the shop's timezone, not the server's", () => {
    // 11pm PT is already the next day in UTC. Naive maths would say "tomorrow".
    const now = new Date("2026-08-17T20:00:00Z"); // 1pm PT
    const start = new Date("2026-08-18T06:00:00Z"); // 11pm PT same day
    expect(describeWhen(start, now, LA)).toBe("today at 11:00 PM");
  });
});

describe("REMINDER_LOG_TYPE", () => {
  it("keeps the original log keys so nobody is texted twice", () => {
    expect(REMINDER_LOG_TYPE.day_before).toBe("reminder_24h");
    expect(REMINDER_LOG_TYPE.same_day).toBe("reminder_2h");
  });
});
