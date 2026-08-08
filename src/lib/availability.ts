import { datesForRange } from "./ical";
import { Booking, Room } from "../types";

export interface CalendarDay {
  dayNum: number;
  isCurrentMonth: boolean;
  dateStr: string;
}

export type AvailabilityStatus = "available" | "reserved" | "blocked";

export interface AvailabilityDateSets {
  reservedDates: Set<string>;
  blockedDates: Set<string>;
}

export function getCalendarDays(month: number, year: number): CalendarDay[] {
  const days: CalendarDay[] = [];
  const firstDay = new Date(year, month, 1).getDay();
  const previousMonthDays = new Date(year, month, 0).getDate();

  for (let index = firstDay - 1; index >= 0; index -= 1) {
    days.push({
      dayNum: previousMonthDays - index,
      isCurrentMonth: false,
      dateStr: "",
    });
  }

  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= totalDays; day += 1) {
    days.push({
      dayNum: day,
      isCurrentMonth: true,
      dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }

  return days;
}

export function buildAvailabilityDateSets(room: Room, confirmedBookings: Booking[]): AvailabilityDateSets {
  const reservedDates = new Set<string>();
  const blockedDates = new Set(room.blockedDates);

  for (const booking of confirmedBookings) {
    if (booking.roomId !== room.id || booking.status !== "confirmed") continue;
    for (const date of datesForRange(booking.checkIn, booking.checkOut)) {
      reservedDates.add(date);
    }
  }

  return { reservedDates, blockedDates };
}

export function getAvailabilityStatus(dateStr: string, dateSets: AvailabilityDateSets): AvailabilityStatus {
  if (dateSets.reservedDates.has(dateStr)) return "reserved";
  if (dateSets.blockedDates.has(dateStr)) return "blocked";
  return "available";
}

export function getBookingsForDate(dateStr: string, bookings: Booking[]): Booking[] {
  return bookings.filter((booking) => (
    booking.status === "confirmed"
    && datesForRange(booking.checkIn, booking.checkOut).includes(dateStr)
  ));
}

export function formatAvailabilityDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
