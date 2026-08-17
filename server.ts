import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { OAuth2Client } from "google-auth-library";
import {
  initializeApp,
  getApps,
  getApp,
  applicationDefault,
} from "firebase-admin";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  buildBlockedDateProjection,
  buildICalContent,
  buildSyncSummary,
  filterDateListFrom,
  normalizeDateList,
  syncRoomAvailability,
} from "./src/lib/ical.ts";
import type { ICalBookingRange, ICalSourceDiagnostic, ICalSyncSummary } from "./src/lib/ical.ts";

function readRequiredServerEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  console.error(`[config] Missing required server env var: ${name}`);
  process.exit(1);
}

const firebaseConfig = {
  projectId: readRequiredServerEnv("FIREBASE_PROJECT_ID"),
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
};
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "edificiocardamomo@gmail.com";
const CLOUD_SCHEDULER_OIDC_AUDIENCE = process.env.CLOUD_SCHEDULER_OIDC_AUDIENCE?.trim() || "";
const CLOUD_SCHEDULER_OIDC_EMAIL = process.env.CLOUD_SCHEDULER_OIDC_EMAIL?.trim() || "";
const schedulerOidcClient = new OAuth2Client();

// Initialize Firebase Admin SDK (server-side).
// Uses Application Default Credentials: GOOGLE_APPLICATION_CREDENTIALS in local
// dev (service account JSON), or the runtime service account in Cloud Functions/Cloud Run.
// Admin bypasses Firestore security rules, so server endpoints are not subject to
// request.auth checks.
try {
  if (!getApps().length) {
    initializeApp({
      projectId: firebaseConfig.projectId,
      credential: applicationDefault(),
    });
  }
} catch (err) {
  console.error(
    "[firebase-admin] Failed to initialize. For local dev set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path (or run `gcloud auth application-default login`).",
    err
  );
  process.exit(1);
}

const db = getFirestore(getApp(), firebaseConfig.firestoreDatabaseId || "(default)");

const app = express();
const configuredCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function applyApiCors(req: express.Request, res: express.Response) {
  const requestOrigin = req.headers.origin;
  if (!requestOrigin) return;

  if (configuredCorsOrigins.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (configuredCorsOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
  } else {
    return;
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    applyApiCors(req, res);
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
  }
  next();
});
app.use(express.json());
const PORT = Number(process.env.PORT || 3000);
const ENABLE_ICAL_SYNC_TIMER = process.env.ENABLE_ICAL_SYNC_TIMER === "true";

interface RoomIntegrationRecord {
  roomId: string;
  airbnbIcalUrl: string;
  bookingIcalUrl: string;
}

type ICalSyncAuthMode = "admin_token" | "scheduler_oidc" | "loopback";

function extractBearerToken(req: express.Request): string {
  const authorization = req.headers.authorization || "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function getRequestNetworkDetails(req: express.Request): { forwardedFor: string | null; remoteAddress: string | null } {
  const forwardedFor = typeof req.headers["x-forwarded-for"] === "string"
    ? req.headers["x-forwarded-for"].split(",")[0].trim()
    : "";
  const remoteAddress = forwardedFor || req.socket.remoteAddress || "";
  return {
    forwardedFor: forwardedFor || null,
    remoteAddress: remoteAddress || null,
  };
}

