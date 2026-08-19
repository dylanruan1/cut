import { describe, it, expect } from "vitest";
import {
  estimateWaitMinutes,
  queuePosition,
  autoCompleteAt,
  shouldAutoComplete,
  shouldNotify,
  nextToSeat,
  formatWait,
  laneLength,
  generateCashCode,
  AUTO_COMPLETE_GRACE_MINUTES,
  type QueueItem,
} from "./queue";

const NOW = new Date("2026-08-10T17:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function item(over: Partial<QueueItem> & { id: string }): QueueItem {
  return {
    status: "WAITING",
    serviceDuration: 30,
    barberId: null,
    joinedAt: minsAgo(5),
    seatedAt: null,
    ...over,
  };
}

describe("estimateWaitMinutes", () => {
  it("is zero for the first person when a barber is free", () => {
    const queue = [item({ id: "a" })];
    expect(
      estimateWaitMinutes({ queue, entryId: "a", barberIds: ["b1"], now: NOW })
    ).toBe(0);
  });

  it("stacks waits behind people ahead in line", () => {
    const queue = [
      item({ id: "a", joinedAt: minsAgo(10) }),
      item({ id: "b", joinedAt: minsAgo(5) }),
      item({ id: "c", joinedAt: minsAgo(1) }),
    ];
    const args = { queue, barberIds: ["b1"], now: NOW };
    expect(estimateWaitMinutes({ ...args, entryId: "a" })).toBe(0);
    expect(estimateWaitMinutes({ ...args, entryId: "b" })).toBe(30);
    expect(estimateWaitMinutes({ ...args, entryId: "c" })).toBe(60);
  });

  it("splits the line across multiple barbers", () => {
    const queue = [
      item({ id: "a", joinedAt: minsAgo(10) }),
      item({ id: "b", joinedAt: minsAgo(5) }),
      item({ id: "c", joinedAt: minsAgo(1) }),
    ];
    const args = { queue, barberIds: ["b1", "b2"], now: NOW };
    // Two chairs: first two start immediately, third waits one service.
    expect(estimateWaitMinutes({ ...args, entryId: "a" })).toBe(0);
    expect(estimateWaitMinutes({ ...args, entryId: "b" })).toBe(0);
    expect(estimateWaitMinutes({ ...args, entryId: "c" })).toBe(30);
  });

  it("counts the remaining time of someone already in the chair", () => {
    const queue = [
      item({
        id: "seated",
        status: "IN_CHAIR",
        seatedAt: minsAgo(10),
        serviceDuration: 30,
        barberId: "b1",
      }),
      item({ id: "waiting", joinedAt: minsAgo(2) }),
    ];
    // 20 minutes left on the current cut.
    expect(
      estimateWaitMinutes({
        queue,
        entryId: "waiting",
        barberIds: ["b1"],
        now: NOW,
      })
    ).toBe(20);
  });

  it("never returns a negative wait when a cut has run long", () => {
    const queue = [
      item({
        id: "seated",
        status: "IN_CHAIR",
        seatedAt: minsAgo(90),
        serviceDuration: 30,
        barberId: "b1",
      }),
      item({ id: "waiting" }),
    ];
    expect(
      estimateWaitMinutes({ queue, entryId: "waiting", barberIds: ["b1"], now: NOW })
    ).toBe(0);
  });

  it("makes a barber request wait for that specific barber", () => {
    const queue = [
      item({
        id: "seated",
        status: "IN_CHAIR",
        seatedAt: minsAgo(5),
        serviceDuration: 30,
        barberId: "b1",
      }),
      item({ id: "wants-b1", barberId: "b1", joinedAt: minsAgo(1) }),
    ];
    // b2 is free, but they asked for b1 who has 25 minutes left.
    expect(
      estimateWaitMinutes({
        queue,
        entryId: "wants-b1",
        barberIds: ["b1", "b2"],
        now: NOW,
      })
    ).toBe(25);
  });

  it("returns 0 when the shop has no barbers", () => {
    expect(
      estimateWaitMinutes({
        queue: [item({ id: "a" })],
        entryId: "a",
        barberIds: [],
        now: NOW,
      })
    ).toBe(0);
  });
});

