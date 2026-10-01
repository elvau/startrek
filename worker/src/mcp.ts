/*
 * KI-Konnektor (MCP über HTTP, JSON-RPC): eigener KI-Assistent (Claude, ChatGPT, Cursor …) sucht über Split&Fly
 * und plant Reisen im Konto.
 * Anmeldung mit persönlichem Schlüssel (apikey.ts). Gesucht wird mit unseren Suchen; Angebote merkt sich der
 * Such-Dienst einige Stunden, damit der Assistent sie per Kennung in eine Reise übernehmen kann. Gebucht wird beim Anbieter
 * über den Link des Angebots. Buchungsdaten (Ausweis, Reisepass) gibt es hier nicht.
 */
import { parseQuery } from "../../app/src/lib/flights/search";
import { parseStayQuery } from "../../app/src/lib/stays/search";
import { parseEventQuery } from "../../app/src/lib/events/search";
import { parseActivityQuery } from "../../app/src/lib/activities/search";
import type { FlightOffer, FlightQuery, SearchResult } from "../../app/src/lib/flights/types";
import type { StayOffer, StayQuery, StaySearchResult } from "../../app/src/lib/stays/types";
import type { EventQuery, EventSearchResult } from "../../app/src/lib/events/types";
import type { ActivityQuery, ActivitySearchResult } from "../../app/src/lib/activities/types";
import type { Trip } from "../../app/src/lib/model";
import { addCost, addFlight, addStay, isCat, LANGS, newTrip, removeItem, tripSummary } from "../../app/src/lib/connector/trips";
import { canEdit, roleOf, type TripRecord, type TripStore } from "./firestore";
import type { KeyInfo } from "./apikey";

export interface McpDeps {
  flights: (q: FlightQuery) => Promise<SearchResult>;
  stays: (q: StayQuery) => Promise<StaySearchResult>;
  events: (q: EventQuery) => Promise<EventSearchResult>;
  activities: (q: ActivityQuery) => Promise<ActivitySearchResult>;
  /** Reisen im Konto; null: nur Suchen */
  store: TripStore | null;
  /** gefundene Angebote merken (je Schlüssel, einige Stunden) */
  offers: { put: (id: string, v: Saved) => Promise<void>; get: (id: string) => Promise<Saved | null> };
  /** zählt eine Suche mit; Fehlermeldung, wenn das Tageslimit erreicht ist */
  allowSearch: () => Promise<string | null>;
  version: string;
  today?: string;
}

export type Saved = { kind: "flight"; offer: FlightOffer } | { kind: "stay"; offer: StayOffer; q: StayQuery };

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SHOWN = 8;

const INSTRUCTIONS = [
  "Split&Fly plans group trips and splits the costs fairly. Use these tools to search real flights, accommodation, events and tours, and to plan trips in the user's Split&Fly account.",
  "Search results have an id; add an offer to a trip with add_flight or add_stay (ids stay valid for a few hours). Prices are totals for all travelers in the given currency.",
  "Split&Fly does not book: each offer has a link to the provider, where the user books. Never ask for passport or ID data.",
  "Items you add are marked in the app as suggested or created by AI. The app shows the exact split per person and family."
].join(" ");

const str = (d: string) => ({ type: "string", description: d });
const int = (d: string, min: number, max: number) => ({ type: "integer", description: d, minimum: min, maximum: max });
const ages = { type: "array", items: { type: "integer", minimum: 0, maximum: 17 }, description: "Ages of the children (0-17), one per child" };
const lang = { type: "string", enum: LANGS, description: "Language for item names in the app (default de)" };

