/* App-Zustand: mehrere Reisen, lokal gespeichert. Später hinter einem Speicher-Adapter (Firebase). */
import { noteNav } from "./bugs/log";
import { untrack } from "svelte";
import { t as tr, type Key } from "./i18n/index.svelte";
import { totals } from "./calc";
import { CAT_KEYS, DEFAULT_SETTINGS, isDetailed, uid, type CatKey, type Item, type Price, type SimpleLine, type Traveler, type Trip } from "./model";
import { sampleTrip } from "./seed";
import { autoName } from "./format";
import { soloTraveler } from "./placeholders";
import { cloud, cloudTrip, freshCloudTrip, initCloud, isCloud, logout as cloudLogout, markSynced, needsPush, push, removeCloudTrip, roleOf, upload, watch, type Role } from "./cloud/cloud.svelte";
import { pruneIndex } from "./cloud/prune";

interface TripMeta { id: string; name: string; place: string; from?: string; to?: string; people?: number }
export interface TripEntry extends TripMeta { cloud: boolean; role?: Role; shared?: boolean; /** zuletzt bearbeitet (ISO), für die Sortierung */ edited?: string }

const K_INDEX = "rk2-index", K_CUR = "rk2-current", K_TRIP = (id: string) => "rk2-t:" + id, K_OLD = "rk2-trip";
/** Konto-Reisen, die dieses Gerät zuletzt in der Liste gesehen hat (je Konto) */
const K_SEEN = (uid: string) => "rk2-cloud-seen:" + uid;
/** wann eine Reise auf diesem Gerät zuletzt geändert wurde (für „Zuletzt bearbeitet“ auf der Startseite) */
const K_EDITED = "rk2-edited";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch {} };
let editedAt: Record<string, string> = {};
try { editedAt = JSON.parse(localStorage.getItem(K_EDITED) || "{}"); } catch {}
function markEdited(id: string) {
  editedAt[id] = new Date().toISOString();
  try { localStorage.setItem(K_EDITED, JSON.stringify(editedAt)); } catch {}
}
const later = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);

const meta = (t: Trip): TripMeta => ({ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: t.travelers.filter(x => x.active !== false).length });

function readTrip(id: string): Trip | null {
  const raw = get(K_TRIP(id));
  try { return raw ? normalize(JSON.parse(raw)) : null; } catch { return null; }
}

/** Ältere Stände ergänzen, damit neue Felder immer da sind */
function normalize(t: Trip): Trip {
  t.settings = { ...DEFAULT_SETTINGS, ...t.settings };
  t.households ||= {};
  t.tiers ||= {};
  return t;
}

type NewOpts = { name?: string; place?: string; from?: string; to?: string; travelers?: Traveler[] };

/** Leere Reise; ohne Namen heißt sie „Neue Reise“, bis Ort oder Zeitraum da sind oder man selbst einen vergibt */
function emptyTrip(o: NewOpts = {}): Trip {
  const own = o.name?.trim();
  const auto = autoName(o);
  // Standard: eine Person als Tier
  const travelers = o.travelers ?? [soloTraveler()];
  return {
    id: uid(), name: own || auto || "", autoName: !own,
    place: o.place?.trim() || "", country: "", from: o.from || undefined, to: o.to || undefined,
    travelers, items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }
  };
}

/** Noch nichts eingetragen: so eine Reise verschwindet, sobald man woanders hinwechselt */
function pristine(t: Trip): boolean {
  // höchstens das anonyme Reh vom Start, sonst nichts eingetragen
  const onlySolo = t.travelers.length <= 1 && t.travelers.every(x => x.placeholder);
  return onlySolo && !t.items.length && !t.lines?.length && !Object.values(t.simple || {}).some(Boolean) && !t.from
    && (!t.place.trim() || t.place === "Neue Reise") && (!!t.autoName || t.name === "Neue Reise");
}

/** ohne Kosten: keine Posten, keine Beträge, kein Event (Ziel, Daten und Reisende zählen nicht) */
export function costless(t: Trip): boolean {
  return !t.items.some(i => !i.auto) && !t.lines?.length && !Object.values(t.simple || {}).some(Boolean) && !t.event;
}

/** schon ins Konto übernommen, die Liste im Konto kennt sie aber vielleicht noch nicht */
const uploaded = new Set<string>();


