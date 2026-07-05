import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import {
  initializeApp,
  getApps,
  getApp,
  applicationDefault,
} from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";

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
app.use(express.json());
const PORT = 3000;

// Helper to format ISO Date to YYYYMMDD for iCal
function formatToICalDate(dateStr: string, isAllDay: boolean = true): string {
  // input dateStr: YYYY-MM-DD
  const dateStrClean = dateStr.replace(/-/g, '');
  if (isAllDay) {
    return `VALUE=DATE:${dateStrClean}`;
  }
  return dateStrClean + "T000000Z";
}

// Normalize createdAt into an iCal DTSTAMP string. Handles both ISO strings (legacy
// frontend writes) and Firestore Timestamps (admin SDK / serverTimestamp writes).
function toICalStamp(createdAt: unknown): string {
  if (!createdAt) return "20260602T001614Z";
  let date: Date;
  if (createdAt instanceof Date) {
    date = createdAt;
  } else if (typeof createdAt === "string") {
    date = new Date(createdAt);
  } else if (createdAt && typeof createdAt === "object" && "toDate" in createdAt && typeof (createdAt as any).toDate === "function") {
    date = (createdAt as any).toDate();
  } else if (createdAt && typeof createdAt === "object" && "seconds" in createdAt) {
    date = new Date((createdAt as any).seconds * 1000);
  } else {
    date = new Date();
  }
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 15) + "Z";
}

