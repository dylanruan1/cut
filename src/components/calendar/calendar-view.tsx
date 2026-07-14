"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { DayView } from "@/components/calendar/day-view";
import { WeekView } from "@/components/calendar/week-view";
import { MonthView } from "@/components/calendar/month-view";
import { AppointmentDialog } from "@/components/calendar/appointment-dialog";
import { getAppointments } from "@/actions/appointments";
import { addDays, addWeeks, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "@/lib/dates";
import { getAppointmentClientName } from "@/lib/utils";
import type { CalendarAppointment, CalendarBarber, CalendarService } from "@/components/calendar/types";

interface CalendarViewProps {
  barbers: CalendarBarber[];
  services: CalendarService[];
  timezone: string;
}

export function CalendarView({ barbers, services, timezone }: CalendarViewProps) {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [filterBarber, setFilterBarber] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<CalendarAppointment | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: Date; barberId?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const getDateRange = useCallback(() => {
    if (view === "day") {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (view === "week") {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [view, currentDate]);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    const { start, end } = getDateRange();
    const data = await getAppointments(
      start.toISOString(),
      end.toISOString(),
      filterBarber !== "all" ? filterBarber : undefined
    );
    setAppointments(data);
    setLoading(false);
  }, [getDateRange, filterBarber]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  function navigate(direction: "prev" | "next" | "today") {
    if (direction === "today") {
      setCurrentDate(new Date());
      return;
    }
    const delta = direction === "prev" ? -1 : 1;
    if (view === "day") setCurrentDate(addDays(currentDate, delta));
    else if (view === "week") setCurrentDate(addWeeks(currentDate, delta));
    else setCurrentDate(addMonths(currentDate, delta));
  }

  function getTitle() {
    if (view === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    if (view === "week") {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    }
    return format(currentDate, "MMMM yyyy");
  }

  const filteredAppointments = appointments.filter((apt) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const displayName = getAppointmentClientName(apt).toLowerCase();
    return (
      displayName.includes(q) ||
      apt.client.name.toLowerCase().includes(q) ||
      apt.client.phone.includes(q) ||
      (apt.clientPhoneSnapshot?.includes(q) ?? false) ||
      apt.service.name.toLowerCase().includes(q)
    );
  });

  function handleAppointmentClick(apt: CalendarAppointment) {
    setSelectedAppointment(apt);
    setSelectedSlot(null);
    setDialogOpen(true);
  }

  function handleSlotClick(date: Date, barberId?: string) {
    setSelectedAppointment(null);
    setSelectedSlot({ date, barberId });
    setDialogOpen(true);
  }

  function handleAppointmentMove(id: string, newStart: Date, newBarberId?: string) {
    setAppointments((prev) =>
      prev.map((apt) => {
        if (apt.id !== id) return apt;
        const duration = apt.duration;
        const newEnd = new Date(newStart.getTime() + duration * 60000);
        return {
          ...apt,
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
          barberId: newBarberId ?? apt.barberId,
          barber: newBarberId
            ? barbers.find((b) => b.id === newBarberId) ?? apt.barber
            : apt.barber,
        };
      })
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Calendar</h1>
        <Button onClick={() => { setSelectedAppointment(null); setSelectedSlot({ date: new Date() }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          New appointment
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("today")}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate("prev")} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate("next")} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-medium ml-2">{getTitle()}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search appointments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-48"
              aria-label="Search appointments"
            />
          </div>
          <Select value={filterBarber} onValueChange={setFilterBarber}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All barbers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All barbers</SelectItem>
              {barbers.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                    {b.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
        {view === "day" && (
          <DayView
            date={currentDate}
            appointments={filteredAppointments}
            barbers={barbers}
            timezone={timezone}
            loading={loading}
            onAppointmentClick={handleAppointmentClick}
            onSlotClick={handleSlotClick}
            onAppointmentMove={handleAppointmentMove}
          />
        )}
        {view === "week" && (
          <WeekView
            date={currentDate}
            appointments={filteredAppointments}
            barbers={barbers}
            timezone={timezone}
            loading={loading}
            onAppointmentClick={handleAppointmentClick}
            onSlotClick={handleSlotClick}
            onAppointmentMove={handleAppointmentMove}
          />
        )}
        {view === "month" && (
          <MonthView
            date={currentDate}
            appointments={filteredAppointments}
            timezone={timezone}
            loading={loading}
            onDayClick={(d) => { setCurrentDate(d); setView("day"); }}
            onAppointmentClick={handleAppointmentClick}
          />
        )}
      </div>

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={selectedAppointment}
        defaultDate={selectedSlot?.date}
        defaultBarberId={selectedSlot?.barberId}
        barbers={barbers}
        services={services}
        timezone={timezone}
        onSuccess={loadAppointments}
      />
    </div>
  );
}
