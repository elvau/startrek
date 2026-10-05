/*
 * Firebase-Anbindung. Wird nur geladen, wenn die App mit Firebase-Zugangsdaten gebaut wurde
 * (VITE_FIREBASE_*). Ohne sie bleibt alles lokal auf dem Gerät.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider, connectAuthEmulator, getAuth, isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithEmailLink, signInWithPopup, signInWithRedirect, signOut,
  updateProfile, type Auth, type User
} from "firebase/auth";
import {
  arrayRemove, arrayUnion, clearIndexedDbPersistence, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDocFromServer, getDocsFromServer,
  initializeFirestore, onSnapshot, terminate,
  persistentLocalCache, persistentMultipleTabManager, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, collection,
  type Firestore, type Unsubscribe
} from "firebase/firestore";

export type Role = "owner" | "editor" | "viewer";

export interface TripDoc {
  name: string;
  data: string;
  owner: string;
  memberIds: string[];
  members: Record<string, Role>;
  memberNames?: Record<string, string>;
  invite?: { key: string; role: "editor" | "viewer" } | null;
  updatedAt?: unknown;
  updatedBy?: string;
}

import { emulator } from "./config";
import type { CampaignDoc } from "../campaign";

const env = import.meta.env;

let app: FirebaseApp, auth: Auth, db: Firestore;

export function start(): { auth: Auth; db: Firestore } {
  if (db) return { auth, db };
  app = initializeApp(emulator
    ? { apiKey: "demo", projectId: "demo-reisekasse", authDomain: "localhost" }
    : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID
    });
  auth = getAuth(app);
  auth.languageCode = "de";
  let cache;
  try { cache = persistentLocalCache({ tabManager: persistentMultipleTabManager() }); } catch { cache = undefined; }
  db = initializeFirestore(app, { ignoreUndefinedProperties: true, ...(cache ? { localCache: cache } : {}) });
  if (emulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  return { auth, db };
}

export const onUser = (fn: (u: User | null) => void) => onAuthStateChanged(start().auth, fn);

export async function loginGoogle() {
  const { auth } = start();
  const p = new GoogleAuthProvider();
  try { await signInWithPopup(auth, p); }
  catch (e) {
    const code = (e as { code?: string }).code || "";
    // Popups sind in installierten Apps und manchen Handy-Browsern blockiert
    if (code.includes("popup-blocked") || code.includes("operation-not-supported")) await signInWithRedirect(auth, p);
    else throw e;
  }
}

const EMAIL_KEY = "rk2-login-email";

export async function sendLoginLink(email: string) {
  const { auth } = start();
  await sendSignInLinkToEmail(auth, email, { url: location.href.split("#")[0], handleCodeInApp: true });
  try { localStorage.setItem(EMAIL_KEY, email); } catch {}
}

/** Anmelde-Link aus der E-Mail einlösen, falls die Seite damit geöffnet wurde */
export async function finishLoginLink(ask: () => string | null): Promise<boolean> {
  const { auth } = start();
  if (!isSignInWithEmailLink(auth, location.href)) return false;
  let email: string | null = null;
  try { email = localStorage.getItem(EMAIL_KEY); } catch {}
  email ||= ask();
  if (!email) return false;
  await signInWithEmailLink(auth, email, location.href);
  try { localStorage.removeItem(EMAIL_KEY); } catch {}
  const u = new URL(location.href);
  ["apiKey", "oobCode", "mode", "lang", "continueUrl"].forEach(k => u.searchParams.delete(k));
  history.replaceState(null, "", u);
  return true;
}

/** Nur im Emulator: Anmelden ohne Google, für Tests */
export async function loginTest(email: string, name: string) {
  const { auth } = start();
  try { await signInWithEmailAndPassword(auth, email, "test-passwort"); }
  catch { const c = await createUserWithEmailAndPassword(auth, email, "test-passwort"); await updateProfile(c.user, { displayName: name }); }
}

export const logout = () => signOut(start().auth);

const tripRef = (id: string) => doc(start().db, "trips", id);

export function watchMyTrips(uid: string, fn: (list: (TripDoc & { id: string })[], fromCache: boolean) => void, err: (e: Error) => void): Unsubscribe {
  const q = query(collection(start().db, "trips"), where("memberIds", "array-contains", uid));
  return onSnapshot(q, { includeMetadataChanges: true }, s => fn(s.docs.map(d => ({ id: d.id, ...(d.data() as TripDoc) })), s.metadata.fromCache), err);
}

export function watchTrip(id: string, fn: (d: (TripDoc & { id: string }) | null, pending: boolean) => void, err: (e: Error) => void): Unsubscribe {
  return onSnapshot(tripRef(id), { includeMetadataChanges: false }, s => fn(s.exists() ? { id: s.id, ...(s.data() as TripDoc) } : null, s.metadata.hasPendingWrites), err);
}

export function createTrip(id: string, name: string, data: string, u: User) {
  const d: TripDoc = {
    name, data, owner: u.uid, memberIds: [u.uid], members: { [u.uid]: "owner" },
    memberNames: { [u.uid]: displayName(u) }, invite: null, updatedAt: serverTimestamp(), updatedBy: u.uid
  };
  // Transaktion statt setDoc: wird das Anlegen wiederholt (z. B. nach Verbindungsabbruch),
  // darf es eine inzwischen geteilte und bearbeitete Reise nicht überschreiben.
  const ref = tripRef(id);
  return runTransaction(start().db, async tx => {
    const s = await tx.get(ref);
    if (s.exists()) {
      if ((s.data() as TripDoc).owner !== u.uid) throw Object.assign(new Error("Reise gibt es schon"), { code: "already-exists" });
      return;
    }
    tx.set(ref, d);
  });
}

