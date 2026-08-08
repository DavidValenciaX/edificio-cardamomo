import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, handleFirestoreError, OperationType, storage } from "../lib/firebase";
import { getApiUrl, getPublicApiOrigin } from "../lib/api";
import { buildDefaultRoomFeatures, DEFAULT_HERO_PLACEHOLDER, DEFAULT_LOGO_PLACEHOLDER, DEFAULT_ROOM_IMAGE_PLACEHOLDER } from "../data";
import { getOccupancyPriceOptions, getRoomStartingPrice } from "../lib/pricing";
import { PublicContent, Room, RoomFeatures, RoomIntegration, Settings } from "../types";
import PublicContentEditor from "./PublicContentEditor";
import {
  Bell,
  CalendarDays,
  CheckCircle,
  ChevronRight,
  Edit2,
  FileText,
  Home,
  LayoutDashboard,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  type LucideIcon,
} from "lucide-react";

interface AdminPanelProps {
  rooms: Room[];
  onRefreshRooms: () => void;
  publicContent: PublicContent;
  onPublicContentChange: (content: PublicContent) => void;
}

function buildEmptySettings(): Settings {
  return {
    hotelLogoUrl: "",
    heroBannerUrl: "",
    notificationConfig: {
      emailEnabled: false,
      emailDestination: "",
      whatsappEnabled: false,
      whatsappDestination: "",
      smsEnabled: false,
      smsDestination: "",
    },
  };
}

function normalizeSettings(raw?: Partial<Settings> | null): Settings {
  const defaults = buildEmptySettings();
  return {
    hotelLogoUrl: raw?.hotelLogoUrl || defaults.hotelLogoUrl,
    heroBannerUrl: raw?.heroBannerUrl || defaults.heroBannerUrl,
    notificationConfig: {
      ...defaults.notificationConfig,
      ...(raw?.notificationConfig || {}),
    },
  };
}

function buildEmptyRoomIntegration(roomId: string = ""): RoomIntegration {
  return {
    roomId,
    airbnbIcalUrl: "",
    bookingIcalUrl: "",
  };
}

type AdminSectionId = "overview" | "rooms" | "availability" | "content" | "branding";

const adminSections: Array<{
  id: AdminSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "overview", label: "Resumen", description: "Estado operativo", icon: LayoutDashboard },
  { id: "rooms", label: "Apartamentos", description: "Inventario y fichas", icon: Home },
  { id: "availability", label: "Disponibilidad", description: "Bloqueos e iCal", icon: CalendarDays },
  { id: "content", label: "Contenido público", description: "Información, FAQ y guía local", icon: FileText },
  { id: "branding", label: "Marca y alertas", description: "Imagen y notificaciones", icon: Palette },
];

