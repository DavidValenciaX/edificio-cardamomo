import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { UserProfile, Room, Settings } from "./types";
import { DEFAULT_ROOMS, DEFAULT_SETTINGS } from "./data";
import Navbar from "./components/Navbar";
import LoginModal from "./components/LoginModal";
import LandingPage from "./components/LandingPage";
import GuestDashboard from "./components/GuestDashboard";
import AdminPanel from "./components/AdminPanel";
import { ShieldCheck, Calendar, Info, Heart, Award } from "lucide-react";

export default function App() {
  const [currentRole, setCurrentRole] = useState<'guest' | 'admin'>('guest');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  // App states
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [settingsLogo, setSettingsLogo] = useState(DEFAULT_SETTINGS.hotelLogoUrl);
  
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
          
          if (userDocSnap.exists()) {
            const profile = userDocSnap.data() as UserProfile;
            setUserProfile(profile);
            setCurrentRole(profile.role);
          } else {
            // New user registration
            const role: 'guest' | 'admin' = (user.email === 'edificiocardamomo@gmail.com') ? 'admin' : 'guest';
            const profile: UserProfile = {
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || user.email?.split('@')[0] || "Huésped Cardamomo",
              role
            };
            await setDoc(userDocRef, profile);
            setUserProfile(profile);
            setCurrentRole(role);
          }
        } catch (authError) {
          console.error("Profile sync failed. Using local auth status:", authError);
          // Fallback
          const role: 'guest' | 'admin' = (user.email === 'edificiocardamomo@gmail.com') ? 'admin' : 'guest';
          const mockProfile: UserProfile = {
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "Huésped Cardamomo",
            role
          };
          setUserProfile(mockProfile);
          setCurrentRole(role);
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
      // 1. Fetch Rooms
      const roomsColRef = collection(db, "rooms");
      const snap = await getDocs(roomsColRef);
      let list: Room[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Room);
      });

      if (list.length === 0) {
        console.log("Firestore 'rooms' collection empty. Auto-bootstrapping with defaults...");
        for (const item of DEFAULT_ROOMS) {
          await setDoc(doc(db, "rooms", item.id), item);
        }
        list = [...DEFAULT_ROOMS];
      }
      setRooms(list);

      // 2. Fetch Settings
      const settingsSnap = await getDoc(doc(db, "settings", "global"));
      if (settingsSnap.exists()) {
        const s = settingsSnap.data() as Settings;
        setSettingsLogo(s.hotelLogoUrl);
      } else {
        await setDoc(doc(db, "settings", "global"), DEFAULT_SETTINGS);
        setSettingsLogo(DEFAULT_SETTINGS.hotelLogoUrl);
      }

    } catch (err) {
      console.error("Failed to fetch Rooms from live database. Utilizing fallback local records:", err);
      // Fallback
      setRooms(DEFAULT_ROOMS);
      setSettingsLogo(DEFAULT_SETTINGS.hotelLogoUrl);
    } finally {
      setLoadingRooms(false);
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
      
      {/* Universal Sticky Header Navbar */}
      <Navbar
        currentRole={currentRole}
        userProfile={userProfile}
        onLoginClick={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        onToggleRole={handleToggleRole}
        logoUrl={settingsLogo}
      />

      {/* Primary Workspace Scroll Layer */}
      <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-7xl mx-auto bg-warm-bg overflow-y-auto pb-16 px-4 md:px-8">
        
        {loadingRooms ? (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold text-dark font-mono uppercase tracking-wider">
              Conectando con Cardamomo DB...
            </span>
          </div>
        ) : (
          <div>
            
            {/* View dispatching */}
            {!userProfile ? (
              /* Public general screen */
              <LandingPage
                rooms={rooms}
                onSelectRoom={(roomId) => {
                  setSelectedRoomId(roomId);
                  // Since not logged in, trigger signup modal
                  setIsLoginOpen(true);
                }}
                onLoginClick={() => setIsLoginOpen(true)}
                isLoggedIn={false}
              />
            ) : currentRole === 'admin' ? (
              /* Administrative controls dashboard */
              <AdminPanel
                rooms={rooms}
                onRefreshRooms={fetchRoomsAndSettings}
              />
            ) : (
              /* Interactive Guest Booking console */
              <div className="space-y-4">
                {/* Notice header */}
                <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 text-center flex items-center justify-center gap-2 text-xs font-semibold text-dark">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  <span>Bienvenido, {userProfile.displayName}. Sesión de Huésped Activa.</span>
                </div>

                <GuestDashboard
                  rooms={rooms}
                  userProfile={userProfile}
                  selectedRoomId={selectedRoomId}
                  onSelectRoomId={setSelectedRoomId}
                  onRefreshRooms={fetchRoomsAndSettings}
                />
              </div>
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
            © 2026 Reservas Móviles de Lujo. Neiva, Huila, Colombia.
          </span>
        </div>
      </footer>

    </div>
  );
}
