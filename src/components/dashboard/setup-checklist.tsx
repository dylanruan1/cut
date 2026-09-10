"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SetupChecklist } from "@/lib/setup-checklist";
import { Check, ChevronRight, Sparkles, X } from "lucide-react";

const DISMISS_KEY = "cut:setup-checklist-dismissed";

/**
 * First-run guidance on the dashboard.
 *
 * Hidden once everything is done, or once the owner dismisses it — a shop that
 * doesn't want walk-ins shouldn't stare at an unfinishable list forever.
 */
/**
 * Warning that the shop's public booking link is currently turning customers
 * away.
 *
 * Deliberately separate from the checklist card, and deliberately not
 * dismissible: the checklist is first-run guidance you can reasonably ignore,
 * this is a live fault. It most often appears after a shop deletes the starter
 * services to add its own, at which point the link on its stickers and in its
 * Instagram bio silently stops taking bookings.
 */
export function BookingLinkDeadBanner({
  checklist,
}: {
  checklist: SetupChecklist;
}) {
  if (!checklist.bookingLinkDead) return null;

  return (
    <Card className="border-destructive/40 bg-destructive/[0.04]">
      <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold tracking-tight">
            Your booking link isn&apos;t taking bookings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Anyone opening it sees &ldquo;not booking online yet&rdquo;. You
            need at least one service and one barber before customers can book.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/services">Add a service</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function SetupChecklistCard({ checklist }: { checklist: SetupChecklist }) {
  const [dismissed, setDismissed] = useState(true); // assume hidden until checked

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (checklist.complete || dismissed) return null;

  const pct = Math.round((checklist.doneCount / checklist.total) * 100);
  const next = checklist.items.filter((i) => !i.done);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold tracking-tight">Finish setting up</h2>
              <p className="text-sm text-muted-foreground">
                {checklist.doneCount} of {checklist.total} done
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss setup checklist"
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4 space-y-1">
          {next.slice(0, 4).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.title}</span>
                  {item.upgrade && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      Upgrade
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>

        {checklist.doneCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3">
            {checklist.items
              .filter((i) => i.done)
              .map((i) => (
                <span
                  key={i.id}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <Check className="h-3 w-3 text-primary" />
                  {i.title}
                </span>
              ))}
          </div>
        )}

        {next.length > 4 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" asChild>
            <Link href="/settings">
              {next.length - 4} more to go
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
