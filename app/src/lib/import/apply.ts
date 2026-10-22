/*
 * Reise per KI importieren (#457): Angebotsdaten → Posten der Reise. Flug und Unterkunft werden eingetragen wie von
 * Hand: Preis laut Angebot, Anbieter, Datum, Link zum Original; gekennzeichnet als importiert (nicht live prüfbar).
 * Pauschalreise (#188): Flug, Unterkunft und enthaltener Transfer bekommen dieselbe Paket-Kennung, der Paketpreis
 * steht an der Unterkunft, die anderen Teile kosten 0 € (Paket aufbrechen: #460). Nebenkosten hängen an Flug bzw. Unterkunft.
 * Kreuzfahrt (#525): Posten wie „Neue Kreuzfahrt“ mit Route aus dem Angebot; sie trägt den Paketpreis statt der Unterkunft.
 */
import { t } from "../i18n/index.svelte";
import { AGE, isActive, uid, type AiMark, type Extra, type FlightLeg, type Item, type Option, type Port, type Traveler, type Trip } from "../model";
import { suggestCabins, syncCruise } from "../cruise";
import { animalName, nextAnimal, partyTravelers } from "../placeholders";
import type { ImportCruise, ImportedOffer, ImportLeg } from "./ai";
import { checks, partyOf } from "./review";

const COLORS = ["#D2693C", "#2F6FDB", "#C0487A", "#1F8A70", "#D08A12", "#7A5AC8"];
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const known = (trip: Trip) => trip.travelers.length > 1 || trip.travelers.some(p => !p.placeholder);

/** Reisende aus dem Angebot bzw. der Liste, wenn die Reise noch keine hat (sonst bleiben die eingetragenen) */
export function importParty(trip: Trip, o: ImportedOffer) {
  if (known(trip)) return;
  if (o.travelers?.length) {
    const used: string[] = [];
    const fam = new Map<string, string>();
    trip.travelers = o.travelers.map((p): Traveler => {
      let hh = p.household || "";
      // ohne Familienname: alle ohne Angabe in eine Tierfamilie
      if (!hh) { if (!used.length) used.push(nextAnimal()); hh = animalName(used[0]); }
      if (!fam.has(hh)) fam.set(hh, COLORS[fam.size % COLORS.length]);
      const kind = p.age == null ? "adult" : p.age < AGE.child ? "infant" : p.age < AGE.adult ? "child" : "adult";
      return { id: uid(), name: p.name, household: hh, color: fam.get(hh), ...(p.age != null ? { age: p.age } : { kind }) };
    });
    // Kinder, die nur als Alter im Angebot stehen (nicht in der Namensliste), nicht verlieren (#474)
    const minors = trip.travelers.filter(p => p.age != null ? p.age < 18 : p.kind !== "adult").length;
    const rest: (number | undefined)[] = (o.childAges || []).slice(minors);
    while (rest.length + minors < (o.children || 0)) rest.push(undefined);
    if (rest.length) {
      const first = trip.travelers[0];
      rest.forEach((age, k) => trip.travelers.push({ id: uid(), name: t("ph.child", { a: first.household, k: minors + k + 1 }), household: first.household, color: first.color, ...(age != null ? { age } : { kind: "child" as const }), placeholder: true }));
    }
    return;
  }
  const party = partyOf(o);
  if (!party.adults && !party.kids && !party.infants) return;
  const animal = nextAnimal();
  const list = partyTravelers({ adults: party.adults || 1, kids: party.kids, infants: party.infants, kind: o.partyKind }, animal);
  // bekannte Alter: 2–11 an die Kinder, unter 2 an die Kleinkinder (ab 12 zählen sie zu den Erwachsenen)
  const ages = o.childAges || [];
  const older = ages.filter(a => a >= AGE.child && a < AGE.adult), young = ages.filter(a => a < AGE.child);
  for (const p of list) {
    const age = p.kind === "child" ? older.shift() : p.kind === "infant" ? young.shift() : undefined;
    if (age != null) p.age = age;
  }
  trip.travelers = list;
}

function leg(l: ImportLeg, trip: Trip): FlightLeg {
  const fallback = (l.dir === "back" ? trip.to : trip.from) || "";
  const dep = l.dep || fallback, arr = l.arr || (l.dep ? l.dep.slice(0, 10) : fallback);
  return { dir: l.dir, from: l.from, to: l.to, dep, arr, ...(l.carrier ? { carrier: l.carrier } : {}) };
}

const sourceOf = (o: ImportedOffer, at: string): NonNullable<Option["source"]> =>
  ({ name: o.provider || t("imp.source"), at: at.slice(0, 10), imported: true, ...(o.url ? { url: o.url } : {}) });

function extra(x: NonNullable<ImportedOffer["extras"]>[number], o: ImportedOffer): Extra {
  return { id: uid(), kind: x.kind, ...(x.label ? { label: x.label } : {}), amount: x.amount, basis: x.basis, pay: x.pay, source: o.provider || t("imp.source") };
}

