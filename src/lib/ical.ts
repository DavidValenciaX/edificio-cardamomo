export interface ICalBookingRange {
  checkIn: string;
  checkOut: string;
}

export interface BlockedDateProjectionInput {
  manualBlockedDates?: string[];
  externalBlockedDates?: string[];
  confirmedBookings: ICalBookingRange[];
}

export interface BlockedDateProjection {
  blockedDates: string[];
  confirmedBookingDates: string[];
}

export interface ICalSyncInput {
  roomId: string;
  roomName: string;
  existingBlockedDates: string[];
  manualBlockedDates?: string[];
  existingExternalBlockedDates?: string[];
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
  externalBlockedDates: string[];
  hasAirbnbIcal: boolean;
  hasBookingIcal: boolean;
  errors: string[];
  warnings: string[];
  sourceDiagnostics: ICalSourceDiagnostic[];
  summary: ICalSyncSummary;
}

export interface ICalFetchResponse {
  ok: boolean;
  status: number;
  headers?: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
}

export type ICalFetcher = (url: string) => Promise<ICalFetchResponse>;

export interface ICalSourceDiagnostic {
  sourceName: string;
  configured: boolean;
  urlSummary: string | null;
  status: "not_configured" | "fetched" | "failed";
  durationMs: number;
  httpStatus: number | null;
  responseBytes: number | null;
  contentType: string | null;
  rawLineCount: number;
  eventCount: number;
  completeEventCount: number;
  incompleteEventCount: number;
  blockedDatesCount: number;
  firstBlockedDate: string | null;
  lastBlockedDate: string | null;
  warnings: string[];
  error: string | null;
}

export interface ICalSyncSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  configuredSourcesCount: number;
  successfulSourcesCount: number;
  failedSourcesCount: number;
  confirmedBookingsCount: number;
  confirmedBookingDatesCount: number;
  manualBlockedDatesCount: number;
  previousBlockedDatesCount: number;
  previousExternalBlockedDatesCount: number;
  nextBlockedDatesCount: number;
  nextExternalBlockedDatesCount: number;
  blockedDatesChanged: boolean;
  externalBlockedDatesChanged: boolean;
  changedBlockedDatesCount: number;
  changedExternalBlockedDatesCount: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const I_CAL_DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})/;

interface ParsedICalDetails {
  blockedDates: string[];
  eventCount: number;
  completeEventCount: number;
  incompleteEventCount: number;
  rawLineCount: number;
}

interface ICalSourceFetchResult {
  dates: string[];
  diagnostic: ICalSourceDiagnostic;
}

class ICalSourceSyncError extends Error {
  diagnostic: ICalSourceDiagnostic;

  constructor(message: string, diagnostic: ICalSourceDiagnostic) {
    super(message);
    this.name = "ICalSourceSyncError";
    this.diagnostic = diagnostic;
  }
}

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

/**
 * Builds the public availability projection from every authoritative source.
 * Overlapping dates intentionally collapse into one blocked date: iCal does
 * not provide a safe priority rule between Airbnb, Booking.com, and direct
 * bookings, so the conservative result is to keep the night unavailable.
 */
export function buildBlockedDateProjection(
  input: BlockedDateProjectionInput,
): BlockedDateProjection {
  const confirmedBookingDates = normalizeDateList(
    input.confirmedBookings.flatMap((booking) => datesForRange(booking.checkIn, booking.checkOut)),
  );
  const manualBlockedDates = normalizeDateList(input.manualBlockedDates || []);
  const externalBlockedDates = normalizeDateList(input.externalBlockedDates || []);

  return {
    confirmedBookingDates,
    blockedDates: normalizeDateList([
      ...manualBlockedDates,
      ...externalBlockedDates,
      ...confirmedBookingDates,
    ]),
  };
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

function summarizeSourceUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    return `${parsedUrl.protocol}//${parsedUrl.host} (segments:${pathSegments.length}, lastSegmentLength:${pathSegments.at(-1)?.length || 0}, query:${parsedUrl.search ? "yes" : "no"})`;
  } catch {
    return `invalid-url-format(length:${url.length})`;
  }
}

function getDateRangePreview(dates: string[]): { firstBlockedDate: string | null; lastBlockedDate: string | null } {
  const normalizedDates = normalizeDateList(dates);
  return {
    firstBlockedDate: normalizedDates[0] || null,
    lastBlockedDate: normalizedDates[normalizedDates.length - 1] || null,
  };
}

function areDateListsEqual(previousDates: string[], nextDates: string[]): boolean {
  const previous = normalizeDateList(previousDates);
  const next = normalizeDateList(nextDates);
  if (previous.length !== next.length) return false;

  return previous.every((date, index) => date === next[index]);
}

