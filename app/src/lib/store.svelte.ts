/* App-Zustand: mehrere Reisen, lokal gespeichert. Später hinter einem Speicher-Adapter (Firebase). */
import { totals } from "./calc";
import { CAT_KEYS, DEFAULT_SETTINGS, isDetailed, uid, type CatKey, type Item, type Traveler, type Trip } from "./model";
import { sampleTrip } from "./seed";
import { cloud, cloudTrip, initCloud, isCloud, logout as cloudLogout, markSynced, needsPush, push, removeCloudTrip, roleOf, upload, watch, type Role } from "./cloud/cloud.svelte";

interface TripMeta { id: string; name: string; place: string; from?: string }
export interface TripEntry extends TripMeta { cloud: boolean; role?: Role; shared?: boolean }

const K_INDEX = "rk2-index", K_CUR = "rk2-current", K_TRIP = (id: string) => "rk2-t:" + id, K_OLD = "rk2-trip";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch {} };
const meta = (t: Trip): TripMeta => ({ id: t.id, name: t.name, place: t.place, from: t.from });

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

function boot(): { index: TripMeta[]; trip: Trip } {
  let index: TripMeta[] = [];
  try { index = JSON.parse(get(K_INDEX) || "[]"); } catch {}
  if (!index.length) {
    // erster Start oder Stand aus der ersten Vorschau (eine Reise)
    let first: Trip = sampleTrip();
    try { const old = get(K_OLD); if (old) first = JSON.parse(old); } catch {}
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

export const app = $state({
  trip: b.trip,
  index: b.index,
  /** Karte im Fokusmodus */
  editing: null as string | null,
  saved: true
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
      if (isCloud(m.id)) {
        if (edited && needsPush(m.id, json)) {
          // unsere Fassung wird als letzte gespeichert und gilt, eine zurückgehaltene fremde verfällt
          pendingRemote = null;
          baseline = { id: m.id, json };
          void push(trip, json);
        }
      } else {
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
    if (id === app.trip.id) openFirst();
  }
});

$effect.root(() => {
  // aktuelle Reise beobachten, sobald sie als Konto-Reise bekannt ist
  $effect(() => { const id = app.trip.id; void cloud.trips.length; void watch(id); });
  // zurückgehaltene Änderung anwenden, wenn nicht mehr bearbeitet wird
  $effect(() => { if (!app.editing) applyPending(); });
  // nach dem Beitreten die Reise öffnen
  $effect(() => { const j = cloud.joined; if (j && isCloud(j)) { cloud.joined = null; switchTrip(j); } });
});

/** Alle Reisen: im Konto und nur auf diesem Gerät */
export function allTrips(): TripEntry[] {
  const c: TripEntry[] = cloud.trips.map(t => ({ id: t.id, name: t.name, place: "", cloud: true, role: t.role, shared: Object.keys(t.members).length > 1 }));
  const l: TripEntry[] = app.index.filter(m => !isCloud(m.id)).map(m => ({ ...m, cloud: false }));
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
  try { await upload(JSON.parse(JSON.stringify(t))); }
  catch (e) {
    cloud.error = (e as { code?: string }).code === "unavailable" ? "Offline: Übernehmen ins Konto geht nur mit Verbindung." : "Die Reise konnte nicht ins Konto übernommen werden.";
    return;
  }
  app.index = app.index.filter(x => x.id !== id);
  put(K_INDEX, JSON.stringify(app.index));
}

export async function moveAllToCloud() {
  for (const m of [...app.index]) await moveToCloud(m.id);
}

export async function logout() {
  flush();
  const ids = cloud.trips.map(t => t.id);
  await cloudLogout();
  // Reisen aus dem Konto nicht auf dem Gerät liegen lassen
  ids.forEach(id => del(K_TRIP(id)));
  if (ids.includes(app.trip.id)) openFirst();
}

/** Nach dem Löschen oder Abmelden: nächste Reise öffnen, sonst eine leere (nie wieder das Beispiel) */
function openFirst() {
  clearTimeout(timer); timer = undefined;
  const gone = app.trip.id;
  const next = app.index.filter(m => m.id !== gone).map(m => readTrip(m.id)).find(Boolean);
  if (next) { open(next); return; }
  const c = cloud.trips.find(t => t.id !== gone);
  if (c) {
    open(readTrip(c.id) || { id: c.id, name: c.name, place: c.name, country: "", travelers: [], items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS } });
    return;
  }
  const empty: Trip = { id: uid(), name: "Neue Reise", place: "Neue Reise", country: "", travelers: [], items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS } };
  open(empty);
  if (cloud.user) void moveToCloud(empty.id);
}