function boot(): { index: TripMeta[]; trip: Trip } {
  let index: TripMeta[] = [];
  try { index = JSON.parse(get(K_INDEX) || "[]"); } catch {}
  if (!index.length) {
    // erster Start: leere Reise im Hintergrund (oder Stand aus der ersten Vorschau)
    let first: Trip | null = null;
    try { const old = get(K_OLD); if (old) first = JSON.parse(old); } catch {}
    if (!first) first = emptyTrip();
    first = normalize(first);
    put(K_TRIP(first.id), JSON.stringify(first));
    index = [meta(first)];
    put(K_INDEX, JSON.stringify(index));
    del(K_OLD);
  }
  // Beispielreisen hatten früher alle die ID "beispiel"; eigene ID vergeben, damit sie im Konto nicht kollidieren
  const oldEx = index.find(m => m.id === "beispiel");
  if (oldEx) {
    const t = readTrip("beispiel");
    const nid = "b-" + uid();
    if (t) { t.id = nid; put(K_TRIP(nid), JSON.stringify(t)); }
    del(K_TRIP("beispiel"));
    oldEx.id = nid;
    put(K_INDEX, JSON.stringify(index));
    if (get(K_CUR) === "beispiel") put(K_CUR, nid);
  }
  const cur = get(K_CUR);
  const trip = (cur && readTrip(cur)) || readTrip(index[0].id) || normalize(sampleTrip());
  return { index, trip };
}

const b = boot();
noteNav(`geladen: ${b.trip.id}`);

export const app = $state({
  trip: b.trip,
  index: b.index,
  /** Karte im Fokusmodus */
  editing: null as string | null,
  saved: true,
  /** Startseite: bei jedem Besuch, außer man kommt über einen Einladungslink */
  home: typeof location === "undefined" || !location.search.includes("join=")
});

const t = $derived.by(() => totals(app.trip));
/** Berechnete Summen der aktuellen Reise */
export const calc = { get T() { return t; } };

let timer: ReturnType<typeof setTimeout> | undefined;
/** Stand beim Öffnen oder letzten Empfang; nur was davon abweicht, ist eine Änderung auf diesem Gerät */
let baseline = { id: b.trip.id, json: JSON.stringify(b.trip) };
const setBaseline = (t: Trip) => { baseline = { id: t.id, json: JSON.stringify(t) }; };
$effect.root(() => {
  $effect(() => {
    const json = JSON.stringify(app.trip);
    const m = meta(app.trip);
    app.saved = false;
    clearTimeout(timer);
    const trip = app.trip;
    timer = setTimeout(() => {
      timer = undefined;
      put(K_TRIP(m.id), json);
      put(K_CUR, m.id);
      const edited = !(baseline.id === m.id && baseline.json === json);
      if (edited) markEdited(m.id);
      if (isCloud(m.id)) {
        if (edited && needsPush(m.id, json)) {
          // unsere Fassung wird als letzte gespeichert und gilt, eine zurückgehaltene fremde verfällt
          pendingRemote = null;
          baseline = { id: m.id, json };
          void push(trip, json);
        }
      } else if (!uploaded.has(m.id)) {
        const i = app.index.findIndex(x => x.id === m.id);
        if (i < 0) app.index.push(m);
        else if (JSON.stringify(app.index[i]) !== JSON.stringify(m)) app.index[i] = m;
        put(K_INDEX, JSON.stringify(app.index));
      }
      app.saved = true;
      applyPending();
    }, 400);
  });
});

/** Sofort speichern, z. B. vor dem Wechsel der Reise */
function flush() {
  const pending = !!timer;
  clearTimeout(timer);
  timer = undefined;
  const json = JSON.stringify(app.trip);
  put(K_TRIP(app.trip.id), json);
  if (pending && isCloud(app.trip.id)) void push(app.trip, json);
}
// Neuladen oder Schließen kurz nach einer Änderung: nicht auf das verzögerte Speichern warten
if (typeof addEventListener !== "undefined") addEventListener("pagehide", () => { if (timer) flush(); });

/* ---------- Konto: Reisen im Konto, Änderungen von anderen ---------- */

let pendingRemote: Trip | null = null;

