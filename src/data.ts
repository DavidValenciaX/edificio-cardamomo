import { FaqItem, NearbyPlace, PublicContent, PublicPolicies, Room, RoomFeatures, RoomPricing } from "./types";
import { filterDateListFrom } from "./lib/ical";

export const DEFAULT_LOGO_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' rx='64' fill='%23E5E7EB'/%3E%3Ccircle cx='64' cy='46' r='20' fill='%239CA3AF'/%3E%3Cpath d='M32 104c4-18 18-30 32-30s28 12 32 30' fill='%239CA3AF'/%3E%3C/svg%3E";

export const DEFAULT_HERO_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 420'%3E%3Crect width='1200' height='420' fill='%23E5E7EB'/%3E%3Crect x='90' y='80' width='320' height='220' rx='28' fill='%23D1D5DB'/%3E%3Crect x='470' y='120' width='260' height='26' rx='13' fill='%239CA3AF'/%3E%3Crect x='470' y='165' width='420' height='20' rx='10' fill='%23CBD5E1'/%3E%3Crect x='470' y='200' width='360' height='20' rx='10' fill='%23CBD5E1'/%3E%3Crect x='470' y='245' width='180' height='40' rx='20' fill='%239CA3AF'/%3E%3C/svg%3E";

export const DEFAULT_ROOM_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 400'%3E%3Crect width='640' height='400' fill='%23F3F4F6'/%3E%3Crect x='190' y='110' width='260' height='180' rx='18' fill='%23E5E7EB' stroke='%23CBD5E1' stroke-width='8'/%3E%3Ccircle cx='270' cy='170' r='24' fill='%23CBD5E1'/%3E%3Cpath d='M220 250l55-52 42 36 44-42 49 58H220z' fill='%23CBD5E1'/%3E%3C/svg%3E";

export function buildDefaultRoomFeatures(): RoomFeatures {
  return {
    bedrooms: 1,
    beds: 1,
    hasSofaBed: false,
    hasAirConditioning: false,
    hasWifi: true,
    hasTv: false,
    hasFullKitchen: false,
    hasFridge: false,
    hasPrivateBathroom: true,
  };
}

function asPositiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function asNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeRoom(raw: unknown, id: string): Room {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const defaults = buildDefaultRoomFeatures();
  const rawFeatures = input.features && typeof input.features === "object"
    ? input.features as Record<string, unknown>
    : {};
  const capacity = asPositiveInt(input.capacity, 1);
  const legacyPricePerNight = asNonNegativeNumber(input.pricePerNight, 0);
  const rawPricing = input.pricing && typeof input.pricing === "object"
    ? input.pricing as Record<string, unknown>
    : {};
  const baseOccupancy = Math.min(asPositiveInt(rawPricing.baseOccupancy, 1), capacity);
  const pricing: RoomPricing = {
    baseOccupancy,
    basePricePerNight: asNonNegativeNumber(rawPricing.basePricePerNight, legacyPricePerNight),
    extraGuestPricePerNight: asNonNegativeNumber(rawPricing.extraGuestPricePerNight, 0),
  };
  const storedBlockedDates = Array.isArray(input.blockedDates)
    ? input.blockedDates.filter((date): date is string => typeof date === "string")
    : [];
  const blockedDates = filterDateListFrom(storedBlockedDates);
  const manualBlockedDates = Array.isArray(input.manualBlockedDates)
    ? input.manualBlockedDates.filter((date): date is string => typeof date === "string")
    : blockedDates;
  const externalBlockedDates = Array.isArray(input.externalBlockedDates)
    ? filterDateListFrom(input.externalBlockedDates.filter((date): date is string => typeof date === "string"))
    : [];

  return {
    id,
    name: typeof input.name === "string" ? input.name : "Apartamento",
    description: typeof input.description === "string" ? input.description : "",
    capacity,
    pricing,
    features: {
      bedrooms: asPositiveInt(rawFeatures.bedrooms, defaults.bedrooms),
      beds: asPositiveInt(rawFeatures.beds, defaults.beds),
      hasSofaBed: asBoolean(rawFeatures.hasSofaBed, defaults.hasSofaBed),
        hasAirConditioning: asBoolean(rawFeatures.hasAirConditioning, defaults.hasAirConditioning),
      hasWifi: asBoolean(rawFeatures.hasWifi, defaults.hasWifi),
      hasTv: asBoolean(rawFeatures.hasTv, defaults.hasTv),
      hasFullKitchen: asBoolean(rawFeatures.hasFullKitchen, defaults.hasFullKitchen),
      hasFridge: asBoolean(rawFeatures.hasFridge, defaults.hasFridge),
      hasPrivateBathroom: asBoolean(rawFeatures.hasPrivateBathroom, defaults.hasPrivateBathroom),
    },
    images: Array.isArray(input.images) ? input.images.filter((image): image is string => typeof image === "string") : [],
    blockedDates,
    manualBlockedDates,
    externalBlockedDates,
  };
}

