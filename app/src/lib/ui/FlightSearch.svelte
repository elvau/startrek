<script lang="ts">
  import { arrow, autoName, t, tn, type Key } from "../i18n/index.svelte";
  /*
   * Flüge suchen (wie im Artefakt): mehrere Abflughäfen einzeln abfragen und vergleichen, Anfahrt einrechnen,
   * feste Daten (± Tage) oder flexibler Zeitraum mit „spätestens zuhause“ und Nächten per Schieberegler.
   */
  import { app, calc } from "../store.svelte";
  import { eur, money } from "../calc";
  import { airportsOf } from "../calc/travel";
  import { dayShort, nights, time } from "../format";
  import Modal from "./Modal.svelte";
  import { showItem } from "./showItem";
  import { dir } from "../directory.svelte";
  import { prefsFor, touchesAvoided } from "../prefs";
  import { surchargeBanned, type BagNeed } from "../flights/addons";
  import DualRange from "./DualRange.svelte";
  import LocationPicker from "./LocationPicker.svelte";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf, findCity } from "../geo/places";
  import { airportsNear, areaAround, locLabel, locOf, resolveLoc, searchLocs, type Loc } from "../geo/locations";
  import { addDays } from "../flights/kiwi";
  import { alternatives, anyReal, isShort, searchRound, swapLeg, type RoundPlace, type RoundStop, type RoundTrip } from "../flights/roundtrip";
  import { BOOKING_SIZE, MAX_PAX, SPLIT_FROM, scaleResult, splitPax } from "../flights/app";
  import { warnHintsFor } from "../hints";
  import { FLIGHTS_URL, fitTripDates, rateRound, takeRound, compareRow, hitsHidden, providerDown, covered, deadline, defaultFlyers, defaultQuery, flyers, followFlight, fmtMin, homeGuess, nearestAirports, passengers, rate, searchFlights, stopsText, takeOffer, type CompareRow, type Rated } from "../flights/app";
  import { hhKey, isActive } from "../model";
  import { loadPlz, withHome } from "../plz";
  import { cloud } from "../cloud/cloud.svelte";
  import type { FlightScope } from "../flights/open.svelte";
  import PartnerLinks from "./PartnerLinks.svelte";
  import ExtLink from "./ExtLink.svelte";
  import { partnersOf } from "../partners";
  import type { FlightOffer, FlightQuery, OfferLeg, SourceStatus } from "../flights/types";
  import { applyFilter, arrivalGap, dayCells, noFilter, sortFlights, type FlightSort, type SyncRef } from "../flights/filter";
  import { arrivals } from "../stays/presence";
  import FlightFilters from "./FlightFilters.svelte";
  import PriceCalendar from "./PriceCalendar.svelte";
  import { untrack } from "svelte";
  import RoughCalendar from "./RoughCalendar.svelte";
  import HomeHint from "./HomeHint.svelte";
  import { loadOrigin } from "../flights/origin.svelte";

  let { onclose, scope = {}, inline = false }: { onclose: () => void; scope?: FlightScope; inline?: boolean } = $props();

  const K = "rk-flight-search";
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(K) || "{}"); } catch {}

  const trip = app.trip;
  // Wer fliegt (wie im Artefakt je Flug-Posten): aus dem Posten, sonst die erste Familie ohne Flug, sonst alle
  const start = (() => ({ ...scope }))();
  const item = start.itemId ? trip.items.find(i => i.id === start.itemId) : undefined;
  let who = $state<string[] | undefined>(start.ids ?? item?.participants ?? defaultFlyers(trip));
  const act = trip.travelers.filter(isActive);
  const hhs = [...new Set(act.map(hhKey))];
  const cov = covered(trip);
  const whoIds = $derived(flyers(trip, who).map(t => t.id));
  const hhOn = (h: string) => !!who && act.filter(t => hhKey(t) === h).every(t => who!.includes(t.id));
  function setWho(ids: string[] | undefined) {
    who = ids && ids.length && ids.length < act.length ? ids : undefined;
    if (!custom) aps = nearestAirports(trip, 4, who);
    // Daten folgen der Auswahl (eigene Daten der Familie), solange man sie nicht selbst geändert hat
    const q = defaultQuery(trip, "", who ?? act.map(x => x.id));
    if (out === shownBase.depart && rFrom === shownBase.depart && (ret || "") === (shownBase.ret || "") && (rTo || "") === (shownBase.latest || "")) {
      out = rFrom = q.depart; ret = q.ret || ""; rTo = q.latest || ""; wTo = q.depart ? addDays(q.depart, 7) : "";
      lo = q.nightsMin || lo; hi = q.nightsMax || hi;
      shownBase = q;
    }
  }
  const toggleHh = (h: string) => { const ids = act.filter(t => hhKey(t) === h).map(t => t.id); setWho(hhOn(h) ? whoIds.filter(id => !ids.includes(id)) : [...new Set([...(who || []), ...ids])]); };
  // bei „Alle“ nimmt ein Klick die Person heraus, sonst schaltet er sie dazu oder weg
  const togglePerson = (id: string) => setWho(!who ? whoIds.filter(x => x !== id) : who.includes(id) ? who.filter(x => x !== id) : [...who, id]);
  // Mitfliegen: andere Flug-Posten, die diese Personen nicht schon enthalten
  const mains = $derived(trip.items.filter(i => i.cat === "flights" && !i.follow && i.status !== "dropped" && i.id !== item?.id && i.participants && !whoIds.some(id => i.participants!.includes(id))));
  function flyAlong(mainId: string) {
    app.trip.detail ||= {};
    app.trip.detail.flights = true;
    followFlight(app.trip, mainId, whoIds);
    onclose();
  }
  // bisher mitgeflogen: was das kostet (inkl. Anfahrt), zum Vergleich mit einem eigenen Flug
  const alongCost = $derived(item?.follow ? calc.T.items[item.id]?.net ?? null : null);
  // am Posten erneut geöffnet: Ziel und Daten aus dem schon übernommenen Flug (weitere Angebote für denselben Posten)
  const had = (item?.options.find(o => o.id === item.chosen) ?? item?.options.find(o => o.legs?.length))?.legs;
  const hadOut = had && !had.some(l => l.dir === "via") ? had.find(l => l.dir === "out") : undefined;
  const hadBack = hadOut ? [...had!].reverse().find(l => l.dir === "back") : undefined;
  const base = { ...defaultQuery(trip, "", start.ids ?? item?.participants ?? defaultFlyers(trip)),
    ...(hadOut ? { to: hadOut.to, depart: hadOut.dep.slice(0, 10), ...(hadBack ? { ret: hadBack.dep.slice(0, 10), latest: hadBack.arr.slice(0, 10) } : {}) } : {}) };
  const known = airportsOf(trip);
  // Abflughäfen: eigene Auswahl (gemerkt) oder die 4 nächsten zum Wohnort
  const prefs = prefsFor(trip, dir);
  // eigene Auswahl aus der letzten Suche, sonst die bevorzugten Abflughäfen aus den Vorlieben
  const savedAps = Array.isArray(saved.aps) && (saved.aps as string[]).length ? (saved.aps as string[]) : prefs.airports?.length ? prefs.airports : null;
  let custom = $state(!!savedAps);
  let aps = $state<string[]>(savedAps ?? nearestAirports(trip, 4, start.ids ?? item?.participants ?? defaultFlyers(trip)));
  // zur Auswahl: die nächsten Flughäfen zum Wohnort der Mitfliegenden (ohne Wohnort die ersten der Liste) und die gewählten
  const allCodes = $derived([...new Set([...nearestAirports(trip, 8, who), ...aps])]);
  // aus der Liste gewählte Abflug-Städte (z. B. LON = alle Londoner Flughäfen); alles andere ist ein Flughafen
  let apCities = $state<string[]>(Array.isArray(saved.apCities) ? (saved.apCities as string[]) : []);
  const originLoc = (code: string): Loc | null => (apCities.includes(code) ? locOf(airportData, code, "city") : locOf(airportData, code, "airport"));

  let mode = $state<"flex" | "fixed">((saved.mode as "flex" | "fixed") || "flex");
  // Art der Reise: hin und zurück, nur hin (z. B. erst mal bis Rio), Rundreise mit mehreren Stationen
  let kind = $state<"return" | "oneway" | "round">((saved.kind as "return" | "oneway" | "round") || "return");
  let to = $state(base.to);
  let toLoc = $state<Loc | null>(null);
  const cc = $derived(ccOf(geo, trip.country));
  /** Ort mit Koordinaten: bekannter Ort (auch ohne Flughafen, z. B. Makarska) oder Flughafen/Stadt aus der Liste */
  function pointOf(text: string): { name: string; lat: number; lon: number; cc?: string } | null {
    const name = text.split(",")[0].trim();
    if (!name || /^[A-Za-z]{3}$/.test(name)) return null;
    const c = findCity(geo, name, cc) || findCity(geo, name);
    if (c) return { name: c.name, lat: c.lat, lon: c.lon, cc: c.cc };
    const hit = searchLocs(airportData, name, 1, fromPt)[0];
    const ap = hit && (hit.lat != null ? hit : locOf(airportData, hit.airports[0], "airport"));
    return ap?.lat != null ? { name: hit.city, lat: ap.lat, lon: ap.lon!, cc: hit.cc } : null;
  }
  const areaFor = (text: string) => { const p = pointOf(text); return p ? areaAround(airportData, p) : null; };
  // Mittelpunkt der Abflughäfen: gleich gute Treffer beim Ziel nach Entfernung (Birmingham ab DUS → BHX, nicht BHM)
  const fromPt = $derived.by(() => {
    const ps = aps.map(c => locOf(airportData, c, "airport")).filter((l): l is Loc => l?.lat != null && l.lon != null);
    return ps.length ? { lat: ps.reduce((v, l) => v + l.lat!, 0) / ps.length, lon: ps.reduce((v, l) => v + l.lon!, 0) / ps.length } : null;
  });
  // Vorschläge ohne Eingabe: alle Flughäfen im Umkreis des Reiseziels, dann jeder einzeln mit Entfernung
  const nearDest = $derived.by(() => {
    const p = airportData.airports.length ? pointOf(trip.place || base.to) : null;
    if (!p) return [];
    const city = resolveLoc(airportData, p.name, cc);
    const area = areaAround(airportData, p);
    return [...(city?.kind === "city" ? [city] : []), ...(area ? [area] : []), ...airportsNear(airportData, p)];
  });
  // Ziel der Reise gleich als Auswahl: der Flughafen am Ort (Split → SPU), sonst alle im Umkreis (Makarska)
  Promise.all([ensureGeo(trip), ensureAirports()]).then(() => {
    if (toLoc || to !== base.to || !base.to) return;
    const l = resolveLoc(airportData, base.to, cc) ?? areaFor(base.to);
    if (l) { toLoc = l; to = locLabel(l); }
  });
  // flexibel
  let rFrom = $state(base.depart);
  // zuletzt automatisch gesetzte Daten (für setWho)
  let shownBase = base;
  let rTo = $state(base.latest || "");
  // nur hin / Rundreise: spätester Abflug (Zeitfenster)
  let wTo = $state(base.depart ? addDays(base.depart, 7) : "");
  // Rundreise: Stationen mit Nächten vor Ort, am Ende zurück nach Hause
  interface Station { loc: Loc | null; text: string; min: number; max: number }
  let stations = $state<Station[]>([{ loc: null, text: "", min: 4, max: 7 }]);
  let home = $state(true);
  let rounds = $state<{ rt: RoundTrip; r: Rated }[] | null>(null);
  let roundErrors = $state<string[]>([]);
  let roundMore = $state<string[]>([]);
  let listMore = $state(false);
  function setKind(k: typeof kind) {
    kind = k;
    // erste Station der Rundreise: bisheriges Ziel
    if (k === "round" && !stations[0].text && (toLoc || to.trim())) { stations[0].loc = toLoc; stations[0].text = to; }
  }
  let rToTime = $state((saved.rToTime as string) || "22:00");
  let lo = $state(base.nightsMin || 7);
  let hi = $state(base.nightsMax || 14);
  const span = $derived(rFrom && rTo ? nights(rFrom, rTo) : null);
  // feste Daten
  let out = $state(base.depart);
  const farOut = $derived(((mode === "flex" || kind === "round" ? rFrom : out) || "") > new Date(Date.now() + 330 * 86400000).toISOString().slice(0, 10));
  let ret = $state(base.ret || "");
  let flexDays = $state(Number(saved.flexDays ?? 0));
  // für beide
  // Vorlieben (Konto und Gruppe) belegen vor; gesperrte Länder filtern
  let maxStops = $state(Number(prefs.maxStops ?? saved.maxStops ?? 1));
  // Koffer insgesamt (aufgegeben), je Reise gemerkt; sonst je Person einer, außer „nur Handgepäck“
  const bagMemo: Record<string, number> = saved.bagCounts && typeof saved.bagCounts === "object" ? (saved.bagCounts as Record<string, number>) : {};
  let bagCount = $state<number | null>(typeof bagMemo[trip.id] === "number" ? bagMemo[trip.id] : null);
  const avoid = prefs.avoid || [];
  const ccOfAp = (c: string) => locOf(airportData, c, "airport")?.cc;
  let avoidedOut = $state(0);
  let noSelf = $state(saved.noSelf !== false);
  let withAccess = $state(saved.withAccess !== false);

  const pax = $derived(passengers(trip, who));
  // Plätze mit Koffer (Babys auf dem Schoß ohne); ohne eigene Wahl: je Platz einer, bei „nur Handgepäck“ keiner
  const seats = $derived(pax.adults + pax.children);
  // ohne Vorliebe: ab 5 Reisetagen mit Koffer, kürzer nur Handgepäck
  const tripDays = $derived(mode === "flex" ? lo + 1 : out && ret ? nights(out, ret) + 1 : null);
  const bags = $derived(Math.min(bagCount ?? ((prefs.bags ?? (tripDays == null || tripDays >= 5)) ? seats : 0), 2 * seats));
  // Koffer und Sitzplätze dazubuchen (#171): Kinder neben den Eltern, wenn nicht anders gewünscht
  const together = $derived(prefs.seatsTogether !== false);
  const need = $derived<BagNeed>({ bags, adults: pax.adults, kids: pax.children, together });
  const n = $derived(pax.adults + pax.children + pax.infants);
  const people = $derived([`${pax.adults} ${t("age.adultShort")}`, pax.children && tn("n.kids", pax.children), pax.infants && tn("n.babies", pax.infants)].filter(Boolean).join(" · "));
  // große Gruppen in Buchungen aufteilen (Vorschlag ab 10 Sitzen: je 5): gesucht wird für eine, hochgerechnet auf alle
  let bookSize = $state<number | null>(null);
  const split = $derived(splitPax(pax, bookSize ?? (seats >= SPLIT_FROM ? BOOKING_SIZE : MAX_PAX)));
  const qBags = $derived(split.bookings > 1 ? Math.min(2 * split.size, Math.ceil(bags / split.bookings)) : bags);
  const splitInfo = $derived(split.bookings > 1 ? { size: split.size, note: t("fs.split.note", { n: split.bookings, k: split.size }) } : undefined);
  const searchAll = (q: FlightQuery, signal?: AbortSignal) => { const f = split.factor; return searchFlights(q, signal).then(r => scaleResult(r, f)); };

  let busy = $state(false);
  let progress = $state("");
  let error = $state("");
  let list = $state<Rated[] | null>(null);
  let rows = $state<CompareRow[]>([]);
  let sources = $state<SourceStatus[]>([]);
  let lateOut = $state(0);
  let sort = $state<FlightSort>("price");
  // Filter auf die Treffer (keine neue Anfrage); Kalender wählt Hin- und Rücktag
  let filter = $state(noFilter());
  let taken = $state<Record<string, boolean>>({});
  let into = $state<string | undefined>(item?.id);
  let ctrl: AbortController | undefined;

  function toggleAp(code: string) {
    aps = aps.includes(code) ? aps.filter(c => c !== code) : [...aps, code];
    custom = true;
  }
  function addAp(l: Loc) {
    if (!aps.includes(l.code)) { aps = [...aps, l.code]; custom = true; }
    apCities = l.kind === "city" ? [...new Set([...apCities, l.code])] : apCities.filter(c => c !== l.code);
  }
  function resetAps() { aps = nearestAirports(trip, 4, who); custom = false; }
  // ohne Wohnort schlägt die Suche Flughäfen aus der Standardliste (NRW) vor: PLZ gleich hier eintragen
  const noHome = $derived(flyers(trip, who).some(x => !trip.households?.[hhKey(x)]?.geo));
  let plzErr = $state(false);
  async function setPlz(v: string): Promise<boolean> {
    plzErr = false;
    if (!/^\d{5}$/.test(v.trim())) return false;
    const pl = (await loadPlz().catch(() => null))?.get(v.trim());
    if (!pl) { plzErr = true; return false; }
    trip.households = withHome(trip.households, flyers(trip, who).map(hhKey), v.trim(), pl);
    resetAps();
    return true;
  }
  // ohne Wohnort: ungefährer Ort aus der Verbindung kommt nach; Vorschlag nachziehen, solange nichts selbst gewählt ist
  loadOrigin();
  $effect(() => { if (homeGuess(4) && noHome) untrack(() => { if (!custom) aps = nearestAirports(trip, 4, who); }); });
  // gespeicherte PLZ (nur mit Konto) erst auf Knopfdruck übernehmen: sie wird dann Teil der Reise
  const savedPlz = $derived(cloud.user ? dir.prefs?.plz : undefined);

  const SHOW = 40;
  // Flüge der anderen (schon übernommen): zum gemeinsamen Ankommen
  const refs = $derived<SyncRef[]>(arrivals(trip).filter(a => (a.arr || a.dep) && !a.ids.some(id => whoIds.includes(id))).map(a => ({ who: a.who, arr: a.arr, dep: a.dep })));
  const filtered = $derived(applyFilter(list || [], filter, refs));
  const shown = $derived(sortFlights(filtered, sort).slice(0, SHOW));
  const returns = $derived(!!list?.some(o => o.back));
  // Kalender nur, wenn die Treffer an mehr als einem Tag liegen
  const outCells = $derived(dayCells(list || [], filter, "out", refs));
  const backCells = $derived(filter.outDay || outCells.length < 2 ? dayCells(list || [], filter, "back", refs) : []);
  const hhmm = (m: number) => (m >= 1440 ? tn("n.days", Math.round(m / 1440)) : `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")} h`);
  const dur = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const hm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")} h`;

  async function search(e: Event) {
    e.preventDefault();
    error = ""; list = null; rows = []; sources = []; lateOut = 0; avoidedOut = 0; rounds = null; roundErrors = []; filter = noFilter();
    if (!aps.length) { error = t("fs.errAirport"); return; }
    if (kind === "round") return roundSearch();
    if (kind === "oneway") {
      if (mode === "flex" && (!rFrom || !wTo)) { error = t("fs.errWindow"); return; }
      if (mode === "flex" && wTo < rFrom) { error = t("fs.errWindowOrder"); return; }
      if (mode === "flex" && nights(rFrom, wTo) > 62) { error = t("fs.errWindowLong"); return; }
      if (mode === "fixed" && !out) { error = t("fs.errDepart"); return; }
    } else if (mode === "flex") {
      if (span == null) { error = t("fs.errFlex"); return; }
      if (span < 1) { error = t("fs.errFlexOrder"); return; }
    } else if (!out) { error = t("fs.errOut"); return; }
    // je Suche höchstens 9 (große Gruppen werden in Buchungen aufgeteilt)
    if (split.q.adults + split.q.children + split.q.infants > MAX_PAX) { error = t("fs.errMax", { n }); return; }
    if (!whoIds.length) { error = t("fs.errWho"); return; }
    // Ziel: gewählte Stadt oder Flughafen; Freitext wird nachgeschlagen („Split“ → SPU)
    const dest = toLoc ?? resolveLoc(airportData, to, cc) ?? areaFor(to);
    if (!dest && !/^[A-Za-z]{3}$/.test(to.trim())) { error = t("fs.errNotFound", { q: to.trim() }); return; }
    // Auswahl = Name + Liste von Codes; bei einer Stadt zusätzlich ihr Stadt-Code
    const toQ = dest ? { to: dest.code, toAirports: dest.airports, ...(dest.kind === "city" ? { toCityCode: dest.code } : {}) } : { to: to.trim().toUpperCase() };
    const fromQ = (code: string) => { const l = originLoc(code); return l ? { from: l.code, fromAirports: l.airports, ...(l.kind === "city" ? { fromCityCode: l.code } : {}) } : { from: code }; };
    try { localStorage.setItem(K, JSON.stringify({ aps: custom ? aps : [], apCities: custom ? apCities.filter(c => aps.includes(c)) : [], mode, kind, rToTime, flexDays, maxStops, bags: bags > 0, bagCounts: { ...bagMemo, ...(bagCount != null ? { [trip.id]: bagCount } : {}) }, noSelf, withAccess })); } catch {}

    busy = true;
    ctrl?.abort(); ctrl = new AbortController();
    const common = { ...toQ, ...split.q, maxStops, bags: qBags > 0, bagCount: qBags, selfTransfer: !noSelf, ...(avoid.length ? { avoidCountries: avoid } : {}), ...(prefs.maxHours ? { maxHours: prefs.maxHours } : {}), currency: "EUR" };
    const q: Omit<FlightQuery, "from"> = kind === "oneway"
      ? mode === "flex" ? { ...common, depart: rFrom, departTo: wTo } : { ...common, depart: out, flexDays }
      : mode === "flex" ? { ...common, depart: rFrom, latest: rTo, nightsMin: lo, nightsMax: hi } : { ...common, depart: out, ret: ret || undefined, flexDays };
    const qq = q;
    const dl = kind === "return" && mode === "flex" ? deadline(rTo, rToTime) : NaN;
    const all: Rated[] = [], cmp: CompareRow[] = [], src = new Map<string, SourceStatus>();
    let late = 0;
    listMore = false;
    try {
      const pass = async (q: typeof qq) => { for (const [i, code] of aps.entries()) {
        progress = t("fs.progress", { code, i: i + 1, n: aps.length });
        try {
          const r = await searchAll({ ...q, ...fromQ(code) }, ctrl!.signal);
          r.sources.forEach(s => { const p = src.get(s.id); src.set(s.id, p ? { ...p, ok: p.ok || s.ok, count: p.count + s.count, error: p.ok ? p.error : s.error } : { ...s }); });
          const ok = r.offers.filter(o => !touchesAvoided(o, avoid, ccOfAp));
          avoidedOut += r.offers.length - ok.length;
          let rated = ok.map(o => rate(trip, o, code, withAccess, who, need));
          if (!isNaN(dl)) { const before = rated.length; rated = rated.filter(o => !isNaN(o.home) && o.home <= dl); late += before - rated.length; }
          all.push(...rated);
          // Fehler nur zeigen, wenn keine Quelle geantwortet hat; sonst gab es schlicht keine passende Verbindung
          const err = r.sources.some(s => s.ok) ? undefined : r.sources.find(s => s.configured && !s.ok)?.error;
          cmp.push(compareRow(code, rated, rated.length ? undefined : err));
        } catch (err) {
          if ((err as Error).name === "AbortError") throw err;
          cmp.push(compareRow(code, [], (err as Error).message));
        }
      } };
      await pass(qq);
      // abgelegene Ziele gehen oft nur mit zwei Umstiegen: dann damit nachsuchen
      // Testangebote zählen nicht (Duffel im Testmodus liefert sonst einen erfundenen Direktflug nach Galápagos)
      if (!anyReal(all) && qq.maxStops === 1) {
        cmp.length = 0; all.length = 0;
        await pass({ ...qq, maxStops: 2 });
        listMore = anyReal(all);
      }
      // mehr behalten als gezeigt: Filter und Kalender arbeiten auf allen Treffern
      list = all.sort((a, b) => a.total - b.total).slice(0, 400);
      rows = cmp.sort((a, b) => (a.count ? a.total : Infinity) - (b.count ? b.total : Infinity));
      sources = [...src.values()];
      lateOut = late;
    } catch (err) {
      if ((err as Error).name !== "AbortError") error = (err as Error).message;
    } finally { busy = false; progress = ""; }
  }

  /** Preiskalender vor der Suche: Abflug-Codes (Städte mit Stadt-Code) und Ziel (Stadt-Code oder bis zu 2 Flughäfen) */
  const roughQuery = $derived.by(() => {
    if (kind === "round" || !aps.length) return null;
    const dest = toLoc ?? (to.trim() ? resolveLoc(airportData, to, cc) ?? areaFor(to) : null);
    const toCodes = dest ? (dest.kind === "city" ? [dest.code] : dest.airports.slice(0, 2)) : /^[A-Za-z]{3}$/.test(to.trim()) ? [to.trim().toUpperCase()] : [];
    return toCodes.length ? { from: aps.slice(0, 4), to: toCodes, oneWay: kind === "oneway", ...(maxStops === 0 ? { direct: true } : {}) } : null;
  });
  /** Warnhinweise zum Ziel (z. B. Nordkorea): erklären, warum es keine frei buchbaren Flüge gibt */
  const destWarn = $derived(warnHintsFor((roughQuery?.to ?? []).map(c => ccOfAp(c)?.toUpperCase()), `${to} ${toLoc ? locLabel(toLoc) : ""}`));
  const roughStart = $derived(((mode === "flex" ? rFrom : out) || addDays(new Date().toISOString().slice(0, 10), 30)).slice(0, 7));
  /** Tag(e) im Preiskalender gewählt: feste Daten eintragen und gleich suchen */
  function roughPick(o: string, b?: string) {
    mode = "fixed"; out = o; ret = b || ""; flexDays = 0;
    void search(new Event("submit"));
  }

  /** Ort der Auswahl als Liste von Codes für die Rundreise */
  const placeOf = (l: Loc): RoundPlace => ({ name: l.kind === "airport" ? l.code : l.city, code: l.code, airports: l.airports, ...(l.kind === "city" ? { cityCode: l.code } : {}) });

  async function roundSearch() {
    if (!rFrom || !wTo || wTo < rFrom) { error = t("fs.errWindow"); return; }
    // je Suche höchstens 9 (große Gruppen werden in Buchungen aufgeteilt)
    if (split.q.adults + split.q.children + split.q.infants > MAX_PAX) { error = t("fs.errMax", { n }); return; }
    if (!whoIds.length) { error = t("fs.errWho"); return; }
    const stops: RoundStop[] = [];
    for (const [i, st] of stations.entries()) {
      const l = st.loc ?? resolveLoc(airportData, st.text, cc) ?? areaFor(st.text);
      if (!l) { error = t("fs.errStation", { i: i + 1, q: st.text.trim() || "—" }); return; }
      if (!(st.min >= 0 && st.max >= st.min && st.max <= 60)) { error = t("fs.errStationNights", { i: i + 1 }); return; }
      stops.push({ place: placeOf(l), min: st.min, max: st.max });
    }
    // Start: alle gewählten Abflughäfen als eine Liste (Städte mit all ihren Flughäfen)
    const fromAps = [...new Set(aps.flatMap(c => originLoc(c)?.airports ?? [c]))];
    const one = aps.length === 1 ? originLoc(aps[0]) : null;
    const from: RoundPlace = { name: aps.join("/"), code: fromAps[0], airports: fromAps, ...(one?.kind === "city" ? { cityCode: one.code } : {}) };
    try { localStorage.setItem(K, JSON.stringify({ aps: custom ? aps : [], apCities: custom ? apCities.filter(c => aps.includes(c)) : [], mode, kind, rToTime, flexDays, maxStops, bags: bags > 0, bagCounts: { ...bagMemo, ...(bagCount != null ? { [trip.id]: bagCount } : {}) }, noSelf, withAccess })); } catch {}
    busy = true;
    ctrl?.abort(); ctrl = new AbortController();
    const signal = ctrl.signal;
    try {
      const plan = { from, stops, home, depart: rFrom, departTo: wTo, ...split.q, maxStops, bags: qBags > 0, bagCount: qBags, selfTransfer: !noSelf, ...(avoid.length ? { avoidCountries: avoid } : {}), ...(prefs.maxHours ? { maxHours: prefs.maxHours } : {}), currency: "EUR" };
      const run = (p: typeof plan, what: string) => searchRound(p, q => searchAll(q, signal), (k, of) => (progress = `${what}${t("fs.leg", { k, n: of })}`));
      // getrennte Flüge; kurze Stationen (unter 48 h) zusätzlich als Gabelflug mit langem Umstieg auf einem Ticket
      const res = [await run(plan, "")];
      const short = stops.slice(0, home ? stops.length : -1).some(isShort);
      if (short) res.push(await run({ ...plan, stops: stops.map(s => (isShort(s) ? { ...s, via: true } : s)) }, `${t("fs.openJaw")}: `));
      const seen = new Set<string>();
      const allRt = res.flatMap(r => r.trips);
      const okRt = allRt.filter(rt => !rt.legs.some(l => touchesAvoided(l, avoid, ccOfAp)));
      avoidedOut = allRt.length - okRt.length;
      rounds = okRt.filter(rt => (seen.has(rt.id) ? false : (seen.add(rt.id), true)))
        .map(rt => ({ rt, r: rateRound(trip, rt, home, withAccess, who) })).sort((a, b) => a.r.total - b.r.total).slice(0, 30);
      const srcs = new Map<string, SourceStatus>();
      res.flatMap(r => r.sources).forEach(s => { const o = srcs.get(s.id); srcs.set(s.id, o ? { ...o, ok: o.ok || s.ok, count: o.count + s.count } : { ...s }); });
      sources = [...srcs.values()];
      // Fehler nur zeigen, wenn es gar keine Rundreise gab
      roundErrors = rounds.length ? [] : res.flatMap(r => r.errors);
      roundMore = [...new Set(res.flatMap(r => r.moreStops || []))];
    } catch (err) {
      if ((err as Error).name !== "AbortError") error = (err as Error).message;
    } finally { busy = false; progress = ""; }
  }

  /** „Andere Flüge“ je Strecke: offen als „Karten-ID:Strecke“ */
  let altOpen = $state<string | null>(null);
  let swapped = $state<Record<string, number>>({});
  function swap(idx: number, i: number, o: FlightOffer) {
    if (!rounds) return;
    const rt = swapLeg(rounds[idx].rt, i, o);
    // dieselbe Kombination kann schon als eigene Karte in der Liste stehen: dann nur einmal (an dieser Stelle)
    rounds = rounds.map((y, k) => (k === idx ? { rt, r: rateRound(trip, rt, home, withAccess, who) } : y)).filter((y, k) => k === idx || y.rt.id !== rt.id);
    swapped[rt.id] = i + 1;
    altOpen = null;
  }
  const signed = (v: number) => (v > 0 ? `+${eur(v)}` : v < 0 ? `−${eur(-v)}` : `±${eur(0)}`);

  function takeR(rt: RoundTrip) {
    app.trip.detail ||= {};
    app.trip.detail.flights = true;
    into = takeRound(app.trip, rt, home, into, who, splitInfo).id;
    fitTripDates(app.trip);
    taken[rt.id] = true;
    // Suche schließen und den Posten zeigen; weitere Angebote: Suche am Posten erneut öffnen
    onclose();
    showItem(into);
  }

  function take(o: Rated) {
    // gefundene Flüge rechnen detailliert; weitere Treffer kommen als Angebote in denselben Posten
    app.trip.detail ||= {};
    app.trip.detail.flights = true;
    const hints: ("checkin" | "payfee")[] = [...(together && pax.children ? ["checkin" as const] : []), ...(!surchargeBanned(ccOfAp(o.out.from)) ? ["payfee" as const] : [])];
    into = takeOffer(app.trip, o, into, who, splitInfo, { add: o.add, hints }).id;
    fitTripDates(app.trip);
    taken[o.id + o.origin] = true;
    onclose();
    showItem(into);
  }
  function takeCheapest(code: string) {
    const o = list?.filter(x => x.origin === code).sort((a, b) => a.total - b.total)[0];
    if (o) take(o);
  }
