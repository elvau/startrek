/*
 * Firebase-Anbindung. Wird nur geladen, wenn die App mit Firebase-Zugangsdaten gebaut wurde
 * (VITE_FIREBASE_*). Ohne sie bleibt alles lokal auf dem Gerät.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  EmailAuthProvider, GoogleAuthProvider, connectAuthEmulator, getAuth, isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail,
  signInAnonymously, signInWithCredential, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithEmailLink, signInWithPopup,
  signInWithRedirect, signOut, linkWithCredential, linkWithPopup, linkWithRedirect, updateProfile, type Auth, type User
} from "firebase/auth";
import {
  arrayRemove, arrayUnion, clearIndexedDbPersistence, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDocFromServer, getDocsFromServer,
  getDoc, initializeFirestore, limit, onSnapshot, orderBy, terminate, writeBatch,
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
  /** „Wer bist du?“ (#435): Konto → Reisende-Kennung und Vorname */
  claims?: Record<string, { t: string; n: string }>;
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

/** Gast (#435): mitplanen ohne Konto, als anonyme Anmeldung mit Vornamen; später zu einem Konto verknüpfbar */
// Firebase meldet den Gast an, bevor der Name gesetzt ist: bis dahin gilt dieser (für Mitglieder und „Wer bist du?“)
let guestName = "";
export async function loginGuest(name: string) {
  const { auth } = start();
  guestName = name;
  const c = await signInAnonymously(auth);
  await updateProfile(c.user, { displayName: name });
}

const codeOf = (e: unknown) => (e as { code?: string }).code || "";

