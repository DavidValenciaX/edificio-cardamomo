import { LogIn, LogOut, ShieldCheck, User as UserIcon } from "lucide-react";
import { UserProfile } from "../types";

interface NavbarProps {
  currentRole: 'guest' | 'admin';
  userProfile: UserProfile | null;
  onLoginClick: () => void;
  onLogout: () => void;
  onToggleRole: () => void;
  logoUrl: string;
}

export default function Navbar({
  currentRole,
  userProfile,
  onLoginClick,
  onLogout,
  onToggleRole,
  logoUrl,
}: NavbarProps) {
  return (
    <nav className="sticky top-0 z-40 w-full bg-warm-bg/95 backdrop-blur-md border-b border-warm-border px-4 py-3 shadow-sm">
      <div className="max-w-md md:max-w-4xl lg:max-w-7xl mx-auto flex items-center justify-between px-2 md:px-4">
        
        {/* Dynamic Logo & Name */}
        <div className="flex items-center gap-2 shrink-0">
          <img
            src={logoUrl}
            alt="Logo Edificio Cardamomo"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-full object-cover border border-secondary"
          />
          <div>
            <span className="text-[9px] text-dark-muted font-mono uppercase tracking-widest block -mt-1 font-semibold">
              Edificio
            </span>
            <span className="font-display font-bold tracking-widest text-secondary text-sm block uppercase">
              Cardamomo
            </span>
          </div>
        </div>

        {/* Editorial Responsive Navigation Menu (Hidden on mobile, visible on tablet/desk) */}
        <div className="hidden md:flex items-center gap-8 text-[10px] font-sans font-bold uppercase tracking-widest text-dark-muted">
          <a href="#suites" className="hover:text-primary transition-colors py-1 pl-1">
            Suites de Firma
          </a>
          <a href="#amenities" className="hover:text-primary transition-colors py-1">
            Comodidades
          </a>
          <a href="#location" className="hover:text-primary transition-colors py-1">
            Ubicación
          </a>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 shrink-0">
          {userProfile ? (
            <div className="flex items-center gap-2">
              {/* User Roles Quick Switch for testing/demo */}
              {userProfile.role === 'admin' && (
                <button
                  id="toggle-role-btn"
                  onClick={onToggleRole}
                  aria-label="Wechseln Sie die Ansicht"
                  className={`p-1.5 rounded-full transition-colors ${
                    currentRole === 'admin'
                      ? 'bg-secondary text-accent'
                      : 'bg-warm-card text-secondary hover:bg-warm-border'
                  }`}
                  title={currentRole === 'admin' ? "Ver Vista Huésped" : "Ver Panel Admin"}
                >
                  <ShieldCheck className="w-5 h-5" />
                </button>
              )}

              {/* Profile pill */}
              <div className="flex items-center gap-1.5 bg-warm-card border border-warm-border py-1 px-2.5 rounded-full">
                <UserIcon className="w-4 h-4 text-secondary" />
                <span className="text-xs font-semibold text-dark max-w-[80px] truncate">
                  {userProfile.displayName.split(' ')[0]}
                </span>
              </div>

              {/* Logout button */}
              <button
                id="logout-btn"
                onClick={onLogout}
                aria-label="Cerrar Sesión"
                className="p-1.5 rounded-full bg-warm-card hover:bg-red-50 hover:text-red-600 transition-colors border border-warm-border"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              id="login-trigger-btn"
              onClick={onLoginClick}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-warm-bg text-xs font-semibold py-1.5 px-3.5 rounded-full shadow-sm transition-all active:scale-95"
            >
              <LogIn className="w-4 h-4" />
              Ingresar
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
