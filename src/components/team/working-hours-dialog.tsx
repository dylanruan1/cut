"use client";

import { useState, useTransition } from "react";
import { Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  getBarberWeek,
  setBarberWorkingHours,
} from "@/actions/working-hours";
import {
  DAY_NAMES,
  defaultWeek,
  workingDayCount,
  type WorkingHourInput,
} from "@/lib/working-hours";

/**
 * Weekly hours editor for one barber.
 *
 * Loads on open rather than with the page — most visits to the Team page never
 * touch it, and a shop with eight barbers would otherwise pay for eight
 * schedule queries to show a list of names.
 */
export function WorkingHoursDialog({
  barberId,
  barberName,
}: {
  barberId: string;
  barberName: string;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<WorkingHourInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    setDays(null);
    getBarberWeek(barberId)
      .then((week) => setDays(week?.days ?? defaultWeek()))
      .catch(() => setDays(defaultWeek()));
  }

  function update(dayOfWeek: number, patch: Partial<WorkingHourInput>) {
    setDays((prev) =>
      prev
        ? prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d))
        : prev
    );
  }

  function save() {
    if (!days) return;
    setError(null);
    startTransition(async () => {
      const res = await setBarberWorkingHours(barberId, days);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      toast({
        title: "Hours saved",
        description: `${barberName} works ${workingDayCount(days)} days a week.`,
      });
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Clock className="mr-2 h-3.5 w-3.5" />
          Hours
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{barberName}&apos;s hours</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Customers can only book inside these hours. Days marked off never
          appear as available.
        </p>

        {!days ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading
          </div>
        ) : (
          <div className="space-y-2">
            {days.map((day) => (
              <div
                key={day.dayOfWeek}
                className="grid grid-cols-[5.5rem_1fr] items-center gap-3"
              >
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!day.isOff}
                    onChange={(e) =>
                      update(day.dayOfWeek, { isOff: !e.target.checked })
                    }
                    aria-label={`${DAY_NAMES[day.dayOfWeek]} on`}
                  />
                  <span className={day.isOff ? "text-muted-foreground" : ""}>
                    {DAY_NAMES[day.dayOfWeek].slice(0, 3)}
                  </span>
                </label>

                {day.isOff ? (
                  <span className="text-sm text-muted-foreground">Off</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={day.startTime}
                      onChange={(e) =>
                        update(day.dayOfWeek, { startTime: e.target.value })
                      }
                      className="h-9"
                      aria-label={`${DAY_NAMES[day.dayOfWeek]} start`}
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={day.endTime}
                      onChange={(e) =>
                        update(day.dayOfWeek, { endTime: e.target.value })
                      }
                      className="h-9"
                      aria-label={`${DAY_NAMES[day.dayOfWeek]} finish`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1"
            disabled={pending || !days}
            onClick={save}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save hours"
            )}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
