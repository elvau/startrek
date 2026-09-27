/* Ob die App mit Firebase gebaut wurde. Bewusst ohne Firebase-Import, damit ohne Konfiguration nichts davon geladen wird. */
const env = import.meta.env;
export const emulator = env.VITE_FIREBASE_EMULATOR === "1";
export const configured = emulator || !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID);