function open(trip: Trip) {
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

export function switchTrip(id: string) {
  if (id === app.trip.id) return;
  flush();
  const t = readTrip(id);
  if (t) { open(t); return; }
  // Reise aus dem Konto, noch nicht auf diesem Gerät: Platzhalter, Inhalt kommt gleich
  const c = cloudTrip(id);
  if (c) open({ id, name: c.name, place: c.name, country: "", travelers: [], items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS } });
}

/** Neue Reise, standardmäßig im einfachen Modus; Reisende z. B. aus gespeicherten Gruppen */
export function newTrip(opts: { name?: string; travelers?: Traveler[] } = {}) {
  flush();
  const toCloud = !!cloud.user;
  const name = opts.name?.trim() || "Neue Reise";
  open({
    id: uid(), name, place: name, country: "",
    travelers: opts.travelers || [],
    // Wohnorte und Anreise je Familie aus der bisherigen Reise übernehmen, das spart Tipparbeit
    households: JSON.parse(JSON.stringify(app.trip.households || {})),
    items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }
  });
  if (toCloud) void moveToCloud(app.trip.id);
}

export function duplicateTrip() {
  flush();
  const copy: Trip = JSON.parse(JSON.stringify(app.trip));
  copy.id = uid();
  copy.name = copy.name + " (Kopie)";
  const toCloud = !!cloud.user;
  open(copy);
  if (toCloud) void moveToCloud(copy.id);
}

export async function deleteTrip(id: string) {
  if (id === app.trip.id) { clearTimeout(timer); timer = undefined; }
  if (isCloud(id)) {
    await removeCloudTrip(id);
    del(K_TRIP(id));
    if (id === app.trip.id) openFirst();
    return;
  }
  del(K_TRIP(id));
  app.index = app.index.filter(x => x.id !== id);
  put(K_INDEX, JSON.stringify(app.index));
  if (app.trip.id === id) openFirst();
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

export function resetSample() {
  const s = sampleTrip();
  app.trip = normalize({ ...s, id: app.trip.id });
  app.editing = null;
}

/* ---------- Einfach oder detailliert ---------- */

const CAT_NAMES: Record<CatKey, string> = { flights: "Flüge", stay: "Unterkunft", transport: "Transport vor Ort", attractions: "Erlebnisse", misc: "Sonstiges" };

/**
 * Bereich umschalten, ohne etwas zu verlieren:
 * einfach → detailliert: ein vorhandener Betrag wird zum ersten Posten, wenn es noch keine gibt;
 * detailliert → einfach: ist noch kein Betrag eingetragen, wird die Summe der Posten übernommen.
 */
export function setDetailed(cat: CatKey, on: boolean) {
  const trip = app.trip;
  if (isDetailed(trip, cat) === on) return;
  if (on) {
    const v = trip.simple?.[cat] || 0;
    if (v > 0 && !trip.items.some(i => i.cat === cat)) {
      trip.items.push({
        id: uid(), cat, name: `${CAT_NAMES[cat]} (pauschal)`, status: "chosen",
        options: [{ id: uid(), label: "Pauschal", price: { mode: "unit", currency: "EUR", unit: v } }]
      });
    }
  } else if (!((trip.simple?.[cat] ?? 0) > 0)) {
    const sum = calc.T.byCat[cat];
    if (sum > 0) { trip.simple ||= {}; trip.simple[cat] = Math.round(sum); }
  }
  trip.detail ||= {};
  trip.detail[cat] = on;
  if (app.editing && !on) app.editing = null;
}

export function setAllDetailed(on: boolean) { CAT_KEYS.forEach(c => setDetailed(c, on)); }

/** "simple", "detail" oder "mixed" für die ganze Reise */
export function tripMode(): "simple" | "detail" | "mixed" {
  const d = CAT_KEYS.map(c => isDetailed(app.trip, c));
  return d.every(Boolean) ? "detail" : d.some(Boolean) ? "mixed" : "simple";
}

export function setSimple(cat: CatKey, v: number | undefined) {
  app.trip.simple ||= {};
  if (v == null || isNaN(v)) delete app.trip.simple[cat];
  else app.trip.simple[cat] = Math.max(0, v);
}