/**
 * Kreuzfahrt aus Angebot oder Suche (#525, #519): Kabinen nach Familien wie bei „Neue Kreuzfahrt“. Preis je Kabine bzw.
 * Person laut Angebot, sonst der Gesamtpreis nach Personen auf die Kabinen verteilt (Rest an die letzte, damit die Summe stimmt).
 */
export function cruiseItem(trip: Trip, c: ImportCruise, o: { total?: number; cur: string; source: Option["source"]; mark: AiMark; pkg?: Option["pkg"] }): Item {
  const people = trip.travelers.filter(isActive);
  const cabins = suggestCabins(people, c.cabin || "inside");
  if (c.price && o.total == null) for (const x of cabins) { x.price = c.price; if (c.per === "person") x.per = "person"; }
  else if (o.total) {
    const n = Math.max(1, people.length), total = o.total;
    let left = total;
    cabins.forEach((x, i) => { x.price = i === cabins.length - 1 ? Math.round(left * 100) / 100 : Math.round(total * x.who.length / n * 100) / 100; left -= x.price; });
  }
  const opt: Option = { id: uid(), label: [c.line, c.ship].filter(Boolean).join(" · ") || t("cr.label"), ...(o.pkg ? { pkg: o.pkg } : {}),
    price: { mode: "unit", basis: "stay", currency: o.cur, unit: 0 }, source: o.source, cabins };
  const it: Item = { id: uid(), cat: "stay", name: c.ship || t("cr.new"), status: "idea", icon: "ship", options: [opt], ai: o.mark,
    cruise: { ...(c.line ? { line: c.line } : {}), ...(c.ship ? { ship: c.ship } : {}), ports: cruisePorts(c, trip.from, trip.to) } };
  syncCruise(it);
  return it;
}

const cruisePorts = (c: ImportCruise, from?: string, to?: string): Port[] => {
  const ps: Port[] = c.ports.map(p => ({ date: p.date || "", ...(p.place ? { place: p.place } : {}), ...(p.arr ? { arr: p.arr } : {}), ...(p.dep ? { dep: p.dep } : {}), ...(p.sea ? { sea: true } : {}) }));
  if (!ps.length) return [{ date: from || "" }, { date: to || "" }];
  if (!ps[0].date && from) ps[0].date = from;
  if (!ps[ps.length - 1].date && to) ps[ps.length - 1].date = to;
  return ps;
};