function isLoopbackRequest(req: express.Request): boolean {
  const { remoteAddress } = getRequestNetworkDetails(req);
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

function buildIcalSyncRunId(): string {
  return `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getIcalSyncRequestContext(req: express.Request, authMode?: ICalSyncAuthMode) {
  const network = getRequestNetworkDetails(req);
  return {
    authMode: authMode || "unknown",
    origin: req.headers.origin || null,
    referer: req.headers.referer || null,
    userAgent: req.headers["user-agent"] || null,
    hasAuthorizationHeader: Boolean(req.headers.authorization),
    ...network,
  };
}

function serializeErrorForLog(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack || null,
      name: error.name,
    };
  }

  return {
    message: String(error),
    stack: null,
    name: "UnknownError",
  };
}

async function isAdminBearerToken(idToken: string): Promise<boolean> {
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return decoded.email === ADMIN_EMAIL;
  } catch {
    return false;
  }
}

async function isSchedulerOidcBearerToken(idToken: string): Promise<boolean> {
  if (!CLOUD_SCHEDULER_OIDC_AUDIENCE || !CLOUD_SCHEDULER_OIDC_EMAIL) {
    return false;
  }

  try {
    const ticket = await schedulerOidcClient.verifyIdToken({
      idToken,
      audience: CLOUD_SCHEDULER_OIDC_AUDIENCE,
    });
    const payload = ticket.getPayload();
    if (!payload) return false;

    const issuer = payload.iss || "";
    const issuerIsTrusted =
      issuer === "accounts.google.com" ||
      issuer === "https://accounts.google.com";

    return issuerIsTrusted
      && payload.email_verified === true
      && payload.email === CLOUD_SCHEDULER_OIDC_EMAIL;
  } catch {
    return false;
  }
}

async function authorizeIcalSyncRequest(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    if (await isAdminBearerToken(bearerToken)) {
      res.locals.icalSyncAuthMode = "admin_token" as ICalSyncAuthMode;
      return next();
    }

    if (await isSchedulerOidcBearerToken(bearerToken)) {
      res.locals.icalSyncAuthMode = "scheduler_oidc" as ICalSyncAuthMode;
      return next();
    }

    console.warn("[iCal sync] Authorization denied for bearer token", getIcalSyncRequestContext(req));
    return res.status(403).json({
      error: "No autorizado para sincronizar iCal. Use un token de administrador o el OIDC de Cloud Scheduler configurado.",
    });
  }

  if (isLoopbackRequest(req)) {
    res.locals.icalSyncAuthMode = "loopback" as ICalSyncAuthMode;
    return next();
  }

  console.warn("[iCal sync] Authorization denied without bearer token", getIcalSyncRequestContext(req));
  return res.status(401).json({
    error: "La sincronización iCal requiere autenticación de administrador o Scheduler.",
  });
}

function normalizeRoomIntegration(raw: any, roomId: string): RoomIntegrationRecord {
  const airbnbIcalUrl =
    typeof raw?.airbnbIcalUrl === "string"
      ? raw.airbnbIcalUrl.trim()
      : typeof raw?.airbnb_ical_url === "string"
        ? raw.airbnb_ical_url.trim()
        : "";
  const bookingIcalUrl =
    typeof raw?.bookingIcalUrl === "string"
      ? raw.bookingIcalUrl.trim()
      : typeof raw?.booking_ical_url === "string"
        ? raw.booking_ical_url.trim()
        : "";

  return {
    roomId,
    airbnbIcalUrl,
    bookingIcalUrl,
  };
}

async function loadRoomIntegration(roomId: string, roomData: any): Promise<RoomIntegrationRecord> {
  const integrationRef = db.collection("roomIntegrations").doc(roomId);
  const integrationSnap = await integrationRef.get();
  if (integrationSnap.exists) {
    return normalizeRoomIntegration(integrationSnap.data(), roomId);
  }

  const legacyIntegration = normalizeRoomIntegration(roomData, roomId);
  if (!legacyIntegration.airbnbIcalUrl && !legacyIntegration.bookingIcalUrl) {
    return legacyIntegration;
  }

  const batch = db.batch();
  batch.set(integrationRef, legacyIntegration);
  batch.update(db.collection("rooms").doc(roomId), {
    airbnb_ical_url: FieldValue.delete(),
    booking_ical_url: FieldValue.delete(),
  });
  await batch.commit();

  return legacyIntegration;
}

interface RoomAvailabilityProjectionUpdate {
  blockedDates: string[];
  manualBlockedDates: string[];
  externalBlockedDates: string[];
  confirmedBookingsCount: number;
  confirmedBookingDatesCount: number;
  previousBlockedDates: string[];
  previousExternalBlockedDates: string[];
}

function normalizeStoredDateList(value: unknown): string[] {
  return Array.isArray(value)
    ? normalizeDateList(value.filter((date): date is string => typeof date === "string"))
    : [];
}

/**
 * Rebuilds and writes the room projection from a fresh Firestore snapshot.
 * External feeds are fetched before this function is called, but all local
 * data is read again inside the transaction so a direct booking or
 * cancellation cannot be lost by a stale iCal sync.
 */
async function updateRoomAvailabilityProjection(
  roomId: string,
  externalBlockedDates?: string[],
): Promise<RoomAvailabilityProjectionUpdate> {
  const roomRef = db.collection("rooms").doc(roomId);
  const bookingsQuery = db
    .collection("bookings")
    .where("roomId", "==", roomId)
    .where("status", "==", "confirmed");

  return db.runTransaction(async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    const confirmedBookingsSnap = await transaction.get(bookingsQuery);
    if (!roomSnap.exists) {
      throw new Error("Apartamento no encontrado.");
    }

    const roomData = roomSnap.data() || {};
    const previousBlockedDates = normalizeStoredDateList(roomData.blockedDates);
    const manualBlockedDates = Array.isArray(roomData.manualBlockedDates)
      ? normalizeStoredDateList(roomData.manualBlockedDates)
      : previousBlockedDates;
    const currentExternalBlockedDates = normalizeStoredDateList(roomData.externalBlockedDates);
    const nextExternalBlockedDates = filterDateListFrom(
      externalBlockedDates === undefined ? currentExternalBlockedDates : externalBlockedDates,
    );
    const confirmedBookings: ICalBookingRange[] = confirmedBookingsSnap.docs.map((bookingDoc) => {
      const booking = bookingDoc.data();
      return {
        checkIn: typeof booking.checkIn === "string" ? booking.checkIn : "",
        checkOut: typeof booking.checkOut === "string" ? booking.checkOut : "",
      };
    });
    const projection = buildBlockedDateProjection({
      manualBlockedDates,
      externalBlockedDates: nextExternalBlockedDates,
      confirmedBookings,
    });
    const activeBlockedDates = filterDateListFrom(projection.blockedDates);
    const activeConfirmedBookingDates = filterDateListFrom(projection.confirmedBookingDates);

    transaction.update(roomRef, {
      blockedDates: activeBlockedDates,
      manualBlockedDates,
      externalBlockedDates: nextExternalBlockedDates,
    });

    return {
      blockedDates: activeBlockedDates,
      manualBlockedDates,
      externalBlockedDates: nextExternalBlockedDates,
      confirmedBookingsCount: confirmedBookings.length,
      confirmedBookingDatesCount: activeConfirmedBookingDates.length,
      previousBlockedDates,
      previousExternalBlockedDates: currentExternalBlockedDates,
    };
  });
}

async function rebuildRoomBlockedDates(roomId: string): Promise<string[]> {
  const projection = await updateRoomAvailabilityProjection(roomId);
  return projection.blockedDates;
}

// -------------------------------------------------------------
// 0. ENDPOINT: Consolidate anonymous temporary guests into accounts
// -------------------------------------------------------------
app.post("/api/consolidate-temporary-user", async (req, res) => {
  const authorization = req.headers.authorization || "";
  const finalIdToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const { temporaryUserId, temporaryIdToken, finalProfile } = req.body || {};

  if (!finalIdToken || !temporaryUserId || !temporaryIdToken || !finalProfile) {
    return res.status(400).json({ error: "Missing temporary/final user consolidation data." });
  }

  try {
    const [finalToken, temporaryToken] = await Promise.all([
      getAuth().verifyIdToken(finalIdToken),
      getAuth().verifyIdToken(temporaryIdToken),
    ]);

    if (temporaryToken.uid !== temporaryUserId) {
      return res.status(403).json({ error: "Temporary token does not match the temporary user." });
    }

    const temporaryProvider = temporaryToken.firebase?.sign_in_provider;
    if (temporaryProvider !== "anonymous") {
      return res.status(403).json({ error: "Only anonymous temporary users can be consolidated." });
    }

    const finalUserId = finalToken.uid;
    const finalRole = finalToken.email === ADMIN_EMAIL ? "admin" : "guest";
    if (finalUserId === temporaryUserId) {
      await db.collection("users").doc(finalUserId).set({
        ...finalProfile,
        uid: finalUserId,
        role: finalRole,
        isTemporary: false,
        updatedAt: FieldValue.serverTimestamp(),
        convertedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.json({ status: "already-linked", migratedBookings: 0 });
    }

    const temporaryRef = db.collection("users").doc(temporaryUserId);
    const finalRef = db.collection("users").doc(finalUserId);
    const temporarySnap = await temporaryRef.get();
    const temporaryData = temporarySnap.exists ? temporarySnap.data() || {} : {};

    await finalRef.set({
      ...finalProfile,
      uid: finalUserId,
      email: finalToken.email || finalProfile.email || "",
      displayName: finalProfile.displayName || temporaryData.displayName || finalToken.email || "Huésped Cardamomo",
      role: finalRole,
      phone: finalProfile.phone || temporaryData.phone || "",
      identification: finalProfile.identification || temporaryData.identification || "",
      isTemporary: false,
      mergedTemporaryUserIds: FieldValue.arrayUnion(temporaryUserId),
      updatedAt: FieldValue.serverTimestamp(),
      convertedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const bookingsSnap = await db
      .collection("bookings")
      .where("userId", "==", temporaryUserId)
      .get();

    const batch = db.batch();
    bookingsSnap.forEach((bookingDoc) => {
      batch.update(bookingDoc.ref, {
        userId: finalUserId,
        userEmail: finalToken.email || finalProfile.email || "",
        userDisplayName: finalProfile.displayName || temporaryData.displayName || "Huésped Cardamomo",
        userStatus: "registered",
        convertedFromTemporaryUserId: temporaryUserId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    batch.delete(temporaryRef);
    await batch.commit();

    return res.json({ status: "consolidated", migratedBookings: bookingsSnap.size });
  } catch (error: any) {
    console.error("Temporary user consolidation failed:", error);
    return res.status(500).json({ error: error.message || "Unable to consolidate temporary user." });
  }
});

// -------------------------------------------------------------
// 1. ENDPOINT: Expose the complete blocked-date projection as an iCal feed
// -------------------------------------------------------------
async function serveRoomICal(req: express.Request, res: express.Response) {
  const { roomId } = req.params;
  try {
    console.log(`Generating iCal feed for room: ${roomId}`);
    
    // Fetch room
    const roomSnap = await db.collection("rooms").doc(roomId).get();
    if (!roomSnap.exists) {
      return res.status(404).send("Room not found");
    }
    const roomData = roomSnap.data();
    const blockedDates = Array.isArray(roomData?.blockedDates)
      ? roomData.blockedDates.filter((date: unknown): date is string => typeof date === "string")
      : [];
    const icalContent = buildICalContent(roomData?.name || "Apartastudio", blockedDates);

    res.set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="room-${roomId}-availability.ics"`,
    });
    
    return res.send(icalContent);
  } catch (error) {
    console.error("Error generating iCal feed:", error);
    return res.status(500).send("Error generating calendar.");
  }
}