</script>

{#snippet legRow(dir: string, l: OfferLeg)}
  <div class="fs-leg">
    <span class="fs-dir">{dir}</span>
    <span><b>{dayShort(l.dep)} {time(l.dep)} {arrow()} {time(l.arr)}</b> · {dur(l.minutes)} · {stopsText(l.stops)}</span>
    <span class="muted">{l.route.join(" → ")} · {l.carriers.join(" / ")}</span>
  </div>
{/snippet}

<Modal title={item ? `${t("fs.open")}: ${autoName(item.name) || t("ie.flight")}` : t("fs.open")} {onclose} wide {inline}>
  <form class="fs-form" onsubmit={search}>
    <div class="fs-who">
      <span class="dlabel">{t("fs.who")}</span>
      <div class="chips">
        <button type="button" class="chip" class:on={!who} aria-pressed={!who} onclick={() => setWho(undefined)}>{t("all")} ({act.length})</button>
        {#if hhs.length > 1}
          {#each hhs as h (h)}
            {@const ms = act.filter(x => hhKey(x) === h)}
            <button type="button" class="chip" class:on={hhOn(h)} aria-pressed={hhOn(h)} onclick={() => toggleHh(h)}>{h} ({ms.length}){#if ms.every(x => cov.has(x.id)) && !item}<small> {t("fs.hasFlight")}</small>{/if}</button>
          {/each}
        {/if}
      </div>
      <details class="more"><summary class="muted small">{t("fs.single")}</summary>
        <div class="chips">{#each act as p (p.id)}<button type="button" class="chip sm" class:on={whoIds.includes(p.id)} aria-pressed={whoIds.includes(p.id)} onclick={() => togglePerson(p.id)}>{p.name}{#if cov.has(p.id) && !item}<small class="fs-has" title={t("fs.hasFlight")}> ✓</small>{/if}</button>{/each}</div>
      </details>
      {#if hhs.length > 1 && !who}<p class="muted small">{t("fs.tipFamily")}</p>{/if}
      {#if who && mains.length && !item}
        <div class="chips fs-along"><span class="muted small">{t("fs.alongLabel")}</span>
          {#each mains as mm (mm.id)}<button type="button" class="chip sm" onclick={() => flyAlong(mm.id)}>{t("ie.like", { name: mm.name })}</button>{/each}
        </div>
      {/if}
      {#if alongCost != null}<p class="muted small">{t("fs.alongCost", { name: trip.items.find(i => i.id === item?.follow)?.name || "", v: eur(alongCost) })}</p>{/if}
    </div>
    <div>
      <span class="dlabel">{t("fs.origins")}</span>
      <div class="chips fs-aps">
        {#each allCodes as c (c)}
          {@const a = known.find(x => x.code === c)}
          {@const l = a ? null : originLoc(c)}
          <button type="button" class="chip" class:on={aps.includes(c)} aria-pressed={aps.includes(c)} title={a?.name || (l ? locLabel(l) : c)} onclick={() => toggleAp(c)}>{c}{#if l?.kind === "city"}<small>{t("fs.cityAll", { name: l.name })}</small>{/if}</button>
        {/each}
        <LocationPicker cls="fs-add" placeholder={t("fs.addOrigin")} clearOnPick onpick={addAp} />
      </div>
      {#if noHome}<HomeHint {setPlz} {savedPlz} {plzErr} />{/if}
      <p class="muted small">
        {#if custom}{t("fs.custom")} <button type="button" class="linkbtn" onclick={resetAps}>{t("fs.reset")}</button>
        {:else}{t("fs.default")}{/if}
      </p>
    </div>

    <div class="chips fs-kind" role="radiogroup" aria-label={t("fs.kind")}>
      {#each [["return", t("fs.return")], ["oneway", t("fs.oneway")], ["round", t("fs.round")]] as [k, lbl] (k)}
        <button type="button" role="radio" aria-checked={kind === k} class="chip" class:on={kind === k} onclick={() => setKind(k as typeof kind)}>{lbl}</button>
      {/each}
    </div>

    {#if kind !== "round"}
    <div class="chips fs-mode" role="radiogroup" aria-label={t("fs.dates")}>
      <button type="button" role="radio" aria-checked={mode === "fixed"} class="chip" class:on={mode === "fixed"} onclick={() => (mode = "fixed")}>{t("fs.fixed")}</button>
      <button type="button" role="radio" aria-checked={mode === "flex"} class="chip" class:on={mode === "flex"} onclick={() => (mode = "flex")}>{t("fs.flex")}</button>
    </div>

    <LocationPicker label={t("ie.to")} bind:value={toLoc} bind:text={to} placeholder={t("fs.toPh")} required near={nearDest} {areaFor} from={fromPt} />
    {#if toLoc && toLoc.kind !== "airport"}<p class="muted small fs-note">{t("fs.multiNote", { n: toLoc.airports.length, list: toLoc.airports.join(", ") })}</p>{/if}

    {/if}

    {#if kind === "round"}
      <div class="fs-flexbox">
        <div class="ed-row">
          <label class="f">{t("fs.depEarliest")}<input type="date" bind:value={rFrom} required /></label>
          <label class="f">{t("fs.latest")}<input type="date" bind:value={wTo} min={rFrom} required /></label>
        </div>
        <div class="fs-stations">
          {#each stations as st, i (i)}
            <div class="fs-station">
              <LocationPicker label={t("fs.station", { i: i + 1 })} bind:value={st.loc} bind:text={st.text} placeholder={t("fs.stationPh")} near={i === 0 ? nearDest : []} {areaFor} from={fromPt} />
              <label class="f fs-n">{t("fs.nightsFrom")}<input type="number" min="0" max="60" bind:value={st.min} /></label>
              <label class="f fs-n">{t("range.to")}<input type="number" min="1" max="60" bind:value={st.max} /></label>
              {#if stations.length > 1}<button type="button" class="btn sm fs-del" aria-label={t("fs.stationRemove", { i: i + 1 })} onclick={() => (stations = stations.filter((_, j) => j !== i))}>×</button>{/if}
            </div>
            {#if st.max <= 1 && (home || i < stations.length - 1)}<p class="muted small fs-short">{t("fs.shortHint")}</p>{/if}
          {/each}
          {#if stations.length < 5}<button type="button" class="btn sm fs-addst" onclick={() => (stations = [...stations, { loc: null, text: "", min: 3, max: 6 }])}>+ {t("fs.addStation")}</button>{/if}
        </div>
        <label class="in-row"><input type="checkbox" bind:checked={home} /> {t("fs.homeAtEnd", { list: aps.join(", ") })}</label>
        <p class="muted small">{t("fs.roundHint")}</p>
      </div>
    {:else if kind === "oneway"}
      {#if mode === "flex"}
        <div class="ed-row">
          <label class="f">{t("fs.earliestDep")}<input type="date" bind:value={rFrom} required /></label>
          <label class="f">{t("fs.latestDep")}<input type="date" bind:value={wTo} min={rFrom} required /></label>
        </div>
        <p class="muted small">{t("fs.onewayHint")}</p>
      {:else}
        <div class="ed-row">
          <label class="f">{t("fs.depOn")}<input type="date" bind:value={out} required /></label>
          <label class="f fs-sel">{t("fs.plusMinus")}<select bind:value={flexDays}>{#each [0, 1, 2, 3] as v (v)}<option value={v}>{v}</option>{/each}</select></label>
        </div>
      {/if}
    {:else if mode === "flex"}
      <div class="fs-flexbox">
        <div class="ed-row">
          <label class="f">{t("fs.earliestOut")}<input type="date" bind:value={rFrom} required /></label>
          <label class="f">{t("fs.homeBy")}<input type="date" bind:value={rTo} min={rFrom} required /></label>
          <label class="f fs-time">{t("fs.at")}<input type="time" bind:value={rToTime} /></label>
        </div>
        {#if span == null}
          <p class="muted small">{t("fs.errFlex")}</p>
        {:else if span < 1}
          <p class="warnline small">{t("fs.errFlexOrder")}</p>
        {:else}
          <DualRange bind:lo bind:hi min={1} max={span} label={t("fs.duration")} unit={t("fs.nightsUnit")} maxNote={t("fs.maxNote", { n: span })} />
        {/if}
        <p class="muted small">{t("fs.flexHint")}</p>
      </div>
    {:else}
      <div class="ed-row">
        <label class="f">{t("fs.outOn")}<input type="date" bind:value={out} required /></label>
        <label class="f">{t("fs.backOn")} <small class="muted">({t("fs.backEmpty")})</small><input type="date" bind:value={ret} min={out} /></label>
        <label class="f fs-sel">{t("fs.plusMinus")}<select bind:value={flexDays}>{#each [0, 1, 2, 3] as v (v)}<option value={v}>{v}</option>{/each}</select></label>
      </div>
    {/if}

    {#if kind !== "round" && FLIGHTS_URL}<RoughCalendar query={roughQuery} start={roughStart} onpick={roughPick} />{/if}

    <div class="ed-row fs-opts">
      <label class="f fs-sel">{t("fs.maxStops")}<select bind:value={maxStops}>{#each [0, 1, 2] as v (v)}<option value={v}>{v}</option>{/each}</select></label>
      <label class="f fs-sel">{t("fs.bags")}<select value={bags} onchange={e => (bagCount = Number(e.currentTarget.value))}>
        {#each Array.from({ length: 2 * seats + 1 }, (_, i) => i) as v (v)}<option value={v}>{v === 0 ? t("fs.bagsNone") : v}</option>{/each}
      </select></label>
      {#if seats >= 4}<label class="f fs-sel fs-split">{t("fs.split.label")}<select value={split.bookings > 1 ? split.size : MAX_PAX} onchange={e => (bookSize = Number(e.currentTarget.value))}>
        {#each [MAX_PAX, 6, 5, 4, 3, 2].filter(v => v < seats || v === MAX_PAX) as v (v)}<option value={v}>{v >= seats ? t("fs.split.none") : v}</option>{/each}
      </select></label>{/if}
      <label class="in-row"><input type="checkbox" bind:checked={noSelf} /> {t("fs.noSelf")}</label>
      <label class="in-row"><input type="checkbox" bind:checked={withAccess} /> {t("fs.withAccess")}</label>
    </div>
    {#if split.bookings > 1}<p class="small fs-split-hint">{t("fs.split.hint", { n: split.bookings, k: split.size, all: n })}</p>{/if}
    <p class="muted small">{people}{who ? ` (${[...new Set(flyers(trip, who).map(hhKey))].join(", ")})` : ` (${t("fs.allTrav")})`}. {who ? ([...new Set(flyers(trip, who).map(hhKey))].length === 1 ? t("fs.pricesOne") : t("fs.pricesSome")) : t("fs.pricesAll")}</p>
    {#if !FLIGHTS_URL}<p class="warnline small">{t("search.notSetUp")}</p>{/if}
    <button class="btn primary" disabled={busy || !FLIGHTS_URL}>{busy ? `${t("fs.busy")} ${progress}` : kind === "round" ? t("fs.roundBtn") : aps.length > 1 ? t("fs.compareN", { n: aps.length }) : t("fs.searchBtn")}</button>
    {#if kind !== "round" && to.trim() && aps.length && (mode === "flex" ? rFrom : out)}
      {@const d0 = toLoc ?? resolveLoc(airportData, to, cc)}
      {@const o0 = originLoc(aps[0])}
      {@const lq = { from: o0?.kind === "city" ? o0.airports[0] : aps[0], to: d0 ? d0.airports[0] : to.trim(), depart: mode === "flex" ? rFrom : out, ret: kind === "oneway" ? undefined : mode === "flex" ? rTo || undefined : ret || undefined, ...split.q }}
      <p class="muted small fs-direct">{t("fs.directFrom", { ap: aps[0] })} <PartnerLinks ids={partnersOf("flight")} q={{ ...lq, ...(o0?.kind === "city" ? { fromName: o0.city } : {}), ...(d0 && d0.kind !== "airport" ? { toName: d0.city } : {}) }} /></p>
    {/if}
  </form>

  {#if error}<p class="err small">{error}</p>{/if}

  {#if rounds}
    {#if sources.length}
      <div class="fs-src small">
        {#each sources as s (s.id)}
          <span class:ok={s.ok} class:off={!s.configured} title={s.error || ""}>{s.name}{s.test ? ` (${t("test.badge")})` : ""}: {s.ok ? tn("n.hits", s.count) : s.configured ? t("search.error") : t("search.notConfigured")}</span>
        {/each}
      </div>
      {#if sources.some(s => s.test && s.count)}<p class="warnline test-banner">⚠ {t("test.banner", { list: sources.filter(s => s.test && s.count).map(s => s.name).join(", ") })}</p>{/if}
    {/if}
    {#if rounds.length}
      <p class="muted small">{tn("n.rounds", rounds.length)} · {withAccess ? t("fs.cheapestInclAccess") : t("fs.cheapestFirst")} · {t("persShort", { n })} · {t("fs.ticketsSeparate")}</p>
      <div class="fs-list">
        {#each rounds as x, idx (x.rt.id)}
          <article class="fs-res fs-round">
            <div class="fs-top">
              <span class="pill-ap">{t("fs.from", { ap: x.rt.legs[0].out.from })}</span>
              <b class="num fs-price">{eur(x.r.total)}</b>
              {#if x.rt.legs.some(l => l.test)}<span class="pill-test">{t("test.badge")}</span>{/if}
              <span class="fs-badge">{tn("n.tickets", x.rt.legs.length)}</span>
            </div>
            <p class="muted small fs-sub">{t("fs.flightsPrice", { v: eur(x.rt.price) })}{withAccess && x.r.access ? ` + ${t("fs.accessPrice", { v: eur(x.r.access) })}` : ""}{n > 1 ? ` · ${t("pp", { v: eur(x.r.total / n) })}` : ""}</p>
            <div class="fs-pills">
              {#each x.rt.stays as st, i (i)}
                {#if st.hours != null}<span class="pill-h">{st.name}: {t("fs.layover", { h: Math.round(st.hours) })}</span>
                {:else if st.nights != null}<span class="pill-n">{st.name}: {tn("n.nights", st.nights)}</span>{/if}
              {/each}
              {#if !isNaN(x.r.home)}<span class="pill-h">{t("fs.homeAt", { t: fmtMin(x.r.home) })}</span>{/if}
            </div>
            {#each x.rt.legs as l, i (i)}
              {@const alts = alternatives(x.rt, i)}
              {@const key = `${x.rt.id}:${i}`}
              {@render legRow(`${i + 1}.`, l.out)}
              <p class="muted small fs-legsrc">{l.sourceName} · {eur(l.price)}{#if l.url}{" · "}<ExtLink href={l.url} sponsored={l.sponsored} track={[l.source, "flight"]}>{t("search.atProvider")} ↗</ExtLink>{/if}</p>
              {#if alts.length}
                <button type="button" class="linkbtn fs-altbtn" aria-expanded={altOpen === key} onclick={() => (altOpen = altOpen === key ? null : key)}>{altOpen === key ? t("fs.altHide") : t("fs.altShow", { n: alts.length })} {altOpen === key ? "▴" : "▾"}</button>
                {#if altOpen === key}
                  <div class="fs-alts">
                    <p class="muted small">{t("fs.altHint")}</p>
                    {#each alts as o (o.id)}
                      <div class="fs-alt">
                        {@render legRow("", o.out)}
                        <div class="fs-alt-r">
                          <b class="num" class:up={o.price > l.price} class:down={o.price < l.price}>{signed(o.price - l.price)}</b>
                          <button type="button" class="btn sm" onclick={() => swap(idx, i, o)}>{t("fs.altPick")}</button>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              {/if}
            {/each}
            {#if swapped[x.rt.id]}<p class="muted small fs-swapped">✓ {t("fs.altSwapped", { k: swapped[x.rt.id] })}</p>{/if}
            <div class="fs-acts">
              <button class="btn primary sm" disabled={taken[x.rt.id]} onclick={() => takeR(x.rt)}>{taken[x.rt.id] ? `✓ ${t("search.taken")}` : t("search.take")}</button>
            </div>
          </article>
        {/each}
      </div>
      {#if rounds.some(x => x.rt.legs.some(l => l.sponsored))}<p class="muted small">* {t("fs.partnerNote")}</p>{/if}
      {#if into}<p class="muted small">{t("fs.roundTaken")}</p>{/if}
    {:else}
      <p class="muted small">{t("fs.roundNone")}</p>
    {/if}
    {#each roundErrors as e (e)}<p class="muted small">{e}</p>{/each}
    {#if !rounds.length && farOut}<p class="warnline fs-farout">{t("fs.farOut")}</p>{/if}
    {#if roundMore.length}<p class="muted small fs-morestops">{t("fs.moreStops", { list: roundMore.join(", ") })}</p>{/if}
    {#if avoidedOut}<p class="muted small">{tn("fs.avoidedOut", avoidedOut)}</p>{/if}
  {/if}

  {#if list && listMore}<p class="muted small fs-morestops">{t("fs.moreStops", { list: `${aps.join("/")} → ${to}` })}</p>{/if}
  {#if list}
    {#if sources.length}
      <div class="fs-src small">
        {#each sources as s (s.id)}
          <span class:ok={s.ok} class:off={!s.configured} title={s.error || ""}>{s.name}{s.test ? ` (${t("test.badge")})` : ""}: {s.ok ? tn("n.hits", s.count) : s.configured ? t("search.error") : t("search.notConfigured")}</span>
        {/each}
      </div>
      {#if sources.some(s => s.test && s.count)}<p class="warnline test-banner">⚠ {t("test.banner", { list: sources.filter(s => s.test && s.count).map(s => s.name).join(", ") })}</p>{/if}
    {/if}
    {#if rows.length > 1}
      <div class="fs-cmp-wrap">
        <table class="fs-cmp">
          <thead><tr><th>{t("fs.th.from")}</th><th>{t("ie.flight")}</th><th class="c-x">{t("fs.th.access")}</th><th>{t("fs.th.total")}</th><th class="c-x">{t("fs.th.time")}</th><th>{t("fs.th.direct")}</th><th></th></tr></thead>
          <tbody>
            {#each rows as r, i (r.code)}
              {#if r.count}
                <tr class:cheap={i === 0}>
                  <td><b>{r.code}</b><small class="muted fs-apn">{known.find(a => a.code === r.code)?.name || ""}</small></td>
                  <td class="num">{eur(r.price)}</td>
                  <td class="num muted c-x">{eur(r.access || 0)}</td>
                  <td class="num"><b>{eur(r.total)}</b></td>
                  <td class="num c-x">{Math.round(r.hours)} h</td>
                  <td class="num">{r.direct != null ? eur(r.direct) : t("no")}</td>
                  <td><button class="btn sm" onclick={() => takeCheapest(r.code)}>{t("fs.pick")}</button></td>
                </tr>
              {:else}
                <tr class="muted"><td><b>{r.code}</b></td><td colspan="6">{r.error}</td></tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
      <p class="muted small">{withAccess ? t("fs.cmpNoteIncl") : t("fs.cmpNoteExcl")}</p>
    {/if}
    {#if lateOut}<p class="muted small">{tn("fs.lateOut", lateOut)}</p>{/if}
    {#if avoidedOut}<p class="muted small">{tn("fs.avoidedOut", avoidedOut)}</p>{/if}

    {#if list.length}
      {#if outCells.length > 1}
        <div class="pcals">
          <PriceCalendar cells={outCells} selected={filter.outDay} label={returns ? t("fs.cal.out") : t("fs.cal.oneway")} onpick={d => { filter.outDay = d; filter.backDay = null; }} />
          {#if returns && filter.outDay && backCells.length}
            <PriceCalendar cells={backCells} selected={filter.backDay} label={t("fs.cal.back")} onpick={d => (filter.backDay = d)} />
          {/if}
        </div>
        <p class="muted small">{returns ? (filter.outDay ? t("fs.cal.hintBack") : t("fs.cal.hintOut")) : t("fs.cal.hintOne")}</p>
      {:else if returns && backCells.length > 1}
        <div class="pcals"><PriceCalendar cells={backCells} selected={filter.backDay} label={t("fs.cal.back")} onpick={d => (filter.backDay = d)} /></div>
      {/if}
      <FlightFilters list={list} bind:filter {returns} {refs} />
      <div class="chips fs-sort" role="radiogroup" aria-label={t("search.sort")}>
        <button type="button" role="radio" aria-checked={sort === "price"} class="chip" class:on={sort === "price"} onclick={() => (sort = "price")}>{t("search.cheapest")}</button>
        <button type="button" role="radio" aria-checked={sort === "best"} class="chip" class:on={sort === "best"} onclick={() => (sort = "best")} title={t("fs.bestTitle")}>{t("fs.best")}</button>
        <button type="button" role="radio" aria-checked={sort === "time"} class="chip" class:on={sort === "time"} onclick={() => (sort = "time")}>{t("fs.fastest")}</button>
        <button type="button" role="radio" aria-checked={sort === "arrival"} class="chip" class:on={sort === "arrival"} onclick={() => (sort = "arrival")}>{t("fs.earliest")}</button>
      </div>
      <p class="muted small">{filtered.length < list.length ? `${t("fs.f.shown", { n: filtered.length, of: list.length })} · ` : ""}{t("fs.listSummary", { n: Math.min(SHOW, filtered.length), over: rows.length > 1 ? t("fs.allAirports") : aps[0] })} · {withAccess ? t("fs.byPriceIncl") : t("fs.byPrice")}{bags ? ` · ${t("fs.withBags", { n: tn("n.bags", bags) })}` : ""} · {t("persShort", { n })}</p>
      {#if together && pax.children}<p class="muted small fs-tip">💺 {t("fs.seatTip")}</p>{/if}
      <div class="fs-list">
        {#each shown as o (o.id + o.origin)}
          <article class="fs-res">
            <div class="fs-top">
              <span class="pill-ap">{t("fs.from", { ap: o.out.from })}</span>
              <b class="num fs-price">{eur(o.total)}</b>
              {#if o.test}<span class="pill-test" title={t("test.title")}>{t("test.badge")}</span>{/if}
              <span class="fs-badge">{o.sourceName}</span>
            </div>
            {#if alongCost != null && Math.abs(o.total - alongCost) >= 1}<p class="st-diff fs-sub" class:good={o.total < alongCost}>{o.total < alongCost ? t("fs.cheaperAlong", { v: eur(alongCost - o.total) }) : t("fs.dearerAlong", { v: eur(o.total - alongCost) })}</p>{/if}
            <p class="muted small fs-sub">{t("fs.flightPrice", { v: eur(o.price) })}{withAccess && o.access ? ` + ${t("fs.accessPrice", { v: eur(o.access) })}` : ""}{o.add?.bagFee ? ` + ${t("fs.addBags", { v: eur(o.add.bagFee) })}` : ""}{o.add?.seatFee ? ` + ${t("fs.addSeats", { v: eur(o.add.seatFee) })}` : ""}{n > 1 ? ` · ${t("pp", { v: eur(o.total / n) })}` : ""}{o.orig ? ` · ${t("fx.orig", { v: money(o.orig.amount, o.orig.currency) })}` : ""}</p>
            <div class="fs-pills">
              {#if o.baggage}<span class="pill-n fs-bag" class:miss={bags > o.baggage.checked}>🧳 {o.baggage.checked ? t("fs.bagsIncl", { n: tn("n.bags", o.baggage.checked) }) : t("fs.bagsNoneIncl")}</span>
              {:else if bags && !o.add?.bagFee}<span class="pill-n fs-bag unk">🧳 {t("fs.bagsUnknown")}</span>{/if}
              {#if o.nights != null}<span class="pill-n">{tn("fs.nightsThere", o.nights)}</span>{/if}
              {#if !isNaN(o.home)}<span class="pill-h">{t("fs.homeAt", { t: fmtMin(o.home) })}</span>{/if}
              {#if o.accessHours}<span class="pill-h">{t("fs.accessAbout", { h: hm(o.accessHours) })}</span>{/if}
              {#if arrivalGap(o, refs)}
                {@const g = arrivalGap(o, refs)!}
                <span class="pill-h fs-sync" class:near={Math.abs(g.min) <= 180}>🤝 {Math.abs(g.min) < 15 ? t("fs.sync.same", { who: g.who }) : g.min > 0 ? t("fs.sync.after", { h: hhmm(g.min), who: g.who }) : t("fs.sync.before", { h: hhmm(-g.min), who: g.who })}</span>
              {/if}
            </div>
            {@render legRow(t("fl.out"), o.out)}
            {#if o.back}{@render legRow(t("fs.backShort"), o.back)}{/if}
            <div class="fs-acts">
              <button class="btn primary sm" disabled={taken[o.id + o.origin]} onclick={() => take(o)}>{taken[o.id + o.origin] ? `✓ ${t("search.taken")}` : t("search.take")}</button>
              {#if o.url}<ExtLink cls="btn sm" href={o.url} sponsored={o.sponsored} inside track={[o.source, "flight"]}>{t("search.atProvider")} ↗</ExtLink>{/if}
              <button class="btn sm" disabled title={t("search.bookSoonTitle")}>{t("search.bookHere")} <small>{t("search.soon")}</small></button>
            </div>
          </article>
        {:else}
          <p class="muted small">{t("fs.f.none")}</p>
        {/each}
      </div>
      {#if list.some(o => o.sponsored)}<p class="muted small">* {t("fs.partnerNote")}</p>{/if}
      {#if into}<p class="muted small">{t("fs.takenHint")}</p>{/if}
    {:else}
      <p class="muted small">{t("fs.none")}</p>
      {#if hitsHidden(sources, list.length)}<p class="warnline">{t("fs.hitsHidden")}</p>{/if}
      {#if providerDown(sources)}<p class="warnline">{t("fs.providerDown")}</p>{/if}
      {#each destWarn as h (h.id)}
        <div class="warnline fs-destwarn">
          <strong>{t(`hint.${h.id}.t` as Key)}</strong>
          <p class="small">{t(`hint.${h.id}.x` as Key)}</p>
          <p class="small">{t("fs.noFreeFlights")}</p>
          <p class="small">{#each h.links as l (l.url)}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>{" "}{/each}</p>
        </div>
      {/each}
      <!-- Airlines verkaufen meist erst rund 11 Monate im Voraus: dann nicht „gibt es nicht“, sondern „noch nicht“ -->
      {#if farOut}<p class="warnline fs-farout">{t("fs.farOut")}</p>{/if}
    {/if}
  {/if}
</Modal>
