import { describe, it, expect } from "vitest";
import {
  cn,
  formatCurrency,
  formatPhone,
  generateSlug,
  getInitials,
  getAppointmentClientName,
} from "@/lib/utils";

describe("utils", () => {
  it("cn merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("formatCurrency formats USD", () => {
    expect(formatCurrency(35)).toBe("$35.00");
    expect(formatCurrency(35.5)).toBe("$35.50");
  });

  it("formatPhone formats US numbers", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
    expect(formatPhone("15551234567")).toBe("+1 (555) 123-4567");
  });

  it("generateSlug creates URL-safe slugs", () => {
    expect(generateSlug("The Gentleman's Cut")).toBe("the-gentleman-s-cut");
    expect(generateSlug("  My Shop  ")).toBe("my-shop");
  });

  it("getInitials returns uppercase initials", () => {
    expect(getInitials("John Smith")).toBe("JS");
    expect(getInitials("Alice")).toBe("A");
  });
});

describe("getAppointmentClientName", () => {
  it("prefers clientNameSnapshot over client.name", () => {
    expect(
      getAppointmentClientName({
        clientNameSnapshot: "Jeff",
        client: { name: "Dylan" },
      })
    ).toBe("Jeff");
  });

  it("falls back to client.name when snapshot is null", () => {
    expect(
      getAppointmentClientName({
        clientNameSnapshot: null,
        client: { name: "Dylan" },
      })
    ).toBe("Dylan");
  });

  it("keeps old Dylan display when new booking used Jeff snapshot only on the new apt", () => {
    const oldApt = {
      clientNameSnapshot: "Dylan",
      client: { name: "Dylan" },
    };
    const newApt = {
      clientNameSnapshot: "Jeff",
      client: { name: "Dylan" },
    };
    expect(getAppointmentClientName(oldApt)).toBe("Dylan");
    expect(getAppointmentClientName(newApt)).toBe("Jeff");
  });
});
