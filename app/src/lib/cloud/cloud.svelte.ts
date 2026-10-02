/*
 * Konto und Synchronisation. Die App arbeitet immer mit einer lokalen Kopie;
 * Reisen im Konto werden zusätzlich in Firestore gespeichert und live abgeglichen.
 * Bei gleichzeitigen Änderungen gewinnt die zuletzt gespeicherte Fassung der ganzen Reise.
 */
import { t } from "../i18n/index.svelte";
import type { User } from "firebase/auth";
import type { Unsubscribe } from "firebase/firestore";
import type { Trip } from "../model";
import { configured, emulator } from "./config";
import type { Role, TripDoc } from "./firebase";
import type { CampaignDoc } from "../campaign";

export type { Role };
export interface CloudTrip { id: string; name: string; role: Role; owner: string; members: Record<string, Role>; memberNames: Record<string, string>; invite: TripDoc["invite"]; /** zuletzt im Konto gespeichert (ISO) */ updated?: string; /** von wem (Konto-ID) */ by?: string }
type FB = typeof import("./firebase");

export const cloud = $state({
  configured,
  /** Firebase geladen und Anmeldestatus bekannt */
  ready: !configured,
  user: null as { uid: string; name: string; email: string } | null,
  trips: [] as CloudTrip[],
  status: "local" as "local" | "saving" | "saved" | "offline" | "error",
  error: "",
  /** Einladung aus dem Link, wartet auf Anmeldung */
  join: null as { id: string; key: string; role: Role } | null,
  joinError: "",
  /** zuletzt beigetretene Reise, wird geöffnet sobald sie in der Liste ist */
  joined: null as string | null,
  showLogin: false,
  /** Reisen, deren aktueller Stand aus dem Konto schon da ist */
  loaded: {} as Record<string, boolean>,
  /** Liste im Konto ist vom Server (nicht nur aus dem Zwischenspeicher des Browsers) */
  fresh: false
});

let fb: FB | null = null;
let fbUser: User | null = null;
let unTrips: Unsubscribe | null = null, unTrip: Unsubscribe | null = null;
let watching = "";
/** Reise, die beobachtet werden soll (für Wiederholungen nach Fehlern) */
let wanted = "", retries = 0;
/** gerade angelegte Reisen: erst beobachten, wenn der Server sie bestätigt hat */
const creating = new Set<string>();
/** zuletzt gespeicherter oder empfangener Stand je Reise, um Echos zu erkennen */
const synced = new Map<string, string>();
let onRemote: (id: string, trip: Trip) => void = () => {};
let onGone: (id: string) => void = () => {};

const load = async () => (fb ??= await import("./firebase"));
const dbg = (...a: unknown[]) => { if (emulator) console.debug("[rk]", ...a); };

/** Stand, der gerade aus dem Konto übernommen wurde, gilt als gespeichert (kein Zurückschicken) */
export function markSynced(id: string, json: string) { synced.set(id, json); }

/*
 * Stand jeder Konto-Reise, wie ihn die Liste mitliefert: für die Startseite, auch wenn die Reise auf diesem Gerät nie
 * geöffnet wurde (sonst stand sie dort mit 0 € und ohne Ziel, bis man sie öffnete).
 */
const remote = new Map<string, { json: string; trip?: Trip | null }>();
const remoteRev = $state({ n: 0 });
function keepRemote(list: { id: string; data?: string }[]) {
  let changed = false;
  const ids = new Set(list.map(d => d.id));
  for (const id of [...remote.keys()]) if (!ids.has(id)) { remote.delete(id); changed = true; }
  for (const d of list) if (typeof d.data === "string" && remote.get(d.id)?.json !== d.data) { remote.set(d.id, { json: d.data }); changed = true; }
  if (changed) remoteRev.n++;
}
/** Stand der Konto-Reise aus der Liste (reaktiv), null wenn nicht bekannt */
export function remoteTrip(id: string): Trip | null {
  void remoteRev.n;
  const r = remote.get(id);
  if (!r) return null;
  if (r.trip === undefined) { try { r.trip = JSON.parse(r.json) as Trip; } catch { r.trip = null; } }
  return r.trip;
}

export function cloudTrip(id: string) { return cloud.trips.find(t => t.id === id) || null; }
export const isCloud = (id: string) => !!cloudTrip(id);
export const roleOf = (id: string): Role | null => cloudTrip(id)?.role || null;

/** Speicherzeit aus Firestore (Timestamp) als ISO; fehlt sie noch (gerade gespeichert), keine */
const stamp = (v: unknown): { updated?: string } => {
  const ms = (v as { toMillis?: () => number } | undefined)?.toMillis?.();
  return ms ? { updated: new Date(ms).toISOString() } : {};
};