function countDateListChanges(previousDates: string[], nextDates: string[]): number {
  const previous = new Set(normalizeDateList(previousDates));
  const next = new Set(normalizeDateList(nextDates));
  let changes = 0;

  for (const date of previous) {
    if (!next.has(date)) {
      changes += 1;
    }
  }

  for (const date of next) {
    if (!previous.has(date)) {
      changes += 1;
    }
  }

  return changes;
}

export function buildSyncSummary(params: {
  startedAt: Date;
  configuredSourcesCount: number;
  successfulSourcesCount: number;
  failedSourcesCount: number;
  confirmedBookingsCount: number;
  confirmedBookingDatesCount: number;
  manualBlockedDatesCount: number;
  previousBlockedDatesCount: number;
  previousExternalBlockedDatesCount: number;
  nextBlockedDates: string[];
  nextExternalBlockedDates: string[];
  comparisonBlockedDates: string[];
  comparisonExternalBlockedDates: string[];
}): ICalSyncSummary {
  const finishedAt = new Date();
  return {
    startedAt: params.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - params.startedAt.getTime(),
    configuredSourcesCount: params.configuredSourcesCount,
    successfulSourcesCount: params.successfulSourcesCount,
    failedSourcesCount: params.failedSourcesCount,
    confirmedBookingsCount: params.confirmedBookingsCount,
    confirmedBookingDatesCount: params.confirmedBookingDatesCount,
    manualBlockedDatesCount: params.manualBlockedDatesCount,
    previousBlockedDatesCount: params.previousBlockedDatesCount,
    previousExternalBlockedDatesCount: params.previousExternalBlockedDatesCount,
    nextBlockedDatesCount: params.nextBlockedDates.length,
    nextExternalBlockedDatesCount: params.nextExternalBlockedDates.length,
    blockedDatesChanged: !areDateListsEqual(params.comparisonBlockedDates, params.nextBlockedDates),
    externalBlockedDatesChanged: !areDateListsEqual(params.comparisonExternalBlockedDates, params.nextExternalBlockedDates),
    changedBlockedDatesCount: countDateListChanges(params.comparisonBlockedDates, params.nextBlockedDates),
    changedExternalBlockedDatesCount: countDateListChanges(params.comparisonExternalBlockedDates, params.nextExternalBlockedDates),
  };
}

function buildRoomWarnings(params: {
  configuredSourcesCount: number;
  successfulSourcesCount: number;
  nextExternalBlockedDates: string[];
  nextBlockedDates: string[];
  comparisonBlockedDates: string[];
  sourceDiagnostics: ICalSourceDiagnostic[];
}): string[] {
  const warnings: string[] = [];
  if (params.configuredSourcesCount === 0) {
    warnings.push("No hay feeds iCal externos configurados para este apartamento.");
  }

  if (params.configuredSourcesCount > 0 && params.successfulSourcesCount > 0 && params.nextExternalBlockedDates.length === 0) {
    warnings.push("Los feeds iCal configurados respondieron, pero no aportaron fechas bloqueadas externas.");
  }

  if (areDateListsEqual(params.comparisonBlockedDates, params.nextBlockedDates)) {
    warnings.push("La sincronización terminó sin cambios en blockedDates.");
  }

  if (params.sourceDiagnostics.some((diagnostic) => diagnostic.warnings.length > 0)) {
    warnings.push("Uno o más feeds devolvieron advertencias; revisa sourceDiagnostics.");
  }

  return warnings;
}

/**
 * Extract blocked nights from VEVENT ranges. DTSTART is inclusive and DTEND
 * is exclusive, matching the reservation semantics used by the app.
 */
export function parseICalContent(icalText: string): string[] {
  return parseICalDocumentDetails(icalText).blockedDates;
}

