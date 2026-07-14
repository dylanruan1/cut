"use client";

import { format, getMonthDates } from "@/lib/dates";
import { formatShopLocalDateKey } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalendarAppointment } from "@/components/calendar/types";

interface MonthViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  timezone: string;
  loading: boolean;
  onDayClick: (date: Date) => void;
  onAppointmentClick: (apt: CalendarAppointment) => void;
}

export function MonthView({
  date,
  appointments,
  timezone,
  loading,
  onDayClick,
  onAppointmentClick,
}: MonthViewProps) {
  const monthDates = getMonthDates(date.getFullYear(), date.getMonth());
  const todayKey = formatShopLocalDateKey(new Date(), timezone);
  const currentMonth = date.getMonth();

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="text-center py-2 text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {monthDates.map((d) => {
          const dayKey = formatShopLocalDateKey(d, timezone);
          const dayAppointments = appointments.filter(
            (apt) => formatShopLocalDateKey(apt.startTime, timezone) === dayKey
          );
          const isCurrentMonth = d.getMonth() === currentMonth;
          const isToday = dayKey === todayKey;

          return (
            <div
              key={d.toISOString()}
              className={cn(
                "min-h-[100px] border-b border-r p-1 cursor-pointer hover:bg-muted/30 transition-colors",
                !isCurrentMonth && "bg-muted/20 text-muted-foreground",
                isToday && "bg-primary/5"
              )}
              onClick={() => onDayClick(d)}
              role="button"
              tabIndex={0}
              aria-label={`${format(d, "MMMM d")}, ${dayAppointments.length} appointments`}
            >
              <p
                className={cn(
                  "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground"
                )}
              >
                {d.getDate()}
              </p>
              <div className="space-y-0.5 mt-1">
                {dayAppointments.slice(0, 3).map((apt) => (
                  <div
                    key={apt.id}
                    className="text-[10px] px-1 py-0.5 rounded truncate"
                    style={{
                      backgroundColor: `${apt.barber.color}20`,
                      borderLeft: `2px solid ${apt.barber.color}`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(apt);
                    }}
                  >
                    {apt.client.name}
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <p className="text-[10px] text-muted-foreground px-1">
                    +{dayAppointments.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