// The .ics suffix is required by Airbnb and Booking.com validators. Keep the
// legacy route working for links already copied before this correction.
app.get("/api/rooms/:roomId/ical.ics", serveRoomICal);
app.get("/api/rooms/:roomId/ical", serveRoomICal);

// -------------------------------------------------------------------------
// 1b. ENDPOINT: Rebuild availability after an authenticated guest cancellation
// -------------------------------------------------------------------------
app.post("/api/rooms/:roomId/rebuild-availability", async (req, res) => {
  const bearerToken = extractBearerToken(req);
  const bookingId = typeof req.body?.bookingId === "string" ? req.body.bookingId.trim() : "";

  if (!bearerToken) {
    return res.status(401).json({ error: "La solicitud requiere un token de autenticación." });
  }
  if (!bookingId) {
    return res.status(400).json({ error: "La solicitud requiere el ID de la reserva." });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(bearerToken);
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) {
      return res.status(404).json({ error: "Reserva no encontrada." });
    }

    const booking = bookingSnap.data() || {};
    if (booking.roomId !== req.params.roomId) {
      return res.status(400).json({ error: "La reserva no corresponde al apartamento indicado." });
    }
    if (booking.userId !== decodedToken.uid) {
      return res.status(403).json({ error: "No autorizado para actualizar esta reserva." });
    }
    if (booking.status !== "cancelled") {
      return res.status(409).json({ error: "La reserva todavía no está cancelada." });
    }

    const blockedDates = await rebuildRoomBlockedDates(req.params.roomId);
    return res.json({ status: "rebuilt", blockedDatesCount: blockedDates.length });
  } catch (error: any) {
    console.error("Room availability rebuild failed:", error);
    return res.status(500).json({ error: error.message || "No se pudo reconstruir la disponibilidad." });
  }
});