/** Änderung aus dem Konto übernehmen und als gespeichert markieren, damit sie nicht zurückgeschickt wird */
function applyRemote(trip: Trip) {
  const t = normalize(trip);
  markSynced(t.id, JSON.stringify(t));
  app.trip = t;
  setBaseline(app.trip);
  if (import.meta.env.VITE_FIREBASE_EMULATOR === "1") console.debug("[rk] remote angewendet", t.id);
}
function applyPending() {
  if (pendingRemote && !app.editing && !timer) {
    const t = pendingRemote;
    pendingRemote = null;
    if (t.id === app.trip.id) applyRemote(t);
  }
}

void initCloud({
  remote(id, trip) {
    if (import.meta.env.VITE_FIREBASE_EMULATOR === "1") console.debug("[rk] remote empfangen", id, "editing", app.editing, "timer", !!timer);
    put(K_TRIP(id), JSON.stringify(trip));
    if (id !== app.trip.id) return;
    // nicht mitten im Bearbeiten überschreiben
    pendingRemote = trip;
    applyPending();
  },
  gone(id) {
    del(K_TRIP(id));
    if (id === app.trip.id) openFirst("im Konto weg");
  }
});

$effect.root(() => {
  // aktuelle Reise beobachten, sobald sie als Konto-Reise bekannt ist
  $effect(() => { const id = app.trip.id; void cloud.trips.length; void watch(id); });
  // zurückgehaltene Änderung anwenden, wenn nicht mehr bearbeitet wird
  $effect(() => { if (!app.editing) applyPending(); });
  // Name folgt Ziel und Zeitraum, bis man selbst einen vergibt
  $effect(() => {
    const t = app.trip;
    if (!t.autoName) return;
    const n = autoName(t);
    if (n && n !== t.name) t.name = n;
  });
  // angemeldet mit Reisen im Konto: statt einer leeren Reise auf dem Gerät die erste aus dem Konto öffnen
  // (einmal nach dem Anmelden, später legt man vielleicht bewusst eine leere Reise an)
  let checked = false;
  $effect(() => {
    const first = cloud.trips[0];
    if (checked || !first || !cloud.user) return;
    checked = true;
    // nur solange man noch auf der Startseite ist: wer schon eine neue Reise begonnen hat (z. B. „Zu einem Event“
    // direkt nach dem Laden, Konto noch nicht da), dem wird sie nicht unter den Händen gegen eine Konto-Reise getauscht
    if (untrack(() => app.home) && !isCloud(app.trip.id) && pristine(app.trip) && !uploaded.has(app.trip.id)) {
      switchTrip(first.id, "Konto-Start");
    }
  });
  // Verzeichnis mit der Liste im Konto abgleichen: Konto-Reisen raus, woanders gelöschte Konto-Reisen weg (nur mit Stand vom Server)
  $effect(() => {
    const u = cloud.user;
    if (!u || !cloud.fresh) return;
    const ids = cloud.trips.map(t => t.id);
    const key = K_SEEN(u.uid);
    let seen: string[] = [];
    try { seen = JSON.parse(get(key) || "[]"); } catch {}
    const { index, gone } = pruneIndex(untrack(() => app.index), ids, seen, untrack(() => app.trip.id));
    gone.forEach(id => del(K_TRIP(id)));
    if (index.length !== untrack(() => app.index.length)) { app.index = index; put(K_INDEX, JSON.stringify(index)); }
    put(key, JSON.stringify(ids));
  });
  // nach dem Beitreten die Reise öffnen
  $effect(() => { const j = cloud.joined; if (j && isCloud(j)) { cloud.joined = null; switchTrip(j, "Einladung"); app.home = false; } });
});

