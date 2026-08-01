export interface ICalBookingRange {
  checkIn: string;
  checkOut: string;
}

export interface ICalSyncInput {
  roomId: string;
  roomName: string;
  existingBlockedDates: string[];
  confirmedBookings: ICalBookingRange[];
  airbnbIcalUrl?: string;
  bookingIcalUrl?: string;
}

export interface ICalSyncResult {
  roomId: string;
  roomName: string;
  shouldUpdate: boolean;
  status: "synced" | "skipped";
  blockedDates: string[];
  hasAirbnbIcal: boolean;
  hasBookingIcal: boolean;
  errors: string[];
}

export interface ICalFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type ICalFetcher = (url: string) => Promise<ICalFetchResponse>;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const I_CAL_DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})/;

function isValidDateString(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function dateToString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(dateString: string, days: number): string {
  const match = DATE_PATTERN.exec(dateString);
  if (!match) return dateString;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return dateToString(date);
}

export function datesForRange(checkIn: string, checkOut: string): string[] {
  if (!isValidDateString(checkIn) || !isValidDateString(checkOut)) return [];

  const dates: string[] = [];
  let current = checkIn;
  while (current < checkOut) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function unfoldICalLines(icalText: string): string[] {
  const unfolded: string[] = [];

  for (const rawLine of icalText.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if ((rawLine.startsWith(" ") || rawLine.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += rawLine.slice(1);
    } else {
      unfolded.push(rawLine);
    }
  }

  return unfolded;
}

function readICalDateValue(propertyLine: string): string | null {
  const separatorIndex = propertyLine.indexOf(":");
  if (separatorIndex < 0) return null;

  const value = propertyLine.slice(separatorIndex + 1).trim();
  const match = I_CAL_DATE_PATTERN.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function isValidICalDocument(icalText: string): boolean {
  return /(?:^|\r?\n)BEGIN:VCALENDAR\s*(?:\r?\n|$)/.test(icalText)
    && /(?:^|\r?\n)END:VCALENDAR\s*(?:\r?\n|$)/.test(icalText);
}

/**
 * Extract blocked nights from VEVENT ranges. DTSTART is inclusive and DTEND
 * is exclusive, matching the reservation semantics used by the app.
 */
export function parseICalContent(icalText: string): string[] {
  if (!isValidICalDocument(icalText)) {
    throw new Error("La respuesta no contiene un documento iCal válido.");
  }

  const blockedDates: string[] = [];
  let currentEvent: { start?: string; end?: string } | null = null;

  for (const rawLine of unfoldICalLines(icalText)) {
    const line = rawLine.trim();

    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent?.start && currentEvent.end) {
        blockedDates.push(...datesForRange(currentEvent.start, currentEvent.end));
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    if (line.startsWith("DTSTART")) {
      currentEvent.start = readICalDateValue(line) || undefined;
    } else if (line.startsWith("DTEND")) {
      currentEvent.end = readICalDateValue(line) || undefined;
    }
  }

  return [...new Set(blockedDates)].sort();
}

function normalizeDateList(dates: string[]): string[] {
  return [...new Set(dates.filter(isValidDateString))].sort();
}

function escapeICalText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

function groupConsecutiveDates(dates: string[]): { start: string; end: string }[] {
  const normalized = normalizeDateList(dates);
  if (normalized.length === 0) return [];

  const ranges: { start: string; end: string }[] = [];
  let start = normalized[0];
  let previous = normalized[0];

  for (const date of normalized.slice(1)) {
    if (date === addDays(previous, 1)) {
      previous = date;
      continue;
    }

    ranges.push({ start, end: addDays(previous, 1) });
    start = date;
    previous = date;
  }

  ranges.push({ start, end: addDays(previous, 1) });
  return ranges;
}

function toICalStamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 15) + "Z";
}

/** Build a read-only feed from the room's complete blocked-date projection. */
export function buildICalContent(roomName: string, blockedDates: string[], stamp = new Date()): string {
  const safeRoomName = escapeICalText(roomName || "Apartastudio");
  const ranges = groupConsecutiveDates(blockedDates);
  let icalContent = "BEGIN:VCALENDAR\r\n";
  icalContent += "VERSION:2.0\r\n";
  icalContent += "PRODID:-//Edificio Cardamomo//Calendar Sync//ES\r\n";
  icalContent += "CALSCALE:GREGORIAN\r\n";
  icalContent += "METHOD:PUBLISH\r\n";
  icalContent += `X-WR-CALNAME:Cardamomo - ${safeRoomName}\r\n`;

  for (const range of ranges) {
    const startCompact = range.start.replace(/-/g, "");
    const endCompact = range.end.replace(/-/g, "");
    icalContent += "BEGIN:VEVENT\r\n";
    icalContent += `UID:blocked-${range.start}-${range.end}@edificiocardamomo.com\r\n`;
    icalContent += `DTSTAMP:${toICalStamp(stamp)}\r\n`;
    icalContent += `DTSTART;VALUE=DATE:${startCompact}\r\n`;
    icalContent += `DTEND;VALUE=DATE:${endCompact}\r\n`;
    icalContent += `SUMMARY:Disponibilidad bloqueada - ${safeRoomName}\r\n`;
    icalContent += "STATUS:CONFIRMED\r\n";
    icalContent += "END:VEVENT\r\n";
  }

  return `${icalContent}END:VCALENDAR\r\n`;
}

async function fetchSourceDates(
  sourceName: string,
  url: string,
  fetcher: ICalFetcher,
): Promise<string[]> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`${sourceName} respondió HTTP ${response.status}.`);
  }

  return parseICalContent(await response.text());
}

/**
 * Rebuild a room's availability from authoritative local bookings and all
 * configured external feeds. A failed source makes the result non-updatable
 * so callers can preserve the last known-good Firestore projection.
 */
export async function syncRoomAvailability(
  input: ICalSyncInput,
  fetcher: ICalFetcher = (url) => fetch(url),
): Promise<ICalSyncResult> {
  const externalSources = [
    { name: "Airbnb", url: input.airbnbIcalUrl?.trim() || "" },
    { name: "Booking.com", url: input.bookingIcalUrl?.trim() || "" },
  ];
  const errors: string[] = [];
  const nextBlockedDates: string[] = [];

  for (const booking of input.confirmedBookings) {
    nextBlockedDates.push(...datesForRange(booking.checkIn, booking.checkOut));
  }

  for (const source of externalSources) {
    if (!source.url) continue;

    try {
      nextBlockedDates.push(...await fetchSourceDates(source.name, source.url, fetcher));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${source.name} no pudo sincronizarse.`);
    }
  }

  if (errors.length > 0) {
    return {
      roomId: input.roomId,
      roomName: input.roomName,
      shouldUpdate: false,
      status: "skipped",
      blockedDates: normalizeDateList(input.existingBlockedDates),
      hasAirbnbIcal: Boolean(externalSources[0].url),
      hasBookingIcal: Boolean(externalSources[1].url),
      errors,
    };
  }

  return {
    roomId: input.roomId,
    roomName: input.roomName,
    shouldUpdate: true,
    status: "synced",
    blockedDates: normalizeDateList(nextBlockedDates),
    hasAirbnbIcal: Boolean(externalSources[0].url),
    hasBookingIcal: Boolean(externalSources[1].url),
    errors: [],
  };
}
