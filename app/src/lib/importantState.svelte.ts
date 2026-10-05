/*
 * „Wichtiges“ der aktuellen Reise, gemeinsam für die Bubble in der Menüleiste (Zähler) und das Popup (Punkte).
 * Lädt Einreise-Daten (visa.json) und Warnstufen (Such-Dienst) einmal, Orts- und Flughafendaten je Reise.
 */
import { app } from "./store.svelte";
import { dir } from "./directory.svelte";
import { hintsFor, tripAps, tripCountries, tripText } from "./hints";
import { itinerary } from "./itinerary";
import { airportData, ensureAirports, ensureGeo, geo } from "./geo/geo.svelte";
import { ccOf } from "./geo/places";
import { locOf } from "./geo/locations";
import type { AdviceMap } from "./advice";
import { loadAdvice } from "./adviceApp";
import { loadVisa, type VisaData } from "./visa";
import { bookAheadFor } from "./bookahead";
import { importantPoints, isOpen } from "./important";
import { docs } from "./traveldocs.svelte";
import { cloud } from "./cloud/cloud.svelte";

class ImportantState {
  visa = $state<VisaData | null>(null);
  advice = $state<AdviceMap>({});
  /** Popup offen */
  shown = $state(false);
  countries = $derived(tripCountries(app.trip, n => (n ? ccOf(geo, n) : null), c => locOf(airportData, c, "airport")?.cc));
  places = $derived([...new Set(itinerary(app.trip).map(d => d.place).filter(Boolean))]);
  /** Ablauf der Reisepässe (nur aus dem Konto, nur im Browser) */
  passports = $derived(docs.status === "ready" ? Object.fromEntries(app.trip.travelers.filter(x => x.personId && docs.map[x.personId]?.passExpiry).map(x => [x.id, docs.map[x.personId!].passExpiry!])) : {});
  canCheck = $derived(!!cloud.user && docs.status !== "ready" && docs.status !== "loading" && app.trip.travelers.some(x => x.personId));
  book = $derived(bookAheadFor(tripText(app.trip, this.places), tripAps(app.trip), app.trip.from));
  points = $derived(importantPoints({ trip: app.trip, countries: this.countries, hints: hintsFor(app.trip, this.countries, this.places), visa: this.visa, advice: this.advice, passports: this.passports, book: this.book }));
  open = $derived(this.points.filter(p => isOpen(p, app.trip.done || {})));
  closed = $derived(this.points.filter(p => !isOpen(p, app.trip.done || {})));
  /** man selbst in dieser Reise („Ich bin“ im Personenverzeichnis) */
  meId = $derived(dir.me ? app.trip.travelers.find(x => x.personId === dir.me)?.id : undefined);
}

export const imp = new ImportantState();

let loaded = false;
/** Daten laden (einmal je Sitzung bzw. je Reise); aus einem $effect aufrufen */
export function loadImportant() {
  if (!loaded) {
    loaded = true;
    void loadVisa().then(d => (imp.visa = d));
    void loadAdvice().then(m => (imp.advice = m));
  }
  void ensureGeo(app.trip).catch(() => {});
  void ensureAirports().catch(() => {});
}