/** Alle Reisen: im Konto und nur auf diesem Gerät */
export function allTrips(): TripEntry[] {
  // Ziel und Zeitraum stehen nur in der Reise selbst; aus der Kopie auf dem Gerät ergänzen, falls vorhanden.
  // Der Name der offenen Reise ist frischer als der im Konto (dort erst nach dem verzögerten Speichern); steht im Konto
  // noch der Platzhalter „Reise“ (gerade angelegt, Name noch nicht gespeichert), gilt der Name der Kopie auf dem Gerät
  const local = (id: string) => { const t = id === app.trip.id ? app.trip : readTrip(id); return t ? meta(t) : null; };
  const c: TripEntry[] = cloud.trips.map(t => { const l = local(t.id); return { place: "", ...l, id: t.id, name: t.id === app.trip.id ? app.trip.name : (t.name === tr("trip") || !t.name) && l?.name ? l.name : t.name, cloud: true, role: t.role, shared: Object.keys(t.members).length > 1, edited: later(editedAt[t.id], t.updated) }; });
  const l: TripEntry[] = app.index.filter(m => !isCloud(m.id)).map(m => ({ ...m, ...(m.id === app.trip.id ? meta(app.trip) : {}), cloud: false, edited: editedAt[m.id] }));
  return [...c, ...l];
}

export const access = {
  /** Reise aus dem Konto, aktueller Stand noch nicht da */
  get loading() { return isCloud(app.trip.id) && !cloud.loaded[app.trip.id]; },
  /** nur ansehen: eingeladen als viewer, oder Stand lädt noch */
  get readonly() { return roleOf(app.trip.id) === "viewer" || this.loading; },
  get role() { return roleOf(app.trip.id); }
};

/** Reise von diesem Gerät ins Konto übernehmen */
export async function moveToCloud(id: string) {
  if (!cloud.user || isCloud(id)) return;
  if (id === app.trip.id) flush();
  const t = id === app.trip.id ? app.trip : readTrip(id);
  if (!t) return;
  uploaded.add(id);
  const sent = JSON.stringify(t);
  try { await upload(JSON.parse(sent)); }
  catch (e) {
    uploaded.delete(id);
    cloud.error = (e as { code?: string }).code === "unavailable" ? tr("store.offlineMove") : tr("store.moveFailed");
    return;
  }
  app.index = app.index.filter(x => x.id !== id);
  put(K_INDEX, JSON.stringify(app.index));
  pushLater(id, sent);
}

/**
 * Während des Hochladens weiter geändert (z. B. KI-Vorschlag direkt in die neue Reise übernommen): Das Speichern ins Konto
 * ging da noch nicht, weil die Liste im Konto die Reise noch nicht kannte. Den Stand nachschicken, sobald sie drin ist,
 * sonst bleibt im Konto die leere Reise und überschreibt beim nächsten Laden die Kopie auf dem Gerät.
 */
function pushLater(id: string, sent: string, tries = 0) {
  const cur = id === app.trip.id ? app.trip : readTrip(id);
  if (!cur || !cloud.user) return;
  const json = JSON.stringify(cur);
  if (json === sent) return;
  if (roleOf(id)) { void push(cur, json); return; }
  if (tries < 40) setTimeout(() => pushLater(id, sent, tries + 1), 250);
}

/** Leere, unberührte Reise beim Verlassen wegräumen, damit sich keine „Neue Reise“ ansammelt */
function dropIfPristine(t: Trip) {
  if (t.id === app.trip.id || !pristine(t)) return;
  const c = cloudTrip(t.id);
  if (c) {
    if (c.owner === cloud.user?.uid && Object.keys(c.members).length === 1) void removeCloudTrip(t.id).catch(() => {});
    return;
  }
  app.index = app.index.filter(x => x.id !== t.id);
  put(K_INDEX, JSON.stringify(app.index));
  del(K_TRIP(t.id));
}

/** Reisen, die nur auf diesem Gerät liegen: wie auf der Startseite ohne leere Entwürfe und Einträge ohne gespeicherte Reise */
export function localTrips(): TripEntry[] {
  return allTrips().filter(m => !m.cloud && !isPristine(m.id));
}

export async function moveAllToCloud() {
  for (const m of localTrips()) await moveToCloud(m.id);
}

export async function logout() {
  flush();
  const ids = cloud.trips.map(t => t.id);
  await cloudLogout();
  // Reisen aus dem Konto nicht auf dem Gerät liegen lassen
  ids.forEach(id => del(K_TRIP(id)));
  if (ids.includes(app.trip.id)) openFirst("abgemeldet");
}

/**
 * Die offene Reise ist weg (gelöscht, im Konto verschwunden, abgemeldet): auf die Startseite, im Hintergrund eine leere
 * Reise (wird nicht angezeigt und nicht ins Konto gelegt). Früher ging es in die nächste Reise der Liste; die ist
 * alphabetisch sortiert, so landete man unerwartet z. B. in der Beispielreise (Fehlerbericht #13).
 */
