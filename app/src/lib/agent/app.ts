/* KI-Planer in der App: Anfrage aus der Reise bauen, an den Such-Dienst schicken, Vorschlag übernehmen */
import { i18n, t, type Key } from "../i18n/index.svelte";
import { ageClass, presences, totals } from "../calc";
import { FLIGHTS_URL, flyers, nearestAirports, offerToOption, passengers, takeOffer } from "../flights/app";
import { takeStay } from "../stays/app";
import { idToken } from "../cloud/cloud.svelte";
import { hhKey, isActive, uid, type AiMark, type Item, type Prefs, type Traveler, type Trip } from "../model";
import { syncFood } from "../food";
import type { GeoData } from "../geo/places";
import { ANIMALS, animalName, nextAnimal, placeholderTravelers } from "../placeholders";
import type { AgentEdit, AgentGroupIn, AgentRequest, AgentResult, AgentTrip, FlightBooking, TripBrief } from "./types";
import { noteError } from "../bugs/log";

/** Wunsch plus Reisende, Abflughäfen und was über die Reise schon feststeht */
export function agentRequest(trip: Trip, prompt: string, asked = false, prefs?: Prefs, withTrip = false): AgentRequest {
  const pax = passengers(trip);
  // Kinder mit Alter (ohne Babys auf dem Schoß); ohne Alter: 8
  const childAges = flyers(trip)
    .filter(p => ageClass(p.age, trip.settings, p.kind) !== "adult" && !(p.age != null && (p.age as unknown) !== "" && p.age < 2))
    .map(p => (p.age != null && (p.age as unknown) !== "" ? Math.min(17, Math.max(2, Math.round(Number(p.age)))) : 8))
    .slice(0, pax.children);
  const known = { place: trip.place || undefined, from: trip.from || undefined, to: trip.to || undefined };
  return {
    prompt: prompt.trim(), lang: i18n.lang, today: new Date().toISOString().slice(0, 10),
    origins: nearestAirports(trip, 3), adults: pax.adults, childAges, infants: pax.infants,
    ...(known.place || known.from || known.to ? { trip: known } : {}),
    originsKnown: flyers(trip).some(p => !!trip.households?.[hhKey(p)]?.geo),
    travelersKnown: travelersKnown(trip), asked, ...(prefs ? { prefs } : {}),
    ...(withTrip ? { current: tripBrief(trip) } : {}),
    ...(groupsIn(trip).length > 1 ? { groups: groupsIn(trip) } : {})
  };
}

/** Familien der Reise mit Kürzel (F1, F2 … in der Reihenfolge der Reisenden); die KI bekommt keine Namen (#230) */
export function groupKeys(trip: Trip): Map<string, string> {
  return new Map([...new Set(trip.travelers.filter(isActive).map(hhKey))].slice(0, 10).map((hh, i) => [`F${i + 1}`, hh]));
}

/** Familien für die KI: Personen und, falls eingetragen, eigene Zeiten */
export function groupsIn(trip: Trip): AgentGroupIn[] {
  const pres = presences(trip);
  return [...groupKeys(trip)].map(([key, hh]) => {
    const ms = trip.travelers.filter(p => isActive(p) && hhKey(p) === hh);
    const cls = (p: Traveler) => (p.kind === "infant" || (p.age != null && (p.age as unknown) !== "" && p.age < 2) ? "infant" : ageClass(p.age, trip.settings, p.kind));
    const childAges = ms.filter(p => cls(p) === "child").map(p => (p.age != null && (p.age as unknown) !== "" ? Math.min(17, Math.max(2, Math.round(Number(p.age)))) : 8));
    const h = trip.households?.[hh];
    const own = h?.arrive && h?.depart ? { from: h.arrive, to: h.depart } : (() => {
      const ps = ms.map(p => pres[p.id]).filter(x => !!x && x.src === "flight");
      return ps.length ? { from: ps.map(x => x!.a).sort()[0], to: ps.map(x => x!.d).sort().at(-1)! } : {};
    })();
    return { key, adults: ms.filter(p => cls(p) === "adult").length, childAges, infants: ms.filter(p => cls(p) === "infant").length, ...own };
  }).filter(g => g.adults + g.childAges.length > 0);
}

/** berät die KI zur offenen Reise? (sonst plant sie neue Reisen) – sobald Ziel oder eigene Posten da sind */
export const hasPlan = (trip: Trip) => !!trip.place || trip.items.some(i => !i.auto);

