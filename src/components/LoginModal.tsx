import { useState, FormEvent } from "react";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile 
} from "firebase/auth";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { X, Mail, Lock, User as UserIcon, AlertCircle } from "lucide-react";
import { UserProfile } from "../types";

interface LoginModalProps {
  onClose: () => void;
  onSuccess: (profile: UserProfile) => void;
}

export default function LoginModal({ onClose, onSuccess }: LoginModalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Authenticate with Google (Popup method is highly recommended)
  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg("");
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user has a profile document in Firestore, if not create as guest
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      let profile: UserProfile;

      if (!userDocSnap.exists()) {
        // Set standard guest profile (unless it's the registered hotel email)
        const role: 'guest' | 'admin' = (user.email === 'edificiocardamomo@gmail.com') ? 'admin' : 'guest';
        profile = {
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || user.email?.split('@')[0] || "Huésped Cardamomo",
          role
        };
        await setDoc(userDocRef, profile);
      } else {
        profile = userDocSnap.data() as UserProfile;
      }

      onSuccess(profile);
      onClose();
    } catch (err: any) {
      console.error("Google Auth failed:", err);
      setErrorMsg("Ocurrió un error al autenticarse con Google. Verifique el estado de Firebase.");
    } finally {
      setLoading(false);
    }
  };

  // Authenticate / Register with Email/Password
  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (!email || !password || (isRegister && !fullName)) {
      setErrorMsg("Por favor complete todos los campos.");
      setLoading(false);
      return;
    }

    try {
      if (isRegister) {
        // Create user
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const user = result.user;
        
        // Update user profile displayname in auth
        await updateProfile(user, { displayName: fullName });

        // Setup Firestore document
        const role: 'guest' | 'admin' = (email === 'edificiocardamomo@gmail.com') ? 'admin' : 'guest';
        const profile: UserProfile = {
          uid: user.uid,
          email,
          displayName: fullName,
          role
        };
        
        try {
          await setDoc(doc(db, "users", user.uid), profile);
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.CREATE, `users/${user.uid}`);
        }

        onSuccess(profile);
      } else {
        // Login user
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user = result.user;

        // Fetch Firestore profile
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        let profile: UserProfile;

        if (userDocSnap.exists()) {
          profile = userDocSnap.data() as UserProfile;
        } else {
          // Fallback if document does not exist yet
          const role: 'guest' | 'admin' = (user.email === 'edificiocardamomo@gmail.com') ? 'admin' : 'guest';
          profile = {
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "Huésped Cardamomo",
            role
          };
          await setDoc(userDocRef, profile);
        }

        onSuccess(profile);
      }
      onClose();
    } catch (err: any) {
      console.error("Email Auth Error:", err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setErrorMsg("Credenciales incorrectas. Verifique por favor.");
      } else if (err.code === "auth/email-already-in-use") {
        setErrorMsg("Este correo ya está registrado.");
      } else if (err.code === "auth/operation-not-allowed") {
        setErrorMsg("El proveedor de correo/contraseña no está activo en Firebase Console.");
      } else {
        setErrorMsg(`Error: ${err.message || "Ocurrió un error inesperado."}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-dark/60 backdrop-blur-sm sm:items-center p-4">
      <div 
        id="login-modal" 
        className="w-full max-w-sm bg-warm-bg rounded-t-3xl sm:rounded-2xl border border-warm-border p-6 shadow-xl relative animate-in slide-in-from-bottom"
      >
        {/* Close Button */}
        <button 
          id="close-login-modal"
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-full bg-warm-card hover:bg-warm-border text-dark transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center mt-2 mb-6">
          <h2 className="font-display font-bold text-2xl text-dark">
            {isRegister ? "Crear cuenta" : "Iniciar sesión"}
          </h2>
          <p className="text-xs text-dark-muted font-medium mt-1">
            {isRegister 
              ? "Regístrate para reservar tu apartaestudio" 
              : "Ingresa para gestionar tus reservas en Cardamomo"}
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="text-[11px] font-bold text-dark uppercase tracking-wider block mb-1">
                Nombre Completo
              </label>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Ej: Camilo Torres"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full text-sm bg-warm-card border border-warm-border rounded-xl py-2.5 pl-10 pr-4 text-dark focus:outline-none focus:border-primary transition-colors placeholder:text-dark-muted/45 font-medium"
                />
                <UserIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-dark-muted/60" />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-dark uppercase tracking-wider block mb-1">
              Correo Electrónico
            </label>
            <div className="relative">
              <input 
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-sm bg-warm-card border border-warm-border rounded-xl py-2.5 pl-10 pr-4 text-dark focus:outline-none focus:border-primary transition-colors placeholder:text-dark-muted/45 font-medium"
              />
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-dark-muted/60" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-dark uppercase tracking-wider block mb-1">
              Contraseña
            </label>
            <div className="relative">
              <input 
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm bg-warm-card border border-warm-border rounded-xl py-2.5 pl-10 pr-4 text-dark focus:outline-none focus:border-primary transition-colors placeholder:text-dark-muted/45 font-medium"
              />
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-dark-muted/60" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover text-warm-bg py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 mt-2"
          >
            {loading ? "Procesando..." : isRegister ? "Registrarse" : "Ingresar"}
          </button>
        </form>

        {/* Divider */}
        <div className="my-5 flex items-center justify-between text-xs text-dark-muted/60 font-semibold uppercase tracking-wider">
          <div className="h-px bg-warm-border w-1/3"></div>
          <span>O</span>
          <div className="h-px bg-warm-border w-1/3"></div>
        </div>

        {/* Google Quick SignIn */}
        <button
          onClick={handleGoogleLogin}
          type="button"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-warm-card text-dark border border-warm-border py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] shadow-sm"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" width="24" height="24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
          </svg>
          Continuar con Google
        </button>

        {/* Toggle View */}
        <div className="text-center mt-5 text-xs text-dark-muted font-medium">
          {isRegister ? "¿Ya tienes una cuenta?" : "¿No tienes una cuenta todavía?"}{" "}
          <button
            onClick={() => setIsRegister(!isRegister)}
            type="button"
            className="text-primary font-bold hover:underline"
          >
            {isRegister ? "Inicia sesión" : "Regístrate gratis"}
          </button>
        </div>

        {/* Admin and setup tip */}
        <div className="mt-4 bg-accent/20 border border-accent/40 rounded-xl p-2 text-[10px] text-dark/80 font-medium">
          💡 <strong>Nota del Desarrollador:</strong> Para registrarse como Administrador, regístrese con el correo oficial del hotel: <code className="font-mono text-primary font-bold">edificiocardamomo@gmail.com</code>. Para habilitar registro con Correo/Clave, actívelo en Firebase Authentication.
        </div>
      </div>
    </div>
  );
}