const SEARCH_TOOLS = [
  {
    name: "search_flights", title: "Search flights",
    description: "Search real round-trip or one-way flights for all travelers. Returns the cheapest offers with id, total price and booking link.",
    inputSchema: { type: "object", properties: {
      from: { type: "array", items: { type: "string" }, description: "IATA codes of departure airports (1-3), e.g. [\"DUS\",\"CGN\"]" },
      to: { type: "array", items: { type: "string" }, description: "IATA codes of destination airports (1-3)" },
      depart: str("Outbound date YYYY-MM-DD"), return: str("Return date YYYY-MM-DD (omit for one-way)"),
      adults: int("Adults", 1, 9), childAges: ages, maxStops: int("Maximum stops per direction (default 1)", 0, 2),
      bags: { type: "boolean", description: "Include a checked bag per person" }
    }, required: ["from", "to", "depart", "adults"] }
  },
  {
    name: "search_stays", title: "Search accommodation",
    description: "Search real accommodation (hotels, apartments) for all travelers. Returns offers with id, total price for the whole stay and booking link.",
    inputSchema: { type: "object", properties: {
      place: str("City or region"), country: str("Country (English)"), checkin: str("YYYY-MM-DD"), checkout: str("YYYY-MM-DD"),
      adults: int("Adults", 1, 20), childAges: ages, rooms: int("Rooms (default: one per two adults)", 1, 10),
      type: { type: "string", enum: ["all", "hotel", "whole"], description: "all, hotel or whole (apartment/house)" }
    }, required: ["place", "checkin", "checkout", "adults"] }
  },
  {
    name: "search_events", title: "Search events",
    description: "Concerts, sports and shows in a city in a date range (Ticketmaster, football fixtures).",
    inputSchema: { type: "object", properties: { city: str("City"), from: str("YYYY-MM-DD"), to: str("YYYY-MM-DD"), keyword: str("Optional keyword, e.g. a band or team") }, required: ["city"] }
  },
  {
    name: "search_tours", title: "Search tours and tickets",
    description: "Bookable tours, attractions and tickets at a destination (Viator).",
    inputSchema: { type: "object", properties: { place: str("City or region"), from: str("YYYY-MM-DD"), to: str("YYYY-MM-DD"), language: lang }, required: ["place"] }
  }
];

const TRIP_TOOLS = [
  { name: "list_trips", title: "List trips", description: "Trips in the user's Split&Fly account (own and shared).", inputSchema: { type: "object", properties: {} } },
  { name: "get_trip", title: "Show trip", description: "Destination, dates, number of travelers (no names) and all items with id, status and price.", inputSchema: { type: "object", properties: { tripId: str("Trip id") }, required: ["tripId"] } },
  {
    name: "create_trip", title: "Create trip",
    description: "Create a new trip in the user's account with placeholder travelers (the user can replace them with real people in the app).",
    inputSchema: { type: "object", properties: {
      place: str("Destination"), country: str("Country"), name: str("Trip name (default: destination)"), from: str("Arrival YYYY-MM-DD"), to: str("Departure YYYY-MM-DD"),
      adults: int("Adults", 1, 20), childAges: ages, language: lang
    }, required: ["place", "adults"] }
  },
  { name: "add_flight", title: "Add flight to trip", description: "Add a flight offer from search_flights to a trip.", inputSchema: { type: "object", properties: { tripId: str("Trip id"), offerId: str("Offer id from search_flights"), language: lang }, required: ["tripId", "offerId"] } },
  { name: "add_stay", title: "Add accommodation to trip", description: "Add an accommodation offer from search_stays to a trip.", inputSchema: { type: "object", properties: { tripId: str("Trip id"), offerId: str("Offer id from search_stays"), language: lang }, required: ["tripId", "offerId"] } },
  {
    name: "add_cost", title: "Add cost to trip",
    description: "Add another cost (rental car, tickets, own arrival by car, an estimate) to a trip, in EUR.",
    inputSchema: { type: "object", properties: {
      tripId: str("Trip id"), category: { type: "string", enum: ["flights", "stay", "transport", "attractions", "misc"], description: "flights, stay, transport (rental car, transfers, own arrival), attractions, misc" },
      name: str("Short name"), amountEur: { type: "number", description: "Amount in EUR", minimum: 0 },
      perPerson: { type: "boolean", description: "true: amount per person; false (default): total for the group" }, link: str("Optional https link (e.g. ticket shop)")
    }, required: ["tripId", "category", "name", "amountEur"] }
  },
  { name: "remove_item", title: "Remove item", description: "Remove an item from a trip (booked or paid items stay).", inputSchema: { type: "object", properties: { tripId: str("Trip id"), itemId: str("Item id from get_trip") }, required: ["tripId", "itemId"] } }
];

const READ_ONLY = new Set(["search_flights", "search_stays", "search_events", "search_tours", "list_trips", "get_trip"]);

export function toolList(deps: Pick<McpDeps, "store">) {
  return [...SEARCH_TOOLS, ...(deps.store ? TRIP_TOOLS : [])].map(t => ({ ...t, annotations: { readOnlyHint: READ_ONLY.has(t.name), openWorldHint: t.name.startsWith("search_") } }));
}

class ToolError extends Error {}
const fail = (m: string): never => { throw new ToolError(m); };