/** offene Reise für die KI: Ziel, Daten, Posten mit Betrag für alle; ohne Namen, Notizen und Buchungsangaben */
export function tripBrief(trip: Trip): TripBrief {
  const T = totals(trip);
  // Postennamen enthalten oft Familiennamen („Flug Klein“): Namen der Reisenden und Familien unkenntlich machen
  const names = [...new Set(trip.travelers.flatMap(p => [p.name, p.household]).map(x => (x || "").trim()).filter(x => x.length > 1))]
    .sort((a, b) => b.length - a.length);
  const anon = (s: string) => names.reduce((v, n) => v.split(n).join("…"), s);
  const items = trip.items.filter(i => !i.auto).slice(0, 40).map(i => {
    const o = T.items[i.id]?.option;
    const legs = o?.legs?.length ? o.legs.map(l => `${l.from}→${l.to} ${l.dep.replace("T", " ")}`).join(", ") : "";
    const detail = legs || (i.from && i.to ? `${i.from} – ${i.to}` : "");
    return {
      id: i.id, cat: i.cat, name: anon(i.name || o?.label || "").slice(0, 60), status: i.status, eur: Math.round(T.items[i.id]?.net || 0),
      ...(o?.estimate ? { estimate: true } : {}), ...(i.arrival ? { arrival: true } : {}), ...(detail ? { detail: detail.slice(0, 120) } : {})
    };
  });
  return {
    items,
    ...(trip.place ? { place: trip.place } : {}), ...(trip.country ? { country: trip.country } : {}),
    ...(trip.from ? { from: trip.from } : {}), ...(trip.to ? { to: trip.to } : {})
  };
}

/** Reisende eingetragen? Eine neue Reise hat nur das Tier vom Start, dann nimmt die KI Anzahl und Alter aus dem Wunsch */
export const travelersKnown = (trip: Trip) => trip.travelers.length > 1 || trip.travelers.some(p => !p.placeholder);

/** Reisende aus dem Vorschlag übernehmen, wenn die Reise noch keine hat: „Fuchs Erw. 1“, „Fuchs Kind 1 (8)“ … */
export function takeParty(trip: Trip, a: AgentTrip) {
  // neue Familien aus dem Wunsch (#230): je Familie Platzhalter, Name aus dem Wunsch oder ein Tier
  const fresh = (a.groups || []).filter(g => !g.key.startsWith("F"));
  if (fresh.length && !travelersKnown(trip)) {
    const used: string[] = [];
    trip.travelers = fresh.flatMap((g, i) => {
      const animal = nextAnimal(used);
      used.push(animal);
      const list = placeholderTravelers([{ animal, adults: g.adults, kids: g.childAges.length, infants: g.infants }], i);
      let k = 0;
      for (const p of list) {
        if (p.kind === "child") p.age = g.childAges[k++];
        if (g.label) { p.name = p.name.replace(p.household, g.label); p.household = g.label; }
        (p as Traveler & { group?: string }).group = g.key;
      }
      return list;
    });
    return;
  }
  if (!a.party || travelersKnown(trip)) return;
  const animal = trip.travelers[0]?.household ? ANIMALS.find(([n]) => animalName(n) === trip.travelers[0].household)?.[0] : undefined;
  const list = placeholderTravelers([{ animal: animal || nextAnimal(), adults: a.party.adults, kids: a.party.childAges.length, infants: a.party.infants }]);
  let k = 0;
  for (const p of list) if (p.kind === "child") p.age = a.party.childAges[k++];
  trip.travelers = list;
}

/** Meldung des Such-Dienstes in der gewählten Sprache (der Dienst antwortet auf Deutsch) */
export function agentError(status: number, msg?: string): string {
  const k = ({ 400: "ai.err.input", 401: "ai.err.login", 429: "ai.err.limit", 502: "ai.err.busy", 503: "ai.err.setup" } as Record<number, Key>)[status];
  // bei 502 den eigentlichen Grund dazu (sonst sieht man nicht, ob Gemini, die Suche oder das Budget hakt)
  if (k === "ai.err.busy" && msg) return `${t(k)} ${t("ai.err.reason", { msg })}`;
  if (k) return t(k);
  return i18n.lang === "de" && msg ? msg : t("search.status", { s: status });
}

export async function askAgent(r: AgentRequest, signal?: AbortSignal): Promise<AgentResult> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const token = await idToken();
  if (!token) throw new Error(t("ai.needLogin"));
  const res = await fetch(`${FLIGHTS_URL}/agent`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(r), signal
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    noteError(`KI ${res.status}: ${data.error || "ohne Meldung"}`);
    throw Object.assign(new Error(agentError(res.status, data.error)), { remaining: data.remaining as number | undefined });
  }
  return data as AgentResult;
}

