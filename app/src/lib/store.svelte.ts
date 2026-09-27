/* App-Zustand: mehrere Reisen, lokal gespeichert. Später hinter einem Speicher-Adapter (Firebase). */
import { totals } from "./calc";
import { DEFAULT_SETTINGS, uid, type CatKey, type Item, type Trip } from "./model";
import { sampleTrip } from "./seed";

interface TripMeta { id: string; name: string; place: string; from?: string }

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
$effect.root(() => {
  $effect(() => {
    const json = JSON.stringify(app.trip);
    const m = meta(app.trip);
    app.saved = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      put(K_TRIP(m.id), json);
      put(K_CUR, m.id);
      const i = app.index.findIndex(x => x.id === m.id);
      if (i < 0) app.index.push(m);
      else if (JSON.stringify(app.index[i]) !== JSON.stringify(m)) app.index[i] = m;
      put(K_INDEX, JSON.stringify(app.index));
      app.saved = true;
    }, 400);
  });
});

/** Sofort speichern, z. B. vor dem Wechsel der Reise */
function flush() {
  clearTimeout(timer);
  put(K_TRIP(app.trip.id), JSON.stringify(app.trip));
}

function open(trip: Trip) {
  app.trip = normalize(trip);
  app.editing = null;
  put(K_CUR, trip.id);
  if (!app.index.some(x => x.id === trip.id)) app.index.push(meta(trip));
  put(K_INDEX, JSON.stringify(app.index));
  scrollTo({ top: 0, behavior: "smooth" });
}

export function switchTrip(id: string) {
  if (id === app.trip.id) return;
  flush();
  const t = readTrip(id);
  if (t) open(t);
}

export function newTrip() {
  flush();
  const hh = app.trip.travelers[0]?.household || "Wir";
  open({
    id: uid(), name: "Neue Reise", place: "Neue Reise", country: "",
    // Reisende und Wohnorte übernehmen, das spart Tipparbeit
    travelers: JSON.parse(JSON.stringify(app.trip.travelers.length ? app.trip.travelers : [{ id: uid(), name: "Ich", age: 35, household: hh }])),
    households: JSON.parse(JSON.stringify(app.trip.households || {})),
    items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }
  });
}

export function duplicateTrip() {
  flush();
  const copy: Trip = JSON.parse(JSON.stringify(app.trip));
  copy.id = uid();
  copy.name = copy.name + " (Kopie)";
  open(copy);
}

export function deleteTrip(id: string) {
  del(K_TRIP(id));
  app.index = app.index.filter(x => x.id !== id);
  put(K_INDEX, JSON.stringify(app.index));
  if (app.trip.id === id) {
    const next = app.index[0] && readTrip(app.index[0].id);
    if (next) open(next);
    else { const s = sampleTrip(); open({ ...s, id: uid() }); }
  }
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
  app.trip = normalize({ ...s, id: app.trip.id === s.id ? s.id : app.trip.id });
  app.editing = null;
}