/** eine JSON-RPC-Nachricht beantworten; null bei Benachrichtigungen (ohne id) */
export async function mcpMessage(msg: any, user: KeyInfo, deps: McpDeps): Promise<object | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Invalid request" } };
  if (msg.id === undefined) return null;
  const ok = (result: object) => ({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize": {
      const want = msg.params?.protocolVersion;
      return ok({
        protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "splitandfly", title: "Split&Fly", version: deps.version },
        instructions: INSTRUCTIONS + (deps.store ? "" : " Trip tools are not available yet; only search.")
      });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: toolList(deps) });
    case "tools/call": {
      const name = msg.params?.name, args = msg.params?.arguments || {};
      if (!toolList(deps).some(t => t.name === name)) return { jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: `Unknown tool: ${name}` } };
      try {
        const out = await callTool(name, args, user, deps);
        return ok({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out });
      } catch (e) {
        const m = e instanceof ToolError ? e.message : `Fehler: ${(e as Error).message}`;
        return ok({ content: [{ type: "text", text: m }], isError: true });
      }
    }
    default: return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
  }
}

const S = (v: unknown, n = 80) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const codes = (v: unknown) => (Array.isArray(v) ? v : [v]).filter(x => typeof x === "string").map(x => (x as string).trim().toUpperCase()).filter(x => /^[A-Z]{3}$/.test(x)).slice(0, 3);
const kids = (v: unknown) => (Array.isArray(v) ? v.filter(a => Number.isInteger(a) && a >= 0 && a <= 17).slice(0, 10) as number[] : []);
const lng = (v: unknown) => (typeof v === "string" && LANGS.includes(v) ? v : "de");
const hm = (iso: string) => iso.slice(0, 16).replace("T", " ");

async function callTool(name: string, a: any, user: KeyInfo, deps: McpDeps): Promise<object> {
  const today = deps.today || new Date().toISOString().slice(0, 10);
  if (name.startsWith("search_")) { const no = await deps.allowSearch(); if (no) fail(no); }
  switch (name) {
    case "search_flights": {
      const from = codes(a.from), to = codes(a.to), ch = kids(a.childAges);
      const q = parseQuery({
        from: from[0], fromAirports: from, to: to[0], toAirports: to, depart: a.depart, ...(a.return ? { ret: a.return } : {}),
        adults: a.adults, children: ch.filter(x => x >= 2).length, infants: ch.filter(x => x < 2).length,
        maxStops: Number.isInteger(a.maxStops) ? a.maxStops : 1, bags: a.bags === true, currency: "EUR"
      });
      if (typeof q === "string") fail(q);
      const fq = q as FlightQuery;
      if (fq.depart < today) fail("Date is in the past");
      const res = await deps.flights(fq);
      const top = res.offers.slice(0, SHOWN);
      await Promise.all(top.map(o => deps.offers.put(o.id, { kind: "flight", offer: o })));
      return {
        offers: top.map(o => ({
          id: o.id, priceTotal: Math.round(o.price), currency: o.currency, provider: o.sourceName, link: o.url,
          out: `${o.out.from} ${hm(o.out.dep)} → ${o.out.to} ${hm(o.out.arr)}, ${o.out.stops} stop(s), ${o.out.carriers.join("/")}`,
          ...(o.back ? { back: `${o.back.from} ${hm(o.back.dep)} → ${o.back.to} ${hm(o.back.arr)}, ${o.back.stops} stop(s)` } : {})
        })),
        ...(top.length ? {} : { note: "No flights found" })
      };
    }
    case "search_stays": {
      const adults = a.adults;
      const q = parseStayQuery({
        place: a.place, country: a.country, checkin: a.checkin, checkout: a.checkout, adults, childAges: kids(a.childAges),
        rooms: Number.isInteger(a.rooms) ? a.rooms : Math.max(1, Math.ceil((Number(adults) || 1) / 2)), type: a.type || "all", currency: "EUR"
      });
      if (typeof q === "string") fail(q);
      const sq = q as StayQuery;
      if (sq.checkin < today) fail("Date is in the past");
      const res = await deps.stays(sq);
      const top = res.offers.slice(0, SHOWN);
      await Promise.all(top.map(o => deps.offers.put(o.id, { kind: "stay", offer: o, q: sq })));
      return {
        offers: top.map(o => ({
          id: o.id, name: o.name, priceTotal: Math.round(o.total), currency: o.currency, provider: o.via || o.sourceName, link: o.url,
          ...(o.score != null ? { rating: o.score } : {}), ...(o.stars ? { stars: o.stars } : {}), ...(o.place ? { area: o.place } : {}),
          ...(o.board ? { board: o.board } : {}), ...(o.facts?.length ? { facts: o.facts } : {})
        })),
        ...(top.length ? {} : { note: "No accommodation found" })
      };
    }
    case "search_events": {
      const q = parseEventQuery({ q: S(a.keyword), city: S(a.city), ...(a.from ? { from: a.from, to: a.to || a.from } : {}) });
      if (typeof q === "string") fail(q);
      const res = await deps.events(q as EventQuery);
      return { events: res.events.slice(0, 15).map(e => ({ name: e.name, start: e.start, venue: e.venue, city: e.city, ...(e.category ? { category: e.category } : {}), link: e.url })) };
    }
    case "search_tours": {
      const q = parseActivityQuery({ place: S(a.place), lang: lng(a.language), ...(a.from ? { from: a.from, to: a.to || a.from } : {}) });
      if (typeof q === "string") fail(q);
      const res = await deps.activities(q as ActivityQuery);
      return { tours: res.activities.slice(0, 15).map(t => ({ title: t.title, price: t.price, currency: t.currency, ...(t.rating ? { rating: t.rating } : {}), ...(t.minutes ? { minutes: t.minutes } : {}), link: t.url })) };
    }
  }
  const store = deps.store || fail("Trips are not available");
  switch (name) {
    case "list_trips": {
      const list = await store!.list(user.uid);
      return { trips: list.map(r => { const t = parse(r); return { id: r.id, name: r.name, place: t?.place, from: t?.from, to: t?.to, role: roleOf(r, user.uid) }; }) };
    }
    case "get_trip": {
      const r = await readable(store!, a.tripId, user.uid);
      return tripSummary(parse(r) || fail("Trip data unreadable"), roleOf(r, user.uid)!);
    }
    case "create_trip": {
      const place = S(a.place);
      if (!place) fail("place is required");
      const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
      const from = day(a.from), to = day(a.to);
      if (from && to && to < from) fail("to is before from");
      const adults = Number.isInteger(a.adults) ? a.adults : 1;
      const trip = newTrip({ name: S(a.name, 120), place, country: S(a.country, 60), from, to, adults, childAges: kids(a.childAges), lang: lng(a.language) });
      trip.ai = { at: new Date().toISOString() };
      await store!.create(trip.id, trip.name, JSON.stringify(trip), user.uid, user.name || "Claude");
      return { tripId: trip.id, ...tripSummary(trip, "owner") };
    }
    case "add_flight":
    case "add_stay": {
      const saved = typeof a.offerId === "string" ? await deps.offers.get(a.offerId) : null;
      if (!saved || saved.kind !== (name === "add_flight" ? "flight" : "stay")) fail("Offer not found or expired: search again and use an id from the results");
      return edit(store!, a.tripId, user, t => {
        const it = saved!.kind === "flight" ? addFlight(t, saved!.offer, lng(a.language)) : addStay(t, saved!.offer, (saved as { q: StayQuery }).q, lng(a.language));
        return { added: it.id, name: it.name };
      });
    }
    case "add_cost": {
      const n = S(a.name, 60), eur = Number(a.amountEur);
      if (!n || !isCat(a.category) || !isFinite(eur) || eur < 0 || eur > 100000) fail("category, name and amountEur (0-100000) are required");
      const link = typeof a.link === "string" && /^https:\/\/[^\s]{4,300}$/.test(a.link) ? a.link : undefined;
      return edit(store!, a.tripId, user, t => {
        const it = addCost(t, { cat: a.category, name: n, eur: Math.round(eur * 100) / 100, perPerson: a.perPerson === true, url: link });
        return { added: it.id, name: it.name };
      });
    }
    case "remove_item":
      return edit(store!, a.tripId, user, t => {
        const r = removeItem(t, String(a.itemId || ""));
        if (r === "missing") fail("Item not found");
        if (r === "fixed") fail("Booked or paid items can only be changed in the app");
        return { removed: a.itemId };
      });
  }
  return fail("Unknown tool");
}

