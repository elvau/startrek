/*
 * Reise als PDF in der App: Daten der Reise sammeln (Route mit Kartenbild, Unterkünfte mit Kartenausschnitt, Flüge,
 * Tag für Tag, Kosten je Familie; im Rückblick dazu Kasse und Ausgleich) und als HTML zum Drucken bauen (tripreport.ts).
 */
import { i18n, langInfo, t, tn, autoName, type Key } from "./i18n/index.svelte";
import { activeOption, eur, eurPP, householdShares, type Totals } from "./calc";
import { dayShort, nights, range, time } from "./format";
import type { CatKey, Trip } from "./model";
import { itinerary, KIND_ICON, stayPlace } from "./itinerary";
import { arc, focus, outline, project, mapView, type Route } from "./route";
import { kasseName, ledger } from "./ledger";
import { reportHtml, type ReportData, type ReportMode } from "./tripreport";
import { mapSnap } from "./ui/mapSnap";

const CATS: CatKey[] = ["flights", "stay", "transport", "attractions", "misc"];
const COLOR: Record<CatKey, string> = { flights: "#2F6FDB", stay: "#C0487A", transport: "#1F8A70", attractions: "#D08A12", misc: "#7A5AC8" };
const signed = (v: number) => (Math.abs(v) < 0.5 ? "±0" : `${v > 0 ? "+" : "−"}${eur(Math.abs(v))}`);
const xml = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Route als SVG über einem Kartenbild (wie das Mini-Bild der Startseite, nur groß und mit Namen der Stationen) */
/** worauf das große Bild scharfstellt: mehrere Stationen (Fernreise, Rundreise) wie in der App, Flüge kommen vom Rand */
export const heroPoints = (route: Route) => (focus(route).length > 1 && focus(route).every(p => p.kind === "station") ? focus(route) : outline(route));