/** Vorschlag übernehmen: Ziel und Daten setzen, Flug und Unterkunft als Posten anlegen */
export function takeAgentTrip(trip: Trip, a: AgentTrip) {
  // erst die Reisenden, damit Flug und Unterkunft für die richtigen Personen gelten
  takeParty(trip, a);
  trip.place = a.place;
  if (a.country) trip.country = a.country;
  trip.from = a.from;
  trip.to = a.to;
  if (trip.autoName !== false) { trip.name = a.title; trip.autoName = false; }
  trip.detail ||= {};
  const at = new Date().toISOString();
  // Flug und Unterkunft sind echte Angebote: „von der KI vorgeschlagen“
  const fam = familiesOf(trip, a);
  for (const [hh, g] of fam) {
    // eigene Zeiten nur, wo sie vom Reisezeitraum abweichen
    if (g.from === trip.from && g.to === trip.to) continue;
    trip.households ||= {};
    trip.households[hh] = { ...(trip.households[hh] || {}), arrive: g.from, depart: g.to };
  }
  if (a.bookings?.length) {
    trip.detail.flights = true;
    const seat = seatQueue(trip);
    const seatOf = new Map([...fam].map(([hh, g]) => [g.key, seatQueue(trip, hh)]));
    for (const b of a.bookings) takeBookings(trip, b, (b.group && seatOf.get(b.group)?.(b.travelers)) || seat(b.travelers), { at, kind: "suggested" });
  } else if (a.flight) { trip.detail.flights = true; takeOffer(trip, a.flight).ai = { at, kind: "suggested" }; }
  if (a.stay && a.stayQuery) {
    trip.detail.stay = true;
    const it = takeStay(trip, a.stay, a.stayQuery);
    it.ai = { at, kind: "suggested" };
    // Verpflegung an der Unterkunft: aus der Suche, sonst laut KI; die Verpflegung unter „Sonstiges“ richtet sich danach
    const o = it.options.at(-1);
    // „ohne Verpflegung“ nur, wenn es die Unterkunft sagt: eine Vermutung der KI übernimmt die App nicht
    if (o && !o.stay?.board && a.board && a.board !== "self") o.stay = { ...(o.stay || {}), board: a.board };
  }
  trip.ai = { at };
  trip.food = { ...(trip.food || {}), on: true };
  // Schätzungen der KI als Posten, als Richtwert markiert
  const est = (cat: Item["cat"], name: string, eur: number) => estimateItem(cat, name, eur, { at, kind: "created" });
  if (a.arrival) { trip.detail.transport = true; trip.items.push({ ...est("transport", a.arrival.label || t("ai.ownArrival"), a.arrival.eur), arrival: true }); }
  if (a.transport) { trip.detail.transport = true; trip.items.push(est("transport", a.transport.label || t("ai.transport"), a.transport.eur)); }
  if (a.extras?.length) { trip.detail.attractions = true; a.extras.forEach(x => trip.items.push(est("attractions", x.name, x.eur))); }
}

/** Familien des Vorschlags → Familie in der Reise (bekannte über das Kürzel, neue über die Platzhalter) */
function familiesOf(trip: Trip, a: AgentTrip): Map<string, NonNullable<AgentTrip["groups"]>[number]> {
  const out = new Map<string, NonNullable<AgentTrip["groups"]>[number]>();
  const keys = groupKeys(trip);
  for (const g of a.groups || []) {
    const hh = keys.get(g.key) ?? trip.travelers.find(p => (p as Traveler & { group?: string }).group === g.key)?.household;
    if (hh) out.set(hh, g);
  }
  // Hilfsfeld der Platzhalter wieder entfernen (gehört nicht in die Reise)
  trip.travelers.forEach(p => delete (p as Traveler & { group?: string }).group);
  return out;
}

/** Reisende mit eigenem Sitz der Reihe nach verteilen (Babys fliegen bei einem Erwachsenen mit und zählen nicht); hh: nur diese Familie */
function seatQueue(trip: Trip, hh?: string) {
  const ids = flyers(trip).filter(p => (!hh || hhKey(p) === hh) && !(p.age != null && (p.age as unknown) !== "" && p.age < 2) && p.kind !== "infant").map(p => p.id);
  let k = 0;
  return (n: number) => { const part = ids.slice(k, k + n); k += n; return part; };
}

/**
 * Flug in kleinen Buchungen: je höchstens `seats` Reisende ein Flugposten mit ihnen als Teilnehmern,
 * Preis pro Platz mal Personen. Name „Flug DUS – PMI (2/5)“.
 */
