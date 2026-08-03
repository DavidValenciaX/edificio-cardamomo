import { useEffect, useState } from "react";
import { LogIn, LogOut, Menu, ShieldCheck, User as UserIcon, X } from "lucide-react";
import { UserProfile } from "../types";

interface NavbarProps {
  currentRole: "guest" | "admin";
  userProfile: UserProfile | null;
  onLoginClick: () => void;
  onLogout: () => void;
  onToggleRole: () => void;
  logoUrl: string;
}

const navItems = [
  { id: "inicio", label: "Inicio" },
  { id: "apartamentos", label: "Apartamentos" },
  { id: "amenities", label: "Comodidades" },
  { id: "informacion", label: "Información" },
  { id: "faq", label: "Preguntas" },
  { id: "nearby", label: "Guía del sector" },
  { id: "location", label: "Ubicación" },
];

export default function Navbar({
  currentRole,
  userProfile,
  onLoginClick,
  onLogout,
  onToggleRole,
  logoUrl,
}: NavbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("inicio");

  useEffect(() => {
    if (currentRole === "admin") return;

    const sections = navItems
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target.id) {
          setActiveSection(visible.target.id);
        }
      },
      { rootMargin: "-22% 0px -62% 0px", threshold: [0, 0.25, 0.5, 0.75] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [currentRole]);

  const handleNavigation = (sectionId: string) => {
    setActiveSection(sectionId);
    setIsMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-warm-border/80 bg-warm-bg/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8" aria-label="Navegación principal">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <a
          href="#inicio"
          onClick={() => handleNavigation("inicio")}
          className="group flex min-h-11 shrink-0 items-center gap-3 rounded-xl pr-2"
        >
          <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-secondary/40 bg-warm-card shadow-sm transition-transform duration-200 group-hover:-rotate-3">
            <img
              src={logoUrl}
              alt="Logo Edificio Cardamomo"
              referrerPolicy="no-referrer"
              width={44}
              height={44}
              className="h-full w-full object-cover"
            />
          </span>
          <span className="hidden sm:block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-dark-muted">Edificio</span>
            <span className="block font-display text-lg font-bold uppercase tracking-[0.12em] text-secondary">Cardamomo</span>
          </span>
        </a>

        {currentRole !== "admin" && (
          <div className="hidden flex-1 items-center justify-center gap-1 xl:flex" role="list">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => handleNavigation(item.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={`rounded-full px-3 py-2 text-[11px] font-semibold tracking-wide transition-colors ${
                    isActive
                      ? "bg-secondary text-warm-bg shadow-sm"
                      : "text-dark-muted hover:bg-warm-card hover:text-dark"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {userProfile ? (
            <div className="flex items-center gap-2">
              {userProfile.role === "admin" && (
                <button
                  id="toggle-role-btn"
                  onClick={onToggleRole}
                  aria-label={currentRole === "admin" ? "Ver vista huésped" : "Ver panel de administración"}
                  className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors ${
                    currentRole === "admin"
                      ? "border-secondary bg-secondary text-accent"
                      : "border-warm-border bg-warm-card text-secondary hover:bg-warm-border"
                  }`}
                  title={currentRole === "admin" ? "Ver vista huésped" : "Ver panel de administración"}
                >
                  <ShieldCheck className="h-5 w-5" />
                </button>
              )}

              <div className="hidden min-h-11 items-center gap-2 rounded-full border border-warm-border bg-warm-card px-3 sm:flex">
                <UserIcon className="h-4 w-4 text-secondary" />
                <span className="max-w-28 truncate text-sm font-semibold text-dark">
                  {userProfile.displayName.split(" ")[0]}
                </span>
              </div>

              <button
                id="logout-btn"
                onClick={onLogout}
                aria-label="Cerrar sesión"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-warm-border bg-warm-card text-dark-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              id="login-trigger-btn"
              onClick={onLoginClick}
              className="flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-warm-bg shadow-sm transition-colors hover:bg-primary-hover"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Ingresar</span>
            </button>
          )}

          {currentRole !== "admin" && (
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label={isMenuOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
              aria-expanded={isMenuOpen}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-warm-border bg-white text-secondary transition-colors hover:bg-warm-card xl:hidden"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {currentRole !== "admin" && isMenuOpen && (
        <div className="mx-auto mt-3 max-w-7xl border-t border-warm-border/70 pt-3 xl:hidden">
          <div className="grid gap-1 sm:grid-cols-2">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => handleNavigation(item.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={`flex min-h-11 items-center justify-between rounded-xl px-4 text-sm font-semibold transition-colors ${
                    isActive ? "bg-secondary text-warm-bg" : "text-dark hover:bg-warm-card"
                  }`}
                >
                  {item.label}
                  <span aria-hidden="true">↗</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
