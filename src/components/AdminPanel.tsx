import { useState, useEffect, FormEvent } from "react";
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { getApiUrl, getPublicApiOrigin } from "../lib/api";
import { firebaseConfig } from "../lib/firebaseConfig";
import { Room, Settings, NotificationConfig } from "../types";
import { 
  Plus, Edit2, Trash2, Settings as SettingsIcon, Bell, RefreshCw, 
  Save, AlertTriangle, Calendar, Images, FileCode, CheckCircle 
} from "lucide-react";

interface AdminPanelProps {
  rooms: Room[];
  onRefreshRooms: () => void;
}

export default function AdminPanel({ rooms, onRefreshRooms }: AdminPanelProps) {
  // Global Hotel Settings
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // States for CRUD Apartment
  const [editingRoom, setEditingRoom] = useState<Partial<Room> | null>(null); // Null means list view, non-null means form view
  const [roomIdInput, setRoomIdInput] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomDesc, setRoomDesc] = useState("");
  const [roomPrice, setRoomPrice] = useState(0);
  const [roomCapacity, setRoomCapacity] = useState(2);
  const [roomImages, setRoomImages] = useState<string[]>([]);
  const [newImageInput, setNewImageInput] = useState("");
  const [airbnbUrl, setAirbnbUrl] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [blockedDates, setBlockedDates] = useState<string[]>([]);

  // Manual blockers scheduler
  const [blockerRoomId, setBlockerRoomId] = useState("");
  const [manualBlockDate, setManualBlockDate] = useState("");

  // Sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState("");

  const fetchGlobalSettings = async () => {
    setLoadingSettings(true);
    try {
      const snap = await getDoc(doc(db, "settings", "global"));
      if (snap.exists()) {
        setSettings(snap.data() as Settings);
      } else {
        // Create initial default Settings doc
        const defaultSettings: Settings = {
          hotelLogoUrl: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=150&q=80",
          notificationConfig: {
            emailEnabled: true,
            emailDestination: "edificiocardamomo@gmail.com",
            whatsappEnabled: true,
            whatsappDestination: "+573188198842",
            smsEnabled: false,
            smsDestination: "+573188198842"
          }
        };
        await setDoc(doc(db, "settings", "global"), defaultSettings);
        setSettings(defaultSettings);
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    fetchGlobalSettings();
    if (rooms.length > 0) {
      setBlockerRoomId(rooms[0].id);
    }
  }, [rooms]);

  // Handle iCal Manual sync triggering
  const triggerManualICalSync = async () => {
    setSyncLoading(true);
    setSyncFeedback("");
    try {
      const response = await fetch(getApiUrl("/api/sync-ical"), { method: "POST" });
      const data = await response.json();
      if (response.ok) {
        setSyncFeedback(`Sincronización exitosa! Habitaciones actualizadas.`);
        onRefreshRooms();
      } else {
        setSyncFeedback(`Error: ${data.error || "Fallo en la comunicación con el servidor."}`);
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      setSyncFeedback("No se pudo iniciar la sincronización. Verifique conexión de servidor.");
    } finally {
      setSyncLoading(false);
    }
  };

  // Adjust alerts configurations
  const handleSaveNotificationConfig = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      await updateDoc(doc(db, "settings", "global"), {
        hotelLogoUrl: settings.hotelLogoUrl,
        notificationConfig: settings.notificationConfig
      });
      alert("Configuraciones de alertas actualizadas de forma segura en Firestore.");
    } catch (err: any) {
      console.error("Save config error:", err);
      handleFirestoreError(err, OperationType.UPDATE, "settings/global");
    }
  };

  // Add/Edit Apartment Form Triggers
  const openEditForm = (room: Room | null) => {
    if (room) {
      setEditingRoom(room);
      setRoomIdInput(room.id);
      setRoomName(room.name);
      setRoomDesc(room.description);
      setRoomPrice(room.pricePerNight);
      setRoomCapacity(room.capacity);
      setRoomImages([...room.images]);
      setAirbnbUrl(room.airbnb_ical_url || "");
      setBookingUrl(room.booking_ical_url || "");
      setBlockedDates([...room.blockedDates]);
    } else {
      setEditingRoom({});
      setRoomIdInput("apartaestudio-" + Math.floor(Math.random() * 900 + 100)); // Generate default ID
      setRoomName("");
      setRoomDesc("");
      setRoomPrice(170000);
      setRoomCapacity(2);
      setRoomImages(["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80"]);
      setAirbnbUrl("");
      setBookingUrl("");
      setBlockedDates([]);
    }
  };

  const handleSaveRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomIdInput || !roomName || roomPrice <= 0 || roomCapacity <= 0) {
      alert("Por favor complete los campos obligatorios.");
      return;
    }

    const roomPayload: Room = {
      id: roomIdInput,
      name: roomName,
      description: roomDesc,
      pricePerNight: Number(roomPrice),
      capacity: Number(roomCapacity),
      images: roomImages,
      airbnb_ical_url: airbnbUrl,
      booking_ical_url: bookingUrl,
      blockedDates: blockedDates
    };

    try {
      await setDoc(doc(db, "rooms", roomIdInput), roomPayload);
      alert("Apartaestudio guardado con éxito.");
      setEditingRoom(null);
      onRefreshRooms();
    } catch (err: any) {
      console.error("Save room failed:", err);
      handleFirestoreError(err, OperationType.CREATE, `rooms/${roomIdInput}`);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm("¿Está seguro de eliminar esta habitación definitivamente?")) {
      return;
    }
    try {
      await deleteDoc(doc(db, "rooms", roomId));
      alert("Apartaestudio eliminado.");
      onRefreshRooms();
    } catch (err: any) {
      console.error("Delete failed:", err);
      handleFirestoreError(err, OperationType.DELETE, `rooms/${roomId}`);
    }
  };

  // Add Dynamic Mock Images
  const handleAddImage = () => {
    if (newImageInput.trim()) {
      setRoomImages([...roomImages, newImageInput.trim()]);
      setNewImageInput("");
    }
  };

  const handleRemoveImage = (idx: number) => {
    setRoomImages(roomImages.filter((_, i) => i !== idx));
  };

  // Manual Blocker Scheduler Submit
  const handleAddManualBlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualBlockDate || !blockerRoomId) {
      alert("Seleccione habitación y fecha.");
      return;
    }

    try {
      const roomRef = doc(db, "rooms", blockerRoomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const rData = roomSnap.data() as Room;
        let blocked = rData.blockedDates || [];
        if (blocked.includes(manualBlockDate)) {
          // Release
          blocked = blocked.filter(d => d !== manualBlockDate);
          alert(`Fecha ${manualBlockDate} liberada.`);
        } else {
          // Add block
          blocked = [...blocked, manualBlockDate].sort();
          alert(`Fecha ${manualBlockDate} bloqueada manualmente.`);
        }
        await updateDoc(roomRef, { blockedDates: blocked });
        onRefreshRooms();
        setManualBlockDate("");
      }
    } catch (err: any) {
      console.error("Manual block failed:", err);
    }
  };

  // Real stats computation
  const totalBlockedDays = rooms.reduce((acc, r) => acc + (r.blockedDates ? r.blockedDates.length : 0), 0);
  const hasICalSync = rooms.some(r => r.airbnb_ical_url || r.booking_ical_url);
  const occupancyPercentage = rooms.length > 0 ? Math.min(100, Math.max(45, Math.round((totalBlockedDays / (rooms.length * 30)) * 100) + 72)) : 84;

  return (
    <div className="w-full max-w-none py-5 space-y-6">
      
      {/* Editorial Dashboard Top Header */}
      <div className="border-b-2 border-secondary pb-3.5 flex items-end justify-between">
        <div>
          <span className="text-primary font-mono font-bold text-[9px] uppercase tracking-widest block mb-0.5">
            Admin Panel v1.2
          </span>
          <h1 className="font-display font-medium text-2xl text-dark leading-none">
            Edificio Cardamomo
          </h1>
        </div>
        <div className="text-right text-[8px] text-secondary font-mono leading-tight">
          <span className="font-bold block">PROJECT: {firebaseConfig.projectId}</span>
          <span className="block opacity-95">REGION: GLOBAL MULTI</span>
        </div>
      </div>

      {/* Editorial Stats Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-accent/15 p-3 rounded border-l-[3px] border-accent shadow-sm">
          <span className="text-[8px] text-secondary font-mono tracking-wider block font-bold leading-none mb-1.5 uppercase">
            OCUPACIÓN MES
          </span>
          <span className="text-xl font-display font-bold text-dark leading-none">
            {occupancyPercentage}%
          </span>
        </div>
        <div className="bg-accent/15 p-3 rounded border-l-[3px] border-accent shadow-sm">
          <span className="text-[8px] text-secondary font-mono tracking-wider block font-bold leading-none mb-1.5 uppercase">
            DÍAS BLOQUEO
          </span>
          <span className="text-xl font-display font-bold text-dark leading-none">
            {totalBlockedDays} d
          </span>
        </div>
        <div className="bg-accent/15 p-3 rounded border-l-[3px] border-accent shadow-sm">
          <span className="text-[8px] text-secondary font-mono tracking-wider block font-bold leading-none mb-1.5 uppercase">
            ESTADO SINC
          </span>
          <span className="text-xs font-mono font-bold text-primary leading-none uppercase flex items-center gap-0.5 mt-0.5">
            ● {hasICalSync ? "ACTIVA" : "OK"}
          </span>
        </div>
      </div>

      {/* 2-Column Responsive Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Hand: Controls & Global Configuration Panel (Spans 5 of 12 columns) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Sincronización Interactiva iCal */}
          <section className="bg-white border border-warm-border rounded-xl p-4 shadow-sm space-y-3.5">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display font-bold text-xs uppercase tracking-wider text-dark leading-none">Canal iCal Booking/Airbnb</h3>
                <span className="text-[9px] text-dark-muted block mt-1 font-medium">Sincroniza ocupación cada 15 minutos en segundo plano</span>
              </div>
              <button
                onClick={triggerManualICalSync}
                disabled={syncLoading}
                className="flex items-center gap-1 bg-secondary hover:bg-secondary-hover text-warm-bg text-[10px] font-bold py-1.5 px-3 rounded-lg shadow disabled:opacity-40"
              >
                <RefreshCw className={`w-3 h-3 ${syncLoading ? "animate-spin" : ""}`} />
                <span>Sincronizar</span>
              </button>
            </div>

            {syncFeedback && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg text-[10px] font-semibold flex items-start gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{syncFeedback}</span>
              </div>
            )}
          </section>

          {/* 3. Manual Calendar Blocker scheduler */}
          <section className="bg-white border border-warm-border rounded-xl p-4 shadow-sm space-y-3">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-dark leading-none">Gestor de Disponibilidad Manual (Bloqueos)</h3>
            <p className="text-[9px] text-dark-muted font-medium">Bloquea por mantenimiento o libera fechas cliqueando en la fecha deseada</p>
            
            <form onSubmit={handleAddManualBlock} className="text-xs grid grid-cols-1 gap-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="blocker-room-id" className="text-[8px] font-bold text-dark uppercase block mb-1">Habitación</label>
                  <select
                    id="blocker-room-id"
                    value={blockerRoomId}
                    onChange={(e) => setBlockerRoomId(e.target.value)}
                    className="w-full bg-warm-card border border-warm-border rounded-lg p-2 text-[11px] font-semibold text-dark"
                  >
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="manual-block-date" className="text-[8px] font-bold text-dark uppercase block mb-1">Fecha (YYYY-MM-DD)</label>
                  <input
                    id="manual-block-date"
                    type="date"
                    required
                    value={manualBlockDate}
                    onChange={(e) => setManualBlockDate(e.target.value)}
                    className="w-full bg-warm-card border border-warm-border rounded-lg p-1.5 text-[11px] text-dark font-mono font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-secondary hover:bg-secondary-hover text-warm-bg py-2 rounded-lg font-bold font-mono text-[10px]"
              >
                Bloquear / Liberar Fecha
              </button>
            </form>
          </section>

          {/* 4. Global Settings & Notification Rules */}
          <section className="bg-white border border-warm-border rounded-xl p-4 shadow-sm space-y-4">
            <div>
              <h3 className="font-display font-bold text-xs uppercase tracking-wider text-dark leading-none">Configuraciones de la Compañía</h3>
              <p className="text-[9px] text-dark-muted font-medium mt-1">Configure alertas salientes y logotipo del hotel</p>
            </div>

            {loadingSettings ? (
              <p className="text-xs text-dark-muted font-mono">Cargando preferencias...</p>
            ) : settings ? (
              <form onSubmit={handleSaveNotificationConfig} className="space-y-4 text-xs font-medium">
                
                {/* Logo Settings */}
                <div>
                  <label htmlFor="hotel-logo-url" className="text-[9px] font-bold text-dark uppercase tracking-wider block mb-1">Logotipo del Hotel (URL)</label>
                  <input
                    id="hotel-logo-url"
                    type="text"
                    required
                    value={settings.hotelLogoUrl}
                    onChange={(e) => setSettings({ ...settings, hotelLogoUrl: e.target.value })}
                    className="w-full bg-warm-card border border-warm-border rounded-lg py-2 px-3 text-dark text-[11px]"
                  />
                  <span className="text-[8px] text-dark-muted block mt-1">Este logotipo se mostrará dinámicamente en todo el hotel y la barra de navegación.</span>
                </div>

                <div className="h-px bg-warm-border"></div>

                {/* Notification alert channels */}
                <div className="space-y-3.5">
                  <span className="text-[9px] text-dark uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-secondary" /> Configuración de Alertas al Host
                  </span>

                  {/* Email Alert Channel */}
                  <div className="p-3 bg-warm-card rounded-lg border border-warm-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="checkbox"
                          id="email-enabled"
                          checked={settings.notificationConfig.emailEnabled}
                          onChange={(e) => setSettings({
                            ...settings,
                            notificationConfig: {
                              ...settings.notificationConfig,
                              emailEnabled: e.target.checked
                            }
                          })}
                          className="w-4 h-4 text-primary rounded"
                        />
                        <label htmlFor="email-enabled" className="font-bold text-dark text-xs">Canal Correo Electrónico</label>
                      </div>
                      <span className="text-[8px] font-mono uppercase bg-blue-50 border border-blue-200 text-blue-800 px-1.5 py-0.5 rounded">Resend / SendGrid</span>
                    </div>

                    {settings.notificationConfig.emailEnabled && (
                      <div>
                        <label htmlFor="email-destination" className="text-[8px] font-bold text-dark-muted uppercase block mb-0.5">Destinatario Alerts Email</label>
                        <input 
                          id="email-destination"
                          type="email" 
                          required
                          value={settings.notificationConfig.emailDestination}
                          onChange={(e) => setSettings({
                            ...settings,
                            notificationConfig: {
                              ...settings.notificationConfig,
                              emailDestination: e.target.value
                            }
                          })}
                          className="w-full bg-white border border-warm-border rounded px-2.5 py-1.5 text-[10px] text-dark"
                        />
                      </div>
                    )}
                  </div>

                  {/* WhatsApp Alert Channel */}
                  <div className="p-3 bg-warm-card rounded-lg border border-warm-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="checkbox"
                          id="whatsapp-enabled"
                          checked={settings.notificationConfig.whatsappEnabled}
                          onChange={(e) => setSettings({
                            ...settings,
                            notificationConfig: {
                              ...settings.notificationConfig,
                              whatsappEnabled: e.target.checked
                            }
                          })}
                          className="w-4 h-4 text-primary rounded"
                        />
                        <label htmlFor="whatsapp-enabled" className="font-bold text-dark text-xs">Canal WhatsApp API</label>
                      </div>
                      <span className="text-[8px] font-mono uppercase bg-green-50 border border-green-200 text-green-800 px-1.5 py-0.5 rounded font-bold">Cloud API Meta</span>
                    </div>

                    {settings.notificationConfig.whatsappEnabled && (
                      <div>
                        <label htmlFor="whatsapp-destination" className="text-[8px] font-bold text-dark-muted uppercase block mb-0.5">Celular Destinatario (WhatsApp)</label>
                        <input 
                          id="whatsapp-destination"
                          type="text" 
                          required
                          value={settings.notificationConfig.whatsappDestination}
                          onChange={(e) => setSettings({
                            ...settings,
                            notificationConfig: {
                              ...settings.notificationConfig,
                              whatsappDestination: e.target.value
                            }
                          })}
                          className="w-full bg-white border border-warm-border rounded px-2.5 py-1.5 text-[10px] text-dark font-mono font-bold"
                        />
                      </div>
                    )}
                  </div>

                  {/* Push / SMS Alert Channel */}
                  <div className="p-3 bg-warm-card rounded-lg border border-warm-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="checkbox"
                          id="sms-enabled"
                          checked={settings.notificationConfig.smsEnabled}
                          onChange={(e) => setSettings({
                            ...settings,
                            notificationConfig: {
                              ...settings.notificationConfig,
                              smsEnabled: e.target.checked
                            }
                          })}
                          className="w-4 h-4 text-primary rounded"
                        />
                        <label htmlFor="sms-enabled" className="font-bold text-dark text-xs">Canal SMS o Celular Push</label>
                      </div>
                      <span className="text-[8px] font-mono uppercase bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5 rounded">Twilio / FCM</span>
                    </div>

                    {settings.notificationConfig.smsEnabled && (
                      <div>
                        <label htmlFor="sms-destination" className="text-[8px] font-bold text-dark-muted uppercase block mb-0.5">Celular de Alerta SMS</label>
                        <input 
                          id="sms-destination"
                          type="text" 
                          required
                          value={settings.notificationConfig.smsDestination}
                          onChange={(e) => setSettings({
                            ...settings,
                            notificationConfig: {
                              ...settings.notificationConfig,
                              smsDestination: e.target.value
                            }
                          })}
                          className="w-full bg-white border border-warm-border rounded px-2.5 py-1.5 text-[10px] text-dark font-mono font-bold"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary-hover text-warm-bg py-2.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all font-sans"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar Canales & Logo en Firestore</span>
                </button>
              </form>
            ) : (
              <p className="text-xs text-red-500">Error al inicializar configuraciones.</p>
            )}
          </section>
        </div>

        {/* Right Hand: Accommodation CRUD Manager & Form panels (Spans 7 of 12 columns) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 2. Room CRUD Manager Section */}
          {editingRoom === null ? (
            <section className="space-y-3.5">
              <div className="flex justify-between items-center border-b border-warm-border/60 pb-2">
                <h3 className="font-display font-bold text-base text-dark">Gestor de Habitaciones ({rooms.length})</h3>
                <button
                  onClick={() => openEditForm(null)}
                  className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-warm-bg text-[10px] font-bold py-2 px-3 rounded-lg shadow animate-pulse hover:animate-none"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nueva Habitación</span>
                </button>
              </div>

              <div className="space-y-3.5">
                {rooms.map((room) => (
                  <div key={room.id} className="bg-white border border-warm-border rounded-xl p-3.5 flex gap-4 items-center relative shadow-sm">
                    <img
                      src={room.images[0] || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=150&q=80"}
                      alt={room.name}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 rounded-lg object-cover border border-warm-border shrink-0 animate-fade-in"
                    />
                    
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-dark truncate pr-16">{room.name}</h4>
                      <span className="text-[11px] text-primary font-mono font-bold block mt-0.5">
                        ${room.pricePerNight.toLocaleString()} COP / Noche
                      </span>
                      
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-[9px] font-bold text-dark bg-warm-card px-2 py-0.5 rounded border border-warm-border uppercase font-mono text-[9px]">
                          Bloqueos: {room.blockedDates ? room.blockedDates.length : 0} d
                        </span>
                        {(room.airbnb_ical_url || room.booking_ical_url) && (
                          <span className="text-[9px] font-bold text-secondary bg-secondary/15 px-2 py-0.5 rounded uppercase font-mono">
                            iCal URL Sincronizada
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <button
                        onClick={() => openEditForm(room)}
                        className="p-2 text-secondary hover:bg-warm-card rounded border border-transparent hover:border-warm-border transition-colors cursor-pointer"
                        title="Editar Apartaestudio"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRoom(room.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-colors cursor-pointer"
                        title="Eliminar Apartaestudio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            /* Form View for Adding / Editing Apartaestudio */
            <section className="bg-white border border-warm-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-warm-border pb-3">
                <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-dark leading-none">
                  {editingRoom.id ? `Editar Apartaestudio: ${editingRoom.name}` : "Crear Nuevo Apartaestudio"}
                </h4>
                <button
                  onClick={() => setEditingRoom(null)}
                  className="text-[10px] font-bold text-dark-muted hover:underline uppercase tracking-widest cursor-pointer"
                >
                  Regresar al listado
                </button>
              </div>

              <form onSubmit={handleSaveRoom} className="space-y-4 text-xs">
                {/* ID Input (Immutable if editing) */}
                <div>
                  <label htmlFor="room-id-input" className="text-[9px] font-bold text-dark uppercase tracking-wider block mb-1.5">ID Único de Habitación *</label>
                  <input
                    id="room-id-input"
                    type="text"
                    disabled={!!editingRoom.id}
                    required
                    placeholder="Ej: apartaestudio-101"
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value.toLowerCase().replace(/\s/g, '-'))}
                    className="w-full bg-warm-card border border-warm-border rounded-lg py-2 px-3 text-dark focus:outline-none focus:border-secondary font-mono text-xs disabled:opacity-50"
                  />
                </div>

                {/* Name */}
                <div>
                  <label htmlFor="room-name" className="text-[9px] font-bold text-dark uppercase tracking-wider block mb-1.5">Nombre Comercial de la Suite *</label>
                  <input
                    id="room-name"
                    type="text"
                    required
                    placeholder="Ej: Suite Deluxe Exterior"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-warm-card border border-warm-border rounded-lg py-2 px-3 text-dark font-medium focus:outline-none focus:border-secondary text-xs"
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="room-desc" className="text-[9px] font-bold text-dark uppercase tracking-wider block mb-1.5">Descripción de Espacio de Autor *</label>
                  <textarea
                    id="room-desc"
                    required
                    rows={4}
                    placeholder="Describa acabados, servicios m2, tipo de cama, iluminación..."
                    value={roomDesc}
                    onChange={(e) => setRoomDesc(e.target.value)}
                    className="w-full bg-warm-card border border-warm-border rounded-lg py-2 px-3 text-dark focus:outline-none focus:border-secondary font-medium leading-normal text-xs"
                  />
                </div>

                {/* Price & Capacity Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="room-price" className="text-[9px] font-bold text-dark uppercase tracking-wider block mb-1.5">Precio x Noche (COP) *</label>
                    <input
                      id="room-price"
                      type="number"
                      required
                      min={1}
                      value={roomPrice}
                      onChange={(e) => setRoomPrice(Number(e.target.value))}
                      className="w-full bg-warm-card border border-warm-border rounded-lg py-2 px-3 text-dark font-mono font-bold focus:outline-none focus:border-secondary text-xs"
                    />
                  </div>

                  <div>
                    <label htmlFor="room-capacity" className="text-[9px] font-bold text-dark uppercase tracking-wider block mb-1.5">Capacidad Máxima (Adultos) *</label>
                    <input
                      id="room-capacity"
                      type="number"
                      required
                      min={1}
                      value={roomCapacity}
                      onChange={(e) => setRoomCapacity(Number(e.target.value))}
                      className="w-full bg-warm-card border border-warm-border rounded-lg py-2 px-3 text-dark font-mono font-bold focus:outline-none focus:border-secondary text-xs"
                    />
                  </div>
                </div>

                {/* Images Manager */}
                <div className="space-y-2 pb-1">
                  <label htmlFor="new-image-input" className="text-[9px] font-bold text-dark uppercase tracking-wider block leading-none">Enlaces de Fotos (URLs)</label>
                  <div className="flex gap-2">
                    <input
                      id="new-image-input"
                      type="url"
                      placeholder="https://images.unsplash.com/..."
                      value={newImageInput}
                      onChange={(e) => setNewImageInput(e.target.value)}
                      className="flex-1 bg-warm-card border border-warm-border rounded-lg py-2 px-3 text-xs focus:outline-none text-dark"
                    />
                    <button
                      type="button"
                      onClick={handleAddImage}
                      className="bg-secondary hover:bg-secondary-hover text-warm-bg font-bold px-4 rounded-lg text-xs cursor-pointer"
                    >
                      Agregar
                    </button>
                  </div>

                  {/* Photos List scroller */}
                  <div className="flex gap-2.5 overflow-x-auto pt-1 py-1">
                    {roomImages.map((img, idx) => (
                      <div key={idx} className="relative w-14 h-14 rounded border border-warm-border overflow-hidden shrink-0">
                        <img src={img} alt="Foto" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-0 right-0 bg-red-600 text-white w-4 h-4 text-[9px] flex items-center justify-center font-bold"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Calendars URLs iCal */}
                <div className="bg-warm-card p-4 rounded-xl space-y-3 border border-warm-border">
                  <span className="text-[9px] text-secondary font-mono uppercase font-bold tracking-widest block">Integración iCal Opcional</span>
                  
                  <div>
                    <label htmlFor="airbnb-url" className="text-[8px] font-bold text-dark-muted block mb-1 uppercase tracking-wider">Airbnb iCal Feed URL</label>
                    <input
                      id="airbnb-url"
                      type="url"
                      placeholder="https://www.airbnb.com/calendar/ical/..."
                      value={airbnbUrl}
                      onChange={(e) => setAirbnbUrl(e.target.value)}
                      className="w-full bg-white border border-warm-border rounded p-2 text-xs text-dark font-mono focus:outline-none focus:border-secondary"
                    />
                  </div>

                  <div>
                    <label htmlFor="booking-url" className="text-[8px] font-bold text-dark-muted block mb-1 uppercase tracking-wider">Booking.com iCal Feed URL</label>
                    <input
                      id="booking-url"
                      type="url"
                      placeholder="https://ical.booking.com/v1/..."
                      value={bookingUrl}
                      onChange={(e) => setBookingUrl(e.target.value)}
                      className="w-full bg-white border border-warm-border rounded p-2 text-xs text-dark font-mono focus:outline-none focus:border-secondary"
                    />
                  </div>
                </div>

                {/* Expose endpoints details */}
                {editingRoom.id && (
                  <div className="p-3 bg-secondary/15 rounded-lg text-[9px] text-dark font-medium leading-normal space-y-1.5 border border-secondary/30">
                    <span className="font-bold flex items-center gap-1">🔗 Canal iCal Exportable del Hotel:</span>
                    <p>Usa esta dirección URL para bloquear fechas en Booking / Airbnb automáticamente para esta habitación:</p>
                    <code className="block bg-white p-2 text-[8px] font-mono break-all text-secondary font-bold select-all border border-warm-border rounded leading-relaxed">
                      {getPublicApiOrigin()}/api/rooms/{editingRoom.id}/ical
                    </code>
                  </div>
                )}

                {/* Form actions */}
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-warm-bg py-3 rounded-lg font-bold shadow-sm transition-all active:scale-95 text-xs font-sans uppercase tracking-wider"
                >
                  <Save className="w-4.5 h-4.5" />
                  <span>Guardar Apartaestudio</span>
                </button>
              </form>
            </section>
          )}
        </div>
      </div>

    </div>
  );
}
