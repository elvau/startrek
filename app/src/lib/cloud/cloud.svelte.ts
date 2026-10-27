/*
 * Konto und Synchronisation. Die App arbeitet immer mit einer lokalen Kopie;
 * Reisen im Konto werden zusätzlich in Firestore gespeichert und live abgeglichen.
 * Bei gleichzeitigen Änderungen gewinnt die zuletzt gespeicherte Fassung der ganzen Reise.
 */
import { t } from "../i18n/index.svelte";
import { errorMessage } from "./errors";
import type { User } from "firebase/auth";
import type { Unsubscribe } from "firebase/firestore";
import type { Trip } from "../model";
import { configured, emulator } from "./config";
import type { Role, TripDoc } from "./firebase";
import type { CampaignDoc } from "../campaign";
import { byTime, CHAT_LIMIT, cleanText, parseMsg, validImg, type ChatMsg } from "../chat";
import { parseSelf, type SelfDoc, type Selfs } from "../self";

export type { Role };
export interface CloudTrip { id: string; name: string; role: Role; owner: string; members: Record<string, Role>; memberNames: Record<string, string>; invite: TripDoc["invite"]; /** „Wer bist du?“ (#435): Konto → Reisende-Kennung, Vorname */ claims: NonNullable<TripDoc["claims"]>; /** zuletzt im Konto gespeichert (ISO) */ updated?: string; /** von wem (Konto-ID) */ by?: string }
type FB = typeof import("./firebase");

