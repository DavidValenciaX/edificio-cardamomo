import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Room, Booking, UserProfile } from "../types";
import { Calendar as CalendarIcon, Check, Users, DollarSign, ArrowRight, ShieldCheck, Info, X } from "lucide-react";

interface GuestDashboardProps {
  rooms: Room[];
  userProfile: UserProfile;
  selectedRoomId: string | null;
  onSelectRoomId: (roomId: string | null) => void;
  onRefreshRooms: () => void;
}

export default function GuestDashboard({
  rooms,
  userProfile,
  selectedRoomId,
  onSelectRoomId,
  onRefreshRooms,
}: GuestDashboardProps) {
  // Active Room State
  const activeRoom = rooms.find(r => r.id === selectedRoomId) || rooms[0] || null;

  // Calendar parameters
  const [currentDate] = useState(new Date("2026-06-02")); // Match the system 2026 current time
  const [calendarMonth, setCalendarMonth] = useState(5); // June (0-indexed is 5)
  const [calendarYear, setCalendarYear] = useState(2026);

  // Booking details
  const [checkIn, setCheckIn] = useState<string | null>(null); // YYYY-MM-DD
  const [checkOut, setCheckOut] = useState<string | null>(null); // YYYY-MM-DD
  const [bookingError, setBookingError] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [successBooking, setSuccessBooking] = useState<Booking | null>(null);

  // My current bookings list
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [loadingMyBookings, setLoadingMyBookings] = useState(false);

  useEffect(() => {
    if (activeRoom) {
      // If room changes, adjust selected dates if they are no longer suitable
      setCheckIn(null);
      setCheckOut(null);
      setBookingError("");
    }
  }, [selectedRoomId]);

  const fetchMyBookings = async () => {
    setLoadingMyBookings(true);
    try {
      const q = query(
        collection(db, "bookings"),
        where("userId", "==", userProfile.uid)
      );
      const snap = await getDocs(q);
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Sort by creation datetime latest first. createdAt may be an ISO string
      // (legacy) or a Firestore Timestamp (serverTimestamp writes).
      const toMillis = (v: any): number => {
        if (!v) return 0;
        if (v instanceof Timestamp) return v.toMillis();
        if (v && typeof v === "object" && "seconds" in v) return v.seconds * 1000;
        if (typeof v === "string") return new Date(v).getTime();
        return 0;
      };
      list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setMyBookings(list);
    } catch (err) {
      console.error("Error loading user bookings:", err);
    } finally {
      setLoadingMyBookings(false);
    }
  };

  useEffect(() => {
    fetchMyBookings();
  }, [userProfile.uid, successBooking]);

  if (!activeRoom) {
    return (
      <div className="p-6 text-center text-dark-muted font-semibold">
        No se encontraron apartaestudios cargados.
      </div>
    );
  }

  // Generate Calendar Days list
  const getDaysInMonth = (month: number, year: number) => {
    const date = new Date(year, month, 1);
    const days = [];
    
    // Get preceding empty slots (days of previous month)
    const firstDayIndex = date.getDay(); // 0 is Sunday, 1 is Monday...
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        dayNum: prevMonthDays - i,
        isCurrentMonth: false,
        dateStr: ""
      });
    }

    // Days in of current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= totalDays; i++) {
      const padM = String(month + 1).padStart(2, '0');
      const padD = String(i).padStart(2, '0');
      days.push({
        dayNum: i,
        isCurrentMonth: true,
        dateStr: `${year}-${padM}-${padD}`
      });
    }

    return days;
  };

  const calendarDays = getDaysInMonth(calendarMonth, calendarYear);
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  // Calendar Day Clicks
  const handleDayClick = (dateStr: string) => {
    setBookingError("");
    const clickedDate = new Date(dateStr);
    const today = new Date("2026-06-02"); // Consistent current time

    if (clickedDate < today) {
      setBookingError("No puede reservar en el pasado.");
      return;
    }

    if (activeRoom.blockedDates.includes(dateStr)) {
      setBookingError("Esta fecha ya se encuentra reservada o está bloqueada.");
      return;
    }

    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(dateStr);
      setCheckOut(null);
    } else {
      // CheckIn exists, set CheckOut
      const checkInDate = new Date(checkIn);
      if (clickedDate <= checkInDate) {
        // Recurrent click: update checkIn
        setCheckIn(dateStr);
      } else {
        // Enforce that NO blocked dates exist in between
        let searchDate = new Date(checkInDate);
        let hasBlocked = false;

        while (searchDate < clickedDate) {
          const year = searchDate.getFullYear();
          const month = String(searchDate.getMonth() + 1).padStart(2, '0');
          const day = String(searchDate.getDate()).padStart(2, '0');
          const testString = `${year}-${month}-${day}`;

          if (activeRoom.blockedDates.includes(testString)) {
            hasBlocked = true;
            break;
          }
          searchDate.setDate(searchDate.getDate() + 1);
        }

        if (hasBlocked) {
          setBookingError("La selección contiene fechas bloqueadas en medio de la reserva.");
        } else {
          setCheckOut(dateStr);
        }
      }
    }
  };

  // Check if dates are selected and calculate pricing
  let nightsCount = 0;
  let totalPriceEstimation = 0;

  if (checkIn && checkOut) {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    nightsCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    totalPriceEstimation = nightsCount * activeRoom.pricePerNight;
  }

  // Submit active booking
  const handleProceedBooking = async () => {
    if (!checkIn || !checkOut || nightsCount === 0) return;
    setBookingLoading(true);
    setBookingError("");

    const bookingId = "res-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    const newBooking: Booking = {
      id: bookingId,
      roomId: activeRoom.id,
      userId: userProfile.uid,
      userEmail: userProfile.email,
      userDisplayName: userProfile.displayName,
      checkIn,
      checkOut,
      status: "confirmed",
      totalPrice: totalPriceEstimation,
      createdAt: serverTimestamp() as any
    };

    try {
      // 1. Save Reservation Document inside bookings.
      // serverTimestamp() resolves server-side and matches the Firestore rule
      // `data.createdAt == request.time`, so the write is accepted.
      const bookingDocRef = doc(db, "bookings", bookingId);
      await setDoc(bookingDocRef, newBooking);

      // 2. Compute date days array to block inside rooms collection
      const datesToBlock: string[] = [];
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const curr = new Date(start);
      while (curr < end) {
        const year = curr.getFullYear();
        const month = String(curr.getMonth() + 1).padStart(2, '0');
        const day = String(curr.getDate()).padStart(2, '0');
        datesToBlock.push(`${year}-${month}-${day}`);
        curr.setDate(curr.getDate() + 1);
      }

      // 3. Atomically join blockedDates inside Room doc
      const roomDocRef = doc(db, "rooms", activeRoom.id);
      
      // Update local state and backend
      const updatedBlockedList = [...activeRoom.blockedDates, ...datesToBlock];
      await updateDoc(roomDocRef, {
        blockedDates: updatedBlockedList
      });

      // 4. Trigger Server Side Notification Dispatch.
      // serverTimestamp() is a sentinel that doesn't serialize to JSON, so send
      // a plain ISO string for the notification body (used only for logging).
      try {
        console.log("Triggering server side alerts...");
        const bookingPayload = {
          ...newBooking,
          createdAt: new Date().toISOString()
        };
        const response = await fetch("/api/notify-booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking: bookingPayload,
            roomDetails: activeRoom,
            userDetails: userProfile
          })
        });
        const notifyData = await response.json();
        console.log("Server side notification dispatched reply:", notifyData);
      } catch (e) {
        console.error("F FCM / Server notifications failed:", e);
      }

      // Refresh Room listing in main layer
      onRefreshRooms();
      setSuccessBooking(newBooking);

      // Reset local dates selection
      setCheckIn(null);
      setCheckOut(null);
    } catch (error: any) {
      console.error("Booking write failed:", error);
      handleFirestoreError(error, OperationType.CREATE, `bookings/${bookingId}`);
    } finally {
      setBookingLoading(false);
    }
  };

  // Cancel reservation
  const handleCancelBooking = async (b: any) => {
    if (!window.confirm("¿Está seguro de cancelar esta reserva? Las fechas volverán a liberarse.")) {
      return;
    }
    try {
      // 1. Set status as cancelled
      await updateDoc(doc(db, "bookings", b.id), { status: "cancelled" });

      // 2. Release dates of room
      const roomDocRef = doc(db, "rooms", b.roomId);
      const roomSnap = await getDoc(roomDocRef);
      if (roomSnap.exists()) {
        const roomData = roomSnap.data() as Room;

        // Generate date block to remove
        const datesToRemove: string[] = [];
        const start = new Date(b.checkIn);
        const end = new Date(b.checkOut);
        const curr = new Date(start);
        while (curr < end) {
          const year = curr.getFullYear();
          const month = String(curr.getMonth() + 1).padStart(2, '0');
          const day = String(curr.getDate()).padStart(2, '0');
          datesToRemove.push(`${year}-${month}-${day}`);
          curr.setDate(curr.getDate() + 1);
        }

        const filteredBlocked = roomData.blockedDates.filter(d => !datesToRemove.includes(d));
        await updateDoc(roomDocRef, { blockedDates: filteredBlocked });
      }

      alert("Reserva cancelada exitosamente.");
      onRefreshRooms();
      fetchMyBookings();
    } catch (err: any) {
      console.error("Cancel failed:", err);
    }
  };

  // Helper inside loop representation
  const isSelectedDate = (dateStr: string) => {
    return dateStr === checkIn || dateStr === checkOut;
  };

  const isBetweenDate = (dateStr: string) => {
    if (!checkIn || !checkOut || !dateStr) return false;
    const curr = new Date(dateStr);
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    return curr > start && curr < end;
  };

  return (
    <div className="w-full max-w-none py-5 space-y-6">
      
      {/* 1. Header & Selector de Apartaestudio */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-warm-border pb-5">
        <div>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-dark leading-none">Reservar en Línea</h2>
          <p className="text-[11px] md:text-xs text-dark-muted font-medium mt-2">Selecciona tu suite preferida y programa tu estadía en el Edificio Cardamomo</p>
        </div>
        
        <div className="w-full md:max-w-xs shrink-0 bg-white p-1 rounded-xl shadow-sm border border-warm-border">
          <label className="text-[9px] font-bold text-secondary uppercase tracking-widest block mb-1 px-2 pt-1 font-mono">Elegir Apartaestudio</label>
          <select
            value={activeRoom.id}
            onChange={(e) => onSelectRoomId(e.target.value)}
            className="w-full bg-transparent text-xs font-semibold rounded-lg p-2 text-dark focus:outline-none cursor-pointer"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (${r.pricePerNight.toLocaleString()} COP)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main split responsive layout container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column - Accommodation specs and Selection calendar */}
        <div className="lg:col-span-7 space-y-6">

      {/* Hero Suite visual details */}
      <div className="bg-white border border-warm-border rounded-2xl overflow-hidden shadow-sm">
        <div className="h-[120px] relative">
          <img
            src={activeRoom.images[0] || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=500&q=80"}
            alt={activeRoom.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2.5 right-2.5 bg-primary text-warm-bg text-[9px] px-2 py-0.5 rounded font-bold font-mono">
            ${activeRoom.pricePerNight.toLocaleString()} COP / Noche
          </div>
        </div>
        <div className="p-3 bg-warm-card">
          <h3 className="font-bold text-xs text-dark">{activeRoom.name}</h3>
          <div className="flex items-center gap-3 text-[10px] text-dark-muted mt-1 font-semibold">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-secondary" /> Cap: {activeRoom.capacity} Huéspedes
            </span>
          </div>
        </div>
      </div>

      {/* 2. Custom availability calendar */}
      <div className="bg-white border border-warm-border rounded-2xl p-4 shadow-sm">
        
        {/* Calendar Header with month slider */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold text-dark uppercase tracking-wider font-display">
            {monthNames[calendarMonth]} {calendarYear}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (calendarMonth === 5) { // Minimum June 2026 for demonstration
                  return;
                }
                setCalendarMonth(calendarMonth - 1);
              }}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-warm-border bg-warm-bg text-dark disabled:opacity-40"
              disabled={calendarMonth === 5}
            >
              Ant
            </button>
            <button
              onClick={() => {
                if (calendarMonth === 6) { // Maximum July 2026 for demo
                  return;
                }
                setCalendarMonth(calendarMonth + 1);
              }}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-warm-border bg-warm-bg text-dark disabled:opacity-40"
              disabled={calendarMonth === 6}
            >
              Sig
            </button>
          </div>
        </div>

        {/* Calendar weekdays header */}
        <div className="grid grid-cols-7 gap-1 text-center font-bold text-[9px] text-dark-muted uppercase tracking-wider mb-2">
          <span>Dom</span>
          <span>Lun</span>
          <span>Mar</span>
          <span>Mié</span>
          <span>Jue</span>
          <span>Vie</span>
          <span>Sáb</span>
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, idx) => {
            const isBlocked = day.dateStr && activeRoom.blockedDates.includes(day.dateStr);
            const isSelected = day.dateStr && isSelectedDate(day.dateStr);
            const isBetween = day.dateStr && isBetweenDate(day.dateStr);
            const isPast = day.dateStr && new Date(day.dateStr) < new Date("2026-06-02");

            return (
              <button
                key={idx}
                type="button"
                disabled={!day.isCurrentMonth || isBlocked || isPast}
                onClick={() => day.dateStr && handleDayClick(day.dateStr)}
                className={`h-9 w-full text-xs font-semibold rounded-lg flex flex-col items-center justify-center relative transition-all active:scale-90 ${
                  !day.isCurrentMonth
                    ? "text-transparent bg-transparent cursor-default pointer-events-none"
                    : isBlocked
                    ? "bg-red-50 text-red-500 border border-red-200 cursor-not-allowed line-through"
                    : isPast
                    ? "text-dark-muted opacity-40 cursor-not-allowed"
                    : isSelected
                    ? "bg-primary text-warm-bg font-bold shadow"
                    : isBetween
                    ? "bg-accent/40 text-dark font-medium"
                    : "bg-warm-card hover:bg-warm-border text-dark"
                }`}
              >
                <span>{day.dayNum}</span>
                
                {/* Dots representation for status */}
                {isBlocked && day.isCurrentMonth && (
                  <span className="w-1 h-1 bg-red-400 rounded-full absolute bottom-1"></span>
                )}
                {day.dateStr === "2026-06-02" && (
                  <span className="w-1 h-1 bg-secondary rounded-full absolute top-1"></span>
                )}
              </button>
            );
          })}
        </div>

        {/* Calendar Status guide */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3 border-t border-warm-border text-[9px] font-bold text-dark-muted uppercase tracking-wider">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-warm-card rounded border border-warm-border"></span> Disponible
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-red-100 rounded border border-red-200"></span> Reservado / Bloqueado
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-primary rounded"></span> Mi Selección
          </div>
        </div>
      </div>

      </div> {/* End Left Column */}
 
      {/* Right Column - Selection diagnostic, pricing summary calculations, and recent history book list */}
      <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24 bg-warm-card/30 p-5 md:p-6 rounded-2xl border border-warm-border/65">
        
        {/* Booking selection diagnostics */}
        {bookingError && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl text-xs font-semibold flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{bookingError}</span>
        </div>
      )}

      {/* 3. Resumen de precios y Reserva buttons */}
      {checkIn && checkOut ? (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3 shadow-inner">
          <h4 className="font-display font-bold text-xs text-secondary uppercase tracking-wider">
            Resumen de tu Reserva
          </h4>
          
          <div className="flex justify-between items-center text-xs">
            <div className="text-dark-muted font-medium">Llegada (Check-In)</div>
            <div className="font-bold text-dark">{checkIn}</div>
          </div>
          <div className="flex justify-between items-center text-xs">
            <div className="text-dark-muted font-medium">Salida (Check-Out)</div>
            <div className="font-bold text-dark">{checkOut}</div>
          </div>
          <div className="flex justify-between items-center text-xs">
            <div className="text-dark-muted font-medium">Estadía</div>
            <div className="font-bold text-dark">{nightsCount} {nightsCount > 1 ? "noches" : "noche"}</div>
          </div>

          <div className="h-px bg-warm-border"></div>

          <div className="flex justify-between items-center pt-1">
            <span className="font-bold text-dark text-sm">Costo Total</span>
            <span className="font-display font-bold text-lg text-primary font-mono leading-none">
              ${totalPriceEstimation.toLocaleString()} COP
            </span>
          </div>

          <button
            onClick={handleProceedBooking}
            disabled={bookingLoading}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-warm-bg text-sm font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 mt-1"
          >
            {bookingLoading ? "Procesando Reserva..." : "Confirmar y Separar Habitación"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="bg-warm-card border border-warm-border rounded-2xl p-4 text-center">
          <CalendarIcon className="w-6 h-6 text-dark-muted/65 mx-auto mb-2" />
          <span className="text-xs text-dark-muted font-bold block uppercase tracking-wider leading-none">
            Pendiente de Fechas
          </span>
          <p className="text-[10px] text-dark-muted/70 font-medium mt-1">
            Toque en el calendario el día de ingreso, y luego el día de salida. Debe ser un rango continuo sin bloqueos intermediarios.
          </p>
        </div>
      )}

      {/* 4. My custom bookings list */}
      <div className="pt-2">
        <h2 className="font-display font-bold text-sm text-dark mb-3">Mis Reservas Recientes</h2>
        
        {loadingMyBookings ? (
          <span className="text-xs text-dark-muted font-mono block">Cargando reservas...</span>
        ) : myBookings.length === 0 ? (
          <div className="bg-white border border-warm-border rounded-2xl p-5 text-center text-xs text-dark-muted font-medium">
            No tienes reservas creadas en el Edificio Cardamomo todavía.
          </div>
        ) : (
          <div className="space-y-3">
            {myBookings.map((b) => {
              const rDetails = rooms.find(rm => rm.id === b.roomId) || { name: "Apartaestudio" };
              return (
                <div 
                  key={b.id} 
                  className={`border rounded-xl p-3.5 bg-white shadow-sm flex flex-col gap-2 ${
                    b.status === 'cancelled' ? 'border-zinc-200 opacity-60' : 'border-warm-border'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-xs text-dark">{rDetails.name}</h4>
                      <code className="text-[8px] text-dark-muted font-mono">ID: {b.id.toUpperCase()}</code>
                    </div>
                    <span className={`text-[8px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                      b.status === "confirmed" ? "bg-green-150 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-100"
                    }`}>
                      {b.status === "confirmed" ? "Confirmada" : "Cancelada"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 text-[10px] bg-warm-card p-2 rounded-lg text-dark border border-warm-border">
                    <div>
                      <span className="text-[8px] text-dark-muted uppercase font-bold block leading-none">Check-In</span>
                      <span className="font-bold block mt-0.5">{b.checkIn}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-dark-muted uppercase font-bold block leading-none">Check-Out</span>
                      <span className="font-bold block mt-0.5">{b.checkOut}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-primary font-mono">
                      ${b.totalPrice.toLocaleString()} COP
                    </span>

                    {b.status === "confirmed" && (
                      <button
                        onClick={() => handleCancelBooking(b)}
                        className="text-[9px] font-bold text-red-600 hover:bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      </div> {/* End Right Column */}
      </div> {/* End Main split layout Grid */}

      {/* 5. SUCCESS MODAL RESEVAR */}
      {successBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-warm-bg border border-warm-border p-6 rounded-2xl text-center space-y-4 shadow-xl relative">
            <button 
              onClick={() => setSuccessBooking(null)}
              className="absolute right-4 top-4 p-1 rounded-full bg-warm-card hover:bg-warm-border"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <Check className="w-7 h-7 stroke-[3px]" />
            </div>

            <div className="space-y-1">
              <h3 className="font-display font-bold text-lg text-dark">¡Reserva Confirmada!</h3>
              <p className="text-[10px] text-dark-muted font-medium">Tu estadía en Edificio Cardamomo está lista</p>
            </div>

            <div className="bg-white border border-warm-border p-3.5 rounded-xl text-left text-xs divide-y divide-warm-border">
              <div className="py-1.5 flex justify-between">
                <span className="text-dark-muted font-medium">Código Reserva</span>
                <span className="font-mono font-bold text-dark">{successBooking.id.toUpperCase()}</span>
              </div>
              <div className="py-1.5 flex justify-between">
                <span className="text-dark-muted font-medium">Check-In</span>
                <span className="font-bold text-dark">{successBooking.checkIn}</span>
              </div>
              <div className="py-1.5 flex justify-between">
                <span className="text-dark-muted font-medium">Check-Out</span>
                <span className="font-bold text-dark">{successBooking.checkOut}</span>
              </div>
              <div className="py-1.5 flex justify-between">
                <span className="text-dark-muted font-medium">Total Pagado</span>
                <span className="font-bold text-primary font-mono">${successBooking.totalPrice.toLocaleString()} COP</span>
              </div>
            </div>

            <div className="bg-accent/20 border border-accent/40 rounded-xl p-2.5 text-[9px] text-dark-muted/95 text-left leading-normal">
              🔔 <strong>Notificaciones de Alerta:</strong> Se ha despachado una simulación de alerta de reserva a los canales autorizados de la administración (Email y WhatsApp) según las preferencias configuradas en el Panel de Administración.
            </div>

            <button
              onClick={() => setSuccessBooking(null)}
              className="w-full bg-primary hover:bg-primary-hover text-warm-bg text-xs font-bold py-3 rounded-xl transition-all"
            >
              Cerrar y Ver mis Reservas
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
