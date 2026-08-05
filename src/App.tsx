import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { omitUndefinedFields } from "./lib/firestoreData";
import { UserProfile, Room, Settings, PublicContent } from "./types";
import { buildDefaultPublicContent, DEFAULT_HERO_PLACEHOLDER, DEFAULT_LOGO_PLACEHOLDER, normalizePublicContent } from "./data";
import Navbar from "./components/Navbar";
import LoginModal from "./components/LoginModal";
import LandingPage from "./components/LandingPage";
import GuestDashboard from "./components/GuestDashboard";
import AdminPanel from "./components/AdminPanel";
import { ShieldCheck, Award } from "lucide-react";

const ADMIN_EMAIL = (import.meta as any).env?.VITE_ADMIN_EMAIL || "edificiocardamomo@gmail.com";

function buildProfileFromAuthUser(user: User, existingProfile?: Partial<UserProfile>): UserProfile {
  const role: 'guest' | 'admin' = user.email === ADMIN_EMAIL ? 'admin' : (existingProfile?.role || 'guest');
  const providerId = user.providerData[0]?.providerId;
  const authProvider: UserProfile['authProvider'] = user.isAnonymous
    ? 'anonymous'
    : providerId === 'google.com'
      ? 'google'
      : providerId === 'password'
        ? 'password'
        : 'unknown';

  return {
    uid: user.uid,
    email: user.email || existingProfile?.email || "",
    displayName:
      user.displayName ||
      existingProfile?.displayName ||
      user.email?.split('@')[0] ||
      "Huésped Cardamomo",
    role,
    phone: existingProfile?.phone,
    identification: existingProfile?.identification,
    isTemporary: user.isAnonymous,
    authProvider,
  };
}