function parseICalDocumentDetails(icalText: string): ParsedICalDetails {
  if (!isValidICalDocument(icalText)) {
    throw new Error("La respuesta no contiene un documento iCal válido.");
  }

  const unfoldedLines = unfoldICalLines(icalText);
  const blockedDates: string[] = [];
  let currentEvent: { start?: string; end?: string } | null = null;
  let eventCount = 0;
  let completeEventCount = 0;
  let incompleteEventCount = 0;

  for (const rawLine of unfoldedLines) {
    const line = rawLine.trim();

    if (line === "BEGIN:VEVENT") {
      eventCount += 1;
      currentEvent = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent?.start && currentEvent.end) {
        blockedDates.push(...datesForRange(currentEvent.start, currentEvent.end));
        completeEventCount += 1;
      } else if (currentEvent) {
        incompleteEventCount += 1;
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

  return {
    blockedDates: [...new Set(blockedDates)].sort(),
    eventCount,
    completeEventCount,
    incompleteEventCount,
    rawLineCount: unfoldedLines.length,
  };
}

export function normalizeDateList(dates: string[]): string[] {
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
  return date.toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
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
): Promise<ICalSourceFetchResult> {
  const startedAt = Date.now();
  const urlSummary = summarizeSourceUrl(url);
  try {
    const response = await fetcher(url);
    const contentType = response.headers?.get("content-type") || null;
    if (!response.ok) {
      throw new ICalSourceSyncError(`${sourceName} respondió HTTP ${response.status}.`, {
        sourceName,
        configured: true,
        urlSummary,
        status: "failed",
        durationMs: Date.now() - startedAt,
        httpStatus: response.status,
        responseBytes: null,
        contentType,
        rawLineCount: 0,
        eventCount: 0,
        completeEventCount: 0,
        incompleteEventCount: 0,
        blockedDatesCount: 0,
        firstBlockedDate: null,
        lastBlockedDate: null,
        warnings: [],
        error: `${sourceName} respondió HTTP ${response.status}.`,
      });
    }

    const rawText = await response.text();

    try {
      const parsed = parseICalDocumentDetails(rawText);
      const warnings: string[] = [];
      if (parsed.eventCount === 0) {
        warnings.push("Documento iCal válido, pero sin eventos VEVENT.");
      }
      if (parsed.incompleteEventCount > 0) {
        warnings.push(`Se ignoraron ${parsed.incompleteEventCount} eventos incompletos sin DTSTART/DTEND.`);
      }

      return {
        dates: parsed.blockedDates,
        diagnostic: {
          sourceName,
          configured: true,
          urlSummary,
          status: "fetched",
          durationMs: Date.now() - startedAt,
          httpStatus: response.status,
          responseBytes: rawText.length,
          contentType,
          rawLineCount: parsed.rawLineCount,
          eventCount: parsed.eventCount,
          completeEventCount: parsed.completeEventCount,
          incompleteEventCount: parsed.incompleteEventCount,
          blockedDatesCount: parsed.blockedDates.length,
          ...getDateRangePreview(parsed.blockedDates),
          warnings,
          error: null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${sourceName} devolvió una respuesta no interpretable.`;
      throw new ICalSourceSyncError(message, {
        sourceName,
        configured: true,
        urlSummary,
        status: "failed",
        durationMs: Date.now() - startedAt,
        httpStatus: response.status,
        responseBytes: rawText.length,
        contentType,
        rawLineCount: rawText.replace(/^\uFEFF/, "").split(/\r?\n/).length,
        eventCount: 0,
        completeEventCount: 0,
        incompleteEventCount: 0,
        blockedDatesCount: 0,
        firstBlockedDate: null,
        lastBlockedDate: null,
        warnings: [],
        error: message,
      });
    }
  } catch (error) {
    if (error instanceof ICalSourceSyncError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : `${sourceName} no pudo sincronizarse.`;
    throw new ICalSourceSyncError(message, {
      sourceName,
      configured: true,
      urlSummary,
      status: "failed",
      durationMs: Date.now() - startedAt,
      httpStatus: null,
      responseBytes: null,
      contentType: null,
      rawLineCount: 0,
      eventCount: 0,
      completeEventCount: 0,
      incompleteEventCount: 0,
      blockedDatesCount: 0,
      firstBlockedDate: null,
      lastBlockedDate: null,
      warnings: [],
      error: message,
    });
  }
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
  const startedAt = new Date();
  const externalSources = [
    { name: "Airbnb", url: input.airbnbIcalUrl?.trim() || "" },
    { name: "Booking.com", url: input.bookingIcalUrl?.trim() || "" },
  ];
  const errors: string[] = [];
  const manualBlockedDates = normalizeDateList(input.manualBlockedDates || []);
  const nextExternalBlockedDates: string[] = [];
  const sourceDiagnostics: ICalSourceDiagnostic[] = [];
  const confirmedBookingDates = buildBlockedDateProjection({
    confirmedBookings: input.confirmedBookings,
  }).confirmedBookingDates;
  const previousBlockedDates = normalizeDateList(input.existingBlockedDates);
  const previousExternalBlockedDates = normalizeDateList(input.existingExternalBlockedDates || []);

  for (const source of externalSources) {
    if (!source.url) {
      sourceDiagnostics.push({
        sourceName: source.name,
        configured: false,
        urlSummary: null,
        status: "not_configured",
        durationMs: 0,
        httpStatus: null,
        responseBytes: null,
        contentType: null,
        rawLineCount: 0,
        eventCount: 0,
        completeEventCount: 0,
        incompleteEventCount: 0,
        blockedDatesCount: 0,
        firstBlockedDate: null,
        lastBlockedDate: null,
        warnings: ["No hay URL configurada para esta fuente."],
        error: null,
      });
      continue;
    }

    const sourceStartedAt = Date.now();
    try {
      const sourceResult = await fetchSourceDates(source.name, source.url, fetcher);
      nextExternalBlockedDates.push(...sourceResult.dates);
      sourceDiagnostics.push(sourceResult.diagnostic);
    } catch (error) {
      const message = error instanceof Error ? error.message : `${source.name} no pudo sincronizarse.`;
      errors.push(message);
      const sourceDiagnostic = error instanceof ICalSourceSyncError
        ? error.diagnostic
        : {
            sourceName: source.name,
            configured: true,
            urlSummary: summarizeSourceUrl(source.url),
            status: "failed" as const,
            durationMs: Date.now() - sourceStartedAt,
            httpStatus: null,
            responseBytes: null,
            contentType: null,
            rawLineCount: 0,
            eventCount: 0,
            completeEventCount: 0,
            incompleteEventCount: 0,
            blockedDatesCount: 0,
            firstBlockedDate: null,
            lastBlockedDate: null,
            warnings: [],
            error: message,
          };
      sourceDiagnostics.push({
        ...sourceDiagnostic,
        error: message,
      });
    }
  }

  const configuredSourcesCount = sourceDiagnostics.filter((diagnostic) => diagnostic.configured).length;
  const successfulSourcesCount = sourceDiagnostics.filter((diagnostic) => diagnostic.status === "fetched").length;
  const failedSourcesCount = sourceDiagnostics.filter((diagnostic) => diagnostic.status === "failed").length;

  if (errors.length > 0) {
    const summary = buildSyncSummary({
      startedAt,
      configuredSourcesCount,
      successfulSourcesCount,
      failedSourcesCount,
      confirmedBookingsCount: input.confirmedBookings.length,
      confirmedBookingDatesCount: confirmedBookingDates.length,
      manualBlockedDatesCount: manualBlockedDates.length,
      previousBlockedDatesCount: previousBlockedDates.length,
      previousExternalBlockedDatesCount: previousExternalBlockedDates.length,
      nextBlockedDates: previousBlockedDates,
      nextExternalBlockedDates: previousExternalBlockedDates,
      comparisonBlockedDates: previousBlockedDates,
      comparisonExternalBlockedDates: previousExternalBlockedDates,
    });
    return {
      roomId: input.roomId,
      roomName: input.roomName,
      shouldUpdate: false,
      status: "skipped",
      blockedDates: previousBlockedDates,
      externalBlockedDates: previousExternalBlockedDates,
      hasAirbnbIcal: Boolean(externalSources[0].url),
      hasBookingIcal: Boolean(externalSources[1].url),
      errors,
      warnings: buildRoomWarnings({
        configuredSourcesCount,
        successfulSourcesCount,
        nextExternalBlockedDates: previousExternalBlockedDates,
        nextBlockedDates: previousBlockedDates,
        comparisonBlockedDates: previousBlockedDates,
        sourceDiagnostics,
      }),
      sourceDiagnostics,
      summary,
    };
  }

  const normalizedExternalBlockedDates = normalizeDateList(nextExternalBlockedDates);
  const normalizedBlockedDates = buildBlockedDateProjection({
    manualBlockedDates,
    externalBlockedDates: normalizedExternalBlockedDates,
    confirmedBookings: input.confirmedBookings,
  }).blockedDates;
  const summary = buildSyncSummary({
    startedAt,
    configuredSourcesCount,
    successfulSourcesCount,
    failedSourcesCount,
    confirmedBookingsCount: input.confirmedBookings.length,
    confirmedBookingDatesCount: confirmedBookingDates.length,
    manualBlockedDatesCount: manualBlockedDates.length,
    previousBlockedDatesCount: previousBlockedDates.length,
    previousExternalBlockedDatesCount: previousExternalBlockedDates.length,
    nextBlockedDates: normalizedBlockedDates,
    nextExternalBlockedDates: normalizedExternalBlockedDates,
    comparisonBlockedDates: previousBlockedDates,
    comparisonExternalBlockedDates: previousExternalBlockedDates,
  });

  return {
    roomId: input.roomId,
    roomName: input.roomName,
    shouldUpdate: true,
    status: "synced",
    blockedDates: normalizedBlockedDates,
    externalBlockedDates: normalizedExternalBlockedDates,
    hasAirbnbIcal: Boolean(externalSources[0].url),
    hasBookingIcal: Boolean(externalSources[1].url),
    errors: [],
    warnings: buildRoomWarnings({
      configuredSourcesCount,
      successfulSourcesCount,
      nextExternalBlockedDates: normalizedExternalBlockedDates,
      nextBlockedDates: normalizedBlockedDates,
      comparisonBlockedDates: previousBlockedDates,
      sourceDiagnostics,
    }),
    sourceDiagnostics,
    summary,
  };
}
