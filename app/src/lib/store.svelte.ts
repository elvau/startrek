/* App-Zustand: aktuelle Reise, lokal gespeichert. Später hinter einem Speicher-Adapter (Firebase). */
import { totals } from "./calc";
import { uid, type CatKey, type Item, type Trip } from "./model";
import { sampleTrip } from "./seed";

const KEY = "rk2-trip";

function load(): Trip {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Trip;
  } catch {}
  return sampleTrip();
}

export const app = $state({
  trip: load(),
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
    app.saved = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(KEY, json); app.saved = true; } catch {}
    }, 400);
  });
});

export function addItem(cat: CatKey): Item {
  const it: Item = {
    id: uid(), cat, name: "", status: "idea",
    options: [{ id: uid(), label: "", price: { mode: cat === "stay" || cat === "transport" ? "unit" : "person", currency: "EUR" } }]
  };
  app.trip.items.push(it);
  app.editing = it.id;
  return it;
}

export function removeItem(id: string) {
  app.trip.items = app.trip.items.filter(x => x.id !== id);
  if (app.editing === id) app.editing = null;
}

export function resetSample() {
  app.trip = sampleTrip();
  app.editing = null;
}