export const saveTrip = (id: string, name: string, data: string, uid: string) =>
  updateDoc(tripRef(id), { name, data, updatedAt: serverTimestamp(), updatedBy: uid });

export const deleteTrip = (id: string) => deleteDoc(tripRef(id));

/** Inhalt der Reise frisch vom Server (nicht aus dem Zwischenspeicher); null, wenn es sie nicht gibt */
export async function freshTripData(id: string): Promise<string | null> {
  const s = await getDocFromServer(tripRef(id));
  return s.exists() ? (s.data() as TripDoc).data : null;
}

export const setInvite = (id: string, invite: TripDoc["invite"]) => updateDoc(tripRef(id), { invite });

export const setRole = (id: string, uid: string, role: Role) => updateDoc(tripRef(id), { [`members.${uid}`]: role });

export const removeMember = (id: string, uid: string) =>
  updateDoc(tripRef(id), { memberIds: arrayRemove(uid), [`members.${uid}`]: deleteField(), [`memberNames.${uid}`]: deleteField() });

export const joinTrip = (id: string, key: string, role: Role, u: User) =>
  updateDoc(tripRef(id), { memberIds: arrayUnion(u.uid), [`members.${u.uid}`]: role, [`memberNames.${u.uid}`]: displayName(u), joinKey: key });

export const displayName = (u: User) => u.displayName || (u.email ? u.email.split("@")[0] : "Mitreisende");

export function newKey(): string {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return [...a].map(x => x.toString(36).padStart(2, "0")).join("").slice(0, 24);
}

/* ---------- Aktionsseite (campaigns/{id}): öffentlich lesbar, nur das veröffentlichende Konto schreibt ---------- */

export const publishCampaign = (id: string, d: CampaignDoc) => setDoc(doc(start().db, "campaigns", id), { ...d, updatedAt: serverTimestamp() });
export const removeCampaign = (id: string) => deleteDoc(doc(start().db, "campaigns", id));

/* ---------- Gespeicherte Personen und Gruppen (profiles/{uid}) ---------- */

const profileRef = (uid: string) => doc(start().db, "profiles", uid);

export function watchProfile(uid: string, fn: (data: string | null, pending: boolean) => void, err: (e: Error) => void): Unsubscribe {
  return onSnapshot(profileRef(uid), s => fn(s.exists() ? (s.data().data as string) : null, s.metadata.hasPendingWrites), err);
}

export const saveProfile = (uid: string, data: string) => setDoc(profileRef(uid), { data, updatedAt: serverTimestamp() });

/* ---------- Buchungsdaten (travelDocs/{uid}) ----------
 * Bewusst über die REST-Schnittstelle statt über den Firestore-Client: der legt eine Kopie im Browser (IndexedDB) ab,
 * die Buchungsdaten sollen aber nur im Konto liegen.
 */

function docsUrl(uid: string) {
  const base = emulator ? "http://127.0.0.1:8080/v1" : "https://firestore.googleapis.com/v1";
  const pid = emulator ? "demo-reisekasse" : env.VITE_FIREBASE_PROJECT_ID;
  return `${base}/projects/${pid}/databases/(default)/documents/travelDocs/${encodeURIComponent(uid)}`;
}

async function docsFetch(uid: string, init: RequestInit = {}) {
  const u = start().auth.currentUser;
  if (!u || u.uid !== uid) throw new Error("not signed in");
  const token = await u.getIdToken();
  return fetch(docsUrl(uid), { ...init, cache: "no-store", headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
}

/** Buchungsdaten als Text (JSON), null wenn noch keine gespeichert sind */
export async function loadTravelDocs(uid: string): Promise<string | null> {
  const r = await docsFetch(uid);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`travelDocs ${r.status}`);
  const j = await r.json();
  return j?.fields?.data?.stringValue ?? null;
}

export async function saveTravelDocs(uid: string, data: string) {
  const r = await docsFetch(uid, {
    method: "PATCH",
    body: JSON.stringify({ fields: { data: { stringValue: data }, updatedAt: { timestampValue: new Date().toISOString() } } })
  });
  if (!r.ok) throw new Error(`travelDocs ${r.status}`);
}

export async function deleteTravelDocs(uid: string) {
  const r = await docsFetch(uid, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`travelDocs ${r.status}`);
}

/* ---------- Admin: eigenes Konto zurücksetzen ---------- */

export interface WipeResult { deleted: number; left: number; campaigns: number }

/**
 * Alles, was im Konto liegt: eigene Reisen löschen, geteilte Reisen verlassen, eigene Aktionsseiten, gespeicherte
 * Personen und Gruppen sowie Buchungsdaten löschen. Die Anmeldung selbst bleibt (sonst neue Konto-ID, Admin weg).
 */
export async function wipeAccount(uid: string): Promise<WipeResult> {
  const { db } = start();
  const trips = await getDocsFromServer(query(collection(db, "trips"), where("memberIds", "array-contains", uid)));
  let deleted = 0, left = 0;
  for (const d of trips.docs) {
    if ((d.data() as TripDoc).owner === uid) { await deleteDoc(d.ref); deleted++; }
    else { await removeMember(d.id, uid); left++; }
  }
  const camps = await getDocsFromServer(query(collection(db, "campaigns"), where("owner", "==", uid)));
  for (const d of camps.docs) await deleteDoc(d.ref);
  await deleteDoc(profileRef(uid));
  await deleteTravelDocs(uid);
  return { deleted, left, campaigns: camps.size };
}

/** Zwischenspeicher des Firestore-Clients im Browser leeren (danach ist der Client beendet: Seite neu laden) */
export async function clearCache() {
  const { db } = start();
  await terminate(db);
  await clearIndexedDbPersistence(db);
}
