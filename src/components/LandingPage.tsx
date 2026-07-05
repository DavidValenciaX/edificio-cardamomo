import { Calendar, ChevronRight, MapPin, Phone, ShieldCheck, Star, Wifi, Coffee, Compass, ExternalLink } from "lucide-react";
import { Room } from "../types";

interface LandingPageProps {
  rooms: Room[];
  onSelectRoom: (roomId: string) => void;
  onLoginClick: () => void;
  isLoggedIn: boolean;
}

export default function LandingPage({ rooms, onSelectRoom, onLoginClick, isLoggedIn }: LandingPageProps) {
  return (
    <div className="w-full bg-warm-bg pb-12">
      
      {/* 1. Hero Section */}
      <section className="relative h-[280px] md:h-[420px] w-full overflow-hidden md:rounded-2xl md:mt-4 md:shadow-md">
        <img
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80"
          alt="Edificio Cardamomo Fachada"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/30 to-transparent"></div>
        <div className="absolute bottom-6 left-6 right-6 md:bottom-10 md:left-10 md:right-10">
          <span className="bg-accent text-dark text-[9px] md:text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest font-mono">
            Exclusividad y Confort
          </span>
          <h1 className="font-display font-bold text-3xl md:text-5xl text-warm-bg mt-3 tracking-tight leading-none">
            Edificio Cardamomo
          </h1>
          <p className="text-warm-bg/90 text-xs md:text-sm font-medium mt-2 max-w-xl font-serif">
            Apartaestudios amoblados premium en el corazón de la ciudad. El lugar perfecto para tu estadía de negocios o descanso.
          </p>
        </div>
      </section>

      {/* Quick features bar */}
      <section className="grid grid-cols-3 gap-2 md:gap-5 px-0 py-3 md:py-6 bg-transparent">
        <div className="bg-accent/15 p-3 md:p-4 border-l-4 border-accent rounded-r-md shadow-sm">
          <span className="text-secondary font-display font-bold text-lg md:text-2xl block leading-none">4.9</span>
          <span className="text-[8px] md:text-[10px] text-dark-muted font-bold uppercase tracking-wider block mt-1 leading-none">Súper Host</span>
        </div>
        <div className="bg-accent/15 p-3 md:p-4 border-l-4 border-accent rounded-r-md shadow-sm">
          <span className="text-secondary font-display font-bold text-lg md:text-2xl block leading-none">100%</span>
          <span className="text-[8px] md:text-[10px] text-dark-muted font-bold uppercase tracking-wider block mt-1 leading-none font-sans">Equipados</span>
        </div>
        <div className="bg-accent/15 p-3 md:p-4 border-l-4 border-accent rounded-r-md shadow-sm">
          <span className="text-secondary font-display font-bold text-lg md:text-2xl block leading-none">WiFi</span>
          <span className="text-[8px] md:text-[10px] text-dark-muted font-bold uppercase tracking-wider block mt-1 leading-none">Fibra Óptica</span>
        </div>
      </section>

      {/* 2. Rooms / Apartaestudios Showcase */}
      <section id="suites" className="py-8 px-0 scroll-mt-14">
        <div className="flex items-end justify-between mb-6 border-b border-warm-border/60 pb-3">
          <div>
            <h2 className="font-display font-bold text-2xl md:text-3xl text-dark leading-none">Nuestros Apartaestudios</h2>
            <p className="text-[10px] md:text-xs text-dark-muted font-serif italic mt-2">Espacios de firma con acabados contemporáneos e interiorismo zen</p>
          </div>
          <span className="text-[9px] md:text-xs text-secondary font-mono font-bold uppercase bg-secondary/10 px-3 py-1 rounded border border-secondary/20">
            {rooms.length} Suites de autor
          </span>
        </div>
 
        {/* Horizontal scroll cards on mobile, Grid of 2 or 3 columns on tablet and desktop */}
        <div className="flex gap-5 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-thin md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 md:overflow-x-visible md:pb-0 md:snap-none">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="w-[285px] md:w-full shrink-0 md:shrink bg-white border border-warm-border/70 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 snap-start"
            >
              <div className="relative h-[165px] md:h-[200px]">
                <img
                  src={room.images[0] || "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=500&q=80"}
                  alt={room.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.03]"
                />
                <div className="absolute top-3 right-3 bg-dark/80 text-accent font-bold text-[9px] md:text-[10px] font-mono px-2.5 py-1 rounded flex items-center gap-1 border border-accent/25">
                  <Star className="w-2.5 h-2.5 md:w-3 md:h-3 fill-accent text-accent" />
                  <span>4.9</span>
                </div>
                <div className="absolute bottom-3 left-3 bg-primary text-warm-bg text-[9px] md:text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                  Cap: {room.capacity} {room.capacity > 1 ? "Personas" : "Persona"}
                </div>
              </div>
 
              <div className="p-4 space-y-2">
                <div>
                  <h3 className="font-display font-medium text-base md:text-lg text-dark truncate">
                    {room.name}
                  </h3>
                  <span className="text-[8px] md:text-[9px] text-secondary font-mono uppercase tracking-widest block font-bold mt-0.5">
                    Neiva, Huila
                  </span>
                </div>
                <p className="text-[11px] md:text-xs text-dark-muted line-clamp-2 leading-relaxed font-sans">
                  {room.description}
                </p>
 
                <div className="pt-3 border-t border-warm-border/60 flex items-center justify-between">
                  <div>
                    <span className="text-[8px] md:text-[9px] text-dark-muted font-bold block uppercase tracking-wider leading-none">Tarifa base</span>
                    <span className="text-xs md:text-sm font-bold text-primary font-mono block mt-1">
                      ${room.pricePerNight.toLocaleString()} COP / noche
                    </span>
                  </div>
                  
                  <button
                    onClick={() => {
                      if (isLoggedIn) {
                        onSelectRoom(room.id);
                      } else {
                        onLoginClick();
                      }
                    }}
                    className="flex items-center gap-1 bg-primary hover:bg-primary-hover text-warm-bg text-[10px] md:text-xs uppercase font-bold py-1.5 px-3 md:py-2 md:px-4 rounded transition-all active:scale-95 shadow-sm font-sans tracking-wide"
                  >
                    <span>Reservar</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Comodidades del Edificio (Amenities) */}
      <section id="amenities" className="bg-warm-card border-y border-warm-border py-10 px-6 scroll-mt-14 rounded-2xl my-6">
        <h2 className="font-display font-medium text-xl md:text-2xl text-dark mb-6 text-center">
          Servicios Premium Incluidos
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <div className="flex gap-3 items-start bg-white p-4 rounded-xl border border-warm-border/50 shadow-sm">
            <Wifi className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-xs text-dark block leading-tight">Internet de Fibra</span>
              <span className="text-[10px] text-dark-muted mt-1 block">Canal simétrico de alta velocidad y backup.</span>
            </div>
          </div>
          <div className="flex gap-3 items-start bg-white p-4 rounded-xl border border-warm-border/50 shadow-sm">
            <Coffee className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-xs text-dark block leading-tight">Cocina Completa</span>
              <span className="text-[10px] text-dark-muted mt-1 block">Encimeras, microondas, cafetera y vajilla fina.</span>
            </div>
          </div>
          <div className="flex gap-3 items-start bg-white p-4 rounded-xl border border-warm-border/50 shadow-sm">
            <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-xs text-dark block leading-tight">Seguridad 24/7</span>
              <span className="text-[10px] text-dark-muted mt-1 block">Acceso móvil inteligente y cámaras de control.</span>
            </div>
          </div>
          <div className="flex gap-3 items-start bg-white p-4 rounded-xl border border-warm-border/50 shadow-sm">
            <Compass className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-xs text-dark block leading-tight">Ubicación Clave</span>
              <span className="text-[10px] text-dark-muted mt-1 block">Cerca al Unico y al aeropuerto Benito Salas.</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Ubicación y Contacto */}
      <section id="location" className="py-8 px-4 scroll-mt-14">
        <div>
          <h2 className="font-display font-bold text-xl md:text-2xl text-dark leading-none">
            Ubicación y Contacto
          </h2>
          <p className="text-[10px] md:text-xs text-dark-muted font-medium mt-1">
            Cerca al centro comercial Unico y al aeropuerto Benito Salas, en Neiva, Huila
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start mt-6">
          {/* Google Maps Embed */}
          <div className="w-full h-[180px] md:h-[260px] rounded-2xl border border-warm-border overflow-hidden relative shadow-inner">
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

          {/* Contact Links */}
          <div className="space-y-4 md:py-2">
            <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-warm-border/50 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-dark-muted uppercase font-bold block leading-none">Dirección de Firma</span>
                <span className="text-xs md:text-sm font-semibold text-dark block mt-1.5 leading-relaxed">Calle 61 #1b-75, Neiva, Huila, Colombia</span>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-warm-border/50 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-dark-muted uppercase font-bold block leading-none">Reservas Telefónicas / WhatsApp Directo</span>
                <span className="text-xs md:text-sm font-semibold text-dark block mt-1.5 leading-relaxed">+57 318 819 88 42</span>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-warm-border/50 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                <ExternalLink className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-dark-muted uppercase font-bold block leading-none">Reserva Directa en Plataformas</span>
                <div className="flex flex-col gap-1 mt-1.5">
                  <a href="https://www.booking.com/hotel/co/edificio-cardamomo.es.html" target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm font-semibold text-secondary hover:text-primary transition-colors flex items-center gap-1 leading-relaxed">
                    Booking.com <ExternalLink className="w-3 h-3" />
                  </a>
                  <a href="https://www.airbnb.com.co/p/edificio-cardamomo" target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm font-semibold text-secondary hover:text-primary transition-colors flex items-center gap-1 leading-relaxed">
                    Airbnb <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hero Call to Action */}
      {!isLoggedIn && (
        <section className="px-4 py-8 mt-2 max-w-sm mx-auto md:max-w-md">
          <button
            onClick={onLoginClick}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-warm-bg py-4 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] uppercase tracking-wider"
          >
            <Calendar className="w-4 h-4" />
            Ingresa y Reserva en Línea
          </button>
        </section>
      )}
    </div>
  );
}