export default function App() {
  const [currentRole, setCurrentRole] = useState<'guest' | 'admin'>('guest');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [guestView, setGuestView] = useState<"landing" | "booking">("landing");
  
  // App states
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [settingsLogo, setSettingsLogo] = useState("");
  const [heroBannerUrl, setHeroBannerUrl] = useState("");
  const [publicContent, setPublicContent] = useState<PublicContent>(() => buildDefaultPublicContent());
  
  // Navigation & Dialog toggles
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Authenticated state persistence and listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          const existingProfile = userDocSnap.exists()
            ? (userDocSnap.data() as UserProfile)
            : undefined;
          const profile = buildProfileFromAuthUser(user, existingProfile);

          const firestoreProfile = omitUndefinedFields({
            ...profile,
            updatedAt: serverTimestamp(),
            ...(userDocSnap.exists() ? {} : { createdAt: serverTimestamp() }),
            ...(!user.isAnonymous && existingProfile?.isTemporary ? { convertedAt: serverTimestamp() } : {}),
          });

          await setDoc(userDocRef, firestoreProfile, { merge: true });

          setUserProfile(profile);
          setCurrentRole(profile.role);
        } catch (authError) {
          console.error("[auth] Profile sync failed. Using local auth status.", {
            error: authError instanceof Error ? authError.message : String(authError),
            uid: user.uid,
            email: user.email || null,
          });
          // Fallback
          const mockProfile = buildProfileFromAuthUser(user);
          setUserProfile(mockProfile);
          setCurrentRole(mockProfile.role);
        }
      } else {
        setUserProfile(null);
        setCurrentRole('guest');
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch Rooms (with auto-bootstrap if Firestore collection is blank)
  const fetchRoomsAndSettings = async () => {
    setLoadingRooms(true);
    try {
      const roomsColRef = collection(db, "rooms");
      const snap = await getDocs(roomsColRef);
      let list: Room[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Room);
      });
      setRooms(list);
    } catch (err) {
      console.error("[firestore] Failed to fetch rooms.", err);
      setRooms([]);
    }

    try {
      const settingsSnap = await getDoc(doc(db, "settings", "global"));
      if (settingsSnap.exists()) {
        const s = settingsSnap.data() as Settings;
        setSettingsLogo(typeof s.hotelLogoUrl === "string" ? s.hotelLogoUrl : "");
        setHeroBannerUrl(typeof s.heroBannerUrl === "string" ? s.heroBannerUrl : "");
      } else {
        console.warn("[firestore] 'settings/global' does not exist yet. Using empty logo placeholder.");
        setSettingsLogo("");
        setHeroBannerUrl("");
      }
    } catch (err) {
      console.error("[firestore] Failed to fetch settings.", err);
      setSettingsLogo("");
      setHeroBannerUrl("");
    } finally {
      try {
        const publicContentSnap = await getDoc(doc(db, "publicContent", "global"));
        setPublicContent(publicContentSnap.exists()
          ? normalizePublicContent(publicContentSnap.data())
          : buildDefaultPublicContent());
      } catch (err) {
        console.error("[firestore] Failed to fetch public content. Using defaults.", err);
        setPublicContent(buildDefaultPublicContent());
      } finally {
        setLoadingRooms(false);
      }
    }
  };

  useEffect(() => {
    fetchRoomsAndSettings();
  }, []);

  // Logout Handlers
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      setCurrentRole('guest');
      setGuestView("landing");
      setSelectedRoomId(null);
      alert("Sesión cerrada correctamente.");
    } catch (err) {
      console.error("Signout error:", err);
    }
  };

  // Toggle roles for testing (admins can quickly view how guests interact and vice-versa)
  const handleToggleRole = () => {
    if (userProfile && userProfile.role === 'admin') {
      const targetRole = currentRole === 'admin' ? 'guest' : 'admin';
      setCurrentRole(targetRole);
    }
  };

  // Successful Auth login callback
  const handleAuthSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
    setCurrentRole(profile.role);
  };

  return (
    <div className="min-h-screen bg-warm-bg flex flex-col antialiased">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-full bg-secondary px-4 py-3 text-sm font-bold text-warm-bg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Saltar al contenido principal
      </a>
      
      {/* Universal Sticky Header Navbar */}
      <Navbar
        currentRole={currentRole}
        userProfile={userProfile}
        guestView={guestView}
        onLoginClick={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        onToggleRole={handleToggleRole}
        onShowHome={() => {
          setGuestView("landing");
          setSelectedRoomId(null);
        }}
        onShowBooking={() => {
          setGuestView("booking");
        }}
        logoUrl={settingsLogo || DEFAULT_LOGO_PLACEHOLDER}
      />

      {/* Primary Workspace Scroll Layer */}
      <main id="main-content" tabIndex={-1} className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-7xl mx-auto bg-warm-bg overflow-y-auto pb-16 px-4 md:px-8">
        
        {loadingRooms ? (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold text-dark font-mono uppercase tracking-wider">
              Conectando con Cardamomo DB…
            </span>
          </div>
        ) : (
          <div>
            
            {/* View dispatching */}
            {currentRole === 'admin' && userProfile ? (
              /* Administrative controls dashboard */
              <AdminPanel
                rooms={rooms}
                onRefreshRooms={fetchRoomsAndSettings}
                publicContent={publicContent}
                onPublicContentChange={setPublicContent}
              />
            ) : guestView === "booking" ? (
              /* Interactive Guest Booking console */
              <div className="space-y-4">
                {/* Notice header */}
                <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 text-center flex items-center justify-center gap-2 text-xs font-semibold text-dark">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    {userProfile
                      ? `Bienvenido, ${userProfile.displayName}. ${userProfile.isTemporary ? "Reserva como invitado temporal." : "Sesión de huésped activa."}`
                      : "Reserva sin registrarte. Solo necesitaremos tus datos básicos de huésped."}
                  </span>
                </div>

                <GuestDashboard
                  rooms={rooms}
                  userProfile={userProfile}
                  selectedRoomId={selectedRoomId}
                  onSelectRoomId={setSelectedRoomId}
                  onBackToLanding={() => {
                    setGuestView("landing");
                    setSelectedRoomId(null);
                  }}
                  onRefreshRooms={fetchRoomsAndSettings}
                  onTemporaryProfileReady={setUserProfile}
                />
              </div>
            ) : (
              /* Public general screen */
              <LandingPage
                rooms={rooms}
                heroImageUrl={heroBannerUrl || DEFAULT_HERO_PLACEHOLDER}
                publicContent={publicContent}
                onSelectRoom={(roomId) => {
                  setSelectedRoomId(roomId);
                  setGuestView("booking");
                }}
                onLoginClick={() => setIsLoginOpen(true)}
                isLoggedIn={Boolean(userProfile)}
              />
            )}

          </div>
        )}
      </main>

      {/* Auth Login Dialog view popup */}
      {isLoginOpen && (
        <LoginModal
          onClose={() => setIsLoginOpen(false)}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* Subtle brand Footer on the mobile frame */}
      <footer className="w-full bg-warm-card border-t border-warm-border py-6 px-4 text-center mt-auto">
        <div className="max-w-md md:max-w-4xl lg:max-w-7xl mx-auto flex flex-col items-center gap-1 md:flex-row md:justify-between px-2 md:px-4">
          <div className="flex items-center gap-1.5 justify-center text-[10px] text-dark-muted font-bold uppercase tracking-widest leading-none">
            <Award className="w-4.5 h-4.5 text-secondary" />
            <span>Edificio Cardamomo</span>
          </div>
          <span className="text-[9px] text-dark-muted/65 italic font-medium mt-1 md:mt-0 font-serif">
            © 2026 Edificio Cardamomo. Neiva, Huila, Colombia.
          </span>
        </div>
      </footer>

    </div>
  );
}