function parse(r: TripRecord): Trip | null {
  try { return JSON.parse(r.data) as Trip; } catch { return null; }
}

async function readable(store: TripStore, id: unknown, uid: string): Promise<TripRecord> {
  if (typeof id !== "string" || !/^[\w-]{1,60}$/.test(id)) fail("tripId is invalid");
  const r = await store.get(id as string);
  if (!r || !roleOf(r, uid)) fail("Trip not found");
  return r!;
}

/** Reise ändern: lesen, ändern, speichern, nur wenn sie inzwischen niemand geändert hat (sonst einmal neu) */
async function edit(store: TripStore, id: unknown, user: KeyInfo, change: (t: Trip) => object): Promise<object> {
  for (let attempt = 0; ; attempt++) {
    const r = await readable(store, id, user.uid);
    if (!canEdit(r, user.uid)) fail("You can only view this trip");
    const t = parse(r) || fail("Trip data unreadable");
    const out = change(t!);
    const data = JSON.stringify(t);
    if (data.length >= 900000) fail("Trip is too large");
    try {
      await store.update(r, (t!.name || r.name).slice(0, 199), data, user.uid);
      return { ...out, tripId: r.id };
    } catch (e) {
      if (!(e as { conflict?: boolean }).conflict || attempt) throw e;
    }
  }
}
