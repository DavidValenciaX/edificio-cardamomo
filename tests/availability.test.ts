import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAvailabilityDateSets,
  datesForInclusiveRange,
  extendDateRangeSelection,
  getAvailabilityStatus,
  getBookingsForDate,
  getCalendarDays,
  getTodayDateString,
  isPastAvailabilityDate,
  prepareBookingDateReservation,
  selectDateForRange,
} from "../src/lib/availability.ts";
import { Booking, Room } from "../src/types.ts";

const room: Room = {
  id: "room-101",
  name: "Apartamento 101",
  description: "Apartamento de prueba",
  capacity: 2,
  pricing: {
    baseOccupancy: 1,
    basePricePerNight: 100000,
    extraGuestPricePerNight: 30000,
  },
  features: {
    bedrooms: 1,
    beds: 1,
    hasSofaBed: false,
    hasAirConditioning: true,
    hasWifi: true,
    hasTv: true,
    hasFullKitchen: false,
    hasFridge: true,
    hasPrivateBathroom: true,
  },
  images: [],
  blockedDates: ["2026-08-14", "2026-08-20"],
  manualBlockedDates: ["2026-08-14", "2026-08-20"],
  externalBlockedDates: [],
};

const confirmedBooking: Booking = {
  id: "res-101",
  roomId: room.id,
  userId: "guest-1",
  guestContact: {
    fullName: "Huésped de prueba",
    phone: "3000000000",
    identification: "123456",
  },
  guestCount: 1,
  checkIn: "2026-08-10",
  checkOut: "2026-08-13",
  status: "confirmed",
  nightlyPriceApplied: 100000,
  totalPrice: 300000,
  createdAt: "2026-08-01T12:00:00.000Z",
};

test("availability date sets preserve check-in and exclude check-out", () => {
  const dateSets = buildAvailabilityDateSets(room, [confirmedBooking]);

  assert.equal(getAvailabilityStatus("2026-08-10", dateSets), "reserved");
  assert.equal(getAvailabilityStatus("2026-08-12", dateSets), "reserved");
  assert.equal(getAvailabilityStatus("2026-08-13", dateSets), "available");
  assert.equal(getAvailabilityStatus("2026-08-14", dateSets), "blocked");
  assert.equal(getAvailabilityStatus("2026-08-20", dateSets), "blocked");
});

test("reserved status takes precedence when a booking overlaps a blocked projection", () => {
  const overlappingRoom = { ...room, blockedDates: ["2026-08-10"] };
  const dateSets = buildAvailabilityDateSets(overlappingRoom, [confirmedBooking]);

  assert.equal(getAvailabilityStatus("2026-08-10", dateSets), "reserved");
});

test("booking date preparation detects conflicts from the fresh room projection", () => {
  assert.deepEqual(
    prepareBookingDateReservation(
      ["2026-08-14"],
      "2026-08-12",
      "2026-08-15",
    ),
    {
      datesToBlock: ["2026-08-12", "2026-08-13", "2026-08-14"],
      nextBlockedDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      conflictDate: "2026-08-14",
    },
  );
});

test("booking date preparation preserves existing blocks and excludes checkout", () => {
  assert.deepEqual(
    prepareBookingDateReservation(
      ["2026-08-20"],
      "2026-08-17",
      "2026-08-20",
    ),
    {
      datesToBlock: ["2026-08-17", "2026-08-18", "2026-08-19"],
      nextBlockedDates: ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"],
      conflictDate: null,
    },
  );
});

test("getBookingsForDate ignores checkout dates and cancelled bookings", () => {
  const cancelledBooking = { ...confirmedBooking, id: "res-cancelled", status: "cancelled" as const };

  assert.deepEqual(getBookingsForDate("2026-08-10", [confirmedBooking, cancelledBooking]), [confirmedBooking]);
  assert.deepEqual(getBookingsForDate("2026-08-13", [confirmedBooking]), []);
});

test("calendar days start on Sunday and include all days in the selected month", () => {
  const days = getCalendarDays(7, 2026);

  assert.equal(days[0].isCurrentMonth, false);
  assert.equal(days[0].dateStr, "");
  assert.equal(days[6].dateStr, "2026-08-01");
  assert.equal(days.filter((day) => day.isCurrentMonth).length, 31);
  assert.equal(days.at(-1)?.dateStr, "2026-08-31");
});

test("past availability dates are disabled before today but today remains selectable", () => {
  const today = getTodayDateString(new Date("2026-08-08T12:00:00"));

  assert.equal(today, "2026-08-08");
  assert.equal(isPastAvailabilityDate("2026-08-07", today), true);
  assert.equal(isPastAvailabilityDate("2026-08-08", today), false);
  assert.equal(isPastAvailabilityDate("2026-08-09", today), false);
});

test("manual block ranges include both endpoints and normalize reverse selection", () => {
  assert.deepEqual(
    datesForInclusiveRange("2026-08-10", "2026-08-12"),
    ["2026-08-10", "2026-08-11", "2026-08-12"],
  );
  assert.deepEqual(
    datesForInclusiveRange("2026-08-12", "2026-08-10"),
    ["2026-08-10", "2026-08-11", "2026-08-12"],
  );
  assert.deepEqual(datesForInclusiveRange("2026-08-10", "2026-08-10"), ["2026-08-10"]);
});

test("range selection starts as one day and only grows toward the selected outer date", () => {
  assert.deepEqual(
    extendDateRangeSelection("", "", "2026-08-17"),
    { startDate: "2026-08-17", endDate: "2026-08-17" },
  );
  assert.deepEqual(
    extendDateRangeSelection("2026-08-17", "2026-08-17", "2026-08-12"),
    { startDate: "2026-08-12", endDate: "2026-08-17" },
  );
  assert.deepEqual(
    extendDateRangeSelection("2026-08-12", "2026-08-17", "2026-08-21"),
    { startDate: "2026-08-12", endDate: "2026-08-21" },
  );
  assert.deepEqual(
    extendDateRangeSelection("2026-08-12", "2026-08-21", "2026-08-17"),
    { startDate: "2026-08-12", endDate: "2026-08-21" },
  );
  assert.deepEqual(
    selectDateForRange("", "", "2026-08-17"),
    { startDate: "2026-08-17", endDate: "2026-08-17" },
  );
  assert.deepEqual(
    selectDateForRange("2026-08-17", "2026-08-17", "2026-08-12"),
    { startDate: "2026-08-12", endDate: "2026-08-17" },
  );
  assert.deepEqual(
    selectDateForRange("2026-08-12", "2026-08-17", "2026-08-15"),
    { startDate: "2026-08-15", endDate: "2026-08-15" },
  );
  assert.deepEqual(
    selectDateForRange("2026-08-12", "2026-08-17", "2026-08-21"),
    { startDate: "2026-08-21", endDate: "2026-08-21" },
  );
});