// -------------------------------------------------------------
// 1. ENDPOINT: Expose our own internal bookings as an iCal feed 
// -------------------------------------------------------------
app.get("/api/rooms/:roomId/ical", async (req, res) => {
  const { roomId } = req.params;
  try {
    console.log(`Generating iCal feed for room: ${roomId}`);
    
    // Fetch room
    const roomSnap = await db.collection("rooms").doc(roomId).get();
    if (!roomSnap.exists) {
      return res.status(404).send("Room not found");
    }
    const roomData = roomSnap.data();

    // Fetch confirmed bookings for this room
    const bookingsSnap = await db
      .collection("bookings")
      .where("roomId", "==", roomId)
      .where("status", "==", "confirmed")
      .get();

    let icalContent = "BEGIN:VCALENDAR\r\n";
    icalContent += "VERSION:2.0\r\n";
    icalContent += `PRODID:-//Edificio Cardamomo//Calendar Sync//ES\r\n`;
    icalContent += "CALSCALE:GREGORIAN\r\n";
    icalContent += `METHOD:PUBLISH\r\n`;
    icalContent += `X-WR-CALNAME:Cardamomo - ${roomData?.name || "Apartastudio"}\r\n`;

    bookingsSnap.forEach((bookingDoc) => {
      const b = bookingDoc.data();
      const checkInICal = formatToICalDate(b.checkIn);
      // For iCal end dates, DTEND is exclusive. Airbnb/Booking expect DTEND to be the check-out day.
      const checkOutICal = formatToICalDate(b.checkOut);
      const stamp = toICalStamp(b.createdAt);

      icalContent += "BEGIN:VEVENT\r\n";
      icalContent += `UID:booking-${b.id || bookingDoc.id}@edificiocardamomo.com\r\n`;
      icalContent += `DTSTAMP:${stamp}\r\n`;
      icalContent += `DTSTART;${checkInICal}\r\n`;
      icalContent += `DTEND;${checkOutICal}\r\n`;
      icalContent += `SUMMARY:Reserva Edificio Cardamomo #${b.id ? b.id.substring(0, 6).toUpperCase() : 'APP'}\r\n`;
      icalContent += "DESCRIPTION:Reserva realizada por la app de Edificio Cardamomo.\r\n";
      icalContent += "STATUS:CONFIRMED\r\n";
      icalContent += "END:VEVENT\r\n";
    });

    icalContent += "END:VCALENDAR\r\n";

    res.set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="room-${roomId}-availability.ics"`,
    });
    
    return res.send(icalContent);
  } catch (error) {
    console.error("Error generating iCal feed:", error);
    return res.status(500).send("Error generating calendar.");
  }
});

// Helper: Custom native regex-based iCal Parser
function parseICalContent(icalText: string): string[] {
  const blockedDates: string[] = [];
  const lines = icalText.split(/\r?\n|\\r?\\n/);
  let currentEvent: { start?: string; end?: string } | null = null;

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('BEGIN:VEVENT')) {
      currentEvent = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (currentEvent && currentEvent.start && currentEvent.end) {
        // Parse date strings, typically '20260605' or 'VALUE=DATE:20260605' or with time '20260605T120000Z'
        const rawStart = currentEvent.start.split(':').pop() || '';
        const rawEnd = currentEvent.end.split(':').pop() || '';

        const startStr = rawStart.substring(0, 8); 
        const endStr = rawEnd.substring(0, 8); 

        if (startStr.length === 8 && endStr.length === 8) {
          const startYear = parseInt(startStr.substring(0, 4));
          const startMonth = parseInt(startStr.substring(4, 6)) - 1;
          const startDay = parseInt(startStr.substring(6, 8));

          const endYear = parseInt(endStr.substring(0, 4));
          const endMonth = parseInt(endStr.substring(4, 6)) - 1;
          const endDay = parseInt(endStr.substring(6, 8));

          const startDate = new Date(startYear, startMonth, startDay);
          const endDate = new Date(endYear, endMonth, endDay);

          // Generate all dates in between (check-in day included, check-out day excluded or included depending on standard)
          // For Airbnb/Booking, check-out day is the arrival day of the next guest, so dates blocked is [start, end)
          const current = new Date(startDate);
          while (current < endDate) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const day = String(current.getDate()).padStart(2, '0');
            blockedDates.push(`${year}-${month}-${day}`);
            current.setDate(current.getDate() + 1);
          }
        }
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('DTSTART')) {
        currentEvent.start = line;
      } else if (line.startsWith('DTEND')) {
        currentEvent.end = line;
      }
    }
  }
  return [...new Set(blockedDates)];
}

// -------------------------------------------------------------------------
// 2. ENDPOINT: Sync External iCal URLs into Firestore (The scheduled cron)
// -------------------------------------------------------------------------
app.post("/api/sync-ical", async (req, res) => {
  try {
    console.log("iCal sync triggered manually or by cron...");
    const roomsSnap = await db.collection("rooms").get();
    const results: any[] = [];

    for (const roomDoc of roomsSnap.docs) {
      const room = roomDoc.data();
      const roomId = roomDoc.id;
      let newBlockedDates: string[] = [];

      // We parse actual local app bookings to make sure they remain blocked
      const bookingsSnap = await db
        .collection("bookings")
        .where("roomId", "==", roomId)
        .where("status", "==", "confirmed")
        .get();

      bookingsSnap.forEach((bookingDoc) => {
        const b = bookingDoc.data();
        const start = new Date(b.checkIn);
        const end = new Date(b.checkOut);
        const current = new Date(start);
        while (current < end) {
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const day = String(current.getDate()).padStart(2, '0');
          newBlockedDates.push(`${year}-${month}-${day}`);
          current.setDate(current.getDate() + 1);
        }
      });

      // Synchronize Airbnb source
      if (room.airbnb_ical_url) {
        try {
          console.log(`Syncing from Airbnb for room {${room.name}}: ${room.airbnb_ical_url}`);
          const response = await fetch(room.airbnb_ical_url);
          if (response.ok) {
            const icalText = await response.text();
            const dates = parseICalContent(icalText);
            newBlockedDates.push(...dates);
          }
        } catch (e: any) {
          console.error(`Error fetching Airbnb iCal for ${room.name}:`, e.message);
        }
      }

      // Synchronize Booking.com source
      if (room.booking_ical_url) {
        try {
          console.log(`Syncing from Booking.com for room {${room.name}}: ${room.booking_ical_url}`);
          const response = await fetch(room.booking_ical_url);
          if (response.ok) {
            const icalText = await response.text();
            const dates = parseICalContent(icalText);
            newBlockedDates.push(...dates);
          }
        } catch (e: any) {
          console.error(`Error fetching Booking iCal for ${room.name}:`, e.message);
        }
      }

      // Deduplicate result dates
      const uniqueBlockedDates = [...new Set(newBlockedDates)].sort();

      // Update in Firestore (admin SDK bypasses security rules)
      await db.collection("rooms").doc(roomId).update({ blockedDates: uniqueBlockedDates });

      results.push({
        roomId,
        roomName: room.name,
        blockedDatesCount: uniqueBlockedDates.length
      });
    }

    return res.json({ status: "success", synced_rooms: results });
  } catch (error: any) {
    console.error("Error during iCal sync execution:", error);
    return res.status(500).json({ error: error.message });
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
    const summaryText = `Nueva Reserva en Edificio Cardamomo! 
Apartastudio: ${roomDetails.name}
Huésped: ${userDetails?.displayName || 'Cliente Cardamomo'} (${userDetails?.email || 'N/D'})
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

// Background Timer simulating scheduled Firebase Cloud Function (every 5 minutes in background for preview)
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
