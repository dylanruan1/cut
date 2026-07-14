import {
  addMinutes,
  format,
  parseISO,
  startOfDay,
  endOfDay,
  isWithinInterval,
  addDays,
  addWeeks,
  addMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

export const BARBER_COLORS = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#AF52DE",
  "#FF2D55",
  "#5AC8FA",
  "#FFCC00",
  "#5856D6",
];

export const DEFAULT_SERVICES = [
  { name: "Haircut", duration: 30, price: 35, color: "#007AFF", description: "Classic haircut with styling" },
  { name: "Beard Trim", duration: 20, price: 20, color: "#34C759", description: "Beard shaping and trim" },
  { name: "Kids Cut", duration: 25, price: 25, color: "#FF9500", description: "Haircut for children under 12" },
  { name: "Fade", duration: 45, price: 45, color: "#AF52DE", description: "Precision fade haircut" },
  { name: "Line Up", duration: 15, price: 15, color: "#FF2D55", description: "Edge up and line work" },
];

export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function formatTime(date: Date | string, timezone = "America/Los_Angeles"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(d, timezone, "h:mm a");
}

export function formatDate(date: Date | string, timezone = "America/Los_Angeles"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(d, timezone, "EEEE, MMM d");
}

export function formatShortDate(date: Date | string, timezone = "America/Los_Angeles"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(d, timezone, "MMM d, yyyy");
}

export function getAppointmentEndTime(startTime: Date, durationMinutes: number): Date {
  return addMinutes(startTime, durationMinutes);
}

export function getDayBounds(date: Date, timezone: string): { start: Date; end: Date } {
  const zoned = toZonedTime(date, timezone);
  return {
    start: startOfDay(zoned),
    end: endOfDay(zoned),
  };
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "PENDING":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "COMPLETED":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "CANCELLED":
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "NO_SHOW":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "NO_SHOW":
      return "No Show";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

export function isTimeSlotAvailable(
  slotStart: Date,
  slotEnd: Date,
  appointments: { startTime: Date; endTime: Date }[]
): boolean {
  return !appointments.some((apt) => {
    const aptStart = new Date(apt.startTime);
    const aptEnd = new Date(apt.endTime);
    return (
      isWithinInterval(slotStart, { start: aptStart, end: aptEnd }) ||
      isWithinInterval(slotEnd, { start: aptStart, end: aptEnd }) ||
      (slotStart <= aptStart && slotEnd >= aptEnd)
    );
  });
}

export function generateTimeSlots(
  openTime: string,
  closeTime: string,
  intervalMinutes = 30
): string[] {
  const slots: string[] = [];
  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  let current = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  while (current < end) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += intervalMinutes;
  }

  return slots;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getCalendarHours(): number[] {
  return Array.from({ length: 14 }, (_, i) => i + 7);
}

export function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function getMonthDates(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const dates: Date[] = [];
  const current = new Date(startDate);

  while (dates.length < 42) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export {
  format,
  parseISO,
  addMinutes,
  startOfDay,
  endOfDay,
  addDays,
  addWeeks,
  addMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
};
