import { describe, it, expect } from "vitest";
import { findAvailability } from "./availability";
import type { ShopContext } from "./types";

/**
 * Availability rules the booking engine must never get wrong. These cover the
 * bugs found in the August audit: barber schedules, holidays, service
 * eligibility, and past-time slots.
 */

const TZ = "America/Los_Angeles";
// A Wednesday, comfortably in the future so lead-time never interferes.
const DATE = "2027-03-10";
const WEDNESDAY = 3;

function shop(overrides: Partial<ShopContext> = {}): ShopContext {
  return {
    id: "shop_1",
    name: "Test Shop",
    address: null,
    phone: null,
    timezone: TZ,
    services: [
      { id: "svc_cut", name: "Haircut", duration: 30 },
      { id: "svc_fade", name: "Fade", duration: 60 },
    ],
    barbers: [{ id: "b1", name: "Ann" }],
    businessHours: Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d,
      openTime: "09:00",
      closeTime: "17:00",
      isClosed: false,
    })),
    ...overrides,
  };
}

function run(s: ShopContext, opts: Partial<Parameters<typeof findAvailability>[0]> = {}) {
  return findAvailability({
    shop: s,
    serviceId: "svc_cut",
    serviceName: "Haircut",
    serviceDuration: 30,
    preferredDate: DATE,
    existingAppointments: [],
    limit: 100,
    now: new Date("2027-03-01T12:00:00Z"),
    ...opts,
  });
}

describe("findAvailability", () => {
  it("returns slots inside shop hours by default", () => {
    const slots = run(shop());
    expect(slots.length).toBeGreaterThan(0);
  });

  it("returns nothing when the shop is closed that weekday", () => {
    const s = shop();
    s.businessHours[WEDNESDAY].isClosed = true;
    expect(run(s)).toHaveLength(0);
  });

  describe("holidays", () => {
    it("returns nothing on a closed holiday", () => {
      const s = shop({ holidays: [{ date: DATE, isClosed: true }] });
      expect(run(s)).toHaveLength(0);
    });

    it("ignores holidays on other dates", () => {
      const s = shop({ holidays: [{ date: "2027-03-11", isClosed: true }] });
      expect(run(s).length).toBeGreaterThan(0);
    });
  });

  describe("barber working hours", () => {
    it("excludes a barber who is off that day", () => {
      const s = shop({
        barbers: [
          {
            id: "b1",
            name: "Ann",
            workingHours: [
              { dayOfWeek: WEDNESDAY, startTime: "09:00", endTime: "17:00", isOff: true },
            ],
          },
        ],
      });
      expect(run(s)).toHaveLength(0);
    });

    it("only offers times inside the barber's own hours", () => {
      const s = shop({
        barbers: [
          {
            id: "b1",
            name: "Ann",
            // Works afternoons only, while the shop is open 9-5.
            workingHours: [
              { dayOfWeek: WEDNESDAY, startTime: "13:00", endTime: "17:00", isOff: false },
            ],
          },
        ],
      });
      const slots = run(s);
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        const hour = Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: TZ,
            hour: "2-digit",
            hour12: false,
          }).format(new Date(slot.startTime))
        );
        expect(hour).toBeGreaterThanOrEqual(13);
        expect(hour).toBeLessThan(17);
      }
    });

    it("treats a barber with no configured hours as available", () => {
      const s = shop({ barbers: [{ id: "b1", name: "Ann", workingHours: [] }] });
      expect(run(s).length).toBeGreaterThan(0);
    });

    it("excludes a barber with no entry for that weekday", () => {
      const s = shop({
        barbers: [
          {
            id: "b1",
            name: "Ann",
            workingHours: [
              { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isOff: false },
            ],
          },
        ],
      });
      expect(run(s)).toHaveLength(0);
    });
  });

  describe("service eligibility", () => {
    it("excludes barbers who don't perform the service", () => {
      const s = shop({
        barbers: [{ id: "b1", name: "Ann", serviceIds: ["svc_fade"] }],
      });
      expect(run(s)).toHaveLength(0);
    });

    it("includes barbers who do perform the service", () => {
      const s = shop({
        barbers: [{ id: "b1", name: "Ann", serviceIds: ["svc_cut"] }],
      });
      expect(run(s).length).toBeGreaterThan(0);
    });

    it("treats an unassigned barber as performing everything", () => {
      const s = shop({ barbers: [{ id: "b1", name: "Ann", serviceIds: [] }] });
      expect(run(s).length).toBeGreaterThan(0);
    });

    it("picks only the qualified barber when several exist", () => {
      const s = shop({
        barbers: [
          { id: "b1", name: "Ann", serviceIds: ["svc_fade"] },
          { id: "b2", name: "Ben", serviceIds: ["svc_cut"] },
        ],
      });
      const slots = run(s);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((o) => o.barberId === "b2")).toBe(true);
    });
  });

  describe("time guards", () => {
    it("never returns a slot in the past", () => {
      // "Now" is mid-way through the booking day.
      const now = new Date("2027-03-10T20:00:00Z"); // 12:00 PT
      const slots = run(shop(), { now });
      for (const slot of slots) {
        expect(new Date(slot.startTime).getTime()).toBeGreaterThanOrEqual(
          now.getTime()
        );
      }
    });

    it("respects minimum lead time", () => {
      const now = new Date("2027-03-10T20:00:00Z"); // 12:00 PT
      const slots = run(shop(), { now, minLeadMinutes: 120 });
      for (const slot of slots) {
        expect(new Date(slot.startTime).getTime()).toBeGreaterThanOrEqual(
          now.getTime() + 120 * 60_000
        );
      }
    });
  });

  it("does not offer a slot that collides with an existing appointment", () => {
    const taken = {
      startTime: new Date("2027-03-10T17:00:00Z"), // 9:00 PT
      endTime: new Date("2027-03-10T17:30:00Z"),
      barberId: "b1",
    };
    const slots = run(shop(), { existingAppointments: [taken] });
    expect(
      slots.some((o) => new Date(o.startTime).getTime() === taken.startTime.getTime())
    ).toBe(false);
  });
});
