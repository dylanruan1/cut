import { describe, it, expect } from "vitest";
import {
  isValidTime,
  toMinutes,
  validateDay,
  validateWeek,
  defaultWeek,
  toFullWeek,
  workingDayCount,
  describeDay,
  type WorkingHourInput,
} from "./working-hours";

function day(over: Partial<WorkingHourInput> = {}): WorkingHourInput {
  return {
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "18:00",
    isOff: false,
    ...over,
  };
}

describe("isValidTime", () => {
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
});

describe("toMinutes", () => {
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

  it("accepts a day off without checking its times", () => {
    // Times are ignored when off; demanding valid ones would be busywork.
    expect(validateDay(day({ isOff: true, startTime: "", endTime: "" }))).toEqual({
      ok: true,
    });
  });

  it("rejects finish before start", () => {
    const res = validateDay(day({ startTime: "18:00", endTime: "09:00" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("after start");
  });

  it("rejects equal start and finish", () => {
    expect(validateDay(day({ startTime: "09:00", endTime: "09:00" })).ok).toBe(
      false
    );
  });

  it("names the day in the error so it's findable in a week of inputs", () => {
    const res = validateDay(day({ dayOfWeek: 4, startTime: "bad" }));
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

  it("rejects a duplicated day", () => {
    const res = validateWeek([day({ dayOfWeek: 2 }), day({ dayOfWeek: 2 })]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("twice");
  });

  it("rejects a week with every day off", () => {
    // Nobody could ever book this barber — almost always a mistake.
    const allOff = defaultWeek().map((d) => ({ ...d, isOff: true }));
    const res = validateWeek(allOff);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Deactivate");
  });

  it("allows an empty list", () => {
    // Means "not configured", which the availability engine treats as always
    // available. Not the same as every day being off.
    expect(validateWeek([])).toEqual({ ok: true });
  });
});

describe("defaultWeek", () => {
  it("is Monday to Saturday with Sunday off", () => {
    const week = defaultWeek();
    expect(week).toHaveLength(7);
    expect(week[0].isOff).toBe(true); // Sunday
    expect(workingDayCount(week)).toBe(6);
  });
});

describe("toFullWeek", () => {
  it("fills in days the barber has no row for", () => {
    const partial = [day({ dayOfWeek: 3, startTime: "11:00", endTime: "20:00" })];
    const full = toFullWeek(partial);
    expect(full).toHaveLength(7);
    expect(full[3].startTime).toBe("11:00");
    expect(full[3].endTime).toBe("20:00");
    // Untouched days fall back to the default rather than vanishing.
    expect(full[1].startTime).toBe("09:00");
  });

  it("returns a whole week for a barber with nothing saved", () => {
    expect(toFullWeek([])).toHaveLength(7);
  });
});

describe("describeDay", () => {
  it("says Off for a day off", () => {
    expect(describeDay(day({ isOff: true }))).toBe("Off");
  });

  it("shows the range otherwise", () => {
    expect(describeDay(day())).toBe("09:00–18:00");
  });
});
