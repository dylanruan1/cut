import { describe, it, expect } from "vitest";
import {
  getStatusColor,
  getStatusLabel,
  formatDuration,
  generateTimeSlots,
  isTimeSlotAvailable,
} from "@/lib/dates";

describe("dates", () => {
  it("getStatusColor returns correct classes", () => {
    expect(getStatusColor("CONFIRMED")).toContain("green");
    expect(getStatusColor("CANCELLED")).toContain("gray");
    expect(getStatusColor("NO_SHOW")).toContain("red");
  });

  it("getStatusLabel formats status labels", () => {
    expect(getStatusLabel("CONFIRMED")).toBe("Confirmed");
    expect(getStatusLabel("NO_SHOW")).toBe("No Show");
  });

  it("formatDuration formats minutes", () => {
    expect(formatDuration(30)).toBe("30m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("generateTimeSlots creates time slots", () => {
    const slots = generateTimeSlots("09:00", "11:00", 30);
    expect(slots).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("isTimeSlotAvailable detects conflicts", () => {
    const slotStart = new Date("2026-01-15T10:00:00");
    const slotEnd = new Date("2026-01-15T10:30:00");
    const appointments = [
      {
        startTime: new Date("2026-01-15T10:00:00"),
        endTime: new Date("2026-01-15T10:30:00"),
      },
    ];
    expect(isTimeSlotAvailable(slotStart, slotEnd, appointments)).toBe(false);

    const freeStart = new Date("2026-01-15T11:00:00");
    const freeEnd = new Date("2026-01-15T11:30:00");
    expect(isTimeSlotAvailable(freeStart, freeEnd, appointments)).toBe(true);
  });
});
