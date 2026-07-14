"use client";

import { useRef, useState } from "react";
import { format, formatTime, getCalendarHours, formatHour, getWeekDates } from "@/lib/dates";
import {
  formatShopLocalDateKey,
  getShopLocalDecimalHour,
  shopWallClockToUtc,
} from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { updateAppointment } from "@/actions/appointments";
import type { CalendarAppointment } from "@/components/calendar/types";

const HOUR_HEIGHT = 48;

interface WeekViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  barbers: Array<{ id: string; name: string; color: string }>;
  timezone: string;
  loading: boolean;
  onAppointmentClick: (apt: CalendarAppointment) => void;
  onSlotClick: (date: Date, barberId?: string) => void;
  onAppointmentMove: (id: string, newStart: Date) => void;
}

export function WeekView({
  date,
  appointments,
  timezone,
  loading,
  onAppointmentClick,
  onSlotClick,
  onAppointmentMove,
}: WeekViewProps) {
  const hours = getCalendarHours();
  const weekDates = getWeekDates(date);
  const todayKey = formatShopLocalDateKey(new Date(), timezone);
  const [dragging, setDragging] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  function getTopPosition(startTime: string | Date): number {
    return (getShopLocalDecimalHour(startTime, timezone) - 7) * HOUR_HEIGHT;
  }

  function getHeight(duration: number): number {
    return Math.max((duration / 60) * HOUR_HEIGHT, 20);
  }

  async function handleDrop(e: React.DragEvent, dayIndex: number) {
    e.preventDefault();
    const aptId = e.dataTransfer.getData("appointmentId");
    if (!aptId || !gridRef.current) return;

    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.floor(y / HOUR_HEIGHT) + 7;
    const minutes = Math.round(((y % HOUR_HEIGHT) / HOUR_HEIGHT) * 60 / 15) * 15;
    const dayKey = formatShopLocalDateKey(weekDates[dayIndex], timezone);
    const newStart = shopWallClockToUtc(dayKey, hour, minutes, timezone);

    onAppointmentMove(aptId, newStart);
    await updateAppointment(aptId, { startTime: newStart.toISOString() });
    setDragging(null);
  }

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-[64px_repeat(7,1fr)] min-w-[700px]">
        <div />
        {weekDates.map((d) => {
          const key = formatShopLocalDateKey(d, timezone);
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "text-center py-2 border-b font-medium text-sm",
                key === todayKey && "bg-primary/5"
              )}
            >
              <p className="text-xs text-muted-foreground">{format(d, "EEE")}</p>
              <p className={cn(key === todayKey && "text-primary")}>{format(d, "d")}</p>
            </div>
          );
        })}

        <div className="border-r">
          {hours.map((hour) => (
            <div
              key={hour}
              className="text-xs text-muted-foreground text-right pr-2 border-b border-border/50"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="relative -top-2">{formatHour(hour)}</span>
            </div>
          ))}
        </div>

        {weekDates.map((dayDate, dayIndex) => {
          const dayKey = formatShopLocalDateKey(dayDate, timezone);
          return (
            <div
              key={dayDate.toISOString()}
              className={cn(
                "relative border-r last:border-r-0",
                dayKey === todayKey && "bg-primary/[0.02]"
              )}
              style={{ height: hours.length * HOUR_HEIGHT }}
              ref={dayIndex === 0 ? gridRef : undefined}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, dayIndex)}
            >
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border/30 hover:bg-muted/30 cursor-pointer"
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() => {
                    onSlotClick(shopWallClockToUtc(dayKey, hour, 0, timezone));
                  }}
                />
              ))}

              {appointments
                .filter((apt) => formatShopLocalDateKey(apt.startTime, timezone) === dayKey)
                .map((apt) => (
                  <div
                    key={apt.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("appointmentId", apt.id);
                      setDragging(apt.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 cursor-pointer overflow-hidden text-[10px] shadow-soft",
                      dragging === apt.id && "opacity-50"
                    )}
                    style={{
                      top: getTopPosition(apt.startTime),
                      height: getHeight(apt.duration),
                      backgroundColor: `${apt.barber.color}25`,
                      borderLeft: `2px solid ${apt.barber.color}`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(apt);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${apt.client.name}, ${apt.service.name}`}
                  >
                    <p className="font-medium truncate">{apt.client.name}</p>
                    <p className="text-muted-foreground truncate">
                      {formatTime(apt.startTime, timezone)}
                    </p>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
