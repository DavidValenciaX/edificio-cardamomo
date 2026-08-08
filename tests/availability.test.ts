import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAvailabilityDateSets,
  getAvailabilityStatus,
  getBookingsForDate,
  getCalendarDays,
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