describe("queuePosition", () => {
  it("numbers waiting people from 1 in join order", () => {
    const queue = [
      item({ id: "a", joinedAt: minsAgo(10) }),
      item({ id: "b", joinedAt: minsAgo(5) }),
    ];
    expect(queuePosition(queue, "a")).toBe(1);
    expect(queuePosition(queue, "b")).toBe(2);
  });

  it("returns null once someone is in the chair", () => {
    const queue = [item({ id: "a", status: "IN_CHAIR", seatedAt: minsAgo(2) })];
    expect(queuePosition(queue, "a")).toBeNull();
  });

  it("counts only the same barber's line for a barber request", () => {
    const queue = [
      item({ id: "flex1", joinedAt: minsAgo(30) }),
      item({ id: "wants-b2-a", barberId: "b2", joinedAt: minsAgo(20) }),
      item({ id: "flex2", joinedAt: minsAgo(15) }),
      item({ id: "wants-b2-b", barberId: "b2", joinedAt: minsAgo(10) }),
    ];
    // Second person waiting for b2 is 2nd in b2's line, not 4th overall.
    expect(queuePosition(queue, "wants-b2-b")).toBe(2);
    expect(queuePosition(queue, "wants-b2-a")).toBe(1);
  });

  it("counts only flexible people for someone with no preference", () => {
    const queue = [
      item({ id: "wants-b1", barberId: "b1", joinedAt: minsAgo(30) }),
      item({ id: "wants-b2", barberId: "b2", joinedAt: minsAgo(25) }),
      item({ id: "flex", joinedAt: minsAgo(5) }),
    ];
    // Nobody flexible is ahead, so they're first in the "anyone" line.
    expect(queuePosition(queue, "flex")).toBe(1);
  });
});

describe("laneLength", () => {
  it("counts people waiting for one specific barber", () => {
    const queue = [
      item({ id: "a", barberId: "b1" }),
      item({ id: "b", barberId: "b1" }),
      item({ id: "c", barberId: "b2" }),
      item({ id: "d" }),
      item({ id: "seated", barberId: "b1", status: "IN_CHAIR", seatedAt: minsAgo(1) }),
    ];
    expect(laneLength(queue, "b1")).toBe(2);
    expect(laneLength(queue, "b2")).toBe(1);
  });
});

describe("generateCashCode", () => {
  it("is always four digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCashCode()).toMatch(/^\d{4}$/);
    }
  });
});

describe("auto-complete backstop", () => {
  it("sets the timer to service duration plus grace", () => {
    const seated = new Date("2026-08-10T17:00:00Z");
    expect(autoCompleteAt(seated, 30).toISOString()).toBe(
      new Date(
        seated.getTime() + (30 + AUTO_COMPLETE_GRACE_MINUTES) * 60_000
      ).toISOString()
    );
  });

  it("fires only for in-chair entries past their timer", () => {
    const past = minsAgo(1);
    const future = new Date(NOW.getTime() + 60_000);
    expect(
      shouldAutoComplete({ status: "IN_CHAIR", autoCompleteAt: past, now: NOW })
    ).toBe(true);
    expect(
      shouldAutoComplete({ status: "IN_CHAIR", autoCompleteAt: future, now: NOW })
    ).toBe(false);
    expect(
      shouldAutoComplete({ status: "WAITING", autoCompleteAt: past, now: NOW })
    ).toBe(false);
    expect(
      shouldAutoComplete({ status: "IN_CHAIR", autoCompleteAt: null, now: NOW })
    ).toBe(false);
  });
});

describe("shouldNotify", () => {
  it("texts someone who is nearly up", () => {
    expect(shouldNotify({ status: "WAITING", estimatedWaitMinutes: 5 })).toBe(true);
  });
  it("does not text someone with a long wait", () => {
    expect(shouldNotify({ status: "WAITING", estimatedWaitMinutes: 45 })).toBe(false);
  });
  it("does not text someone twice", () => {
    expect(shouldNotify({ status: "NOTIFIED", estimatedWaitMinutes: 2 })).toBe(false);
  });
});

describe("nextToSeat", () => {
  it("prefers someone whose requested barber is free", () => {
    const queue = [
      item({ id: "any", joinedAt: minsAgo(20) }),
      item({ id: "wants-b2", barberId: "b2", joinedAt: minsAgo(5) }),
    ];
    expect(nextToSeat({ queue, freeBarberIds: ["b2"] })).toEqual({
      entryId: "wants-b2",
      barberId: "b2",
    });
  });

  it("otherwise seats the longest waiter", () => {
    const queue = [
      item({ id: "first", joinedAt: minsAgo(20) }),
      item({ id: "second", joinedAt: minsAgo(5) }),
    ];
    expect(nextToSeat({ queue, freeBarberIds: ["b1"] })).toEqual({
      entryId: "first",
      barberId: "b1",
    });
  });

  it("returns null when nobody is free", () => {
    expect(
      nextToSeat({ queue: [item({ id: "a" })], freeBarberIds: [] })
    ).toBeNull();
  });

  it("returns null when the only waiters want a busy barber", () => {
    const queue = [item({ id: "wants-b1", barberId: "b1" })];
    expect(nextToSeat({ queue, freeBarberIds: ["b2"] })).toBeNull();
  });
});

describe("formatWait", () => {
  it("reads naturally", () => {
    expect(formatWait(0)).toBe("You're up next");
    expect(formatWait(3)).toBe("About 5 minutes");
    expect(formatWait(22)).toBe("About 20 minutes");
    expect(formatWait(60)).toBe("About 1 hour");
    expect(formatWait(95)).toBe("About 1h 30m");
  });
});
