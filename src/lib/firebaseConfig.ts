import fallbackConfig from "../../firebase-applet-config.json";

const env = (import.meta as any).env || {};

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || fallbackConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || fallbackConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || fallbackConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || fallbackConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || fallbackConfig.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || fallbackConfig.measurementId,
  firestoreDatabaseId: env.VITE_FIRESTORE_DATABASE_ID || fallbackConfig.firestoreDatabaseId || "(default)",
};