export async function loginGoogle() {
  const { auth } = start();
  const p = new GoogleAuthProvider();
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  try { await (guest ? linkWithPopup(guest, p) : signInWithPopup(auth, p)); }
  catch (e) {
    const code = codeOf(e);
    // Popups sind in installierten Apps und manchen Handy-Browsern blockiert
    if (code.includes("popup-blocked") || code.includes("operation-not-supported")) await (guest ? linkWithRedirect(guest, p) : signInWithRedirect(auth, p));
    // Gast, aber das Google-Konto gibt es schon: dort anmelden (die Gast-Teilnahme bleibt beim Gast)
    else if (guest && code.includes("credential-already-in-use")) { const cr = GoogleAuthProvider.credentialFromError(e as never); if (cr) await signInWithCredential(auth, cr); else throw e; }
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
  // Gast: das Konto übernimmt die Gast-Kennung (Reisen, Zuordnung und Stimmen bleiben)
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  if (guest) {
    try { await linkWithCredential(guest, EmailAuthProvider.credentialWithLink(email, location.href)); }
    catch (e) { if (codeOf(e).includes("already-in-use")) await signInWithEmailLink(auth, email, location.href); else throw e; }
  } else await signInWithEmailLink(auth, email, location.href);
  try { localStorage.removeItem(EMAIL_KEY); } catch {}
  const u = new URL(location.href);
  ["apiKey", "oobCode", "mode", "lang", "continueUrl"].forEach(k => u.searchParams.delete(k));
  history.replaceState(null, "", u);
  return true;
}

/** Nur im Emulator: Anmelden ohne Google, für Tests */
export async function loginTest(email: string, name: string) {
  const { auth } = start();
  // Gast: wie beim echten Konto die Gast-Kennung verknüpfen
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  if (guest) {
    try { await linkWithCredential(guest, EmailAuthProvider.credential(email, "test-passwort")); await updateProfile(guest, { displayName: name }); return; }
    catch (e) { if (!codeOf(e).includes("already-in-use")) throw e; }
  }
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

/** Reise löschen, vorher Stimmen und Chat darunter (Firestore löscht Unterdokumente nicht mit) */
export async function deleteTrip(id: string) {
  for (const sub of ["votes", "chat", "chatImg"]) {
    const vs = await getDocsFromServer(collection(start().db, "trips", id, sub)).catch(() => null);
    for (const d of vs?.docs || []) await deleteDoc(d.ref).catch(() => {});
  }
  await deleteDoc(tripRef(id));
}

/* ---------- Gruppenchat: je Nachricht ein Dokument trips/{id}/chat/{msgId} ---------- */

/** die neuesten Nachrichten beobachten (neueste zuerst geliefert) */
export function watchChat(id: string, max: number, fn: (docs: { id: string; data: Record<string, unknown> }[]) => void, err: (e: Error) => void): Unsubscribe {
  const q = query(collection(start().db, "trips", id, "chat"), orderBy("at", "desc"), limit(max));
  return onSnapshot(q, { includeMetadataChanges: false }, s => fn(s.docs.map(d => ({ id: d.id, data: d.data({ serverTimestamps: "none" }) as Record<string, unknown> }))), err);
}
/** Nachricht senden; mit Bild beides in einem Schritt (Bild unter derselben Kennung in chatImg) */
export async function sendChat(id: string, m: { u: string; n: string; t: string }, img?: string) {
  const { db } = start();
  const ref = doc(collection(db, "trips", id, "chat"));
  if (!img) return setDoc(ref, { ...m, at: serverTimestamp() });
  const b = writeBatch(db);
  b.set(doc(db, "trips", id, "chatImg", ref.id), { u: m.u, d: img });
  b.set(ref, { ...m, img: true, at: serverTimestamp() });
  await b.commit();
}
/** Bild einer Nachricht (data:-Adresse) */
export async function chatImage(id: string, msgId: string): Promise<string | null> {
  const s = await getDoc(doc(start().db, "trips", id, "chatImg", msgId));
  return s.exists() ? ((s.data() as { d?: string }).d ?? null) : null;
}
/** Nachricht löschen, mit Bild */
export async function deleteChat(id: string, msgId: string, img: boolean) {
  const { db } = start();
  if (img) await deleteDoc(doc(db, "trips", id, "chatImg", msgId)).catch(() => {});
  await deleteDoc(doc(db, "trips", id, "chat", msgId));
}
/** eigene Nachrichten einer Reise (Daten herunterladen, Reise verlassen) */
async function ownChat(id: string, uid: string) {
  return (await getDocsFromServer(query(collection(start().db, "trips", id, "chat"), where("u", "==", uid))).catch(() => null))?.docs || [];
}

/* ---------- Abstimmen (#432): je Mitglied ein Dokument trips/{id}/votes/{uid} ---------- */

export type VoteMap = Record<string, Record<string, number>>;
/** zu „Ohne mich“ (#439): je Abstimmung und Möglichkeit Grund (freiwillig) und „mit Familie“ */
export type WhyMap = Record<string, Record<string, { r?: string; f?: boolean }>>;
export interface VoteDoc { v: VoteMap; w?: WhyMap }
export function watchVotes(id: string, fn: (byUid: Record<string, VoteDoc>) => void, err: (e: Error) => void): Unsubscribe {
  return onSnapshot(collection(start().db, "trips", id, "votes"), s => fn(Object.fromEntries(s.docs.map(d => {
    const x = d.data() as Partial<VoteDoc>;
    return [d.id, { v: x.v || {}, ...(x.w ? { w: x.w } : {}) }];
  }))), err);
}
/** Stimmen einer Reise einmal lesen (Stand auf der Startseiten-Kachel, #429) */
export async function votesOnce(id: string): Promise<Record<string, VoteMap>> {
  const s = await getDocsFromServer(collection(start().db, "trips", id, "votes"));
  return Object.fromEntries(s.docs.map(d => [d.id, ((d.data() as Partial<VoteDoc>).v || {}) as VoteMap]));
}
export const saveVotes = (id: string, uid: string, v: VoteMap, w: WhyMap = {}) => setDoc(doc(start().db, "trips", id, "votes", uid), { v, w, at: serverTimestamp() });

/** Inhalt der Reise frisch vom Server (nicht aus dem Zwischenspeicher); null, wenn es sie nicht gibt */
export async function freshTripData(id: string): Promise<string | null> {
  const s = await getDocFromServer(tripRef(id));
  return s.exists() ? (s.data() as TripDoc).data : null;
}

export const setInvite = (id: string, invite: TripDoc["invite"]) => updateDoc(tripRef(id), { invite });

/** Variante (#428): Mitglieder, Namen und Zuordnungen wie in der Reise, aus der sie entstand (nur Besitzer) */
export const setMembers = (id: string, members: Record<string, Role>, memberNames: Record<string, string>, claims: NonNullable<TripDoc["claims"]>) =>
  updateDoc(tripRef(id), { memberIds: Object.keys(members), members, memberNames, claims });

export const setRole = (id: string, uid: string, role: Role) => updateDoc(tripRef(id), { [`members.${uid}`]: role });

export const removeMember = (id: string, uid: string) =>
  updateDoc(tripRef(id), { memberIds: arrayRemove(uid), [`members.${uid}`]: deleteField(), [`memberNames.${uid}`]: deleteField(), [`claims.${uid}`]: deleteField() });

/** „Wer bist du?“: eigene Zuordnung setzen (t = Reisende-Kennung) oder lösen (null); Besitzer darf jede lösen */
export const setClaim = (id: string, uid: string, c: { t: string; n: string } | null) =>
  updateDoc(tripRef(id), { [`claims.${uid}`]: c ?? deleteField() });

export const joinTrip = (id: string, key: string, role: Role, u: User) =>
  updateDoc(tripRef(id), { memberIds: arrayUnion(u.uid), [`members.${u.uid}`]: role, [`memberNames.${u.uid}`]: displayName(u), joinKey: key });

export const displayName = (u: User) => u.displayName || (u.isAnonymous && guestName) || (u.email ? u.email.split("@")[0] : "Mitreisende");

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

export function watchProfile(uid: string, fn: (data: string | null, pending: boolean, fromCache: boolean) => void, err: (e: Error) => void): Unsubscribe {
  return onSnapshot(profileRef(uid), s => fn(s.exists() ? (s.data().data as string) : null, s.metadata.hasPendingWrites, s.metadata.fromCache), err);
}

export const saveProfile = (uid: string, data: string) => setDoc(profileRef(uid), { data, updatedAt: serverTimestamp() });

/**
 * Profil in einer Transaktion speichern: resolve bekommt den Stand im Konto und gibt zurück, was geschrieben wird
 * (zusammengeführt, falls ein anderes Gerät inzwischen gespeichert hat, #364). Gibt das Geschriebene zurück.
 */
export const saveProfileTx = (uid: string, resolve: (remote: string | null) => string) =>
  runTransaction(start().db, async tx => {
    const s = await tx.get(profileRef(uid));
    const data = resolve(s.exists() ? (s.data().data as string) : null);
    tx.set(profileRef(uid), { data, updatedAt: serverTimestamp() });
    return data;
  });

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

/* ---------- Auskunft (Art. 15 DSGVO): alles, was zum Konto gespeichert ist ---------- */

export interface AccountData {
  account: { uid: string; email: string; name: string; providers: string[]; verified: boolean; created?: string; lastSignIn?: string };
  /** gespeicherte Personen, Gruppen, Vorlieben (JSON) */
  profile: string | null;
  /** Buchungsdaten (JSON) */
  travelDocs: string | null;
  /** Reisen, in denen man Mitglied ist (ohne den Schlüssel des Einladungslinks) */
  trips: (Omit<TripDoc, "invite" | "updatedAt"> & { id: string; invite?: { role: string } | null })[];
  campaigns: (CampaignDoc & { id: string })[];
  /** eigene Stimmen je Reise (#432) */
  votes?: Record<string, VoteDoc>;
  /** eigene Nachrichten im Gruppenchat je Reise (Bilder als Hinweis, nicht als Daten) */
  chat?: Record<string, { t: string; img?: boolean; at?: string }[]>;
}

/** liest alles direkt vom Server (nicht aus dem Zwischenspeicher), wie „Konto zurücksetzen“ es löschen würde */
export async function collectAccount(uid: string): Promise<AccountData> {
  const { db, auth } = start();
  const u = auth.currentUser;
  if (!u || u.uid !== uid) throw new Error("not signed in");
  const [trips, camps, profile, travelDocs] = await Promise.all([
    getDocsFromServer(query(collection(db, "trips"), where("memberIds", "array-contains", uid))),
    getDocsFromServer(query(collection(db, "campaigns"), where("owner", "==", uid))),
    getDocFromServer(profileRef(uid)).then(s => (s.exists() ? (s.data().data as string) : null)).catch(() => null),
    loadTravelDocs(uid)
  ]);
  return {
    account: {
      uid, email: u.email || "", name: displayName(u), providers: u.providerData.map(p => p.providerId), verified: u.emailVerified,
      created: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime
    },
    profile, travelDocs,
    trips: trips.docs.map(d => {
      const { invite, updatedAt: _u, ...rest } = d.data() as TripDoc;
      return { id: d.id, ...rest, ...(invite ? { invite: { role: invite.role } } : {}) };
    }),
    campaigns: camps.docs.map(d => ({ id: d.id, ...(d.data() as CampaignDoc) })),
    // eigene Stimmen je Reise (#432)
    votes: Object.fromEntries((await Promise.all(trips.docs.map(d => getDocFromServer(doc(db, "trips", d.id, "votes", uid))
      .then(v => (v.exists() ? [d.id, { v: (v.data() as Partial<VoteDoc>).v || {}, w: (v.data() as Partial<VoteDoc>).w || {} } as VoteDoc] as const : null)).catch(() => null)))).filter((x): x is readonly [string, VoteDoc] => !!x)),
    chat: Object.fromEntries((await Promise.all(trips.docs.map(async d => [d.id, (await ownChat(d.id, uid)).map(m => {
      const x = m.data() as { t?: string; img?: boolean; at?: { toDate?: () => Date } };
      return { t: x.t || "", ...(x.img ? { img: true } : {}), ...(x.at?.toDate ? { at: x.at.toDate().toISOString() } : {}) };
    })] as const))).filter(([, xs]) => xs.length))
  };
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
    if ((d.data() as TripDoc).owner === uid) { await deleteTrip(d.id); deleted++; }
    else {
      await deleteDoc(doc(db, "trips", d.id, "votes", uid)).catch(() => {});
      for (const m of await ownChat(d.id, uid)) await deleteChat(d.id, m.id, (m.data() as { img?: boolean }).img === true).catch(() => {});
      await removeMember(d.id, uid); left++;
    }
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
