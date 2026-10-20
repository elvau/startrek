/*
 * Reise per KI importieren (#457): Angebotsdaten → Posten der Reise. Flug und Unterkunft werden eingetragen wie von
 * Hand: Preis laut Angebot, Anbieter, Datum, Link zum Original; gekennzeichnet als importiert (nicht live prüfbar).
 * Pauschalreise (#188): Flug, Unterkunft und enthaltener Transfer bekommen dieselbe Paket-Kennung, der Paketpreis
 * steht an der Unterkunft, die anderen Teile kosten 0 € (Paket aufbrechen: #460). Nebenkosten hängen an Flug bzw. Unterkunft.
 */
import { t } from "../i18n/index.svelte";
import { uid, type Extra, type FlightLeg, type Item, type Option, type Traveler, type Trip } from "../model";
import { animalName, nextAnimal, placeholderTravelers } from "../placeholders";
import type { ImportedOffer, ImportLeg } from "./ai";
import { checks } from "./review";

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
      const kind = p.age == null ? "adult" : p.age < 2 ? "infant" : p.age < 18 ? "child" : "adult";
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
  const kids = Math.max(o.childAges?.length || 0, o.children || 0);
  if (!o.adults && !kids) return;
  const animal = nextAnimal();
  const list = placeholderTravelers([{ animal, adults: o.adults || 1, kids }]);
  let k = 0;
  for (const p of list) if (p.kind === "child") { const age = o.childAges?.[k++]; if (age != null) p.age = age; }
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

/** Angebot in die (neue) Reise übernehmen: Ziel, Daten, Reisende, Posten */
export function importToTrip(trip: Trip, o: ImportedOffer, at = new Date().toISOString(), keep = false) {
  importParty(trip, o);
  const legs = o.flights?.legs || [];
  // keep: in eine bestehende Reise (Paket-Dialog, #188): Ziel, Daten und Name nur, wenn noch leer
  if ((o.place || o.stay?.place) && !(keep && trip.place)) trip.place = o.place || o.stay!.place!;
  if (o.country && !(keep && trip.country)) trip.country = o.country;
  if (!(keep && trip.from)) trip.from = o.from || legs.find(l => l.dir === "out")?.dep?.slice(0, 10) || trip.from;
  if (!(keep && trip.to)) trip.to = o.to || (trip.from && o.nights ? addDays(trip.from, o.nights) : undefined) || legs.filter(l => l.dir === "back").at(-1)?.dep?.slice(0, 10) || trip.to;
  if (o.title && !(keep && trip.autoName === false)) { trip.name = o.title; trip.autoName = false; }
  trip.detail ||= {};
  const mark = { at, kind: "imported" as const };
  const cur = o.price?.currency || "EUR";
  const people = Math.max(1, trip.travelers.filter(p => p.active !== false).length);
  const total = o.price?.total ?? (o.price?.perPerson ? Math.round(o.price.perPerson * people * 100) / 100 : undefined);
  const pkg = !!(legs.length && o.stay && !o.flights?.price && !o.stay.price && total && (o.kind === "package" || o.kind === "other"));
  // Pauschalreise (#188): gemeinsame Paket-Kennung, Preis an der Unterkunft
  const pkgId = pkg ? uid() : "";
  const unit = (v: number | undefined) => ({ mode: "unit" as const, currency: cur, unit: v ?? 0 });
  const items: Item[] = [];
  let flight: Option | undefined, stay: Option | undefined;

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
  if (o.stay) {
    const s = o.stay;
    const price = pkg ? total : s.price ?? (o.kind === "stay" ? total : undefined);
    stay = {
      id: uid(), label: s.name || t("imp.stay"),
      ...(s.place ? { detail: s.place } : {}), ...(pkg ? { pkg: { id: pkgId, main: true } } : {}),
      price: { ...unit(price), basis: "stay", capacity: people },
      source: sourceOf(o, at),
      stay: { ...(s.stars ? { stars: s.stars } : {}), ...(s.board ? { board: s.board } : {}), ...(s.boards ? { boards: s.boards.map(x => ({ ...x })) } : {}), ...(s.freeCancel ? { freeCancel: true } : {}) },
      ...(s.name ? { loc: { q: [s.name, s.place || o.place].filter(Boolean).join(", ") } } : {})
    };
    items.push({ id: uid(), cat: "stay", name: s.name || t("st.itemName", { place: trip.place || s.place || "" }), status: "idea", options: [stay], ai: mark, ...(trip.from && trip.to ? { from: trip.from, to: trip.to } : {}) });
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
    const to = (x.kind === "bag" || x.kind === "seat" ? flight || stay : stay || flight);
    if (to) (to.extras ||= []).push(extra(x, o));
  }
  // unsichere Angaben (#458): Posten als „bitte prüfen“ markieren
  const unsure = checks(o);
  for (const it of items) if ((it.cat === "flights" && unsure.flights) || (it.cat === "stay" && unsure.stay) || (it.hint === "transfer" && unsure.transfer)) it.check = true;
  trip.items.push(...items);
  if (!(keep && trip.offer)) trip.offer = {
    at, kind: o.kind, items: items.map(i => i.id),
    ...(o.provider ? { provider: o.provider } : {}), ...(o.url ? { url: o.url } : {}), ...(o.price ? { price: { ...o.price } } : {}), ...(o.validUntil ? { validUntil: o.validUntil } : {})
  };
  trip.ai = { at };
  trip.food = { ...(trip.food || {}), on: true };
  return items;
}