export async function initCloud(handlers: { remote: (id: string, trip: Trip) => void; gone: (id: string) => void }) {
  onRemote = handlers.remote; onGone = handlers.gone;
  readJoinLink();
  if (!configured) return;
  const f = await load();
  try {
    await f.finishLoginLink(() => prompt(t("cloud.confirmEmail")));
  } catch (e) { cloud.error = message(e); }
  f.onUser(u => {
    fbUser = u;
    unTrips?.(); unTrips = null;
    if (!u) { cloud.user = null; cloud.trips = []; cloud.fresh = false; cloud.loaded = {}; synced.clear(); remote.clear(); remoteRev.n++; cloud.status = "local"; cloud.ready = true; stopWatch(); return; }
    cloud.user = { uid: u.uid, name: f.displayName(u), email: u.email || "" };
    cloud.showLogin = false;
    unTrips = f.watchMyTrips(u.uid, (list, fromCache) => {
      const next = list.map(d => ({
        id: d.id, name: d.name, role: d.members[u.uid], owner: d.owner, members: d.members,
        memberNames: d.memberNames || {}, invite: d.invite ?? null, ...stamp(d.updatedAt), ...(d.updatedBy ? { by: d.updatedBy } : {})
      })).sort((a, b) => a.name.localeCompare(b.name, "de"));
      // auch bei reinen Statusänderungen (Zwischenspeicher → Server) gemeldet: Liste nur bei echter Änderung ersetzen
      if (JSON.stringify(next) !== JSON.stringify($state.snapshot(cloud.trips))) cloud.trips = next;
      keepRemote(list);
      cloud.fresh = !fromCache;
      cloud.ready = true;
      if (cloud.status === "local") cloud.status = "saved";
    }, e => { cloud.error = message(e); cloud.status = "error"; cloud.ready = true; });
    if (cloud.join) void acceptJoin();
  });
  addEventListener("online", () => { if (cloud.status === "offline") cloud.status = "saving"; });
  addEventListener("offline", () => { if (cloud.user) cloud.status = "offline"; });
}

function readJoinLink() {
  const u = new URL(location.href);
  const j = u.searchParams.get("join");
  if (!j) return;
  const [id, key, role] = j.split(".");
  if (id && key && (role === "editor" || role === "viewer")) {
    cloud.join = { id, key, role };
    if (configured) cloud.showLogin = true;
  }
  u.searchParams.delete("join");
  history.replaceState(null, "", u);
}

/** Einladung annehmen; danach erscheint die Reise in der Liste */
export async function acceptJoin(): Promise<string | null> {
  const j = cloud.join;
  if (!j || !fbUser) return null;
  const f = await load();
  cloud.join = null;
  if (isCloud(j.id)) { cloud.joined = j.id; return j.id; }
  try { await f.joinTrip(j.id, j.key, j.role, fbUser); cloud.joined = j.id; return j.id; }
  catch (e) { cloud.joinError = t("cloud.inviteInvalid"); console.warn(e); return null; }
}

/** Aktuelle Reise live beobachten, falls sie im Konto liegt */
export async function watch(id: string) {
  if (wanted !== id) retries = 0;
  wanted = id;
  if (watching === id) return;
  stopWatch();
  if (!fbUser || !isCloud(id) || creating.has(id)) return;
  const f = await load();
  watching = id;
  dbg("beobachte", id);
  unTrip = f.watchTrip(id, (d, pending) => {
    dbg("snapshot", id, "pending", pending, "gleich", d ? synced.get(id) === d.data : "weg");
    if (!d) { onGone(id); return; }
    if (pending) return;
    cloud.loaded[id] = true;
    if (synced.get(id) === d.data) { cloud.status = navigator.onLine ? "saved" : "offline"; return; }
    synced.set(id, d.data);
    try { onRemote(id, JSON.parse(d.data) as Trip); } catch (e) { cloud.error = message(e); }
    retries = 0;
  }, e => {
    const code = (e as { code?: string }).code || "";
    dbg("Fehler beim Beobachten", id, code);
    if (watching === id) { watching = ""; unTrip = null; }
    // Direkt nach dem Anlegen kennt der Server die Reise evtl. noch nicht: erneut versuchen
    if (retries < 6 && wanted === id) {
      const wait = 500 * 2 ** retries++;
      setTimeout(() => { if (wanted === id && isCloud(id)) void watch(id); }, wait);
      return;
    }
    cloud.error = message(e); cloud.status = "error";
  });
}
function stopWatch() { if (watching) dbg("beende", watching); unTrip?.(); unTrip = null; watching = ""; }