function openFirst(why: string) {
  clearTimeout(timer); timer = undefined;
  open(emptyTrip(), `weg (${why}) → Startseite`);
  app.home = true;
}

/** why: Grund für den Verlauf in Fehlermeldungen (ohne Namen, nur Kennung) */
function open(trip: Trip, why: string) {
  noteNav(`${why}: ${trip.id}${isCloud(trip.id) ? " ☁" : ""}`);
  app.trip = normalize(trip);
  setBaseline(app.trip);
  app.editing = null;
  put(K_CUR, trip.id);
  if (!isCloud(trip.id) && !app.index.some(x => x.id === trip.id)) {
    app.index.push(meta(trip));
    put(K_INDEX, JSON.stringify(app.index));
  }
  scrollTo({ top: 0, behavior: "smooth" });
}

export function switchTrip(id: string, why = "gewechselt") {
  if (id === app.trip.id) return;
  flush();
  const prev = app.trip;
  const t = readTrip(id);
  // Reise aus dem Konto, noch nicht auf diesem Gerät: Platzhalter, Inhalt kommt gleich
  const c = t ? null : cloudTrip(id);
  if (t) open(t, why);
  else if (c) open({ id, name: c.name, place: "", country: "", travelers: [], items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS } }, why);
  else return;
  dropIfPristine(prev);
}

/** Neue Reise, standardmäßig im einfachen Modus; Reisende z. B. aus gespeicherten Gruppen */
export function newTrip(opts: NewOpts = {}) {
  flush();
  const prev = app.trip;
  open({
    ...emptyTrip(opts),
    // Wohnorte und Anreise je Familie aus der bisherigen Reise übernehmen, das spart Tipparbeit
    households: JSON.parse(JSON.stringify(prev.households || {}))
  }, "neu");
  dropIfPristine(prev);
  if (cloud.user) void moveToCloud(app.trip.id);
}

export function duplicateTrip() {
  flush();
  const copy: Trip = JSON.parse(JSON.stringify(app.trip));
  copy.id = uid();
  copy.name = `${copy.name} (${tr("store.copy")})`;
  const toCloud = !!cloud.user;
  open(copy, "Kopie");
  if (toCloud) void moveToCloud(copy.id);
}

export async function deleteTrip(id: string) {
  if (id === app.trip.id) { clearTimeout(timer); timer = undefined; }
  if (isCloud(id)) {
    await removeCloudTrip(id);
    del(K_TRIP(id));
    // kann beim Start ins Verzeichnis geraten sein, bevor die Liste im Konto da war
    app.index = app.index.filter(x => x.id !== id);
    put(K_INDEX, JSON.stringify(app.index));
    if (id === app.trip.id) openFirst("gelöscht");
    return;
  }
  del(K_TRIP(id));
  app.index = app.index.filter(x => x.id !== id);
  put(K_INDEX, JSON.stringify(app.index));
  if (app.trip.id === id) openFirst("gelöscht");
}

export function addItem(cat: CatKey): Item {
  const it: Item = {
    id: uid(), cat, name: "", status: "idea",
    options: [{ id: uid(), label: "", price: { mode: cat === "stay" || cat === "transport" ? "unit" : "person", currency: "EUR" } }]
  };
  if (cat === "stay" && app.trip.from && app.trip.to) { it.from = app.trip.from; it.to = app.trip.to; }
  app.trip.items.push(it);
  app.editing = it.id;
  return it;
}

export function removeItem(id: string) {
  app.trip.items = app.trip.items.filter(x => x.id !== id);
  if (app.editing === id) app.editing = null;
}

/* ---------- Startseite ---------- */

/** darf diese Reise weg? Nur eigene: auf dem Gerät oder im Konto, dort nur ungeteilt und im eigenen Besitz */
function mine(id: string): boolean {
  const c = cloudTrip(id);
  return !c || (c.owner === cloud.user?.uid && Object.keys(c.members).length === 1);
}

/**
 * Aufräumen auf der Startseite: unberührte Entwürfe (außer der offenen Reise) still löschen.
 * Konto-Reisen nur mit Kopie auf dem Gerät (sonst ist unbekannt, was drinsteht).
 */
