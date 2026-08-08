import {
  Calendar,
  ChevronRight,
  Coffee,
  Compass,
  ExternalLink,
  Building2,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { PublicPolicies, PublicContent, Room } from "../types";
import { DEFAULT_HERO_PLACEHOLDER, DEFAULT_ROOM_IMAGE_PLACEHOLDER } from "../data";
import { getOccupancyPriceOptions, getRoomStartingPrice } from "../lib/pricing";

interface LandingPageProps {
  rooms: Room[];
  heroImageUrl: string;
  publicContent: PublicContent;
  onSelectRoom: (roomId: string) => void;
  onLoginClick: () => void;
  isLoggedIn: boolean;
}

const amenities: Array<{ title: string; description: string; icon: LucideIcon }> = [
  {
    title: "Internet de fibra",
    description: "Conexión estable para trabajar, estudiar o descansar sin interrupciones.",
    icon: Wifi,
  },
  {
    title: "Cocina completa",
    description: "Un espacio bien equipado para preparar algo sencillo o sentirte en casa.",
    icon: Coffee,
  },
  {
    title: "Seguridad 24/7",
    description: "Acceso controlado y una operación pensada para que estés tranquilo.",
    icon: ShieldCheck,
  },
  {
    title: "Ubicación clave",
    description: "Cerca del Centro Comercial Único y del aeropuerto Benito Salas.",
    icon: Compass,
  },
];

export default function LandingPage({
  rooms,
  heroImageUrl,
  publicContent,
  onSelectRoom,
  onLoginClick,
  isLoggedIn,
}: LandingPageProps) {
  const getRoomFeatureLabels = (room: Room): string[] => {
    const labels = [
      `${room.features.bedrooms} ${room.features.bedrooms === 1 ? "habitación" : "habitaciones"}`,
      `${room.features.beds} ${room.features.beds === 1 ? "cama" : "camas"}`,
    ];

    if (room.features.hasSofaBed) labels.push("Sofa cama");
    if (room.features.hasAirConditioning) labels.push("Aire acondicionado");
    if (room.features.hasWifi) labels.push("Wifi");
    if (room.features.hasTv) labels.push("TV");
    if (room.features.hasFullKitchen) labels.push("Cocina completa");
    if (room.features.hasFridge) labels.push("Nevera");
    if (room.features.hasPrivateBathroom) labels.push("Baño privado");

    return labels;
  };

  const policyCards: Array<{ key: keyof PublicPolicies; title: string; icon: LucideIcon }> = [
    { key: "parking", title: "Parqueadero", icon: MapPin },
    { key: "breakfast", title: "Desayuno", icon: Coffee },
    { key: "checkIn", title: "Check-in", icon: Calendar },
    { key: "checkOut", title: "Checkout", icon: Calendar },
    { key: "reception", title: "Recepción", icon: Building2 },
    { key: "selfCheckIn", title: "Llegada coordinada", icon: ShieldCheck },
  ];

  const getPricingLabel = (guestCount: number): string => {
    return `${guestCount} ${guestCount === 1 ? "huésped" : "huéspedes"}`;
  };

  return (
    <div className="brand-grain w-full pt-4 pb-16 md:pt-6">
      <section
        id="inicio"
        className="relative isolate min-h-[520px] overflow-hidden rounded-[1.75rem] border border-dark/10 bg-dark shadow-[0_24px_60px_rgba(64,48,29,0.18)] md:min-h-[590px]"
        aria-labelledby="hero-title"
      >
        <img
          src={heroImageUrl || DEFAULT_HERO_PLACEHOLDER}
          alt="Fachada del Edificio Cardamomo en Neiva"
          referrerPolicy="no-referrer"
          width={1200}
          height={590}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(64,48,29,0.94)_0%,rgba(64,48,29,0.65)_42%,rgba(64,48,29,0.12)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-dark/65 to-transparent" />

        <div className="relative flex min-h-[520px] flex-col justify-between gap-8 p-6 md:min-h-[590px] md:gap-0 md:p-12">
          <div className="flex items-start justify-between gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/50 bg-dark/30 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Estadías con identidad
            </span>
            <span className="hidden rounded-full border border-warm-bg/30 bg-dark/25 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-warm-bg/90 backdrop-blur-sm sm:inline-flex">
              Neiva · Huila
            </span>
          </div>

          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-accent">Apartamentos amoblados</p>
            <h1 id="hero-title" className="max-w-2xl font-display text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-warm-bg md:text-7xl">
              El lugar para vivir Neiva a tu ritmo.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-warm-bg/85 md:text-lg">
              Apartamentos amoblados con calma, diseño y lo necesario para que una noche de paso también se sienta como una buena decisión.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#apartamentos"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-warm-bg shadow-lg shadow-dark/20 transition-colors hover:bg-primary-hover"
              >
                Explorar apartamentos
                <ChevronRight className="h-4 w-4" />
              </a>
              <a
                href="#location"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-warm-bg/50 bg-warm-bg/10 px-5 text-sm font-semibold text-warm-bg backdrop-blur-sm transition-colors hover:bg-warm-bg/20"
              >
                Ver ubicación
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-warm-bg/20 pt-5 text-xs font-medium text-warm-bg/75 md:text-sm">
            <span>Diseño funcional</span>
            <span>Reservas flexibles</span>
            <span>Atención cercana</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl">
        <section id="apartamentos" className="scroll-mt-28 py-16 md:py-24" aria-labelledby="apartments-title">
          <div className="mb-8 flex flex-col gap-4 border-b border-warm-border pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Elige tu base</p>
              <h2 id="apartments-title" className="font-display text-4xl font-semibold leading-none tracking-[-0.03em] text-dark md:text-5xl">
                Apartamentos que se sienten propios.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-dark-muted">
                Espacios preparados para una estadía de negocios, una visita familiar o unos días para conocer mejor la ciudad.
              </p>
            </div>
            <span className="w-fit rounded-full border border-secondary/25 bg-secondary/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-secondary">
              {rooms.length} {rooms.length === 1 ? "apartamento" : "apartamentos"}
            </span>
          </div>

          {rooms.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-warm-border bg-white p-10 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-warm-card text-secondary">
                <Building2 className="h-7 w-7" />
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold text-dark">Estamos preparando los primeros espacios</h3>
              <p className="mx-auto mt-3 max-w-md text-base leading-7 text-dark-muted">
                Cuando la administración publique los apartamentos, podrás consultar sus detalles y reservarlos desde aquí.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {rooms.map((room) => (
                <article key={room.id} className="card-lift group overflow-hidden rounded-3xl border border-warm-border bg-white shadow-[0_12px_32px_rgba(64,48,29,0.07)]">
                  <div className="relative aspect-[4/3] overflow-hidden bg-warm-card">
                    <img
                      src={room.images[0] || DEFAULT_ROOM_IMAGE_PLACEHOLDER}
                      alt={`Interior de ${room.name}`}
                      referrerPolicy="no-referrer"
                      width={640}
                      height={480}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    <span className="absolute left-4 top-4 rounded-full bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-warm-bg">
                      Hasta {room.capacity} {room.capacity === 1 ? "persona" : "personas"}
                    </span>
                  </div>

                  <div className="space-y-5 p-5 md:p-6">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Edificio Cardamomo · Neiva</p>
                      <h3 className="mt-2 truncate font-display text-2xl font-semibold text-dark">{room.name}</h3>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-dark-muted">{room.description}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {getRoomFeatureLabels(room).slice(0, 5).map((label) => (
                          <span key={label} className="rounded-full border border-warm-border bg-warm-card px-3 py-1 text-xs font-semibold text-dark-muted">
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-4 border-t border-warm-border pt-4">
                      <div className="min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-dark-muted">Desde</span>
                        <span className="mt-1 block font-mono text-base font-bold text-primary">
                          ${getRoomStartingPrice(room).toLocaleString()} <span className="font-sans text-sm font-medium text-dark-muted">/ noche</span>
                        </span>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {getOccupancyPriceOptions(room).map((option) => (
                            <span key={option.guestCount} className="rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1 text-[11px] font-semibold text-secondary">
                              {getPricingLabel(option.guestCount)}: ${option.nightlyPrice.toLocaleString()}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => onSelectRoom(room.id)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-warm-bg transition-colors hover:bg-primary-hover"
                      >
                        Reservar
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="amenities" className="scroll-mt-28 rounded-[2rem] border-y border-warm-border bg-warm-card/75 px-5 py-16 md:px-10 md:py-20" aria-labelledby="amenities-title">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Lo que ya está resuelto</p>
            <h2 id="amenities-title" className="font-display text-4xl font-semibold tracking-[-0.03em] text-dark md:text-5xl">Comodidades para vivir ligero.</h2>
            <p className="mt-4 text-base leading-7 text-dark-muted">Pequeños detalles que hacen que la experiencia sea simple desde que llegas.</p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {amenities.map((amenity) => {
              const AmenityIcon = amenity.icon;
              return (
                <article key={amenity.title} className="card-lift rounded-2xl border border-warm-border/80 bg-white p-5 shadow-sm">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <AmenityIcon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 font-display text-xl font-semibold text-dark">{amenity.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-dark-muted">{amenity.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="informacion" className="scroll-mt-28 py-16 md:py-24" aria-labelledby="information-title">
          <div className="mb-8 max-w-2xl">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Antes de reservar</p>
            <h2 id="information-title" className="font-display text-4xl font-semibold tracking-[-0.03em] text-dark md:text-5xl">Información clara, sin letra pequeña.</h2>
            <p className="mt-4 text-base leading-7 text-dark-muted">{publicContent.intro}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {policyCards.map((card) => {
              const PolicyIcon = card.icon;
              return (
                <article key={card.key} className="rounded-2xl border border-warm-border bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <PolicyIcon className="h-5 w-5 text-primary" />
                    <h3 className="font-display text-xl font-semibold text-dark">{card.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-dark-muted">{publicContent.policies[card.key]}</p>
                </article>
              );
            })}
          </div>
        </section>

        {publicContent.faqItems.length > 0 && (
          <section id="faq" className="scroll-mt-28 border-t border-warm-border py-16 md:py-24" aria-labelledby="faq-title">
            <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Respuestas rápidas</p>
                <h2 id="faq-title" className="font-display text-4xl font-semibold tracking-[-0.03em] text-dark md:text-5xl">Preguntas frecuentes.</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-dark-muted">Lo importante para llegar con expectativas claras y disfrutar la estadía.</p>
            </div>

            <div className="mx-auto max-w-4xl space-y-3">
              {publicContent.faqItems.map((item) => (
                <details key={item.id} className="group rounded-2xl border border-warm-border bg-white shadow-sm">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-base font-semibold text-dark transition-colors hover:bg-warm-card/60">
                    <span>{item.question}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-secondary transition-transform duration-200 group-open:rotate-90" />
                  </summary>
                  <p className="max-w-3xl px-5 pb-5 text-sm leading-7 text-dark-muted">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <section id="nearby" className="scroll-mt-28 py-16 md:py-24" aria-labelledby="nearby-title">
          <div className="mb-8 flex flex-col gap-4 border-b border-warm-border pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Más allá del edificio</p>
              <h2 id="nearby-title" className="font-display text-4xl font-semibold tracking-[-0.03em] text-dark md:text-5xl">Una guía para moverte mejor.</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-dark-muted">Lugares útiles para comer, comprar, entrenar y movilizarte desde Cardamomo.</p>
            </div>
            <Compass className="hidden h-12 w-12 text-secondary/70 md:block" />
          </div>

          {publicContent.nearbyPlaces.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-warm-border bg-white p-8 text-center text-sm text-dark-muted">La guía del sector se actualizará próximamente.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {publicContent.nearbyPlaces.map((place) => {
                const safeMapUrl = /^https?:\/\//i.test(place.mapUrl) ? place.mapUrl : "";
                return (
                  <article key={place.id} className="card-lift rounded-2xl border border-warm-border bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">{place.category}</p>
                        <h3 className="mt-2 font-display text-2xl font-semibold text-dark">{place.name}</h3>
                      </div>
                      <MapPin className="h-6 w-6 shrink-0 text-primary" />
                    </div>
                    {place.description && <p className="mt-3 text-sm leading-6 text-dark-muted">{place.description}</p>}
                    {(place.address || place.distance) && (
                      <div className="mt-4 space-y-1 text-sm text-dark-muted">
                        {place.address && <p><span className="font-semibold text-dark">Ubicación:</span> {place.address}</p>}
                        {place.distance && <p><span className="font-semibold text-dark">Distancia:</span> {place.distance}</p>}
                      </div>
                    )}
                    {safeMapUrl && (
                      <a
                        href={safeMapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary/30 px-4 text-sm font-bold text-secondary transition-colors hover:bg-secondary hover:text-warm-bg"
                      >
                        Ver en Google Maps
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section id="location" className="scroll-mt-28 rounded-[2rem] bg-dark px-5 py-16 text-warm-bg md:px-10 md:py-20" aria-labelledby="location-title">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-accent">Encuéntranos</p>
            <h2 id="location-title" className="font-display text-4xl font-semibold tracking-[-0.03em] md:text-5xl">Cerca de lo que necesitas.</h2>
            <p className="mt-4 text-base leading-7 text-warm-bg/75">Calle 61 #1b-75, Neiva, Huila. Una base tranquila para moverte por la ciudad.</p>
          </div>

          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
            <div className="h-[280px] overflow-hidden rounded-3xl border border-warm-bg/15 bg-dark/50 shadow-2xl md:h-[360px]">
              <iframe
                title="Ubicación Edificio Cardamomo"
                src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d7250.263501349435!2d-75.2974845870908!3d2.9599551587499766!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e3b752dcf33823b%3A0x44c2cf5d6a0a6aa2!2sEdificio%20Cardamomo!5e0!3m2!1ses!2sco!4v1783220077828!5m2!1ses!2sco"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-warm-bg/15 bg-warm-bg/10 p-5">
                <MapPin className="h-5 w-5 text-accent" />
                <span className="mt-4 block text-xs font-bold uppercase tracking-[0.16em] text-warm-bg/60">Dirección</span>
                <span className="mt-2 block text-base font-semibold leading-7">Calle 61 #1b-75, Neiva, Huila, Colombia</span>
              </div>
              <div className="rounded-2xl border border-warm-bg/15 bg-warm-bg/10 p-5">
                <Phone className="h-5 w-5 text-accent" />
                <span className="mt-4 block text-xs font-bold uppercase tracking-[0.16em] text-warm-bg/60">Reservas directas</span>
                <a href="tel:+573053229035" className="mt-2 block text-base font-semibold leading-7 text-warm-bg transition-colors hover:text-accent">+57 305 322 90 35</a>
              </div>
              <div className="rounded-2xl border border-warm-bg/15 bg-warm-bg/10 p-5">
                <ExternalLink className="h-5 w-5 text-accent" />
                <span className="mt-4 block text-xs font-bold uppercase tracking-[0.16em] text-warm-bg/60">También puedes reservar en</span>
                <div className="mt-3 flex flex-wrap gap-3">
                  <a href="https://www.booking.com/hotel/co/edificio-cardamomo.es.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-warm-bg/25 px-4 text-sm font-semibold transition-colors hover:bg-warm-bg/15">Booking.com</a>
                  <a href="https://www.airbnb.com.co/p/edificio-cardamomo" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-warm-bg/25 px-4 text-sm font-semibold transition-colors hover:bg-warm-bg/15">Airbnb</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {!isLoggedIn && (
          <section className="mx-auto max-w-3xl px-2 py-16 text-center md:py-24" aria-labelledby="cta-title">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Tu próxima estadía empieza aquí</p>
            <h2 id="cta-title" className="font-display text-4xl font-semibold tracking-[-0.03em] text-dark md:text-5xl">Reserva directo, sin complicarte.</h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-dark-muted">Puedes comenzar como huésped y decidir después si quieres crear una cuenta para gestionar tus reservas.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                onClick={onLoginClick}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-warm-bg shadow-sm transition-colors hover:bg-primary-hover"
              >
                <Calendar className="h-4 w-4" />
                Reservar como huésped
              </button>
              <button
                onClick={onLoginClick}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-primary/30 bg-white px-6 text-sm font-bold text-primary transition-colors hover:bg-warm-card"
              >
                Ingresar a mi cuenta
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
