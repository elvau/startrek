/* Adressen der Testumgebung auf dem eigenen Rechner: Vorschau der App (dist-emu) und Firebase-Emulatoren (firebase.json). */
export const PORT = 4174;
export const URL = `http://127.0.0.1:${PORT}/`;
export const PROJECT = "demo-reisekasse";
export const FIRESTORE = "http://127.0.0.1:8080";
export const AUTH = "http://127.0.0.1:9099";
/** Firestore über REST (Dokumente) */
export const FS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