export function routeSvg(route: Route, w: number, h: number, bg?: string | null): string {
  const pad = 60;
  const pr = project(heroPoints(route), w, h, pad);
  const path = (i: number) => {
    const s = route.segs[i], a = route.points[s.a], b = route.points[s.b];
    const pts = s.mode === "flight" ? arc(a, b, 24).map(([lon, lat]) => pr({ lat, lon })) : [pr(a), pr(b)];
    return "M" + pts.map(p => p.map(v => v.toFixed(1)).join(" ")).join("L");
  };
  const segs = route.segs.map((s, i) => `<path d="${path(i)}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${s.mode === "flight" ? 'stroke="#2F6FE4" stroke-width="3" stroke-dasharray="7 6"' : 'stroke="#1F9E7A" stroke-width="4.5"'}/>`).join("");
  let n = 0;
  const pts = route.points.map(p => {
    const [x, y] = pr(p);
    if (p.kind === "station") {
      n++;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="#C2457A" stroke="#fff" stroke-width="3"/><text x="${x.toFixed(1)}" y="${(y + 4.5).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">${n}</text>`
        + `<text x="${(x > w - 170 ? x - 19 : x + 19).toFixed(1)}" y="${(y + 5).toFixed(1)}"${x > w - 170 ? ' text-anchor="end"' : ""} font-size="16" font-weight="700" fill="#15202E" stroke="#fff" stroke-width="4" paint-order="stroke">${xml(p.name)}</text>`;
    }
    if (p.kind === "home") return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#4a4a4a" stroke="#fff" stroke-width="2.5"/>`;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#2F6FE4" stroke="#fff" stroke-width="2"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="system-ui,sans-serif"><clipPath id="hc"><rect width="${w}" height="${h}"/></clipPath><g clip-path="url(#hc)">${bg ? `<image href="${bg}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>` : `<rect width="${w}" height="${h}" fill="#E9EEF3"/>`}${segs}${pts}</g></svg>`;
}

/**
 * Tatsächliche Kosten je Bereich: Posten mit erfassten Zahlungen mit deren Summe, gebuchte oder bezahlte Posten ohne
 * erfasste Zahlung mit ihrem Preis, dazu die bestätigten Ausgaben unterwegs (ohne Bereich: Sonstiges). Ideen und nur
 * gewählte Posten zählen nicht (noch nicht ausgegeben).
 */
export function actualByCat(trip: Trip, T: Totals): Record<CatKey, number> {
  const out = { flights: 0, stay: 0, transport: 0, attractions: 0, misc: 0 } as Record<CatKey, number>;
  for (const it of trip.items) {
    if (it.status === "dropped" || !(it.cat in out)) continue;
    const pay = (it.payments || []).reduce((a, p) => a + (p.amount > 0 ? p.amount : 0), 0);
    if (pay > 0) out[it.cat as CatKey] += pay;
    else if (it.status === "booked" || it.status === "paid") out[it.cat as CatKey] += T.items[it.id]?.net || 0;
  }
  for (const e of ledger(trip, T).entries) {
    if (e.kind !== "exp" || (e.state && e.state !== "ok")) continue;
    out[(e.cat && e.cat in out ? e.cat : "misc") as CatKey] += e.v;
  }
  return out;
}

export interface ReportInput { trip: Trip; T: Totals; route: Route; mode: ReportMode; now?: Date }

/** HTML der Zusammenfassung; Kartenbilder werden geladen (Route groß, je Unterkunft ein Ausschnitt), fehlen sie, geht es ohne */
export async function buildReport({ trip, T, route, mode, now = new Date() }: ReportInput): Promise<string> {
  const days = itinerary(trip);
  const W = 1000, H = 540;
  const view = route.points.length > 1 ? mapView(heroPoints(route), W, H, 60) : null;
  const stays = trip.items.filter(i => i.cat === "stay" && i.status !== "dropped").sort((a, b) => (a.from || "~").localeCompare(b.from || "~"));
  const [bg, ...maps] = await Promise.all([
    view ? mapSnap(view, W, H) : Promise.resolve(null),
    ...stays.map(i => { const l = activeOption(i, trip)?.loc; return l?.lat != null && l?.lon != null ? mapSnap({ center: [l.lon, l.lat], zoom: 13 }, 480, 220) : Promise.resolve(null); })
  ]);

  const act = Math.max(1, T.active || trip.travelers.length || 1);
  const n = nights(trip.from, trip.to);
  const stamp = new Intl.DateTimeFormat(langInfo().locale, { day: "numeric", month: "long", year: "numeric" }).format(now);
  const stops = route.points.map(p => ({
    icon: p.kind === "home" ? "🏠" : p.kind === "airport" ? "✈️" : "📍",
    name: p.name,
    sub: p.kind === "station" ? [p.date ? dayShort(p.date) : "", p.nights ? tn("n.nights", p.nights) : ""].filter(Boolean).join(" · ") : p.kind === "home" ? t("rep.home") : ""
  }));
  // ohne Lagedaten (keine Route): Stationen aus dem Tagesplan
  if (!stops.length) {
    let last = "";
    for (const d of days) if (d.place && d.place !== last) { stops.push({ icon: "📍", name: d.place, sub: dayShort(d.date) }); last = d.place; }
  }

  const flights = trip.items.filter(i => i.cat === "flights" && i.status !== "dropped").flatMap(i => {
    const legs = activeOption(i, trip)?.legs || [];
    return legs.filter(l => l.dep).map((l, k) => ({
      route: `${l.from} → ${l.to}`,
      when: `${dayShort(l.dep.slice(0, 10))} ${time(l.dep)}${l.arr ? `–${time(l.arr)}` : ""}`,
      detail: [l.carrier, autoName(i.name)].filter(Boolean).join(" · "),
      price: k === 0 && T.items[i.id]?.net ? eur(T.items[i.id].net) : undefined,
      at: l.dep
    }));
  }).sort((a, b) => a.at.localeCompare(b.at)).map(({ at: _at, ...f }) => f);

  const fam = householdShares(trip, T);
  const data: ReportData = {
    mode, lang: i18n.lang, rtl: i18n.lang === "ar",
    title: trip.name || trip.place || t("trip.untitled"),
    kicker: trip.kicker || undefined,
    badge: t(mode === "plan" ? "rep.badgePlan" : "rep.badgeAfter", { d: stamp }),
    meta: [[trip.place, trip.country].filter(Boolean).join(", "), trip.from && trip.to ? range(trip.from, trip.to) : "", n ? tn("n.nights", n) : "", tn("n.persons", act)].filter(Boolean).join(" · "),
    hero: route.points.length > 1 ? routeSvg(route, W, H, bg) : undefined,
    stops,
    stays: stays.map((i, k) => {
      const o = activeOption(i, trip);
      const nn = i.from && i.to ? nights(i.from, i.to) : 0;
      return {
        name: i.private ? `🏠 ${o?.label || autoName(i.name)}` : o?.label || autoName(i.name) || t("stay.new"),
        place: stayPlace(trip, i),
        when: [i.from && i.to ? `${dayShort(i.from)} – ${dayShort(i.to)}` : "", nn ? tn("n.nights", nn) : ""].filter(Boolean).join(" · "),
        price: T.items[i.id]?.net ? eur(T.items[i.id].net) : undefined,
        status: i.status !== "idea" ? t(`status.${i.status}` as Key) : undefined,
        map: maps[k] || undefined
      };
    }),
    flights,
    days: days.filter(d => d.entries.length || d.title).map(d => ({
      head: t("rep.day", { n: d.n, d: dayShort(d.date) }),
      place: d.place,
      title: d.title || d.auto,
      entries: d.entries.map(e => ({ icon: KIND_ICON[e.kind] || "•", time: e.time, text: [e.text, e.sub].filter(Boolean).join(" · ") }))
    })),
    costs: {
      total: eur(T.total), perPerson: eurPP(T.total / act), fixed: eur(T.fixed), open: eur(T.open),
      extras: T.extras.onsite + T.extras.extra > 0 ? t("rep.extras", { v: eur(T.extras.onsite + T.extras.extra) }) : undefined,
      cats: CATS.map(c => ({ key: c, label: t(`ch.${c}.label` as Key), color: COLOR[c], v: T.byCat[c] || 0, text: eur(T.byCat[c] || 0) })),
      families: fam.map(f => {
        const funds = f.funds.reduce((a, x) => a + x.v, 0);
        return { name: f.name, persons: tn("n.persons", f.members.length), costs: eur(f.costs), funds: funds ? eur(funds) : undefined, due: eur(f.total) };
      })
    },
    L: {
      route: t("rep.route"), stays: t("rep.stays"), flights: t("rep.flights"), days: t("rep.days"), costs: t("rep.costs"), costsAfter: t("rep.costsAfter"),
      total: t("rep.total"), perPerson: t("rep.pp"), fixed: t("rep.fixed"), open: t("rep.open"), byFamily: t("rep.byFamily"),
      famCosts: t("rep.famCosts"), famFunds: t("rep.famFunds"), famDue: t("rep.famDue"), planned: t("rep.planned"), actual: t("rep.actual"),
      diff: t("rep.diff"), spent: t("rep.spent"), kassen: t("rep.kassen"), paid: t("rep.paid"), share: t("rep.share"), bal: t("rep.bal"),
      moves: t("rep.moves"), footer: t("rep.footer")
    }
  };
  if (mode === "after") {
    const L = ledger(trip, T);
    const real = actualByCat(trip, T);
    const spent = CATS.reduce((a, c) => a + real[c], 0);
    data.actual = spent > 0 ? {
      spent: eur(spent),
      pending: L.pending.n ? t("rep.pending", { n: L.pending.n, v: eur(L.pending.v) }) : undefined,
      cats: CATS.filter(c => (T.byCat[c] || 0) > 0 || real[c] > 0).map(c => ({
        label: t(`ch.${c}.label` as Key), color: COLOR[c], plan: T.byCat[c] || 0, actual: real[c],
        planText: eur(T.byCat[c] || 0), actualText: eur(real[c]), diffText: signed(real[c] - (T.byCat[c] || 0)), over: real[c] - (T.byCat[c] || 0) > 0.5
      })),
      kassen: L.rows.map(r => ({ name: kasseName(trip, r.hh), paid: eur(r.paid), share: eur(r.owed), bal: signed(r.bal), plus: r.bal >= -0.5 })),
      moves: L.moves.map(m => t("rep.move", { a: kasseName(trip, m.from), b: kasseName(trip, m.to), v: eur(m.v) }))
    } : { spent: eur(0), cats: [], kassen: [], moves: [], none: t("rep.none") };
  }
  return reportHtml(data);
}