/** Würde push() diese Fassung tatsächlich senden? */
export function needsPush(id: string, json: string): boolean {
  const r = roleOf(id);
  return !!fbUser && !!r && r !== "viewer" && !!cloud.loaded[id] && synced.get(id) !== json;
}

/** Änderung der aktuellen Reise speichern (nur wenn sie im Konto liegt und man bearbeiten darf) */

export async function push(trip: Trip, json: string) {
  if (!fbUser) return;
  const r = roleOf(trip.id);
  if (!r || r === "viewer") return;
  // erst senden, wenn der aktuelle Stand empfangen wurde, sonst würde ein alter Stand ihn überschreiben
  if (!cloud.loaded[trip.id]) return;
  if (synced.get(trip.id) === json) return;
  synced.set(trip.id, json);
  cloud.status = navigator.onLine ? "saving" : "offline";
  const f = await load();
  try { await f.saveTrip(trip.id, trip.name || t("trip"), json, fbUser.uid); cloud.status = "saved"; }
  catch (e) { cloud.error = message(e); cloud.status = "error"; synced.delete(trip.id); }
}

/** Reise von diesem Gerät ins Konto übernehmen */
export async function upload(trip: Trip) {
  if (!fbUser) return;
  const f = await load();
  const json = JSON.stringify(trip);
  synced.set(trip.id, json);
  cloud.loaded[trip.id] = true;
  creating.add(trip.id);
  try { await f.createTrip(trip.id, trip.name || t("trip"), json, fbUser); }
  finally { creating.delete(trip.id); }
  if (wanted === trip.id) void watch(trip.id);
}

/** Konto-Reise frisch vom Server lesen (z. B. vor dem Aufräumen: die Kopie auf dem Gerät kann veraltet sein) */
export async function freshCloudTrip(id: string): Promise<Trip | null> {
  const data = await (await load()).freshTripData(id);
  return data ? JSON.parse(data) as Trip : null;
}

export async function removeCloudTrip(id: string) {
  const f = await load();
  const t = cloudTrip(id);
  if (!t || !fbUser) return;
  if (t.owner === fbUser.uid) await f.deleteTrip(id);
  else await f.removeMember(id, fbUser.uid);
}

export async function makeInvite(id: string, role: "editor" | "viewer"): Promise<string> {
  const f = await load();
  const key = f.newKey();
  await f.setInvite(id, { key, role });
  return inviteLink(id, key, role);
}
export const inviteLink = (id: string, key: string, role: string) =>
  `${location.origin}${location.pathname}?join=${id}.${key}.${role}`;
export async function revokeInvite(id: string) { const f = await load(); await f.setInvite(id, null); }
export async function changeRole(id: string, uid: string, role: Role) { const f = await load(); await f.setRole(id, uid, role); }
export async function kick(id: string, uid: string) { const f = await load(); await f.removeMember(id, uid); }

export async function loginGoogle() { cloud.error = ""; try { await (await load()).loginGoogle(); } catch (e) { cloud.error = message(e); } }
export async function loginEmail(email: string) { cloud.error = ""; await (await load()).sendLoginLink(email); }
/** Anmelde-Nachweis für den Such-Dienst (KI-Planer); ohne Anmeldung null */
export async function idToken(): Promise<string | null> { return fbUser ? fbUser.getIdToken() : null; }
export async function logout() { await (await load()).logout(); }
export async function loginTest(email: string, name: string) { if (emulator) await (await load()).loginTest(email, name); }

function message(e: unknown): string {
  const code = (e as { code?: string })?.code || "";
  if (code.includes("popup-closed")) return "";
  if (code.includes("permission-denied")) return t("cloud.denied");
  if (code.includes("unavailable")) return t("cloud.offline");
  if (code.includes("unauthorized-domain")) return t("cloud.domain");
  if (code.includes("operation-not-allowed")) return t("cloud.method");
  return (e as Error)?.message || String(e);
}

/* ---------- Aktionsseite ---------- */

/** neue Kennung für eine Aktionsseite (zufällig, nicht zu erraten) */
export async function newCampaignId(): Promise<string> { const f = await load(); return f.newKey(); }
/** veröffentlichen oder aktualisieren (nur angemeldet); gibt das Konto zurück, dem die Seite gehört */
export async function saveCampaign(id: string, d: Omit<CampaignDoc, "owner">): Promise<string> {
  if (!fbUser) throw new Error(t("cmp.needLogin"));
  const f = await load();
  await f.publishCampaign(id, { ...d, owner: fbUser.uid });
  return fbUser.uid;
}
export async function deleteCampaign(id: string) { const f = await load(); await f.removeCampaign(id); }