const DEFAULT_PUBLIC_POLICIES: PublicPolicies = {
  parking: "Contamos con un único espacio de parqueadero compartido, con capacidad para un automóvil o hasta dos motocicletas. Su disponibilidad puede variar y no se puede garantizar al momento de la llegada.",
  breakfast: "El alojamiento no incluye desayuno. En los alrededores encontrarás restaurantes, tiendas y otros establecimientos de alimentación.",
  checkIn: "El check-in está disponible de 1:00 p. m. a 9:00 p. m.",
  checkOut: "El checkout debe realizarse hasta las 11:00 a. m.",
  earlyArrival: "No ofrecemos llegada anticipada, porque necesitamos que el huésped anterior se retire y contar con tiempo suficiente para limpiar y preparar el apartamento.",
  lateDeparture: "No ofrecemos salida después de las 11:00 a. m., porque necesitamos preparar el apartamento para los nuevos huéspedes.",
  partialStayDiscount: "El valor corresponde a la noche reservada. Llegar más tarde o retirarse antes no genera descuento, porque el apartamento permanece bloqueado para esa reserva.",
  reception: "No contamos con una recepción permanente ni con un mostrador atendido durante todo el día. La llegada se coordina previamente con nuestro equipo.",
  selfCheckIn: "No contamos con acceso autónomo mediante códigos o cerraduras inteligentes. La llegada debe coordinarse con nuestro equipo.",
  electronicInvoice: "Podemos expedir factura electrónica cuando el huésped la solicita. Es importante solicitarla durante la reserva o antes de finalizar la estadía y proporcionar los datos necesarios para su emisión.",
};

const DEFAULT_FAQ_ITEMS: FaqItem[] = [
  {
    id: "early-arrival",
    question: "¿Puedo llegar antes de la hora de check-in?",
    answer: DEFAULT_PUBLIC_POLICIES.earlyArrival,
  },
  {
    id: "late-departure",
    question: "¿Puedo retirarme después de la hora de checkout?",
    answer: DEFAULT_PUBLIC_POLICIES.lateDeparture,
  },
  {
    id: "partial-stay-discount",
    question: "¿Hay descuento si llego tarde o me retiro temprano?",
    answer: DEFAULT_PUBLIC_POLICIES.partialStayDiscount,
  },
  {
    id: "electronic-invoice",
    question: "¿Pueden emitir factura electrónica?",
    answer: DEFAULT_PUBLIC_POLICIES.electronicInvoice,
  },
];

const DEFAULT_NEARBY_PLACES: NearbyPlace[] = [
  {
    id: "centro-comercial-unico",
    category: "Compras",
    name: "Centro Comercial Único",
    description: "Centro comercial con comercios, servicios y opciones de alimentación.",
    address: "Neiva, Huila",
    distance: "Consulta la ruta actual en Google Maps",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Centro+Comercial+Unico+Neiva+Huila",
  },
  {
    id: "aeropuerto-benito-salas",
    category: "Transporte",
    name: "Aeropuerto Benito Salas",
    description: "Aeropuerto de Neiva para vuelos nacionales y conexiones regionales.",
    address: "Neiva, Huila",
    distance: "Consulta la ruta actual en Google Maps",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Aeropuerto+Benito+Salas+Neiva+Huila",
  },
];

export function buildDefaultPublicContent(): PublicContent {
  return {
    intro: "Encuentra aquí las respuestas a las preguntas más frecuentes antes de reservar y una guía práctica de lugares cercanos.",
    policies: { ...DEFAULT_PUBLIC_POLICIES },
    faqItems: DEFAULT_FAQ_ITEMS.map((item) => ({ ...item })),
    nearbyPlaces: DEFAULT_NEARBY_PLACES.map((place) => ({ ...place })),
  };
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizePublicContent(raw: unknown): PublicContent {
  const defaults = buildDefaultPublicContent();
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawPolicies = input.policies && typeof input.policies === "object"
    ? input.policies as Record<string, unknown>
    : {};

  const faqItems = Array.isArray(input.faqItems)
    ? input.faqItems.reduce<FaqItem[]>((items, rawItem, index) => {
        if (!rawItem || typeof rawItem !== "object") return items;
        const item = rawItem as Record<string, unknown>;
        const question = asText(item.question, "").trim();
        const answer = asText(item.answer, "").trim();
        if (!question || !answer) return items;
        items.push({
          id: asText(item.id, `faq-${index + 1}`),
          question,
          answer,
        });
        return items;
      }, [])
    : defaults.faqItems;

  const nearbyPlaces = Array.isArray(input.nearbyPlaces)
    ? input.nearbyPlaces.reduce<NearbyPlace[]>((places, rawPlace, index) => {
        if (!rawPlace || typeof rawPlace !== "object") return places;
        const place = rawPlace as Record<string, unknown>;
        const name = asText(place.name, "").trim();
        if (!name) return places;
        places.push({
          id: asText(place.id, `place-${index + 1}`),
          category: asText(place.category, "Lugar cercano"),
          name,
          description: asText(place.description, ""),
          address: asText(place.address, ""),
          distance: asText(place.distance, ""),
          mapUrl: asText(place.mapUrl, ""),
        });
        return places;
      }, [])
    : defaults.nearbyPlaces;

  return {
    intro: asText(input.intro, defaults.intro),
    policies: {
      parking: asText(rawPolicies.parking, defaults.policies.parking),
      breakfast: asText(rawPolicies.breakfast, defaults.policies.breakfast),
      checkIn: asText(rawPolicies.checkIn, defaults.policies.checkIn),
      checkOut: asText(rawPolicies.checkOut, defaults.policies.checkOut),
      earlyArrival: asText(rawPolicies.earlyArrival, defaults.policies.earlyArrival),
      lateDeparture: asText(rawPolicies.lateDeparture, defaults.policies.lateDeparture),
      partialStayDiscount: asText(rawPolicies.partialStayDiscount, defaults.policies.partialStayDiscount),
      reception: asText(rawPolicies.reception, defaults.policies.reception),
      selfCheckIn: asText(rawPolicies.selfCheckIn, defaults.policies.selfCheckIn),
      electronicInvoice: asText(rawPolicies.electronicInvoice, defaults.policies.electronicInvoice),
    },
    faqItems,
    nearbyPlaces,
  };
}
