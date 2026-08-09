import assert from "node:assert/strict";
import {test} from "node:test";
import {
  buildBlockedDateProjection,
  buildICalContent,
  datesForRange,
  parseICalContent,
  syncRoomAvailability,
} from "../src/lib/ical.ts";

const makeResponse = (body: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() {
    return body;
  },
});

const airbnbFeed = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260810",
  "DTEND;VALUE=DATE:20260813",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("datesForRange preserves calendar dates for reservation nights", () => {
  assert.deepEqual(datesForRange("2026-08-05", "2026-08-07"), [
    "2026-08-05",
    "2026-08-06",
  ]);
  assert.deepEqual(datesForRange("2026-08-18", "2026-08-21"), [
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
  ]);
  assert.deepEqual(datesForRange("2026-09-27", "2026-09-29"), [
    "2026-09-27",
    "2026-09-28",
  ]);
});

test("buildBlockedDateProjection blocks overlapping sources without choosing a priority", () => {
  assert.deepEqual(
    buildBlockedDateProjection({
      manualBlockedDates: ["2026-08-11"],
      externalBlockedDates: ["2026-08-10", "2026-08-11"],
      confirmedBookings: [
        {checkIn: "2026-08-10", checkOut: "2026-08-12"},
      ],
    }),
    {
      confirmedBookingDates: ["2026-08-10", "2026-08-11"],
      blockedDates: ["2026-08-10", "2026-08-11"],
    },
  );
});

test("parseICalContent extracts inclusive start and exclusive end dates", () => {
  assert.deepEqual(parseICalContent(airbnbFeed), [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
  ]);
});

test("parseICalContent supports folded iCal lines and removes duplicates", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260815",
    "DTEND;VALUE=DATE:20260817",
    "SUMMARY:Reservation that is folded",
    " over two lines",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260816",
    "DTEND;VALUE=DATE:20260818",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

  assert.deepEqual(parseICalContent(feed), [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
  ]);
});

test("syncRoomAvailability merges local and external dates and deduplicates them", async () => {
  const requestedUrls: string[] = [];
  const result = await syncRoomAvailability(
    {
      roomId: "apartamento-101",
      roomName: "Apartamento 101",
      existingBlockedDates: ["2026-08-01"],
      confirmedBookings: [
        {checkIn: "2026-08-20", checkOut: "2026-08-22"},
      ],
      airbnbIcalUrl: "https://example.test/airbnb.ics",
      bookingIcalUrl: "https://example.test/booking.ics",
    },
    async (url) => {
      requestedUrls.push(url);
      return makeResponse(url.includes("airbnb") ? airbnbFeed : [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260812",
        "DTEND;VALUE=DATE:20260815",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"));
    },
  );

  assert.equal(result.shouldUpdate, true);
  assert.deepEqual(requestedUrls, [
    "https://example.test/airbnb.ics",
    "https://example.test/booking.ics",
  ]);
  assert.deepEqual(result.blockedDates, [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-20",
    "2026-08-21",
  ]);
  assert.deepEqual(result.externalBlockedDates, [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
  ]);
});

test("syncRoomAvailability preserves manual blocks in the rebuilt projection", async () => {
  const result = await syncRoomAvailability(
    {
      roomId: "apartamento-104",
      roomName: "Apartamento 104",
      existingBlockedDates: [],
      manualBlockedDates: ["2026-08-20"],
      existingExternalBlockedDates: ["2026-08-01"],
      confirmedBookings: [
        {checkIn: "2026-08-10", checkOut: "2026-08-12"},
      ],
      airbnbIcalUrl: "https://example.test/airbnb.ics",
    },
    async () => makeResponse(airbnbFeed),
  );

  assert.deepEqual(result.blockedDates, [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-20",
  ]);
  assert.deepEqual(result.externalBlockedDates, [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
  ]);
});

test("syncRoomAvailability preserves the last projection when a configured feed fails", async () => {
  const result = await syncRoomAvailability(
    {
      roomId: "apartamento-102",
      roomName: "Apartamento 102",
      existingBlockedDates: ["2026-09-01", "2026-09-02"],
      confirmedBookings: [],
      airbnbIcalUrl: "https://example.test/airbnb.ics",
      bookingIcalUrl: "https://example.test/booking.ics",
    },
    async (url) => url.includes("airbnb")
      ? makeResponse("upstream unavailable", 503)
      : makeResponse(airbnbFeed),
  );

  assert.equal(result.shouldUpdate, false);
  assert.equal(result.status, "skipped");
  assert.deepEqual(result.blockedDates, ["2026-09-01", "2026-09-02"]);
  assert.deepEqual(result.errors, ["Airbnb respondió HTTP 503."]);
});

test("syncRoomAvailability rejects invalid iCal instead of clearing dates", async () => {
  const result = await syncRoomAvailability(
    {
      roomId: "apartamento-103",
      roomName: "Apartamento 103",
      existingBlockedDates: ["2026-10-01"],
      confirmedBookings: [],
      bookingIcalUrl: "https://example.test/booking.ics",
    },
    async () => makeResponse("not an iCal document"),
  );

  assert.equal(result.shouldUpdate, false);
  assert.match(result.errors[0], /documento iCal válido/);
  assert.deepEqual(result.blockedDates, ["2026-10-01"]);
});

test("buildICalContent exports the complete blocked-date projection", () => {
  const feed = buildICalContent(
    "Apartamento 101",
    ["2026-11-10", "2026-11-11", "2026-11-13"],
    new Date("2026-08-01T12:00:00.000Z"),
  );

  assert.equal((feed.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.deepEqual(parseICalContent(feed), [
    "2026-11-10",
    "2026-11-11",
    "2026-11-13",
  ]);
  assert.match(feed, /X-WR-CALNAME:Cardamomo - Apartamento 101/);
  assert.match(feed, /DTSTAMP:\d{8}T\d{6}Z/);
});