// -------------------------------------------------------------------------
// 2. ENDPOINT: Sync External iCal URLs into Firestore (The scheduled cron)
// -------------------------------------------------------------------------
app.post("/api/sync-ical", authorizeIcalSyncRequest, async (req, res) => {
  const syncRunId = buildIcalSyncRunId();
  const syncStartedAt = Date.now();
  const authMode = res.locals.icalSyncAuthMode as ICalSyncAuthMode | undefined;
  const requestContext = getIcalSyncRequestContext(req, authMode);

  try {
    console.log("[iCal sync] Run started", {
      syncRunId,
      startedAt: new Date(syncStartedAt).toISOString(),
      ...requestContext,
    });

    const roomsSnap = await db.collection("rooms").get();
    console.log("[iCal sync] Rooms loaded", {
      syncRunId,
      roomCount: roomsSnap.size,
    });

    const results: Array<{
      roomId: string;
      roomName: string;
      status: "synced" | "skipped";
      blockedDatesCount: number;
      externalBlockedDatesCount: number;
      hasAirbnbIcal: boolean;
      hasBookingIcal: boolean;
      errors: string[];
      warnings: string[];
      sourceDiagnostics: ICalSourceDiagnostic[];
      summary: ICalSyncSummary;
    }> = [];

    for (const roomDoc of roomsSnap.docs) {
      const room = roomDoc.data();
      const roomId = roomDoc.id;
      const roomName = room.name || roomId;
      const roomStartedAt = Date.now();

      try {
        const existingBlockedDates = Array.isArray(room.blockedDates)
          ? room.blockedDates.filter((date: unknown): date is string => typeof date === "string")
          : [];
        const manualBlockedDates = Array.isArray(room.manualBlockedDates)
          ? room.manualBlockedDates.filter((date: unknown): date is string => typeof date === "string")
          : existingBlockedDates;
        const existingExternalBlockedDates = Array.isArray(room.externalBlockedDates)
          ? room.externalBlockedDates.filter((date: unknown): date is string => typeof date === "string")
          : [];

        console.log("[iCal sync] Room started", {
          syncRunId,
          roomId,
          roomName,
          currentBlockedDatesCount: existingBlockedDates.length,
          currentManualBlockedDatesCount: manualBlockedDates.length,
          currentExternalBlockedDatesCount: existingExternalBlockedDates.length,
        });

        const integration = await loadRoomIntegration(roomId, room);

        // We parse actual local app bookings to make sure they remain blocked
        const bookingsSnap = await db
          .collection("bookings")
          .where("roomId", "==", roomId)
          .where("status", "==", "confirmed")
          .get();

        console.log("[iCal sync] Room inputs resolved", {
          syncRunId,
          roomId,
          roomName,
          confirmedBookingsCount: bookingsSnap.size,
          hasAirbnbIcal: Boolean(integration.airbnbIcalUrl),
          hasBookingIcal: Boolean(integration.bookingIcalUrl),
        });

        const syncResult = await syncRoomAvailability({
          roomId,
          roomName,
          existingBlockedDates,
          manualBlockedDates,
          existingExternalBlockedDates,
          confirmedBookings: bookingsSnap.docs.map((bookingDoc) => {
            const booking = bookingDoc.data();
            return {
              checkIn: booking.checkIn,
              checkOut: booking.checkOut,
            };
          }),
          airbnbIcalUrl: integration.airbnbIcalUrl,
          bookingIcalUrl: integration.bookingIcalUrl,
        });

        if (!syncResult.shouldUpdate) {
          console.error("[iCal sync] Room skipped", {
            syncRunId,
            roomId,
            roomName,
            durationMs: Date.now() - roomStartedAt,
            errors: syncResult.errors,
            warnings: syncResult.warnings,
            sourceDiagnostics: syncResult.sourceDiagnostics,
            summary: syncResult.summary,
          });
          results.push({
            roomId,
            roomName,
            status: syncResult.status,
            blockedDatesCount: syncResult.blockedDates.length,
            externalBlockedDatesCount: syncResult.externalBlockedDates.length,
            hasAirbnbIcal: syncResult.hasAirbnbIcal,
            hasBookingIcal: syncResult.hasBookingIcal,
            errors: syncResult.errors,
            warnings: syncResult.warnings,
            sourceDiagnostics: syncResult.sourceDiagnostics,
            summary: syncResult.summary,
          });
          continue;
        }

        // Feeds are fetched outside the transaction because network requests
        // must not be held open inside Firestore. Re-read local state and
        // commit the final union atomically so a booking created while feeds
        // were downloading cannot be overwritten by this stale sync.
        const committedProjection = await updateRoomAvailabilityProjection(
          roomId,
          syncResult.externalBlockedDates,
        );
        const committedSummary = buildSyncSummary({
          startedAt: new Date(syncResult.summary.startedAt),
          configuredSourcesCount: syncResult.summary.configuredSourcesCount,
          successfulSourcesCount: syncResult.summary.successfulSourcesCount,
          failedSourcesCount: syncResult.summary.failedSourcesCount,
          confirmedBookingsCount: committedProjection.confirmedBookingsCount,
          confirmedBookingDatesCount: committedProjection.confirmedBookingDatesCount,
          manualBlockedDatesCount: committedProjection.manualBlockedDates.length,
          previousBlockedDatesCount: committedProjection.previousBlockedDates.length,
          previousExternalBlockedDatesCount: committedProjection.previousExternalBlockedDates.length,
          nextBlockedDates: committedProjection.blockedDates,
          nextExternalBlockedDates: committedProjection.externalBlockedDates,
          comparisonBlockedDates: committedProjection.previousBlockedDates,
          comparisonExternalBlockedDates: committedProjection.previousExternalBlockedDates,
        });
        const committedSyncResult = {
          ...syncResult,
          blockedDates: committedProjection.blockedDates,
          externalBlockedDates: committedProjection.externalBlockedDates,
          summary: committedSummary,
        };

        console.log("[iCal sync] Room updated", {
          syncRunId,
          roomId,
          roomName,
          durationMs: Date.now() - roomStartedAt,
          warnings: committedSyncResult.warnings,
          sourceDiagnostics: committedSyncResult.sourceDiagnostics,
          summary: committedSyncResult.summary,
        });

        results.push({
          roomId,
          roomName,
          status: committedSyncResult.status,
          blockedDatesCount: committedSyncResult.blockedDates.length,
          externalBlockedDatesCount: committedSyncResult.externalBlockedDates.length,
          hasAirbnbIcal: syncResult.hasAirbnbIcal,
          hasBookingIcal: syncResult.hasBookingIcal,
          errors: [],
          warnings: committedSyncResult.warnings,
          sourceDiagnostics: committedSyncResult.sourceDiagnostics,
          summary: committedSyncResult.summary,
        });
      } catch (error) {
        console.error("[iCal sync] Room crashed", {
          syncRunId,
          roomId,
          roomName,
          durationMs: Date.now() - roomStartedAt,
          error: serializeErrorForLog(error),
        });
        throw error;
      }
    }

    const finishedAt = new Date().toISOString();
    const failedRooms = results.filter((result) => result.status === "skipped");
    const syncedRooms = results.filter((result) => result.status === "synced");
    const runSummary = {
      syncRunId,
      startedAt: new Date(syncStartedAt).toISOString(),
      finishedAt,
      durationMs: Date.now() - syncStartedAt,
      roomCount: roomsSnap.size,
      syncedRoomsCount: syncedRooms.length,
      failedRoomsCount: failedRooms.length,
    };

    if (failedRooms.length > 0) {
      console.error("[iCal sync] Run completed with room failures", {
        ...runSummary,
        failedRooms: failedRooms.map((roomResult) => ({
          roomId: roomResult.roomId,
          roomName: roomResult.roomName,
          errors: roomResult.errors,
          warnings: roomResult.warnings,
        })),
      });
      return res.status(502).json({
        status: "partial",
        syncRunId,
        summary: runSummary,
        error: "Algunos apartamentos conservaron su última disponibilidad válida porque un feed iCal falló.",
        synced_rooms: syncedRooms,
        failed_rooms: failedRooms,
      });
    }

    console.log("[iCal sync] Run completed successfully", {
      ...runSummary,
      syncedRoomIds: syncedRooms.map((roomResult) => roomResult.roomId),
    });
    return res.json({ status: "success", syncRunId, summary: runSummary, synced_rooms: results });
  } catch (error: any) {
    console.error("[iCal sync] Run failed", {
      syncRunId,
      durationMs: Date.now() - syncStartedAt,
      ...requestContext,
      error: serializeErrorForLog(error),
    });
    return res.status(500).json({ error: error.message, syncRunId });
  }
});