export function takeBookings(trip: Trip, b: FlightBooking, ids: string[], ai: AiMark): Item[] {
  const o = b.offer, per = o.price / Math.max(1, b.seats);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += Math.max(1, b.seats)) chunks.push(ids.slice(i, i + Math.max(1, b.seats)));
  const base = t("fl.nameRoute", { a: o.out.fromCity || o.out.from, b: o.out.toCity || o.out.to });
  return chunks.map((part, i) => {
    const opt = offerToOption(o);
    opt.price = { ...opt.price, unit: Math.round(per * part.length * 100) / 100 };
    const item: Item = { id: uid(), cat: "flights", name: chunks.length > 1 ? `${base} (${i + 1}/${chunks.length})` : base, status: "idea", options: [opt], participants: part, ai: { ...ai } };
    trip.items.push(item);
    return item;
  });
}

/** Schätzung der KI als Posten, als Richtwert markiert */
export function estimateItem(cat: Item["cat"], name: string, eur: number, ai?: AiMark): Item {
  return {
    id: uid(), cat, name, status: "idea", ...(ai ? { ai } : {}),
    options: [{ id: uid(), label: "", estimate: true, source: { name: t("ai.estimate") }, price: { mode: "unit", currency: "EUR", unit: eur } }]
  };
}

/**
 * Antwort der KI in die offene Reise übernehmen (nach Bestätigung): Ziel und Daten, Posten entfernen, ersetzen
 * (an derselben Stelle) oder ergänzen. Alles, was die KI anlegt, ist markiert.
 */
export function applyEdit(trip: Trip, e: AgentEdit) {
  const at = new Date().toISOString();
  const fixed = (id: string) => { const i = trip.items.find(x => x.id === id); return !i || i.status === "booked" || i.status === "paid"; };
  if (e.trip) {
    if (e.trip.place) trip.place = e.trip.place;
    if (e.trip.country) trip.country = e.trip.country;
    if (e.trip.from) trip.from = e.trip.from;
    if (e.trip.to) trip.to = e.trip.to;
  }
  trip.detail ||= {};
  /** neuen Posten markieren; ersetzt er einen alten, nimmt er dessen Platz ein (Mitflieger folgen ihm) */
  const place = (it: Item, kind: AiMark["kind"], replaces?: string) => {
    trip.items = trip.items.filter(x => x !== it);
    const k = replaces && !fixed(replaces) ? trip.items.findIndex(x => x.id === replaces) : -1;
    it.ai = { at, kind: k < 0 ? kind : "changed" };
    if (k < 0) { trip.items.push(it); return; }
    const old = trip.items[k];
    if (old.participants && !it.participants) it.participants = [...old.participants];
    trip.items.splice(k, 1, it);
    for (const x of trip.items) if (x.follow === old.id) x.follow = it.id;
  };
  const seat = seatQueue(trip);
  for (const f of e.flights || []) {
    trip.detail.flights = true;
    if (!f.seats || !f.travelers) { place(takeOffer(trip, f.offer), "suggested", f.replaces); continue; }
    // aufgeteilt: erste Buchung an die Stelle des ersetzten Postens, die weiteren direkt dahinter
    const items = takeBookings(trip, { offer: f.offer, seats: f.seats, travelers: f.travelers }, seat(f.travelers), { at, kind: "suggested" });
    place(items[0], "suggested", f.replaces);
    let k = trip.items.indexOf(items[0]);
    for (const it of items.slice(1)) {
      trip.items = trip.items.filter(x => x !== it);
      it.ai = { at, kind: items[0].ai!.kind };
      trip.items.splice(++k, 0, it);
    }
  }
  for (const s of e.stays || []) {
    trip.detail.stay = true;
    // nicht in einen leeren Unterkunftsposten legen (takeStay tut das), damit „ersetzt“ eindeutig bleibt
    const it = takeStay(trip, s.offer, s.q);
    place(it, "suggested", s.replaces);
  }
  for (const x of e.estimates || []) { trip.detail[x.cat] = true; place({ ...estimateItem(x.cat, x.name, x.eur), ...(x.arrival ? { arrival: true } : {}) }, "created", x.replaces); }
  const gone = new Set((e.remove || []).filter(id => !fixed(id)));
  if (gone.size) {
    trip.items = trip.items.filter(i => !gone.has(i.id));
    for (const x of trip.items) if (x.follow && gone.has(x.follow)) x.follow = undefined;
  }
  trip.ai = { at };
}

/**
 * Vorschlag als fertige Reise, ohne etwas zu speichern: so, wie sie beim Übernehmen entsteht (mit Verpflegung und
 * Anreise zum Flughafen). Für den Gesamtpreis auf der Karte; ohne Orts- und Länderdaten ohne Verpflegung.
 */
export function previewTrip(base: Trip, a: AgentTrip, g?: GeoData): Trip {
  const trip: Trip = JSON.parse(JSON.stringify(base));
  trip.items = [];
  takeAgentTrip(trip, a);
  if (g?.world.length) syncFood(trip, g);
  return trip;
}
