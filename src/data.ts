import { Room, Settings } from "./types";

export const DEFAULT_ROOMS: Room[] = [
  {
    id: "apartaestudio-101",
    name: "Apartaestudio Cardamomo Premium (101)",
    description: "Espacioso apartaestudio amoblado con diseño contemporáneo y acabados de lujo. Cuenta con balcón privado, cocina equipada con barra de cuarzo, cama queen size, Smart TV, zona de trabajo ergonómica y baño de lujo. Ideal para ejecutivos y parejas que aprecian el buen gusto.",
    capacity: 2,
    pricePerNight: 180000, // COP
    images: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80"
    ],
    airbnb_ical_url: "https://calendar.google.com/calendar/ical/es.colombia%23holiday%40group.v.calendar.google.com/public/basic.ics", // Muestra festivos como demo
    booking_ical_url: "https://calendar.google.com/calendar/ical/es.colombia%23holiday%40group.v.calendar.google.com/public/basic.ics",
    blockedDates: ["2026-06-15", "2026-06-16", "2026-06-20"]
  },
  {
    id: "apartaestudio-202",
    name: "Suites Dúplex Cardamomo (202)",
    description: "Exclusivo diseño en dos niveles que separa el área social de la habitación principal. Decoración de vanguardia inspirada en tonos tierra y la naturaleza con abundante iluminación indirecta, cocina integral tipo americana, sofá cama adicional y balcón con vista panorámica.",
    capacity: 4,
    pricePerNight: 240000, // COP
    images: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1502672016487-759bc7fa6f6b?auto=format&fit=crop&w=800&q=80"
    ],
    airbnb_ical_url: "",
    booking_ical_url: "",
    blockedDates: ["2026-06-10", "2026-06-11"]
  },
  {
    id: "apartaestudio-303",
    name: "Apartaestudio Studio Loft (303)",
    description: "Estilo industrial minimalista diseñado para estancias extendidas o nómadas digitales. Cuenta con excelente conexión de fibra óptica de alta velocidad, cerradura inteligente, microondas, cafetera premium, cafetera express y mesa alta multifuncional.",
    capacity: 2,
    pricePerNight: 150000, // COP
    images: [
      "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?auto=format&fit=crop&w=800&q=80"
    ],
    airbnb_ical_url: "",
    booking_ical_url: "",
    blockedDates: []
  }
];

export const DEFAULT_SETTINGS: Settings = {
  hotelLogoUrl: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=150&q=80",
  notificationConfig: {
    emailEnabled: true,
    emailDestination: "edificiocardamomo@gmail.com",
    whatsappEnabled: true,
    whatsappDestination: "+573104567890",
    smsEnabled: false,
    smsDestination: "+573104567890"
  }
};