/** Angebot in die (neue) Reise übernehmen: Ziel, Daten, Reisende, Posten */
export function importToTrip(trip: Trip, o: ImportedOffer, at = new Date().toISOString(), keep = false) {
  importParty(trip, o);
  const legs = o.flights?.legs || [];
  // keep: in eine bestehende Reise (Paket-Dialog, #188): Ziel, Daten und Name nur, wenn noch leer
  const cr = o.cruise, crDays = (cr?.ports || []).map(p => p.date).filter((d): d is string => !!d).sort();
  const crPlace = cr?.ports.find(p => p.place)?.place;
  if ((o.place || o.stay?.place || crPlace) && !(keep && trip.place)) trip.place = o.place || o.stay?.place || crPlace!;
  if (o.country && !(keep && trip.country)) trip.country = o.country;
  if (!(keep && trip.from)) trip.from = o.from || legs.find(l => l.dir === "out")?.dep?.slice(0, 10) || crDays[0] || trip.from;
  if (!(keep && trip.to)) trip.to = o.to || (trip.from && o.nights ? addDays(trip.from, o.nights) : undefined) || legs.filter(l => l.dir === "back").at(-1)?.dep?.slice(0, 10) || crDays.at(-1) || trip.to;
  if (o.title && !(keep && trip.autoName === false)) { trip.name = o.title; trip.autoName = false; }
  trip.detail ||= {};
  const mark = { at, kind: "imported" as const };
  const cur = o.price?.currency || "EUR";
  const people = Math.max(1, trip.travelers.filter(p => p.active !== false).length);
  const total = o.price?.total ?? (o.price?.perPerson ? Math.round(o.price.perPerson * people * 100) / 100 : undefined);
  const pkg = !!(legs.length && (cr || o.stay) && !o.flights?.price && !o.stay?.price && total && (o.kind === "package" || o.kind === "other" || o.kind === "cruise"));
  // Pauschalreise (#188): gemeinsame Paket-Kennung, Preis an der Unterkunft
  const pkgId = pkg ? uid() : "";
  const unit = (v: number | undefined) => ({ mode: "unit" as const, currency: cur, unit: v ?? 0 });
  const items: Item[] = [];
  let flight: Option | undefined, stay: Option | undefined, cruise: Option | undefined;

  if (legs.length) {
    const out = legs.find(l => l.dir === "out") || legs[0];
    const price = pkg ? 0 : o.flights!.price ?? (o.kind === "flight" ? total : undefined);
    const b = o.flights!.baggage;
    flight = {
      id: uid(), label: [out.carrier, out.flightNo].filter(Boolean).join(" ") || t("imp.flight"),
      ...(pkg ? { pkg: { id: pkgId } } : {}),
      price: unit(price), source: sourceOf(o, at), legs: legs.map(l => leg(l, trip)),
      ...(b ? { baggage: { personal: people, cabin: (b.cabin ?? 0) * people, checked: (b.checked ?? 0) * people } } : {})
    };
    items.push({ id: uid(), cat: "flights", name: t("fl.nameRoute", { a: out.from, b: out.to }), status: "idea", options: [flight], ai: mark });
    trip.detail.flights = true;
  }
  if (cr) {
    // ohne eigenen Kreuzfahrtpreis trägt sie den Preis laut Angebot (allein oder als Paket mit Flug)
    const price = pkg ? total : cr.price ? undefined : (o.flights?.price || o.stay?.price) ? undefined : total;
    const it = cruiseItem(trip, cr, { total: price, cur, source: sourceOf(o, at), mark, ...(pkg ? { pkg: { id: pkgId, main: true } } : {}) });
    cruise = it.options[0];
    items.push(it);
    trip.detail.stay = true;
  }
  if (o.stay) {
    const s = o.stay;
    // Pauschalreise ohne Flugdaten (nur „mit Flug“): Paketpreis an der Unterkunft, sonst stünde sie mit 0 € da
    const flightless = o.kind === "package" && !legs.length;
    const price = pkg && !cr ? total : s.price ?? (!cr && (o.kind === "stay" || flightless) ? total : undefined);
    stay = {
      id: uid(), label: s.name || t("imp.stay"),
      ...(s.place ? { detail: s.place } : {}), ...(pkg && !cr ? { pkg: { id: pkgId, main: true } } : {}),
      price: { ...unit(price), basis: "stay", capacity: people },
      source: sourceOf(o, at),
      stay: { ...(s.stars ? { stars: s.stars } : {}), ...(s.board ? { board: s.board } : {}), ...(s.boards ? { boards: s.boards.map(x => ({ ...x })) } : {}), ...(s.freeCancel ? { freeCancel: true } : {}) },
      ...(s.name ? { loc: { q: [s.name, s.place || o.place].filter(Boolean).join(", ") } } : {})
    };
    items.push({ id: uid(), cat: "stay", name: s.name || t("st.itemName", { place: trip.place || s.place || "" }), status: "idea", options: [stay], ai: mark,
      ...(flightless && !s.price ? { note: t("imp.packagePrice") } : {}), ...(trip.from && trip.to ? { from: trip.from, to: trip.to } : {}) });
    trip.detail.stay = true;
  }
  // Transfer: enthalten → Posten zu 0 €, damit die Schätzung für den Transfer am Ziel entfällt (#420)
  if (o.transfer?.included || o.transfer?.price) {
    items.push({ id: uid(), cat: "transport", name: t("imp.transfer"), hint: "transfer", status: "idea", ai: mark,
      options: [{ id: uid(), label: t("imp.transfer"), ...(o.transfer.included ? (pkg ? { pkg: { id: pkgId } } : { detail: t("imp.inPackage") }) : {}), price: unit(o.transfer.included ? 0 : o.transfer.price), source: sourceOf(o, at) }] });
    trip.detail.transport = true;
  }
  if (o.rental || o.kind === "rental") {
    const r = o.rental || {};
    items.push({ id: uid(), cat: "transport", name: t("imp.rental"), status: "idea", ai: mark,
      options: [{ id: uid(), label: [r.company, r.car].filter(Boolean).join(" · ") || t("imp.rental"), price: unit(r.price ?? (o.kind === "rental" ? total : undefined)), source: sourceOf(o, at) }] });
    trip.detail.transport = true;
  }
  // sonst nichts Bekanntes (z. B. Event, Tour): ein Posten mit dem Preis laut Angebot
  if (!items.length && total) {
    items.push({ id: uid(), cat: "attractions", name: o.title || o.provider || t("imp.offer"), status: "idea", ai: mark, options: [{ id: uid(), label: o.provider || o.title || t("imp.offer"), price: unit(total), source: sourceOf(o, at) }] });
    trip.detail.attractions = true;
  }
  for (const x of o.extras || []) {
    const to = (x.kind === "bag" || x.kind === "seat" ? flight || cruise || stay : cruise || stay || flight);
    if (to) (to.extras ||= []).push(extra(x, o));
  }
  // unsichere Angaben (#458): Posten als „bitte prüfen“ markieren
  const unsure = checks(o);
  for (const it of items) if ((it.cat === "flights" && unsure.flights) || (it.cruise && unsure.cruise) || (it.cat === "stay" && !it.cruise && unsure.stay) || (it.hint === "transfer" && unsure.transfer)) it.check = true;
  trip.items.push(...items);
  if (!(keep && trip.offer)) trip.offer = {
    at, kind: o.kind, items: items.map(i => i.id),
    ...(o.provider ? { provider: o.provider } : {}), ...(o.url ? { url: o.url } : {}), ...(o.price ? { price: { ...o.price } } : {}), ...(o.validUntil ? { validUntil: o.validUntil } : {})
  };
  trip.ai = { at };
  trip.food = { ...(trip.food || {}), on: true };
  return items;
}
