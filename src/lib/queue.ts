/**
 * Walk-in queue maths.
 *
 * Design goal: the queue must advance correctly in a cash-heavy shop where the
 * barber never touches the app. Nothing here requires barber input — checkout
 * (card OR cash) is the strongest signal, and a timer backstop keeps things
 * moving when nobody taps anything at all.
 *
 * Pure functions only, so the behaviour is unit-testable without a database.
 */

export type QueueStatus = "WAITING" | "NOTIFIED" | "IN_CHAIR" | "DONE" | "LEFT";

/** Statuses that still occupy a place in line. */
export const ACTIVE_QUEUE_STATUSES: QueueStatus[] = [
  "WAITING",
  "NOTIFIED",
  "IN_CHAIR",
];

/** Grace period added to a service duration before auto-completing an entry. */
export const AUTO_COMPLETE_GRACE_MINUTES = 10;

/** Text the customer when their estimated wait drops below this. */
export const NOTIFY_WHEN_MINUTES_AWAY = 10;

export type QueueItem = {
  id: string;
  status: QueueStatus;
  /** Minutes the chosen service takes. */
  serviceDuration: number;
  /** Preferred barber, or null for "anyone". */
  barberId: string | null;
  joinedAt: Date;
  seatedAt: Date | null;
};

/**
 * Estimated minutes until a given entry starts.
 *
 * Model: each active barber is a lane. People already in a chair block their
 * lane for the remainder of their service; everyone waiting is assigned to the
 * lane that frees up soonest. Entries that requested a specific barber only
 * consider that barber's lane.
 */
export function estimateWaitMinutes(input: {
  queue: QueueItem[];
  entryId: string;
  barberIds: string[];
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const lanes = new Map<string, number>();
  for (const id of input.barberIds) lanes.set(id, 0);
  if (lanes.size === 0) return 0;

  // Anyone currently in a chair blocks their lane for the time remaining.
  for (const item of input.queue) {
    if (item.status !== "IN_CHAIR" || !item.seatedAt) continue;
    const elapsed = (now.getTime() - item.seatedAt.getTime()) / 60_000;
    const remaining = Math.max(0, item.serviceDuration - elapsed);
    const lane = item.barberId && lanes.has(item.barberId) ? item.barberId : null;
    if (lane) {
      lanes.set(lane, Math.max(lanes.get(lane) ?? 0, remaining));
    } else {
      // Unassigned in-chair: charge it to the soonest-free lane.
      const soonest = soonestLane(lanes);
      if (soonest) lanes.set(soonest, (lanes.get(soonest) ?? 0) + remaining);
    }
  }

  // Then walk the waiting list in join order, packing each into a lane.
  const waiting = input.queue
    .filter((i) => i.status === "WAITING" || i.status === "NOTIFIED")
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());

  for (const item of waiting) {
    const eligible = item.barberId
      ? lanes.has(item.barberId)
        ? [item.barberId]
        : [...lanes.keys()]
      : [...lanes.keys()];

    const lane = eligible.reduce((best, id) =>
      (lanes.get(id) ?? 0) < (lanes.get(best) ?? 0) ? id : best
    );

    if (item.id === input.entryId) {
      return Math.max(0, Math.round(lanes.get(lane) ?? 0));
    }
    lanes.set(lane, (lanes.get(lane) ?? 0) + item.serviceDuration);
  }

  // Not found among waiting entries (already seated, done, or left).
  return 0;
}

function soonestLane(lanes: Map<string, number>): string | null {
  let best: string | null = null;
  for (const [id, value] of lanes) {
    if (best === null || value < (lanes.get(best) ?? 0)) best = id;
  }
  return best;
}

/**
 * 1-based position in the line that actually applies to this person.
 *
 * Shops where clients are loyal to one barber effectively run several lines at
 * once. Someone waiting for Mike should see their place in *Mike's* line — not
 * a shop-wide number that makes the wait look worse than it is. People with no
 * preference are counted against everyone ahead of them who could take any
 * chair.
 */
export function queuePosition(queue: QueueItem[], entryId: string): number | null {
  const waiting = queue
    .filter((i) => i.status === "WAITING" || i.status === "NOTIFIED")
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());

  const entry = waiting.find((i) => i.id === entryId);
  if (!entry) return null;

  const relevant = waiting.filter((other) => {
    if (other.id === entry.id) return true;
    if (entry.barberId) {
      // Only people competing for the same barber matter.
      return other.barberId === entry.barberId;
    }
    // No preference: anyone flexible ahead of you is ahead of you.
    return other.barberId === null;
  });

  return relevant.findIndex((i) => i.id === entry.id) + 1;
}

/** How many people are waiting specifically for a given barber. */
export function laneLength(queue: QueueItem[], barberId: string): number {
  return queue.filter(
    (i) =>
      (i.status === "WAITING" || i.status === "NOTIFIED") &&
      i.barberId === barberId
  ).length;
}

/** Generates the short per-visit code a barber reads out to verify cash. */
export function generateCashCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** When an entry that just sat down should auto-complete if nobody checks out. */
export function autoCompleteAt(seatedAt: Date, serviceDuration: number): Date {
  return new Date(
    seatedAt.getTime() + (serviceDuration + AUTO_COMPLETE_GRACE_MINUTES) * 60_000
  );
}

/** Whether an in-chair entry has outlived its timer and should be closed out. */
export function shouldAutoComplete(input: {
  status: QueueStatus;
  autoCompleteAt: Date | null;
  now?: Date;
}): boolean {
  if (input.status !== "IN_CHAIR" || !input.autoCompleteAt) return false;
  return (input.now ?? new Date()).getTime() >= input.autoCompleteAt.getTime();
}

/** Whether this waiting entry is close enough to warrant a "you're next" text. */
export function shouldNotify(input: {
  status: QueueStatus;
  estimatedWaitMinutes: number;
}): boolean {
  if (input.status !== "WAITING") return false;
  return input.estimatedWaitMinutes <= NOTIFY_WHEN_MINUTES_AWAY;
}

/**
 * Picks who to seat next and in which chair.
 * Preference is honoured when that barber is free; otherwise the longest waiter
 * goes to whichever barber is open.
 */
export function nextToSeat(input: {
  queue: QueueItem[];
  freeBarberIds: string[];
}): { entryId: string; barberId: string } | null {
  if (input.freeBarberIds.length === 0) return null;

  const waiting = input.queue
    .filter((i) => i.status === "WAITING" || i.status === "NOTIFIED")
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());

  // First pass: someone whose requested barber is free.
  for (const item of waiting) {
    if (item.barberId && input.freeBarberIds.includes(item.barberId)) {
      return { entryId: item.id, barberId: item.barberId };
    }
  }
  // Second pass: longest waiter with no preference.
  for (const item of waiting) {
    if (!item.barberId) {
      return { entryId: item.id, barberId: input.freeBarberIds[0] };
    }
  }
  return null;
}

/** Human-friendly wait text for the customer's screen. */
export function formatWait(minutes: number): string {
  if (minutes <= 0) return "You're up next";
  if (minutes < 5) return "About 5 minutes";
  if (minutes < 60) return `About ${Math.round(minutes / 5) * 5} minutes`;
  const hours = Math.floor(minutes / 60);
  const rem = Math.round((minutes % 60) / 15) * 15;
  if (rem === 0) return `About ${hours} hour${hours === 1 ? "" : "s"}`;
  return `About ${hours}h ${rem}m`;
}
