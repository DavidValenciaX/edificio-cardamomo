import { datesForRange } from "./ical";
import { Booking, Room } from "../types";

export interface CalendarDay {
  dayNum: number;
  isCurrentMonth: boolean;
  dateStr: string;
}

export type AvailabilityStatus = "available" | "reserved" | "blocked";

export function getTodayDateString(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isPastAvailabilityDate(dateStr: string, todayDateStr = getTodayDateString()): boolean {
  return Boolean(dateStr) && dateStr < todayDateStr;
}

export function datesForInclusiveRange(startDate: string, endDate: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return [];
  }

  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;
  return [...datesForRange(start, end), end];
}

export function extendDateRangeSelection(
  startDate: string,
  endDate: string,
  selectedDate: string,
): { startDate: string; endDate: string } {
  if (!selectedDate) return { startDate, endDate };
  if (!startDate || !endDate) return { startDate: selectedDate, endDate: selectedDate };
  if (selectedDate < startDate) return { startDate: selectedDate, endDate };
  if (selectedDate > endDate) return { startDate, endDate: selectedDate };
  return { startDate, endDate };
}

export function selectDateForRange(
  startDate: string,
  endDate: string,
  selectedDate: string,
): { startDate: string; endDate: string } {
  if (startDate && endDate && startDate !== endDate) {
    return { startDate: selectedDate, endDate: selectedDate };
  }
  return extendDateRangeSelection(startDate, endDate, selectedDate);
}

export interface AvailabilityDateSets {
  reservedDates: Set<string>;
  blockedDates: Set<string>;
}

export interface BookingDateReservation {
  datesToBlock: string[];
  nextBlockedDates: string[];
  conflictDate: string | null;
}

/**
 * Calculates the blocked-date projection for a booking attempt.
 * The caller must use the result from a fresh room read (ideally inside a
 * Firestore transaction) so a stale client projection cannot overwrite a
 * concurrent reservation.
 */
export function prepareBookingDateReservation(
  existingBlockedDates: string[],
  checkIn: string,
  checkOut: string,
): BookingDateReservation {
  const datesToBlock = datesForRange(checkIn, checkOut);
  const existingDates = new Set(existingBlockedDates);
  const conflictDate = datesToBlock.find((date) => existingDates.has(date)) ?? null;
  const nextBlockedDates = [...new Set([...existingBlockedDates, ...datesToBlock])].sort();

  return { datesToBlock, nextBlockedDates, conflictDate };
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