// -------------------------------------------------------------
// 3. ENDPOINT: Trigger Alerts / Notifications on Booking Creation
// -------------------------------------------------------------
app.post("/api/notify-booking", async (req, res) => {
  const { booking, roomDetails, userDetails } = req.body;
  if (!booking || !roomDetails) {
    return res.status(400).json({ error: "Missing required booking details for dispatching notifications" });
  }

  try {
    console.log("Analyzing notification setup fromsettings/global...");
    
    // Fetch settings/global configuration
    const settingsSnap = await db.collection("settings").doc("global").get();
    let config = {
      emailEnabled: true,
      emailDestination: "edificiocardamomo@gmail.com",
      whatsappEnabled: true,
      whatsappDestination: "+573000000000",
      smsEnabled: true,
      smsDestination: "+573000000000"
    };

    if (settingsSnap.exists) {
      const s = settingsSnap.data()!;
      if (s.notificationConfig) {
        config = { ...config, ...s.notificationConfig };
      }
    }

    const logs: string[] = [];

    // Message details
    const guestName = booking.guestContact?.fullName || userDetails?.displayName || 'Cliente Cardamomo';
    const guestPhone = booking.guestContact?.phone || userDetails?.phone || 'N/D';
    const guestIdentification = booking.guestContact?.identification || userDetails?.identification || 'N/D';
    const summaryText = `Nueva Reserva en Edificio Cardamomo! 
Apartastudio: ${roomDetails.name}
Huésped: ${guestName} (${userDetails?.email || 'sin cuenta registrada'})
Celular: ${guestPhone}
Identificación: ${guestIdentification}
Fechas: ${booking.checkIn} al ${booking.checkOut}
Total: $${booking.totalPrice.toLocaleString()} COP
ID Reserva: ${booking.id.substring(0, 8).toUpperCase()}`;

    // 1. Send Email (Simulating Sendgrid / Resend integration)
    if (config.emailEnabled) {
      console.log(`[ALERT] SENDING EMAIL to: ${config.emailDestination}`);
      console.log(`Subject: Nueva Reserva #${booking.id.substring(0,8).toUpperCase()}`);
      console.log(`Body:\n${summaryText}`);
      logs.push(`Email alert sent to ${config.emailDestination}`);
    } else {
      logs.push(`Email alert disabled.`);
    }

    // 2. Send WhatsApp (Simulating WhatsApp Cloud API or Twilio WhatsApp API)
    if (config.whatsappEnabled) {
      console.log(`[ALERT] SENDING WHATSAPP to: ${config.whatsappDestination}`);
      console.log(`Payload: WhatsApp Message Template 'cardamomo_booking_alert' sent.`);
      console.log(`Content:\n${summaryText}`);
      logs.push(`WhatsApp message sent to ${config.whatsappDestination}`);
    } else {
      logs.push(`WhatsApp alerts disabled.`);
    }

    // 3. Send SMS / Mobile Push (Simulating Twilio SMS / Firebase Cloud Messaging)
    if (config.smsEnabled) {
      console.log(`[ALERT] SENDING SMS Push to: ${config.smsDestination}`);
      console.log(`Message: ${summaryText.substring(0, 160)}...`);
      logs.push(`SMS push alert sent to ${config.smsDestination}`);
    } else {
      logs.push(`SMS alerts disabled.`);
    }

    return res.json({ status: "dispatched", logs });
  } catch (error: any) {
    console.error("Failed to process server-side notification alerts:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Cloud Run is request-driven, so recurring background work should be triggered by
// Cloud Scheduler or another external scheduler instead of an in-process timer.
if (ENABLE_ICAL_SYNC_TIMER) {
  setInterval(async () => {
    try {
      console.log("Background job: Running scheduled iCal sync for Edificio Cardamomo rooms...");
      const syncRes = await fetch(`http://localhost:${PORT}/api/sync-ical`, { method: "POST" });
      if (syncRes.ok) {
        const data = await syncRes.json();
        console.log("Background iCal sync completed successfully:", data.synced_rooms);
      }
    } catch (e: any) {
      console.error("Background scheduled sync skipped/failed:", e.message);
    }
  }, 5 * 60 * 1000);
} else {
  console.log("Background iCal sync timer disabled. Use Cloud Scheduler or trigger /api/sync-ical manually.");
}

// Initialize Express + Vite Server Link
async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Edificio Cardamomo Server running on http://localhost:${PORT}`);
  });
}

startServer();