export function sweepPristine() {
  for (const m of allTrips()) {
    if (m.id === app.trip.id || !mine(m.id)) continue;
    const tr = readTrip(m.id);
    if (tr && pristine(tr)) void deleteIf(m.id, pristine).catch(() => {});
  }
}

/** löschen, wenn die Reise (bei Konto-Reisen frisch vom Server gelesen) die Bedingung erfüllt; sonst bleibt sie */
export async function deleteIf(id: string, test: (t: Trip) => boolean): Promise<boolean> {
  if (!mine(id)) return false;
  const tr = isCloud(id) ? await freshCloudTrip(id) : readTrip(id);
  if (!tr || !test(tr) || id === app.trip.id && !test(app.trip)) return false;
  await deleteTrip(id);
  return true;
}

/** eigene Reisen ohne Kosten (zum Aufräumen nach Rückfrage) */
export function emptyTrips(): TripEntry[] {
  return allTrips().filter(m => { if (!mine(m.id)) return false; const tr = tripFor(m.id); return !!tr && costless(tr); });
}

/** Reise zum Anzeigen: die offene oder die Kopie auf dem Gerät (Konto-Reisen, die hier nie offen waren: null) */
export const tripFor = (id: string): Trip | null => (id === app.trip.id ? app.trip : readTrip(id));
const isPristine = (id: string) => { const t = tripFor(id); return !t || pristine(t); };

/** Reisen für die Startseite: zuletzt geöffnete zuerst, leere Entwürfe nicht */
export function homeTrips(): TripEntry[] {
  const cur = get(K_CUR);
  // Konto-Reisen zeigen (die Kopie auf dem Gerät kann veraltet sein); nur die offene, eigene, unberührte nicht
  const show = (m: TripEntry) => (m.cloud ? !(m.id === app.trip.id && mine(m.id) && pristine(app.trip)) : !isPristine(m.id));
  return allTrips().filter(show).sort((a, b) => Number(b.id === cur) - Number(a.id === cur));
}

/** Reise öffnen und Startseite verlassen */
export function openTrip(id: string, why = "Startseite") {
  switchTrip(id, why);
  app.home = false;
  scrollTo({ top: 0 });
}

/** neue Reise mit diesen Reisenden (Standard: eine Person) und direkt hinein */
export function startTrip(travelers?: Traveler[]) {
  newTrip(travelers ? { travelers } : {});
  app.home = false;
  scrollTo({ top: 0 });
}

export function goHome() {
  flush();
  app.editing = null;
  app.home = true;
  noteNav("Startseite");
  scrollTo({ top: 0 });
}

/** Reise selbst benennen; leer: Name folgt wieder Ort und Zeitraum */
export function renameTrip(name: string) {
  const v = name.trim();
  if (v) { app.trip.name = v; app.trip.autoName = false; }
  else { app.trip.autoName = true; app.trip.name = autoName(app.trip) || app.trip.name; }
}

/** Beispielreise als neue Reise öffnen; die offene Reise bleibt unangetastet */
export function openSample() {
  flush();
  const prev = app.trip;
  const s = sampleTrip();
  open({ ...s, id: uid(), name: tr("store.sampleName", { name: s.name }) }, "Beispiel");
  dropIfPristine(prev);
  app.home = false;
  if (cloud.user) void moveToCloud(app.trip.id);
}

/* ---------- Einfach oder detailliert ---------- */

const CAT_NAMES = (c: CatKey) => tr(`ch.${c}.label` as Key);

/**
 * Bereich umschalten. Die Posten eines Bereichs bleiben beim Wechsel auf "Einfach" gespeichert
 * (ausgeblendet) und kommen beim Wechsel zurück wieder:
 * einfach → detailliert: gibt es noch keine Posten, wird aus dem Betrag ein erster Posten mit Preis pro Person;
 *   mit edit öffnet sich dieser (oder ein leerer neuer) Posten gleich zum Eintragen.
 * detailliert → einfach: der Betrag wird auf die Summe der Posten gesetzt, damit die Gesamtsumme nicht springt.
 */