export default function AdminPanel({ rooms, onRefreshRooms, publicContent, onPublicContentChange }: AdminPanelProps) {
  const [activeSection, setActiveSection] = useState<AdminSectionId>("overview");

  // Global Hotel Settings
  const [settings, setSettings] = useState<Settings | null>(null);
  const [roomIntegrations, setRoomIntegrations] = useState<Record<string, RoomIntegration>>({});
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHeroBanner, setUploadingHeroBanner] = useState(false);
  const [uploadingRoomImages, setUploadingRoomImages] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");
  const [heroBannerUploadError, setHeroBannerUploadError] = useState("");
  const [roomImagesUploadError, setRoomImagesUploadError] = useState("");

  // States for CRUD Apartment
  const [editingRoom, setEditingRoom] = useState<Partial<Room> | null>(null); // Null means list view, non-null means form view
  const [roomIdInput, setRoomIdInput] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomDesc, setRoomDesc] = useState("");
  const [roomBasePrice, setRoomBasePrice] = useState("");
  const [roomBaseOccupancy, setRoomBaseOccupancy] = useState(1);
  const [roomExtraGuestPrice, setRoomExtraGuestPrice] = useState("0");
  const [roomCapacity, setRoomCapacity] = useState(2);
  const [roomFeatures, setRoomFeatures] = useState<RoomFeatures>(buildDefaultRoomFeatures());
  const [roomImages, setRoomImages] = useState<string[]>([]);
  const [originalRoomImages, setOriginalRoomImages] = useState<string[]>([]);
  const [pendingRoomImageDeletes, setPendingRoomImageDeletes] = useState<string[]>([]);
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
        setSettings(normalizeSettings(snap.data() as Partial<Settings>));
      } else {
        setSettings(buildEmptySettings());
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
      setSettings(buildEmptySettings());
    } finally {
      setLoadingSettings(false);
    }
  };

  const fetchRoomIntegrations = async () => {
    try {
      const snap = await getDocs(collection(db, "roomIntegrations"));
      const nextIntegrations: Record<string, RoomIntegration> = {};
      snap.forEach((integrationDoc) => {
        const raw = integrationDoc.data() as Partial<RoomIntegration>;
        nextIntegrations[integrationDoc.id] = {
          roomId: integrationDoc.id,
          airbnbIcalUrl: raw.airbnbIcalUrl || "",
          bookingIcalUrl: raw.bookingIcalUrl || "",
        };
      });
      setRoomIntegrations(nextIntegrations);
    } catch (error) {
      console.error("Error fetching room integrations:", error);
      setRoomIntegrations({});
    }
  };

  const uploadImageFile = async (file: File, destinationPath: string) => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Selecciona una imagen válida.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Cada imagen debe pesar menos de 5 MB.");
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-").toLowerCase();
    const storageRef = ref(storage, `${destinationPath}/${Date.now()}-${sanitizedName}`);

    await uploadBytes(storageRef, file, {
      contentType: file.type,
      cacheControl: "public,max-age=3600",
    });

    return getDownloadURL(storageRef);
  };

  const deleteStorageFileByUrl = async (fileUrl: string) => {
    if (!fileUrl || fileUrl.startsWith("data:")) {
      return;
    }

    if (!fileUrl.includes("firebasestorage.googleapis.com") && !fileUrl.startsWith("gs://")) {
      return;
    }

    try {
      await deleteObject(ref(storage, fileUrl));
    } catch (error: any) {
      if (error?.code === "storage/object-not-found") {
        return;
      }
      throw error;
    }
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!settings) {
      event.target.value = "";
      return;
    }

    setUploadingLogo(true);
    setLogoUploadError("");

    try {
      const downloadUrl = await uploadImageFile(file, "branding/logo");
      const previousLogoUrl = settings.hotelLogoUrl;
      const nextSettings = {
        ...settings,
        hotelLogoUrl: downloadUrl,
      };

      await setDoc(doc(db, "settings", "global"), {
        hotelLogoUrl: downloadUrl,
        heroBannerUrl: settings.heroBannerUrl || "",
      }, { merge: true });

      setSettings(nextSettings);
      if (previousLogoUrl && previousLogoUrl !== downloadUrl) {
        await deleteStorageFileByUrl(previousLogoUrl);
      }
    } catch (error) {
      console.error("Logo upload failed:", error);
      setLogoUploadError(error instanceof Error ? error.message : "No se pudo subir el logo. Revisa Storage y sus reglas.");
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  };

  const handleHeroBannerUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!settings) {
      event.target.value = "";
      return;
    }

    setUploadingHeroBanner(true);
    setHeroBannerUploadError("");

    try {
      const downloadUrl = await uploadImageFile(file, "branding/hero");
      const previousHeroBannerUrl = settings.heroBannerUrl;
      await setDoc(doc(db, "settings", "global"), {
        hotelLogoUrl: settings.hotelLogoUrl || "",
        heroBannerUrl: downloadUrl,
      }, { merge: true });

      setSettings({
        ...settings,
        heroBannerUrl: downloadUrl,
      });
      if (previousHeroBannerUrl && previousHeroBannerUrl !== downloadUrl) {
        await deleteStorageFileByUrl(previousHeroBannerUrl);
      }
    } catch (error) {
      console.error("Hero banner upload failed:", error);
      setHeroBannerUploadError(error instanceof Error ? error.message : "No se pudo subir la imagen principal.");
    } finally {
      setUploadingHeroBanner(false);
      event.target.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    if (!settings) return;

    try {
      const previousLogoUrl = settings.hotelLogoUrl;
      await setDoc(doc(db, "settings", "global"), {
        hotelLogoUrl: "",
        heroBannerUrl: settings.heroBannerUrl || "",
      }, { merge: true });

      setSettings({
        ...settings,
        hotelLogoUrl: "",
      });
      setLogoUploadError("");
      if (previousLogoUrl) {
        await deleteStorageFileByUrl(previousLogoUrl);
      }
    } catch (error) {
      console.error("Logo removal failed:", error);
      setLogoUploadError("No se pudo quitar el logo actual.");
    }
  };

  const handleRemoveHeroBanner = async () => {
    if (!settings) return;

    try {
      const previousHeroBannerUrl = settings.heroBannerUrl;
      await setDoc(doc(db, "settings", "global"), {
        hotelLogoUrl: settings.hotelLogoUrl || "",
        heroBannerUrl: "",
      }, { merge: true });

      setSettings({
        ...settings,
        heroBannerUrl: "",
      });
      setHeroBannerUploadError("");
      if (previousHeroBannerUrl) {
        await deleteStorageFileByUrl(previousHeroBannerUrl);
      }
    } catch (error) {
      console.error("Hero banner removal failed:", error);
      setHeroBannerUploadError("No se pudo quitar la imagen principal.");
    }
  };

  useEffect(() => {
    void fetchGlobalSettings();
    void fetchRoomIntegrations();
    if (rooms.length > 0) {
      setBlockerRoomId(rooms[0].id);
    }
  }, [rooms]);

  // Handle iCal Manual sync triggering
  const triggerManualICalSync = async () => {
    setSyncLoading(true);
    setSyncFeedback("");
    try {
      const headers: HeadersInit = {};
      const idToken = await auth.currentUser?.getIdToken();
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }

      const response = await fetch(getApiUrl("/api/sync-ical"), {
        method: "POST",
        headers,
      });
      const data = await response.json();
      if (response.ok) {
        setSyncFeedback(`Sincronización exitosa. Apartamentos actualizados.`);
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
      await setDoc(doc(db, "settings", "global"), {
        hotelLogoUrl: settings.hotelLogoUrl,
        heroBannerUrl: settings.heroBannerUrl,
        notificationConfig: settings.notificationConfig
      }, { merge: true });
      alert("Configuraciones de alertas actualizadas de forma segura en Firestore.");
    } catch (err: any) {
      console.error("Save config error:", err);
      handleFirestoreError(err, OperationType.UPDATE, "settings/global");
    }
  };

  // Add/Edit Apartment Form Triggers
  const openEditForm = (room: Room | null) => {
    setActiveSection("rooms");
    if (room) {
      const integration = roomIntegrations[room.id];
      const legacyRoom = room as Room & {
        airbnb_ical_url?: string;
        booking_ical_url?: string;
      };
      setEditingRoom(room);
      setRoomIdInput(room.id);
      setRoomName(room.name);
      setRoomDesc(room.description);
      setRoomBasePrice(String(room.pricing.basePricePerNight));
      setRoomBaseOccupancy(room.pricing.baseOccupancy);
      setRoomExtraGuestPrice(String(room.pricing.extraGuestPricePerNight));
      setRoomCapacity(room.capacity);
      setRoomFeatures({ ...room.features });
      setRoomImages([...room.images]);
      setOriginalRoomImages([...room.images]);
      setPendingRoomImageDeletes([]);
      setRoomImagesUploadError("");
      setAirbnbUrl(integration?.airbnbIcalUrl || legacyRoom.airbnb_ical_url || "");
      setBookingUrl(integration?.bookingIcalUrl || legacyRoom.booking_ical_url || "");
      setBlockedDates([...room.blockedDates]);
    } else {
      const newRoomRef = doc(collection(db, "rooms"));
      setEditingRoom({});
      setRoomIdInput(newRoomRef.id);
      setRoomName("");
      setRoomDesc("");
      setRoomBasePrice("170000");
      setRoomBaseOccupancy(1);
      setRoomExtraGuestPrice("0");
      setRoomCapacity(2);
      setRoomFeatures(buildDefaultRoomFeatures());
      setRoomImages([]);
      setOriginalRoomImages([]);
      setPendingRoomImageDeletes([]);
      setRoomImagesUploadError("");
      setAirbnbUrl("");
      setBookingUrl("");
      setBlockedDates([]);
    }
  };

  const handleCancelEditForm = async () => {
    if (!editingRoom) {
      setEditingRoom(null);
      return;
    }

    if (!editingRoom.id) {
      const unsavedUploads = [
        ...new Set([
          ...roomImages.filter((imageUrl) => !originalRoomImages.includes(imageUrl)),
          ...pendingRoomImageDeletes,
        ]),
      ];
      for (const imageUrl of unsavedUploads) {
        try {
          await deleteStorageFileByUrl(imageUrl);
        } catch (error) {
          console.error("Failed to delete unsaved room image from storage:", error);
        }
      }
    }

    setPendingRoomImageDeletes([]);
    setOriginalRoomImages([]);
    setRoomImagesUploadError("");
    setEditingRoom(null);
    setActiveSection("rooms");
  };

  const handleSaveRoom = async (e: FormEvent) => {
    e.preventDefault();
    const parsedBasePrice = Number(roomBasePrice);
    const parsedExtraGuestPrice = Number(roomExtraGuestPrice);
    if (
      !roomIdInput
      || !roomName
      || !roomBasePrice.trim()
      || Number.isNaN(parsedBasePrice)
      || parsedBasePrice <= 0
      || !roomExtraGuestPrice.trim()
      || Number.isNaN(parsedExtraGuestPrice)
      || parsedExtraGuestPrice < 0
      || roomCapacity <= 0
      || roomBaseOccupancy <= 0
      || roomBaseOccupancy > roomCapacity
      || roomFeatures.bedrooms <= 0
      || roomFeatures.beds <= 0
    ) {
      alert("Por favor complete los campos obligatorios.");
      return;
    }

    const roomPayload: Room = {
      id: roomIdInput,
      name: roomName,
      description: roomDesc,
      capacity: Number(roomCapacity),
      pricing: {
        baseOccupancy: Number(roomBaseOccupancy),
        basePricePerNight: parsedBasePrice,
        extraGuestPricePerNight: parsedExtraGuestPrice,
      },
      features: roomFeatures,
      images: roomImages,
      blockedDates: blockedDates
    };
    const nextIntegration = {
      roomId: roomIdInput,
      airbnbIcalUrl: airbnbUrl.trim(),
      bookingIcalUrl: bookingUrl.trim(),
    };

    try {
      await setDoc(doc(db, "rooms", roomIdInput), roomPayload);
      if (nextIntegration.airbnbIcalUrl || nextIntegration.bookingIcalUrl) {
        await setDoc(doc(db, "roomIntegrations", roomIdInput), nextIntegration);
      } else {
        await deleteDoc(doc(db, "roomIntegrations", roomIdInput));
      }
      for (const imageUrl of pendingRoomImageDeletes) {
        await deleteStorageFileByUrl(imageUrl);
      }
      alert("Apartamento guardado con éxito.");
      setPendingRoomImageDeletes([]);
      setOriginalRoomImages([]);
      setEditingRoom(null);
      onRefreshRooms();
      void fetchRoomIntegrations();
    } catch (err: any) {
      console.error("Save room failed:", err);
      handleFirestoreError(err, OperationType.CREATE, `rooms/${roomIdInput}`);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm("¿Está seguro de eliminar este apartamento definitivamente?")) {
      return;
    }
    try {
      const roomToDelete = rooms.find((room) => room.id === roomId);
      await deleteDoc(doc(db, "rooms", roomId));
      await deleteDoc(doc(db, "roomIntegrations", roomId));
      if (roomToDelete?.images?.length) {
        for (const imageUrl of roomToDelete.images) {
          await deleteStorageFileByUrl(imageUrl);
        }
      }
      alert("Apartamento eliminado.");
      onRefreshRooms();
      void fetchRoomIntegrations();
    } catch (err: any) {
      console.error("Delete failed:", err);
      handleFirestoreError(err, OperationType.DELETE, `rooms/${roomId}`);
    }
  };

  const handleRoomImagesUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length === 0) return;

    if (!roomIdInput) {
      setRoomImagesUploadError("Define primero el ID del apartamento antes de subir imágenes.");
      event.target.value = "";
      return;
    }

    setUploadingRoomImages(true);
    setRoomImagesUploadError("");

    try {
      const uploadedUrls = await Promise.all(
        files.map((file) => uploadImageFile(file, `rooms/${roomIdInput}`))
      );
      setRoomImages((currentImages) => [...currentImages, ...uploadedUrls].slice(0, 10));
    } catch (error) {
      console.error("Room images upload failed:", error);
      setRoomImagesUploadError(error instanceof Error ? error.message : "No se pudieron subir las imágenes.");
    } finally {
      setUploadingRoomImages(false);
      event.target.value = "";
    }
  };

  const handleRemoveImage = (idx: number) => {
    const imageToRemove = roomImages[idx];
    setRoomImages(roomImages.filter((_, i) => i !== idx));
    if (imageToRemove) {
      setPendingRoomImageDeletes((currentDeletes) =>
        currentDeletes.includes(imageToRemove) ? currentDeletes : [...currentDeletes, imageToRemove]
      );
    }
  };

  // Manual Blocker Scheduler Submit
  const handleAddManualBlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualBlockDate || !blockerRoomId) {
      alert("Seleccione apartamento y fecha.");
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
  const roomsWithICal = rooms.filter((room) => {
    const integration = roomIntegrations[room.id];
    const legacyRoom = room as Room & {
      airbnb_ical_url?: string;
      booking_ical_url?: string;
    };
    return Boolean(
      integration?.airbnbIcalUrl ||
      integration?.bookingIcalUrl ||
      legacyRoom.airbnb_ical_url ||
      legacyRoom.booking_ical_url
    );
  }).length;

  const activeSectionMeta = adminSections.find((section) => section.id === activeSection) || adminSections[0];
  const parsedBasePrice = Number(roomBasePrice);
  const parsedExtraGuestPrice = Number(roomExtraGuestPrice);
  const canPreviewPricing = Number.isFinite(parsedBasePrice)
    && parsedBasePrice > 0
    && Number.isFinite(parsedExtraGuestPrice)
    && parsedExtraGuestPrice >= 0
    && roomCapacity > 0
    && roomBaseOccupancy > 0
    && roomBaseOccupancy <= roomCapacity;
  const roomPricingPreview = canPreviewPricing
    ? getOccupancyPriceOptions({
        id: roomIdInput || "preview",
        name: roomName || "Apartamento",
        description: roomDesc,
        capacity: roomCapacity,
        pricing: {
          baseOccupancy: roomBaseOccupancy,
          basePricePerNight: parsedBasePrice,
          extraGuestPricePerNight: parsedExtraGuestPrice,
        },
        features: roomFeatures,
        images: roomImages,
        blockedDates,
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-[1440px] py-6 lg:py-10">
      <header className="flex flex-col gap-6 border-b border-warm-border pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-secondary">Administración · Edificio Cardamomo</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.04em] text-dark md:text-5xl">Panel de administración</h1>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="self-start lg:sticky lg:top-28" aria-label="Secciones administrativas">
          <div className="rounded-3xl border border-warm-border bg-white p-2 shadow-[0_12px_32px_rgba(64,48,29,0.06)]">
            <p className="px-3 pb-2 pt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-dark-muted">Workspace</p>
            <nav className="flex gap-2 overflow-x-auto lg:flex-col" role="tablist" aria-label="Navegación del panel">
              {adminSections.map((section) => {
                const SectionIcon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveSection(section.id)}
                    className={`group flex min-w-[10rem] items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors lg:min-w-0 ${
                      isActive ? "bg-secondary text-warm-bg shadow-sm" : "text-dark-muted hover:bg-warm-card hover:text-dark"
                    }`}
                  >
                    <SectionIcon className={`h-5 w-5 shrink-0 ${isActive ? "text-accent" : "text-secondary"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{section.label}</span>
                      <span className={`mt-0.5 block truncate text-xs ${isActive ? "text-warm-bg/70" : "text-dark-muted"}`}>{section.description}</span>
                    </span>
                    <ChevronRight className={`ml-auto hidden h-4 w-4 shrink-0 lg:block ${isActive ? "text-accent" : "opacity-0 group-hover:opacity-100"}`} />
                  </button>
                );
              })}
            </nav>
          </div>

        </aside>

        <main className="min-w-0" aria-labelledby="admin-section-title">
          <div className="mb-6 flex flex-col gap-4 border-b border-warm-border pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-secondary">Sección activa</p>
              <h2 id="admin-section-title" className="font-display text-3xl font-semibold tracking-[-0.03em] text-dark">{activeSectionMeta.label}</h2>
              <p className="mt-2 text-sm leading-6 text-dark-muted">{activeSectionMeta.description}. Los cambios se guardan directamente en Firestore.</p>
            </div>
            {activeSection === "rooms" && editingRoom === null && (
              <button
                type="button"
                onClick={() => openEditForm(null)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-warm-bg shadow-sm transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" />
                Nuevo apartamento
              </button>
            )}
          </div>

          {activeSection === "overview" && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-warm-border bg-white p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-dark-muted">Apartamentos</span>
                  <span className="mt-4 block font-display text-4xl font-semibold text-dark">{rooms.length}</span>
                  <span className="mt-1 block text-sm text-dark-muted">espacios publicados</span>
                </div>
                <div className="rounded-3xl border border-warm-border bg-white p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-dark-muted">Días bloqueados</span>
                  <span className="mt-4 block font-display text-4xl font-semibold text-dark">{totalBlockedDays}</span>
                  <span className="mt-1 block text-sm text-dark-muted">en el inventario actual</span>
                </div>
                <div className="rounded-3xl border border-warm-border bg-white p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-dark-muted">Con iCal</span>
                  <span className="mt-4 block font-display text-4xl font-semibold text-dark">{roomsWithICal}</span>
                  <span className="mt-1 block text-sm text-dark-muted">apartamentos conectados</span>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-3xl border border-warm-border bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Accesos frecuentes</p>
                      <h3 className="mt-2 font-display text-2xl font-semibold text-dark">¿Qué necesitas hacer?</h3>
                    </div>
                    <Settings2 className="h-6 w-6 text-secondary/60" />
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => setActiveSection("rooms")} className="flex min-h-16 items-center gap-3 rounded-2xl border border-warm-border bg-warm-card/60 px-4 text-left transition-colors hover:border-secondary/40 hover:bg-warm-card">
                      <Home className="h-5 w-5 text-primary" />
                      <span><span className="block text-sm font-bold text-dark">Gestionar apartamentos</span><span className="mt-1 block text-xs text-dark-muted">Editar fichas y fotos</span></span>
                    </button>
                    <button type="button" onClick={() => setActiveSection("availability")} className="flex min-h-16 items-center gap-3 rounded-2xl border border-warm-border bg-warm-card/60 px-4 text-left transition-colors hover:border-secondary/40 hover:bg-warm-card">
                      <CalendarDays className="h-5 w-5 text-primary" />
                      <span><span className="block text-sm font-bold text-dark">Revisar disponibilidad</span><span className="mt-1 block text-xs text-dark-muted">Bloqueos e integraciones</span></span>
                    </button>
                    <button type="button" onClick={() => setActiveSection("content")} className="flex min-h-16 items-center gap-3 rounded-2xl border border-warm-border bg-warm-card/60 px-4 text-left transition-colors hover:border-secondary/40 hover:bg-warm-card">
                      <FileText className="h-5 w-5 text-primary" />
                      <span><span className="block text-sm font-bold text-dark">Actualizar contenido</span><span className="mt-1 block text-xs text-dark-muted">FAQ y guía del sector</span></span>
                    </button>
                    <button type="button" onClick={() => setActiveSection("branding")} className="flex min-h-16 items-center gap-3 rounded-2xl border border-warm-border bg-warm-card/60 px-4 text-left transition-colors hover:border-secondary/40 hover:bg-warm-card">
                      <Palette className="h-5 w-5 text-primary" />
                      <span><span className="block text-sm font-bold text-dark">Cuidar la marca</span><span className="mt-1 block text-xs text-dark-muted">Logo, hero y alertas</span></span>
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl bg-dark p-6 text-warm-bg shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Inventario visible</p>
                  <h3 className="mt-2 font-display text-2xl font-semibold">Estado de tus espacios</h3>
                  <div className="mt-6 space-y-3">
                    {rooms.length === 0 ? (
                      <p className="rounded-2xl border border-warm-bg/15 bg-warm-bg/10 p-4 text-sm leading-6 text-warm-bg/75">Todavía no hay apartamentos publicados.</p>
                    ) : rooms.slice(0, 4).map((room) => (
                      <div key={room.id} className="flex items-center justify-between gap-3 rounded-2xl border border-warm-bg/15 bg-warm-bg/10 px-4 py-3">
                        <span className="min-w-0 truncate text-sm font-semibold">{room.name}</span>
                        <span className="shrink-0 text-xs font-medium text-warm-bg/65">{room.blockedDates.length} bloqueos</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeSection === "rooms" && (
            editingRoom === null ? (
              <section className="space-y-4" aria-labelledby="rooms-list-title">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-dark-muted">Administra el inventario que aparece en la landing pública.</p>
                    <h3 id="rooms-list-title" className="mt-2 font-display text-2xl font-semibold text-dark">{rooms.length} {rooms.length === 1 ? "apartamento publicado" : "apartamentos publicados"}</h3>
                  </div>
                </div>

                {rooms.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-warm-border bg-white p-10 text-center text-sm leading-6 text-dark-muted shadow-sm">
                    Aún no hay apartamentos configurados. Crea el primero desde el botón <strong className="text-dark">Nuevo apartamento</strong>.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rooms.map((room) => {
                      const integration = roomIntegrations[room.id];
                      const legacyRoom = room as Room & { airbnb_ical_url?: string; booking_ical_url?: string };
                      const hasICal = Boolean(integration?.airbnbIcalUrl || integration?.bookingIcalUrl || legacyRoom.airbnb_ical_url || legacyRoom.booking_ical_url);
                      return (
                        <article key={room.id} className="card-lift flex flex-col gap-4 rounded-3xl border border-warm-border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
                          <img
                            src={room.images[0] || DEFAULT_ROOM_IMAGE_PLACEHOLDER}
                            alt={`Interior de ${room.name}`}
                            referrerPolicy="no-referrer"
                            width={320}
                            height={192}
                            loading="lazy"
                            className="h-28 w-full rounded-2xl object-cover sm:h-24 sm:w-32"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate font-display text-2xl font-semibold text-dark">{room.name}</h4>
                            <p className="mt-1 font-mono text-sm font-bold text-primary">
                              Desde ${getRoomStartingPrice(room).toLocaleString()} COP <span className="font-sans font-medium text-dark-muted">/ noche</span>
                            </p>
                            <p className="mt-1 text-xs text-dark-muted">
                              Base para {room.pricing.baseOccupancy} {room.pricing.baseOccupancy === 1 ? "huésped" : "huéspedes"} y +${room.pricing.extraGuestPricePerNight.toLocaleString()} COP por huésped adicional.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full border border-warm-border bg-warm-card px-3 py-1 text-xs font-semibold text-dark-muted">{room.blockedDates.length} bloqueos</span>
                              <span className="rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">Capacidad {room.capacity}</span>
                              <span className="rounded-full border border-warm-border bg-white px-3 py-1 text-xs font-semibold text-dark-muted">{room.features.bedrooms} hab.</span>
                              <span className="rounded-full border border-warm-border bg-white px-3 py-1 text-xs font-semibold text-dark-muted">{room.features.beds} camas</span>
                              {room.features.hasWifi && <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Wifi</span>}
                              {hasICal && <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">iCal conectado</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 border-t border-warm-border pt-3 sm:border-t-0 sm:pt-0">
                            <button type="button" onClick={() => openEditForm(room)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-warm-border px-4 text-sm font-bold text-secondary transition-colors hover:bg-warm-card" title="Editar apartamento">
                              <Edit2 className="h-4 w-4" />
                              Editar
                            </button>
                            <button type="button" onClick={() => handleDeleteRoom(room.id)} className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-red-200 text-red-700 transition-colors hover:bg-red-50" title="Eliminar apartamento" aria-label={`Eliminar ${room.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-3xl border border-warm-border bg-white p-5 shadow-sm md:p-8" aria-labelledby="room-form-title">
                <div className="flex flex-col gap-3 border-b border-warm-border pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary">Ficha de inventario</p>
                    <h3 id="room-form-title" className="mt-2 font-display text-3xl font-semibold text-dark">{editingRoom.id ? `Editar ${editingRoom.name}` : "Crear nuevo apartamento"}</h3>
                  </div>
                  <button type="button" onClick={() => { void handleCancelEditForm(); }} className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-warm-border px-4 text-sm font-bold text-dark-muted transition-colors hover:bg-warm-card">
                    <ChevronRight className="h-4 w-4 rotate-180" />
                    Volver al listado
                  </button>
                </div>

                <form onSubmit={handleSaveRoom} className="mt-6 space-y-6">
                  {editingRoom.id ? (
                    <div>
                      <label htmlFor="room-id-input" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">ID técnico</label>
                      <input id="room-id-input" type="text" readOnly value={roomIdInput} className="min-h-11 w-full cursor-not-allowed rounded-xl border border-warm-border bg-warm-card px-4 font-mono text-sm text-dark-muted opacity-75" />
                    </div>
                  ) : null}

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label htmlFor="room-name" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Nombre comercial *</label>
                      <input id="room-name" name="roomName" autoComplete="off" type="text" required placeholder="Ej: Apartamento Deluxe Exterior" value={roomName} onChange={(e) => setRoomName(e.target.value)} className="min-h-11 w-full rounded-xl border border-warm-border bg-warm-card px-4 text-sm text-dark placeholder:text-dark-muted/70" />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="room-desc" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Descripción *</label>
                      <textarea id="room-desc" name="description" autoComplete="off" required rows={5} placeholder="Describe acabados, servicios, tipo de cama e iluminación…" value={roomDesc} onChange={(e) => setRoomDesc(e.target.value)} className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-3 text-sm leading-6 text-dark placeholder:text-dark-muted/70" />
                    </div>
                    <div>
                      <label htmlFor="room-base-price" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Precio base por noche (COP) *</label>
                      <input id="room-base-price" name="basePricePerNight" inputMode="numeric" autoComplete="off" type="number" required min={1} value={roomBasePrice} onChange={(e) => setRoomBasePrice(e.target.value)} className="min-h-11 w-full rounded-xl border border-warm-border bg-warm-card px-4 font-mono text-sm font-bold text-dark" />
                      <p className="mt-2 text-xs leading-5 text-dark-muted">Corresponde a la ocupación base definida abajo.</p>
                    </div>
                    <div>
                      <label htmlFor="room-base-occupancy" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Ocupación base *</label>
                      <input id="room-base-occupancy" name="baseOccupancy" inputMode="numeric" autoComplete="off" type="number" required min={1} max={roomCapacity} value={roomBaseOccupancy} onChange={(e) => setRoomBaseOccupancy(Number(e.target.value))} className="min-h-11 w-full rounded-xl border border-warm-border bg-warm-card px-4 font-mono text-sm font-bold text-dark" />
                    </div>
                    <div>
                      <label htmlFor="room-capacity" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Capacidad máxima *</label>
                      <input id="room-capacity" name="capacity" inputMode="numeric" autoComplete="off" type="number" required min={1} value={roomCapacity} onChange={(e) => {
                        const nextCapacity = Number(e.target.value);
                        setRoomCapacity(nextCapacity);
                        setRoomBaseOccupancy((current) => Math.min(Math.max(current, 1), Math.max(nextCapacity, 1)));
                      }} className="min-h-11 w-full rounded-xl border border-warm-border bg-warm-card px-4 font-mono text-sm font-bold text-dark" />
                    </div>
                    <div>
                      <label htmlFor="room-extra-guest-price" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Recargo por huésped adicional (COP) *</label>
                      <input id="room-extra-guest-price" name="extraGuestPricePerNight" inputMode="numeric" autoComplete="off" type="number" required min={0} value={roomExtraGuestPrice} onChange={(e) => setRoomExtraGuestPrice(e.target.value)} className="min-h-11 w-full rounded-xl border border-warm-border bg-warm-card px-4 font-mono text-sm font-bold text-dark" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-secondary/20 bg-secondary/10 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Vista previa tarifaria</p>
                    <p className="mt-2 text-sm leading-6 text-dark-muted">El huésped verá claramente cuánto cuesta la noche según el número de personas que seleccione.</p>
                    {canPreviewPricing ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {roomPricingPreview.map((option) => (
                          <div key={option.guestCount} className="rounded-2xl border border-warm-border bg-white px-4 py-3">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-dark-muted">
                              {option.guestCount} {option.guestCount === 1 ? "huésped" : "huéspedes"}
                            </span>
                            <span className="mt-2 block font-mono text-lg font-bold text-primary">
                              ${option.nightlyPrice.toLocaleString()} COP
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                        Ajusta precio base, ocupación base, capacidad y recargo adicional para generar la vista previa.
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-warm-border bg-warm-card/60 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Ficha de servicios</p>
                    <p className="mt-2 text-sm leading-6 text-dark-muted">Estos datos se muestran al huésped durante la reserva para que entienda mejor cómo está distribuido el apartamento.</p>
                    <div className="mt-5 grid gap-5 md:grid-cols-3">
                      <div>
                        <label htmlFor="room-bedrooms" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Habitaciones *</label>
                        <input id="room-bedrooms" name="bedrooms" inputMode="numeric" autoComplete="off" type="number" required min={1} value={roomFeatures.bedrooms} onChange={(e) => setRoomFeatures((current) => ({ ...current, bedrooms: Number(e.target.value) }))} className="min-h-11 w-full rounded-xl border border-warm-border bg-white px-4 font-mono text-sm font-bold text-dark" />
                      </div>
                      <div>
                        <label htmlFor="room-beds" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Camas *</label>
                        <input id="room-beds" name="beds" inputMode="numeric" autoComplete="off" type="number" required min={1} value={roomFeatures.beds} onChange={(e) => setRoomFeatures((current) => ({ ...current, beds: Number(e.target.value) }))} className="min-h-11 w-full rounded-xl border border-warm-border bg-white px-4 font-mono text-sm font-bold text-dark" />
                      </div>
                      <div className="rounded-2xl border border-warm-border bg-white px-4 py-3 text-sm text-dark">
                        <span className="block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Capacidad publicada</span>
                        <span className="mt-2 block font-mono text-lg font-bold text-primary">{roomCapacity} huéspedes</span>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-warm-border bg-white px-4 text-sm font-semibold text-dark">
                        <input type="checkbox" checked={roomFeatures.hasSofaBed} onChange={(e) => setRoomFeatures((current) => ({ ...current, hasSofaBed: e.target.checked }))} className="h-4 w-4 rounded border-warm-border text-primary focus:ring-primary" />
                        Sofa cama
                      </label>
                      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-warm-border bg-white px-4 text-sm font-semibold text-dark">
                        <input type="checkbox" checked={roomFeatures.hasAirConditioning} onChange={(e) => setRoomFeatures((current) => ({ ...current, hasAirConditioning: e.target.checked }))} className="h-4 w-4 rounded border-warm-border text-primary focus:ring-primary" />
                        Aire acondicionado
                      </label>
                      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-warm-border bg-white px-4 text-sm font-semibold text-dark">
                        <input type="checkbox" checked={roomFeatures.hasWifi} onChange={(e) => setRoomFeatures((current) => ({ ...current, hasWifi: e.target.checked }))} className="h-4 w-4 rounded border-warm-border text-primary focus:ring-primary" />
                        Wifi
                      </label>
                      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-warm-border bg-white px-4 text-sm font-semibold text-dark">
                        <input type="checkbox" checked={roomFeatures.hasTv} onChange={(e) => setRoomFeatures((current) => ({ ...current, hasTv: e.target.checked }))} className="h-4 w-4 rounded border-warm-border text-primary focus:ring-primary" />
                        TV
                      </label>
                      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-warm-border bg-white px-4 text-sm font-semibold text-dark">
                        <input type="checkbox" checked={roomFeatures.hasFullKitchen} onChange={(e) => setRoomFeatures((current) => ({ ...current, hasFullKitchen: e.target.checked }))} className="h-4 w-4 rounded border-warm-border text-primary focus:ring-primary" />
                        Cocina completa
                      </label>
                      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-warm-border bg-white px-4 text-sm font-semibold text-dark">
                        <input type="checkbox" checked={roomFeatures.hasFridge} onChange={(e) => setRoomFeatures((current) => ({ ...current, hasFridge: e.target.checked }))} className="h-4 w-4 rounded border-warm-border text-primary focus:ring-primary" />
                        Nevera
                      </label>
                      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-warm-border bg-white px-4 text-sm font-semibold text-dark">
                        <input type="checkbox" checked={roomFeatures.hasPrivateBathroom} onChange={(e) => setRoomFeatures((current) => ({ ...current, hasPrivateBathroom: e.target.checked }))} className="h-4 w-4 rounded border-warm-border text-primary focus:ring-primary" />
                        Baño privado
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-warm-border bg-warm-card/60 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="font-display text-xl font-semibold text-dark">Fotos del apartamento</h4>
                        <p className="mt-1 max-w-xl text-sm leading-6 text-dark-muted">Sube imágenes reales a Firebase Storage. Puedes cargar hasta 10 fotos.</p>
                      </div>
                      <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-secondary px-4 text-sm font-bold text-warm-bg transition-colors hover:bg-secondary-hover">
                        {uploadingRoomImages ? "Subiendo…" : "Subir fotos"}
                        <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingRoomImages} onChange={handleRoomImagesUpload} />
                      </label>
                    </div>
                    {roomImagesUploadError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{roomImagesUploadError}</p>}
                    <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
                      {roomImages.length === 0 && <div className="w-full rounded-2xl border border-dashed border-warm-border bg-white px-4 py-8 text-center text-sm text-dark-muted">Aún no has subido fotos.</div>}
                      {roomImages.map((img, idx) => (
                        <div key={idx} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-warm-border bg-white">
                        <img src={img} alt={`Foto ${idx + 1} del apartamento`} referrerPolicy="no-referrer" width={96} height={96} className="h-full w-full object-cover" />
                          <button type="button" onClick={() => handleRemoveImage(idx)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-700 text-sm font-bold text-white shadow-sm" aria-label={`Quitar foto ${idx + 1}`}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-warm-border bg-warm-card/60 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Integración iCal opcional</p>
                    <p className="mt-2 text-sm leading-6 text-dark-muted">Estas URLs se guardan en una colección privada y las usa el backend al sincronizar disponibilidad.</p>
                    <div className="mt-5 space-y-4">
                      <div>
                        <label htmlFor="airbnb-url" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Airbnb iCal Feed URL</label>
                        <input id="airbnb-url" name="airbnbIcalUrl" autoComplete="off" type="url" placeholder="https://www.airbnb.com/calendar/ical/…" value={airbnbUrl} onChange={(e) => setAirbnbUrl(e.target.value)} className="min-h-11 w-full rounded-xl border border-warm-border bg-white px-4 font-mono text-sm text-dark" />
                      </div>
                      <div>
                        <label htmlFor="booking-url" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Booking.com iCal Feed URL</label>
                        <input id="booking-url" name="bookingIcalUrl" autoComplete="off" type="url" placeholder="https://ical.booking.com/v1/…" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} className="min-h-11 w-full rounded-xl border border-warm-border bg-white px-4 font-mono text-sm text-dark" />
                      </div>
                    </div>
                  </div>

                  {editingRoom.id && (
                    <div className="rounded-2xl border border-secondary/25 bg-secondary/10 p-4 text-sm leading-6 text-dark">
                      <span className="font-bold text-secondary">Canal iCal exportable del hotel</span>
                      <p className="mt-1">Usa esta URL para publicar la disponibilidad del apartamento:</p>
                      <code className="mt-3 block break-all rounded-xl border border-warm-border bg-white p-3 font-mono text-xs font-bold text-secondary">{getPublicApiOrigin()}/api/rooms/{editingRoom.id}/ical</code>
                    </div>
                  )}

                  <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-warm-bg shadow-sm transition-colors hover:bg-primary-hover">
                    <Save className="h-4 w-4" />
                    Guardar apartamento
                  </button>
                </form>
              </section>
            )
          )}

          {activeSection === "availability" && (
            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-6">
                <section className="rounded-3xl border border-warm-border bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Calendarios externos</p>
                      <h3 className="mt-2 font-display text-2xl font-semibold text-dark">Sincronización iCal</h3>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-dark-muted">Combina reservas locales con los bloqueos de Airbnb y Booking.com configurados en cada apartamento.</p>
                    </div>
                    <button type="button" onClick={triggerManualICalSync} disabled={syncLoading} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-secondary px-4 text-sm font-bold text-warm-bg shadow-sm transition-colors hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50">
                      <RefreshCw className={`h-4 w-4 ${syncLoading ? "animate-spin" : ""}`} />
                      Sincronizar ahora
                    </button>
                  </div>
                  {syncFeedback && <div role="status" aria-live="polite" className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><span>{syncFeedback}</span></div>}
                </section>

                <section className="rounded-3xl border border-warm-border bg-white p-6 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Bloqueo manual</p>
                  <h3 className="mt-2 font-display text-2xl font-semibold text-dark">Mantenimiento y fechas especiales</h3>
                  <p className="mt-2 text-sm leading-6 text-dark-muted">Bloquea una fecha por mantenimiento o vuelve a liberarla desde aquí.</p>
                  <form onSubmit={handleAddManualBlock} className="mt-6 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="blocker-room-id" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Apartamento</label>
                        <select id="blocker-room-id" value={blockerRoomId} onChange={(e) => setBlockerRoomId(e.target.value)} disabled={rooms.length === 0} className="min-h-11 w-full rounded-xl border border-warm-border bg-warm-card px-4 text-sm font-semibold text-dark disabled:cursor-not-allowed disabled:opacity-60">
                          {rooms.length === 0 && <option value="">Sin apartamentos</option>}
                          {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="manual-block-date" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-dark-muted">Fecha</label>
                        <input id="manual-block-date" type="date" required value={manualBlockDate} onChange={(e) => setManualBlockDate(e.target.value)} disabled={rooms.length === 0} className="min-h-11 w-full rounded-xl border border-warm-border bg-warm-card px-4 font-mono text-sm font-bold text-dark disabled:cursor-not-allowed disabled:opacity-60" />
                      </div>
                    </div>
                    <button type="submit" disabled={rooms.length === 0} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-secondary px-5 text-sm font-bold text-warm-bg transition-colors hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50">Bloquear / liberar fecha</button>
                  </form>
                </section>
              </div>

              <section className="rounded-3xl bg-dark p-6 text-warm-bg shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Lectura rápida</p>
                <h3 className="mt-2 font-display text-2xl font-semibold">Disponibilidad del inventario</h3>
                <div className="mt-6 space-y-3">
                  {rooms.length === 0 ? <p className="rounded-2xl border border-warm-bg/15 bg-warm-bg/10 p-4 text-sm text-warm-bg/75">Crea un apartamento para comenzar a gestionar fechas.</p> : rooms.map((room) => (
                    <div key={room.id} className="rounded-2xl border border-warm-bg/15 bg-warm-bg/10 p-4">
                      <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-bold">{room.name}</span><span className="font-mono text-xs text-accent">{room.blockedDates.length} días</span></div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-warm-bg/15"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, room.blockedDates.length * 5)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeSection === "branding" && (
            <section className="rounded-3xl border border-warm-border bg-white p-5 shadow-sm md:p-8" aria-labelledby="branding-title">
              <div className="border-b border-warm-border pb-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Sistema de marca</p>
                <h3 id="branding-title" className="mt-2 font-display text-3xl font-semibold text-dark">Imagen y alertas</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-dark-muted">Actualiza los activos que ve el huésped y configura los destinos de notificación del equipo.</p>
              </div>

              {loadingSettings ? <p className="py-8 text-sm text-dark-muted">Cargando preferencias…</p> : settings ? (
                <form onSubmit={handleSaveNotificationConfig} className="mt-6 space-y-8">
                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="rounded-2xl border border-warm-border bg-warm-card/60 p-5">
                      <h4 className="font-display text-xl font-semibold text-dark">Logotipo del hotel</h4>
                      <p className="mt-2 text-sm leading-6 text-dark-muted">Se muestra en la navegación pública y en el encabezado de la experiencia.</p>
                      <div className="mt-5 flex items-center gap-4">
                        <img src={settings.hotelLogoUrl || DEFAULT_LOGO_PLACEHOLDER} alt="Vista previa del logo" width={64} height={64} className="h-16 w-16 rounded-2xl border border-warm-border bg-white object-cover" />
                        <div className="flex flex-wrap gap-2">
                        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-secondary px-4 text-sm font-bold text-warm-bg transition-colors hover:bg-secondary-hover">{uploadingLogo ? "Subiendo…" : "Subir logo"}<input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={handleLogoUpload} /></label>
                          <button type="button" onClick={handleRemoveLogo} disabled={uploadingLogo || !settings.hotelLogoUrl} className="inline-flex min-h-11 items-center rounded-full border border-warm-border bg-white px-4 text-sm font-bold text-dark transition-colors hover:bg-warm-card disabled:cursor-not-allowed disabled:opacity-50">Quitar</button>
                        </div>
                      </div>
                      {logoUploadError && <p className="mt-3 text-sm font-semibold text-red-700">{logoUploadError}</p>}
                    </div>

                    <div className="rounded-2xl border border-warm-border bg-warm-card/60 p-5">
                      <h4 className="font-display text-xl font-semibold text-dark">Imagen principal</h4>
                      <p className="mt-2 text-sm leading-6 text-dark-muted">Esta imagen se muestra en el hero de la landing pública.</p>
                      <img src={settings.heroBannerUrl || DEFAULT_HERO_PLACEHOLDER} alt="Vista previa del banner principal" width={640} height={160} className="mt-5 h-32 w-full rounded-2xl border border-warm-border bg-white object-cover" />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-secondary px-4 text-sm font-bold text-warm-bg transition-colors hover:bg-secondary-hover">{uploadingHeroBanner ? "Subiendo…" : "Subir banner"}<input type="file" accept="image/*" className="hidden" disabled={uploadingHeroBanner} onChange={handleHeroBannerUpload} /></label>
                        <button type="button" onClick={handleRemoveHeroBanner} disabled={uploadingHeroBanner || !settings.heroBannerUrl} className="inline-flex min-h-11 items-center rounded-full border border-warm-border bg-white px-4 text-sm font-bold text-dark transition-colors hover:bg-warm-card disabled:cursor-not-allowed disabled:opacity-50">Quitar</button>
                      </div>
                      {heroBannerUploadError && <p className="mt-3 text-sm font-semibold text-red-700">{heroBannerUploadError}</p>}
                    </div>
                  </div>

                  <div className="border-t border-warm-border pt-6">
                    <div className="flex items-center gap-3"><Bell className="h-5 w-5 text-secondary" /><div><h4 className="font-display text-xl font-semibold text-dark">Alertas al host</h4><p className="mt-1 text-sm text-dark-muted">Define qué canales y destinos quedan configurados para las notificaciones.</p></div></div>
                    <div className="mt-5 grid gap-4 xl:grid-cols-3">
                      <div className="rounded-2xl border border-warm-border bg-warm-card/60 p-4">
                        <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-dark"><input type="checkbox" id="email-enabled" checked={settings.notificationConfig.emailEnabled} onChange={(e) => setSettings({ ...settings, notificationConfig: { ...settings.notificationConfig, emailEnabled: e.target.checked } })} className="h-5 w-5 rounded text-primary" /> Correo electrónico</label>
                        {settings.notificationConfig.emailEnabled && <div className="mt-3"><label htmlFor="email-destination" className="mb-2 block text-xs font-semibold text-dark-muted">Destinatario</label><input id="email-destination" name="emailDestination" autoComplete="email" type="email" required value={settings.notificationConfig.emailDestination} onChange={(e) => setSettings({ ...settings, notificationConfig: { ...settings.notificationConfig, emailDestination: e.target.value } })} className="min-h-11 w-full rounded-xl border border-warm-border bg-white px-3 text-sm text-dark" /></div>}
                      </div>
                      <div className="rounded-2xl border border-warm-border bg-warm-card/60 p-4">
                        <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-dark"><input type="checkbox" id="whatsapp-enabled" checked={settings.notificationConfig.whatsappEnabled} onChange={(e) => setSettings({ ...settings, notificationConfig: { ...settings.notificationConfig, whatsappEnabled: e.target.checked } })} className="h-5 w-5 rounded text-primary" /> WhatsApp</label>
                        {settings.notificationConfig.whatsappEnabled && <div className="mt-3"><label htmlFor="whatsapp-destination" className="mb-2 block text-xs font-semibold text-dark-muted">Celular destinatario</label><input id="whatsapp-destination" name="whatsappDestination" autoComplete="tel" type="tel" required value={settings.notificationConfig.whatsappDestination} onChange={(e) => setSettings({ ...settings, notificationConfig: { ...settings.notificationConfig, whatsappDestination: e.target.value } })} className="min-h-11 w-full rounded-xl border border-warm-border bg-white px-3 font-mono text-sm font-bold text-dark" /></div>}
                      </div>
                      <div className="rounded-2xl border border-warm-border bg-warm-card/60 p-4">
                        <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-dark"><input type="checkbox" id="sms-enabled" checked={settings.notificationConfig.smsEnabled} onChange={(e) => setSettings({ ...settings, notificationConfig: { ...settings.notificationConfig, smsEnabled: e.target.checked } })} className="h-5 w-5 rounded text-primary" /> SMS / Push</label>
                        {settings.notificationConfig.smsEnabled && <div className="mt-3"><label htmlFor="sms-destination" className="mb-2 block text-xs font-semibold text-dark-muted">Celular destinatario</label><input id="sms-destination" name="smsDestination" autoComplete="tel" type="tel" required value={settings.notificationConfig.smsDestination} onChange={(e) => setSettings({ ...settings, notificationConfig: { ...settings.notificationConfig, smsDestination: e.target.value } })} className="min-h-11 w-full rounded-xl border border-warm-border bg-white px-3 font-mono text-sm font-bold text-dark" /></div>}
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-warm-bg transition-colors hover:bg-primary-hover"><Save className="h-4 w-4" />Guardar configuración</button>
                </form>
              ) : <p className="py-8 text-sm text-red-700">Error al inicializar configuraciones.</p>}
            </section>
          )}

          {activeSection === "content" && <PublicContentEditor content={publicContent} onSaved={onPublicContentChange} />}
        </main>
      </div>
    </div>
  );
}