export const cloud = $state({
  configured,
  /** Firebase geladen und Anmeldestatus bekannt */
  ready: !configured,
  /** guest: ohne Konto beigetreten (anonyme Anmeldung, #435) */
  user: null as { uid: string; name: string; email: string; guest: boolean } | null,
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
/**
 * frühere eigene Stände je Reise (angelegt bzw. gespeichert): Der Server kann direkt nach dem Anlegen noch den ersten
 * Stand melden, wenn auf dem Gerät schon weiter geändert und gespeichert wurde. Das ist kein fremder Stand (#416).
 */
const older = new Map<string, string[]>();
/** neuen eigenen Stand merken; der bisherige zählt ab jetzt als älterer eigener */
function sent(id: string, json: string) {
  const prev = synced.get(id);
  if (prev && prev !== json) older.set(id, [...(older.get(id) || []), prev].slice(-5));
  synced.set(id, json);
}
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
    if (!u) { cloud.user = null; cloud.trips = []; cloud.fresh = false; cloud.loaded = {}; synced.clear(); older.clear(); remote.clear(); remoteRev.n++; cloud.status = "local"; cloud.ready = true; stopWatch(); return; }
    setUser(u);
    cloud.showLogin = false;
    // Meldung eines abgebrochenen Versuchs soll nach erfolgreicher Anmeldung nicht stehen bleiben
    cloud.error = "";
    unTrips = f.watchMyTrips(u.uid, (list, fromCache) => {
      const next = list.map(d => ({
        id: d.id, name: d.name, role: d.members[u.uid], owner: d.owner, members: d.members,
        memberNames: d.memberNames || {}, invite: d.invite ?? null, claims: d.claims || {}, ...stamp(d.updatedAt), ...(d.updatedBy ? { by: d.updatedBy } : {})
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

function setUser(u: User) {
  cloud.user = { uid: u.uid, name: fb!.displayName(u), email: u.email || "", guest: u.isAnonymous };
}
/** nach dem Verknüpfen eines Gasts mit einem Konto meldet Firebase keinen neuen Nutzer: Stand neu lesen */
function refreshUser() {
  if (fbUser) void fbUser.reload().catch(() => {}).then(() => { if (!fbUser) return; setUser(fbUser); if (!fbUser.isAnonymous) cloud.showLogin = false; });
}

/** angemeldet mit Konto (nicht als Gast): KI-Planer, Fehlermeldungen, eigene Reisen im Konto */
export const hasAccount = () => !!cloud.user && !cloud.user.guest;

/** als Gast ohne Konto beitreten (#435); der Vorname erscheint bei den Mitreisenden */
export async function loginGuest(name: string) {
  cloud.error = "";
  try { await (await load()).loginGuest(name); refreshUser(); } catch (e) { cloud.error = message(e); }
}

/** „Wer bist du?“: eigene Zuordnung in einer Reise setzen oder lösen */
export async function claimTraveler(tripId: string, c: { t: string; n: string } | null) {
  if (!fbUser) return;
  await (await load()).setClaim(tripId, fbUser.uid, c);
}
/* ---------- Stimmen (#432): je Mitglied ein Dokument unter der Reise ---------- */

/** Stimmen der offenen Konto-Reise: Konto → Abstimmung → Möglichkeit → Wert */
export const cloudVotes = $state({ trip: "", byUid: {} as Record<string, Record<string, Record<string, number>>>,
  /** zu „Ohne mich“ (#439): Konto → Abstimmung → Möglichkeit → Grund, mit Familie */
  whyByUid: {} as Record<string, Record<string, Record<string, { r?: string; f?: boolean }>>>,
  /** zuletzt gespeichert je Konto (Millisekunden, #585) */
  atByUid: {} as Record<string, number> });
let unVotes: Unsubscribe | null = null;
/** Stimmen der Reise beobachten (nur Konto-Reisen, nur Mitglieder); leer bzw. anderer Kennung: aufhören */
export async function watchVotes(id: string) {
  if (cloudVotes.trip === id && unVotes) return;
  unVotes?.(); unVotes = null;
  cloudVotes.trip = id; cloudVotes.byUid = {}; cloudVotes.whyByUid = {}; cloudVotes.atByUid = {};
  if (!id || !fbUser || !isCloud(id)) return;
  const f = await load();
  if (cloudVotes.trip !== id) return;
  unVotes = f.watchVotes(id, by => {
    if (cloudVotes.trip !== id) return;
    cloudVotes.byUid = Object.fromEntries(Object.entries(by).map(([k, d]) => [k, d.v]));
    cloudVotes.whyByUid = Object.fromEntries(Object.entries(by).map(([k, d]) => [k, d.w || {}]));
    cloudVotes.atByUid = Object.fromEntries(Object.entries(by).map(([k, d]) => [k, d.t || 0]));
  }, () => { unVotes = null; });
}
/** Stimmen einer Konto-Reise einmal lesen (Konto → Abstimmung → Möglichkeit → Wert); ohne Konto oder Fehler: leer */
export async function votesOnce(id: string): Promise<Record<string, Record<string, Record<string, number>>>> {
  if (!fbUser || !isCloud(id)) return {};
  return (await load()).votesOnce(id).catch(() => ({}));
}
/** eigene Stimmen in einer Konto-Reise speichern (alle Abstimmungen der Reise auf einmal) */
export async function saveMyVotes(id: string, v: Record<string, Record<string, number>>, w: Record<string, Record<string, { r?: string; f?: boolean }>> = {}) {
  if (!fbUser) return;
  cloudVotes.byUid = { ...cloudVotes.byUid, [fbUser.uid]: v };
  cloudVotes.whyByUid = { ...cloudVotes.whyByUid, [fbUser.uid]: w };
  cloudVotes.atByUid = { ...cloudVotes.atByUid, [fbUser.uid]: Date.now() };
  await (await load()).saveVotes(id, fbUser.uid, v, w);
}

/* ---------- Selbst eintragen (#571): je Mitglied ein Dokument unter der Reise ---------- */

/** selbst Eingetragenes der offenen Konto-Reise: Konto → Termine, Wohnort, Familienvorschlag */
export const cloudSelf = $state({ trip: "", byUid: {} as Selfs });
let unSelf: Unsubscribe | null = null;
export async function watchSelf(id: string) {
  if (cloudSelf.trip === id && unSelf) return;
  unSelf?.(); unSelf = null;
  cloudSelf.trip = id; cloudSelf.byUid = {};
  if (!id || !fbUser || !isCloud(id)) return;
  const f = await load();
  if (cloudSelf.trip !== id) return;
  unSelf = f.watchSelf(id, by => {
    if (cloudSelf.trip !== id) return;
    cloudSelf.byUid = Object.fromEntries(Object.entries(by).map(([k, d]) => [k, parseSelf(d)]));
  }, () => { unSelf = null; });
}
/** eigene Angaben speichern (nur die genannten Teile); sofort lokal sichtbar */
export async function saveMySelf(id: string, part: SelfDoc) {
  if (!fbUser) return;
  const u = fbUser.uid;
  if (cloudSelf.trip === id) {
    const m: SelfDoc = { ...(cloudSelf.byUid[u] || {}), ...part, t: Date.now() };
    for (const k of Object.keys(part) as (keyof SelfDoc)[]) if (part[k] === undefined) delete m[k];
    cloudSelf.byUid = { ...cloudSelf.byUid, [u]: m };
  }
  await (await load()).saveSelf(id, u, part as Record<string, unknown>);
}

/* ---------- Gruppenchat: je Nachricht ein Dokument unter der Reise ---------- */

/** Nachrichten der offenen Konto-Reise, älteste zuerst; failed: Laden ging nicht (z. B. Regeln noch nicht eingespielt) */
export const cloudChat = $state({ trip: "", msgs: [] as ChatMsg[], failed: false });
let unChat: Unsubscribe | null = null;
/** Chat der Reise beobachten (nur Konto-Reisen, nur Mitglieder); leer bzw. andere Kennung: aufhören */
export async function watchChat(id: string) {
  if (cloudChat.trip === id && unChat) return;
  unChat?.(); unChat = null;
  cloudChat.trip = id; cloudChat.msgs = []; cloudChat.failed = false;
  if (!id || !fbUser || !isCloud(id)) return;
  const f = await load();
  if (cloudChat.trip !== id) return;
  unChat = f.watchChat(id, CHAT_LIMIT, docs => {
    if (cloudChat.trip !== id) return;
    cloudChat.msgs = docs.map(d => parseMsg(d.id, d.data)).filter((m): m is ChatMsg => !!m).sort(byTime);
  }, () => { unChat = null; if (cloudChat.trip === id) cloudChat.failed = true; });
}
/** Nachricht senden (Name wie in der Reise), Bild schon verkleinert */
export async function postChat(id: string, n: string, text: string, img?: string) {
  if (!fbUser) return;
  const t = cleanText(text);
  const pic = img && validImg(img) ? img : undefined;
  if (!t && !pic) return;
  await (await load()).sendChat(id, { u: fbUser.uid, n: n.trim().slice(0, 40), t }, pic);
}
export async function removeChat(id: string, m: ChatMsg) { await (await load()).deleteChat(id, m.id, !!m.img); }
/** Bilder je Nachricht, einmal geladen (null: fehlt bzw. Fehler) */
const imgs = new Map<string, Promise<string | null>>();
export function chatImage(id: string, msgId: string): Promise<string | null> {
  const k = `${id}/${msgId}`;
  if (!imgs.has(k)) imgs.set(k, load().then(f => f.chatImage(id, msgId)).then(d => (validImg(d) ? d : null)).catch(() => { imgs.delete(k); return null; }));
  return imgs.get(k)!;
}

/** Besitzer: Zuordnung eines Mitglieds lösen */
export async function dropClaim(tripId: string, uid: string) { await (await load()).setClaim(tripId, uid, null); }

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
    // eigener älterer Stand (z. B. vom Anlegen), der neuere ist schon unterwegs: nicht übernehmen
    if (older.get(id)?.includes(d.data)) { dbg("älterer eigener Stand", id); return; }
    synced.set(id, d.data);
    older.delete(id);
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
  sent(trip.id, json);
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
  sent(trip.id, json);
  cloud.loaded[trip.id] = true;
  creating.add(trip.id);
  try { await f.createTrip(trip.id, trip.name || t("trip"), json, fbUser); }
  finally { creating.delete(trip.id); }
  if (wanted === trip.id) void watch(trip.id);
}

/** Konto-Reise frisch vom Server lesen (z. B. vor dem Aufräumen: die Kopie auf dem Gerät kann veraltet sein) */
/** Konto-Reise ändern, die gerade nicht offen ist (z. B. Variante in der Vergleichsansicht): frischer Stand, ändern, speichern */
export async function patchTrip(id: string, fn: (t: Trip) => void) {
  const r = roleOf(id);
  if (!fbUser || !r || r === "viewer") return;
  const tr = await freshCloudTrip(id);
  if (!tr) return;
  fn(tr);
  await (await load()).saveTrip(id, tr.name || t("trip"), JSON.stringify(tr), fbUser.uid);
}
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
/**
 * Variante einer geteilten Reise (#428): mit denselben Mitgliedern und Rollen teilen. Wer die Variante anlegt, ist ihr
 * Besitzer; gehört die Reise jemand anderem, wird der zum Bearbeiter.
 */
export async function shareLike(from: string, to: string) {
  const src = cloudTrip(from);
  if (!src || !fbUser || Object.keys(src.members).length < 2) return;
  const me = fbUser.uid;
  const members: Record<string, Role> = { ...src.members, [me]: "owner" };
  if (src.owner !== me) members[src.owner] = "editor";
  const names = { ...src.memberNames };
  if (!names[me]) names[me] = cloud.user?.name || "";
  await (await load()).setMembers(to, members, names, src.claims || {});
}
export async function changeRole(id: string, uid: string, role: Role) { const f = await load(); await f.setRole(id, uid, role); }
export async function kick(id: string, uid: string) { const f = await load(); await f.removeMember(id, uid); }

let signing = false;
/** ein zweiter Klick, während das Anmeldefenster noch offen ist, startet keinen weiteren Versuch */
export async function loginGoogle() {
  if (signing) return;
  signing = true; cloud.error = "";
  try { await (await load()).loginGoogle(); refreshUser(); } catch (e) { cloud.error = message(e); } finally { signing = false; }
}
export async function loginEmail(email: string) { cloud.error = ""; await (await load()).sendLoginLink(email); }
/** Anmelde-Nachweis für den Such-Dienst (KI-Planer); ohne Anmeldung null */
export async function idToken(): Promise<string | null> { return fbUser ? fbUser.getIdToken() : null; }
export async function logout() { await (await load()).logout(); }
/** Admin: Konto zurücksetzen (Reisen, Aktionsseiten, Personen, Buchungsdaten); danach Seite neu laden */
export async function wipeAccount() {
  if (!fbUser) throw new Error("not signed in");
  const f = await load();
  // nichts mehr beobachten: gelöschte Reisen sollen nicht als „verschwunden“ gemeldet oder zurückgeschrieben werden
  unTrips?.(); unTrip?.(); unTrips = unTrip = null; wanted = watching = "";
  const r = await f.wipeAccount(fbUser.uid);
  await f.clearCache();
  return r;
}
/** Auskunft (Art. 15 DSGVO): alles, was zum Konto gespeichert ist, frisch vom Server */
export async function myAccountData() {
  if (!fbUser) throw new Error("not signed in");
  return (await load()).collectAccount(fbUser.uid);
}
export async function loginTest(email: string, name: string) { if (emulator) { await (await load()).loginTest(email, name); refreshUser(); } }

const message = errorMessage;

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