export function setDetailed(cat: CatKey, on: boolean, edit = false) {
  const trip = app.trip;
  if (isDetailed(trip, cat) === on) return;
  const has = trip.items.some(i => i.cat === cat);
  trip.detail ||= {};
  if (on) {
    trip.detail[cat] = true;
    // einzelne Einträge werden Posten mit denselben Beteiligten (Pauschale, gleich verteilt)
    const mine = (trip.lines || []).filter(l => l.cat === cat);
    for (const l of mine) {
      if (!(l.amount > 0) && !l.label.trim()) continue;
      trip.items.push({ id: uid(), cat, name: l.label.trim() || CAT_NAMES(cat), status: "chosen", ...(l.who ? { participants: [...l.who] } : {}),
        options: [{ id: uid(), label: "", price: { mode: "unit", currency: "EUR", unit: Math.max(0, l.amount) } }], ...(cat === "flights" ? { access: false } : {}) });
    }
    if (mine.length) trip.lines = (trip.lines || []).filter(l => l.cat !== cat);
    if (has || mine.length) {
      // der Betrag für alle kommt als eigener Posten dazu, damit die Summe gleich bleibt
      const v = !has ? trip.simple?.[cat] || 0 : 0;
      if (v > 0) trip.items.push({ id: uid(), cat, name: CAT_NAMES(cat), status: "chosen", options: [{ id: uid(), label: "", price: { mode: "unit", currency: "EUR", unit: v } }], ...(cat === "flights" ? { access: false } : {}) });
      return;
    }
    const v = trip.simple?.[cat] || 0;
    const n = calc.T.active;
    if (v > 0) {
      const price: Price = n
        ? { mode: "person", currency: "EUR", adult: Math.round((v / n) * 100) / 100 }
        : { mode: "unit", currency: "EUR", unit: v };
      // Anreise zum Flughafen nicht zusätzlich berechnen, sonst stimmt die Summe nicht mehr
      const it: Item = { id: uid(), cat, name: CAT_NAMES(cat), status: "chosen", options: [{ id: uid(), label: "", price }], ...(cat === "flights" ? { access: false } : {}) };
      trip.items.push(it);
      if (edit) app.editing = it.id;
    } else if (edit) addItem(cat);
    return;
  }
  if (has) {
    trip.simple ||= {};
    trip.simple[cat] = Math.round(calc.T.byCat[cat] * 100) / 100;
  }
  trip.detail[cat] = false;
  if (app.editing) app.editing = null;
}

/** Gespeicherte Posten eines Bereichs verwerfen (der einfache Betrag bleibt) */
export function discardDetails(cat: CatKey) {
  app.trip.items = app.trip.items.filter(i => i.cat !== cat);
  if (app.editing && !app.trip.items.some(i => i.id === app.editing)) app.editing = null;
}

export function setAllDetailed(on: boolean) { CAT_KEYS.forEach(c => setDetailed(c, on)); }

/** "simple", "detail" oder "mixed" für die ganze Reise */
export function tripMode(): "simple" | "detail" | "mixed" {
  const d = CAT_KEYS.map(c => isDetailed(app.trip, c));
  return d.every(Boolean) ? "detail" : d.some(Boolean) ? "mixed" : "simple";
}

/** einfacher Modus: neuer Eintrag, alle sind dabei */
export function addLine(cat: CatKey): SimpleLine {
  const l: SimpleLine = { id: uid(), cat, label: "", amount: 0 };
  app.trip.lines ||= [];
  app.trip.lines.push(l);
  // den Eintrag aus dem Zustand zurückgeben, damit Änderungen daran gespeichert werden
  return app.trip.lines[app.trip.lines.length - 1];
}

export function removeLine(id: string) {
  app.trip.lines = (app.trip.lines || []).filter(l => l.id !== id);
}

/** Person im Eintrag an- oder abwählen; sind wieder alle dabei, fällt die Auswahl weg */
export function toggleLineWho(l: SimpleLine, id: string) {
  const all = app.trip.travelers.filter(t => t.active !== false).map(t => t.id);
  const cur = l.who ? l.who.filter(x => all.includes(x)) : all;
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  l.who = all.every(x => next.includes(x)) ? undefined : next;
}

export function setSimple(cat: CatKey, v: number | undefined) {
  app.trip.simple ||= {};
  if (v == null || isNaN(v)) delete app.trip.simple[cat];
  else app.trip.simple[cat] = Math.max(0, v);
}
