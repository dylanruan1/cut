import { describe, it, expect } from "vitest";
import {
  isValidTime,
  toMinutes,
  validateDay,
  validateWeek,
  defaultWeek,
  toFullWeek,
  openDayCount,
  describeDay,
  type BusinessHourInput,
} from "./business-hours";

function day(over: Partial<BusinessHourInput> = {}): BusinessHourInput {
  return {
    dayOfWeek: 1,
    openTime: "09:00",
    closeTime: "18:00",
    isClosed: false,
    ...over,
  };
}

describe("time primitives", () => {
  // Re-exported from working-hours rather than redefined; this is the check
  // that the re-export actually points at something.
  it("accepts 24-hour times", () => {
    for (const t of ["00:00", "09:30", "13:45", "23:59"]) {
      expect(isValidTime(t)).toBe(true);
    }
  });

  it("rejects malformed times", () => {
    for (const t of ["9:00", "24:00", "12:60", "0900", "noon", ""]) {
      expect(isValidTime(t)).toBe(false);
    }
  });

  it("converts to minutes since midnight", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("returns null for rubbish", () => {
    expect(toMinutes("25:00")).toBeNull();
  });
});

describe("validateDay", () => {
  it("accepts a normal day", () => {
    expect(validateDay(day())).toEqual({ ok: true });
  });

  it("accepts a closed day without checking its times", () => {
    // Times are ignored when closed; demanding valid ones would be busywork.
    expect(
      validateDay(day({ isClosed: true, openTime: "", closeTime: "" }))
    ).toEqual({ ok: true });
  });

  it("rejects closing before opening", () => {
    const res = validateDay(day({ openTime: "18:00", closeTime: "09:00" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("after opening");
  });

  it("rejects equal open and close", () => {
    expect(validateDay(day({ openTime: "09:00", closeTime: "09:00" })).ok).toBe(
      false
    );
  });

  it("accepts a late close, which is the whole point of this editor", () => {
    expect(validateDay(day({ openTime: "10:00", closeTime: "20:00" }))).toEqual({
      ok: true,
    });
  });

  it("names the day in the error so it's findable in a week of inputs", () => {
    const res = validateDay(day({ dayOfWeek: 4, openTime: "bad" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Thursday");
  });

  it("rejects an out-of-range day", () => {
    expect(validateDay(day({ dayOfWeek: 7 })).ok).toBe(false);
    expect(validateDay(day({ dayOfWeek: -1 })).ok).toBe(false);
  });
});

describe("validateWeek", () => {
  it("accepts the default week", () => {
    expect(validateWeek(defaultWeek())).toEqual({ ok: true });
  });

  it("accepts a shop that opens on Sunday", () => {
    // The case the seeded week made impossible.
    const week = defaultWeek().map((d) =>
      d.dayOfWeek === 0 ? { ...d, isClosed: false, closeTime: "20:00" } : d
    );
    expect(validateWeek(week)).toEqual({ ok: true });
    expect(openDayCount(week)).toBe(7);
  });

  it("rejects a duplicated day", () => {
    const res = validateWeek([day({ dayOfWeek: 2 }), day({ dayOfWeek: 2 })]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("twice");
  });

  it("rejects a week with every day closed", () => {
    // A shop nobody could ever book — almost always a mistake.
    const allClosed = defaultWeek().map((d) => ({ ...d, isClosed: true }));
    const res = validateWeek(allClosed);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("nobody could ever book");
  });

  it("accepts a week with a single day open", () => {
    const oneDay = defaultWeek().map((d) => ({
      ...d,
      isClosed: d.dayOfWeek !== 6,
    }));
    expect(validateWeek(oneDay)).toEqual({ ok: true });
  });

  it("surfaces a bad day's error from inside a week", () => {
    const week = defaultWeek().map((d) =>
      d.dayOfWeek === 3 ? { ...d, closeTime: "08:00" } : d
    );
    const res = validateWeek(week);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Wednesday");
  });

  it("allows an empty list", () => {
    // Means "not configured", which is not the same as every day being closed.
    expect(validateWeek([])).toEqual({ ok: true });
  });
});

describe("defaultWeek", () => {
  it("is Monday to Saturday with Sunday closed", () => {
    const week = defaultWeek();
    expect(week).toHaveLength(7);
    expect(week[0].isClosed).toBe(true); // Sunday
    expect(openDayCount(week)).toBe(6);
  });

  it("matches the hours onboarding seeds", () => {
    expect(defaultWeek()[1]).toMatchObject({
      openTime: "09:00",
      closeTime: "18:00",
      isClosed: false,
    });
  });
});

describe("toFullWeek", () => {
  it("fills in days the shop has no row for", () => {
    const partial = [day({ dayOfWeek: 3, openTime: "11:00", closeTime: "20:00" })];
    const full = toFullWeek(partial);
    expect(full).toHaveLength(7);
    expect(full[3].openTime).toBe("11:00");
    expect(full[3].closeTime).toBe("20:00");
    // Untouched days fall back to the default rather than vanishing.
    expect(full[1].openTime).toBe("09:00");
  });

  it("returns a whole week for a shop with nothing saved", () => {
    expect(toFullWeek([])).toHaveLength(7);
  });

  it("keeps a saved closed day closed", () => {
    const full = toFullWeek([day({ dayOfWeek: 2, isClosed: true })]);
    expect(full[2].isClosed).toBe(true);
  });

  it("keeps days in Sunday-first order", () => {
    const full = toFullWeek([day({ dayOfWeek: 5 }), day({ dayOfWeek: 0 })]);
    expect(full.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("describeDay", () => {
  it("says Closed for a closed day", () => {
    expect(describeDay(day({ isClosed: true }))).toBe("Closed");
  });

  it("shows the range otherwise", () => {
    expect(describeDay(day())).toBe("09:00–18:00");
  });
});
