const env = import.meta.env;

function readRequiredClientEnv(name: string): string {
  const value = env[name as keyof ImportMetaEnv];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  throw new Error(`Missing required Firebase client env var: ${name}`);
}

export const firebaseConfig = {
  apiKey: readRequiredClientEnv("VITE_FIREBASE_API_KEY"),
  authDomain: readRequiredClientEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: readRequiredClientEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: readRequiredClientEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readRequiredClientEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readRequiredClientEnv("VITE_FIREBASE_APP_ID"),
  measurementId: readRequiredClientEnv("VITE_FIREBASE_MEASUREMENT_ID"),
  firestoreDatabaseId: env.VITE_FIRESTORE_DATABASE_ID?.trim() || "(default)",
};
