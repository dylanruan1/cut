"use client";

import { useRef, useState } from "react";
import { formatTime, getCalendarHours, formatHour } from "@/lib/dates";
import {
  formatShopLocalDateKey,
  getShopLocalDecimalHour,
  shopWallClockToUtc,
} from "@/lib/datetime";
import { cn, getAppointmentClientName } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { updateAppointment } from "@/actions/appointments";
import type { CalendarAppointment } from "@/components/calendar/types";

const HOUR_HEIGHT = 60;

interface DayViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  barbers: Array<{ id: string; name: string; color: string }>;
  timezone: string;
  loading: boolean;
  onAppointmentClick: (apt: CalendarAppointment) => void;
  onSlotClick: (date: Date, barberId?: string) => void;
  onAppointmentMove: (id: string, newStart: Date, newBarberId?: string) => void;
}

export function DayView({
  date,
  appointments,
  barbers,
  timezone,
  loading,
  onAppointmentClick,
  onSlotClick,
  onAppointmentMove,
}: DayViewProps) {
  const hours = getCalendarHours();
  const [dragging, setDragging] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dayKey = formatShopLocalDateKey(date, timezone);

  const dayAppointments = appointments.filter(
    (apt) => formatShopLocalDateKey(apt.startTime, timezone) === dayKey
  );

  function getTopPosition(startTime: string | Date): number {
    return (getShopLocalDecimalHour(startTime, timezone) - 7) * HOUR_HEIGHT;
  }

  function getHeight(duration: number): number {
    return (duration / 60) * HOUR_HEIGHT;
  }

  async function handleDrop(e: React.DragEvent, barberId: string) {
    e.preventDefault();
    const aptId = e.dataTransfer.getData("appointmentId");
    if (!aptId || !gridRef.current) return;

    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.floor(y / HOUR_HEIGHT) + 7;
    const minutes = Math.round(((y % HOUR_HEIGHT) / HOUR_HEIGHT) * 60 / 15) * 15;
    const newStart = shopWallClockToUtc(dayKey, hour, minutes, timezone);

    onAppointmentMove(aptId, newStart, barberId);
    await updateAppointment(aptId, { startTime: newStart.toISOString(), barberId });
    setDragging(null);
  }

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex overflow-x-auto">
      <div className="w-16 shrink-0 border-r">
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

      {barbers.map((barber) => (
        <div key={barber.id} className="flex-1 min-w-[200px] border-r last:border-r-0">
          <div className="sticky top-0 z-10 bg-card border-b p-2 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: barber.color }} />
              <span className="text-sm font-medium truncate">{barber.name}</span>
            </div>
          </div>
          <div
            ref={gridRef}
            className="relative"
            style={{ height: hours.length * HOUR_HEIGHT }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, barber.id)}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-border/30 hover:bg-muted/30 cursor-pointer transition-colors"
                style={{ height: HOUR_HEIGHT }}
                onClick={() => {
                  onSlotClick(shopWallClockToUtc(dayKey, hour, 0, timezone), barber.id);
                }}
              />
            ))}

            {dayAppointments
              .filter((apt) => apt.barberId === barber.id)
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
                    "absolute left-1 right-1 rounded-lg px-2 py-1 cursor-pointer overflow-hidden shadow-soft transition-opacity",
                    dragging === apt.id && "opacity-50"
                  )}
                  style={{
                    top: getTopPosition(apt.startTime),
                    height: Math.max(getHeight(apt.duration), 24),
                    backgroundColor: `${apt.barber.color}20`,
                    borderLeft: `3px solid ${apt.barber.color}`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAppointmentClick(apt);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${getAppointmentClientName(apt)}, ${apt.service.name} at ${formatTime(apt.startTime, timezone)}`}
                  onKeyDown={(e) => e.key === "Enter" && onAppointmentClick(apt)}
                >
                  <p className="text-xs font-medium truncate">{getAppointmentClientName(apt)}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {formatTime(apt.startTime, timezone)} · {apt.service.name}
                  </p>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
