/*
 * KI-Konnektor (MCP über HTTP, JSON-RPC): eigener KI-Assistent (Claude, ChatGPT, Cursor …) sucht über Split&Fly
 * und plant Reisen im Konto.
 * Anmeldung mit persönlichem Schlüssel (apikey.ts). Gesucht wird mit unseren Suchen; Angebote merkt sich der
 * Such-Dienst einige Stunden, damit der Assistent sie per Kennung in eine Reise übernehmen kann. Gebucht wird beim Anbieter
 * über den Link des Angebots. Angaben „Nur für dich“ (travelDocs) gibt es hier nicht.
 */
import { parseQuery } from "../../app/src/lib/flights/search";
import { parseStayQuery } from "../../app/src/lib/stays/search";
import { parseEventQuery } from "../../app/src/lib/events/search";
import type { FlightOffer, FlightQuery, SearchResult } from "../../app/src/lib/flights/types";
import type { StayOffer, StayQuery, StaySearchResult } from "../../app/src/lib/stays/types";
import type { EventQuery, EventSearchResult } from "../../app/src/lib/events/types";
import type { Directory, Person, Traveler, Trip } from "../../app/src/lib/model";
import { addCost, addFlight, addStay, isCat, LANGS, newTrip, removeItem, tripSummary } from "../../app/src/lib/connector/trips";
import { canEdit, roleOf, type TripRecord, type TripStore } from "./firestore";
import { travelersFor, travelersView } from "../../app/src/lib/connector/people";
import { mergePrefs, prefsFor } from "../../app/src/lib/prefs";
import { prefsFromAi } from "../../app/src/lib/agent/agent";
import { STYLES, type Prefs } from "../../app/src/lib/model";
import type { KeyInfo } from "./apikey";
import { ccOf, findCity, searchParts, type GeoData } from "../../app/src/lib/geo/places";
import world from "../../public/world.json";
import packs from "../../public/packs.json";

export interface McpDeps {
  flights: (q: FlightQuery) => Promise<SearchResult>;
  stays: (q: StayQuery) => Promise<StaySearchResult>;
  events: (q: EventQuery) => Promise<EventSearchResult>;
  /** Reisen im Konto; null: nur Suchen */
  store: TripStore | null;
  /** gespeicherte Personen, Gruppen und Vorlieben des Kontos (profiles/{uid}); fehlt: keine */
  profile?: (uid: string) => Promise<Directory | null>;
  /** eigene Vorlieben im Konto ändern (#602): liest, ändert, speichert nur unverändert; gibt die neuen zurück */
  savePrefs?: (uid: string, change: (cur: Prefs) => Prefs) => Promise<Prefs>;
  /** gefundene Angebote merken (je Schlüssel, einige Stunden) */
  offers: { put: (id: string, v: Saved) => Promise<void>; get: (id: string) => Promise<Saved | null> };
  /** zählt eine Suche mit; Fehlermeldung, wenn das Tageslimit erreicht ist */
  allowSearch: () => Promise<string | null>;
  version: string;
  today?: string;
  /** Partner-Links eingeschaltet (sonst Links aus gespeicherten Reisen ohne Partner-Kennung) */
  partner?: boolean;
}

export type Saved = { kind: "flight"; offer: FlightOffer; seats?: number } | { kind: "stay"; offer: StayOffer; q: StayQuery };

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SHOWN = 8;

const INSTRUCTIONS = [
  "Split&Fly plans group trips and splits the costs fairly. Use these tools to search real flights, accommodation and events, and to plan trips in the user's Split&Fly account.",
  "Search results have an id; add an offer to a trip with add_flight or add_stay (ids stay valid for a few hours). Prices are totals for all travelers in the given currency.",
  "Split&Fly does not book: each offer has a link to the provider, where the user books. Never ask for passport or ID data.",
  "Items you add are marked in the app as suggested or created by AI. The app shows the exact split per person and family.",
  "For every flight the app itself adds the way from home to the departure airport and back (own car incl. airport parking, or train, per household from its settings) and meals; never add these as costs.",
  "Searches use the user's saved preferences (own, group, trip) for anything you leave out and always skip countries to avoid; pass tripId to use a trip's preferences, and the result lists appliedPreferences. If the user has none yet, offer to set up a short travel profile by asking about airports, budget, accommodation, meals, travel style and countries to avoid, then save it with save_my_preferences after they confirmed. Wishes for one trip only go to set_trip_preferences.",
  "Ask instead of guessing: call get_my_travelers first (families with children's ages, saved groups, preferences). If destination, time frame, who travels, budget or kind of trip are still unclear, ask the user short questions, each with 2-4 concrete options plus 'something else', before creating a trip. Never invent travelers or children's ages; state any remaining assumption explicitly."
].join(" ");

const str = (d: string) => ({ type: "string", description: d });
const int = (d: string, min: number, max: number) => ({ type: "integer", description: d, minimum: min, maximum: max });
const ages = { type: "array", items: { type: "integer", minimum: 0, maximum: 17 }, description: "Ages of the children (0-17), one per child" };
const lang = { type: "string", enum: LANGS, description: "Language for item names in the app (default de)" };
/** Vorlieben wie beim KI-Planer (prefsFromAi prüft die Werte) */
const PREFS = {
  airports: { type: "array", items: { type: "string" }, description: "Home airports, IATA codes (1-4)" },
  maxStops: int("Maximum stops per direction", 0, 2), bags: { type: "boolean", description: "Checked bag per person" },
  maxHours: int("Longest flight time per direction in hours", 1, 48),
  stayType: { type: "string", enum: ["all", "hotel", "whole"], description: "Accommodation: all, hotel or whole (apartment/house)" },
  minStars: int("Minimum hotel stars", 1, 5), board: { type: "string", enum: ["self", "breakfast", "half", "full", "all"], description: "Meals: self catering, breakfast, half board, full board, all inclusive" },
  styles: { type: "array", items: { type: "string", enum: STYLES }, description: "Travel styles" },
  budget: { type: "string", enum: ["low", "mid", "high"] }, months: { type: "array", items: { type: "integer", minimum: 1, maximum: 12 }, description: "Usual travel months" },
  nightsMin: int("Usual trip length, nights from", 1, 60), nightsMax: int("Usual trip length, nights up to", 1, 60),
  pet: { type: "boolean", description: "Travels with a pet" }, stepFree: { type: "boolean", description: "Needs step-free access" },
  diet: { type: "string", enum: ["veg", "vegan"] }, avoid: { type: "array", items: { type: "string" }, description: "Countries never to travel to or via (ISO-2 codes)" }
};

const SEARCH_TOOLS = [
  {
    name: "search_flights", title: "Search flights",
    description: "Search real round-trip or one-way flights. Departure airports, stops, bags, flight time and countries to avoid default to the user's preferences (appliedPreferences in the result). A booking holds at most 9 seats; for bigger groups (or cheaper fares) search 2 seats and add the offer with add_flight and travelers, which splits the group into bookings. Returns the cheapest offers with id, total price for the searched seats and booking link.",
    inputSchema: { type: "object", properties: {
      from: { type: "array", items: { type: "string" }, description: "IATA codes of departure airports (1-3), e.g. [\"DUS\",\"CGN\"]" },
      to: { type: "array", items: { type: "string" }, description: "IATA codes of destination airports (1-3)" },
      depart: str("Outbound date YYYY-MM-DD"), return: str("Return date YYYY-MM-DD (omit for one-way)"),
      adults: int("Adults in this booking (max 9)", 1, 9), childAges: ages, maxStops: int("Maximum stops per direction (default: preferences, else 1)", 0, 2),
      bags: { type: "boolean", description: "Include a checked bag per person (default: preferences)" }, maxHours: int("Longest flight time per direction in hours (default: preferences)", 1, 48),
      tripId: str("Use this trip's preferences (default: the user's own)")
    }, required: ["to", "depart", "adults"] }
  },
  {
    name: "search_stays", title: "Search accommodation",
    description: "Search real accommodation (hotels, apartments) for all travelers. Accommodation type and stars default to the user's preferences; countries to avoid are refused. Returns offers with id, total price for the whole stay and booking link.",
    inputSchema: { type: "object", properties: {
      place: str("City or region"), country: str("Country (English)"), checkin: str("YYYY-MM-DD"), checkout: str("YYYY-MM-DD"),
      adults: int("Adults", 1, 20), childAges: ages, rooms: int("Rooms (default: one per two adults)", 1, 10),
      type: { type: "string", enum: ["all", "hotel", "whole"], description: "all, hotel or whole (apartment/house); default: preferences" },
      minStars: int("Minimum hotel stars (default: preferences)", 1, 5), tripId: str("Use this trip's preferences (default: the user's own)")
    }, required: ["place", "checkin", "checkout", "adults"] }
  },
  {
    name: "search_events", title: "Search events",
    description: "Concerts, sports and shows in a city in a date range (Ticketmaster, football fixtures).",
    inputSchema: { type: "object", properties: { city: str("City"), from: str("YYYY-MM-DD"), to: str("YYYY-MM-DD"), keyword: str("Optional keyword, e.g. a band or team") }, required: ["city"] }
  }
];

const TRIP_TOOLS = [
  {
    name: "get_my_travelers", title: "My families and groups",
    description: "The user's saved families (id, adults, children's ages, home town; no names), saved groups (name, families, group preferences) and travel preferences (airports, budget, styles …). Call this before planning, to know who travels instead of guessing.",
    inputSchema: { type: "object", properties: { date: str("Ages as of this day, YYYY-MM-DD (default: today; use the trip start)") } }
  },
  { name: "list_trips", title: "List trips", description: "Trips in the user's Split&Fly account (own and shared).", inputSchema: { type: "object", properties: {} } },
  { name: "get_trip", title: "Show trip", description: "Destination, dates, number of travelers (no names) and all items with id, status and price.", inputSchema: { type: "object", properties: { tripId: str("Trip id") }, required: ["tripId"] } },
  {
    name: "create_trip", title: "Create trip",
    description: "Create a new trip in the user's account. Travelers: saved families or a saved group from get_my_travelers (real people, ages as of the trip start), or, only if the user told you who travels, adults and childAges with travelersFrom 'user' (placeholders the user can replace in the app). If you don't know who travels, ask first.",
    inputSchema: { type: "object", properties: {
      place: str("Destination"), country: str("Country"), name: str("Trip name (default: destination)"), from: str("Arrival YYYY-MM-DD"), to: str("Departure YYYY-MM-DD"),
      families: { type: "array", items: { type: "string" }, description: "Family ids from get_my_travelers (e.g. [\"F1\"])" },
      group: str("Name of a saved group from get_my_travelers"),
      travelersFrom: { type: "string", enum: ["user"], description: "'user': the user told you adults and children's ages in this conversation (only then use adults/childAges)" },
      adults: int("Adults (with travelersFrom 'user')", 1, 20), childAges: ages, language: lang,
      preferences: { type: "object", properties: PREFS, description: "Preferences only for this trip (override the user's and the group's), e.g. holiday home and higher budget this time" }
    }, required: ["place"] }
  },
  {
    name: "add_flight", title: "Add flight to trip",
    description: "Add a flight offer from search_flights to a trip. If the offer was searched for fewer seats than the trip has travelers, or travelers is given, it is added for that many travelers without a flight yet, split into bookings of the searched seat count (one item per booking). Use several offers to put parts of the group on different flights.",
    inputSchema: { type: "object", properties: { tripId: str("Trip id"), offerId: str("Offer id from search_flights"), travelers: int("How many travelers take this flight (default: all without a flight)", 1, 30), language: lang }, required: ["tripId", "offerId"] }
  },
  { name: "add_stay", title: "Add accommodation to trip", description: "Add an accommodation offer from search_stays to a trip.", inputSchema: { type: "object", properties: { tripId: str("Trip id"), offerId: str("Offer id from search_stays"), language: lang }, required: ["tripId", "offerId"] } },
  {
    name: "add_cost", title: "Add cost to trip",
    description: "Add another cost (rental car, transfers at the destination, tickets, an estimate) to a trip, in EUR. Not for the way to the departure airport or airport parking: the app calculates them for every flight.",
    inputSchema: { type: "object", properties: {
      tripId: str("Trip id"), category: { type: "string", enum: ["flights", "stay", "transport", "attractions", "misc"], description: "flights, stay, transport (rental car, transfers, own arrival instead of a flight), attractions, misc" },
      name: str("Short name"), amountEur: { type: "number", description: "Amount in EUR", minimum: 0 },
      perPerson: { type: "boolean", description: "true: amount per person; false (default): total for the group" }, link: str("Optional https link (e.g. ticket shop)"),
      arrival: { type: "boolean", description: "true only if the travelers reach the destination itself without a flight (own car, train, bus all the way); never for the way to the departure airport" },
      estimate: { type: "boolean", description: "true if the amount is an estimate and not a real offer" }
    }, required: ["tripId", "category", "name", "amountEur"] }
  },
  {
    name: "save_my_preferences", title: "Save my travel preferences",
    description: "Save the user's lasting travel preferences in their Split&Fly account (replaces the given fields, keeps the others; countries to avoid are added). Only after you summarized them and the user confirmed in this conversation. Not for wishes that only concern one trip (use set_trip_preferences).",
    inputSchema: { type: "object", properties: PREFS }
  },
  {
    name: "set_trip_preferences", title: "Set preferences for one trip",
    description: "Preferences only for this trip; they override the user's and the group's for searches in this trip (also in the app). reset: back to the usual preferences.",
    inputSchema: { type: "object", properties: { tripId: str("Trip id"), ...PREFS, reset: { type: "boolean", description: "Remove this trip's own preferences" } }, required: ["tripId"] }
  },
  { name: "remove_item", title: "Remove item", description: "Remove an item from a trip (booked or paid items stay).", inputSchema: { type: "object", properties: { tripId: str("Trip id"), itemId: str("Item id from get_trip") }, required: ["tripId", "itemId"] } }
];

const READ_ONLY = new Set(["search_flights", "search_stays", "search_events", "get_my_travelers", "list_trips", "get_trip"]);

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

// Orte und Länder wie in der App (ohne die kleinen Orte): Ländercode und Mittelpunkt für die Unterkunftssuche (#593)
const GEO: GeoData = { world: (world as any).countries, packs: packs as any, places: {} };

async function callTool(name: string, a: any, user: KeyInfo, deps: McpDeps): Promise<object> {
  const today = deps.today || new Date().toISOString().slice(0, 10);
  if (name.startsWith("search_")) { const no = await deps.allowSearch(); if (no) fail(no); }
  switch (name) {
    case "search_flights": {
      // fehlende Angaben aus den Vorlieben (#602); gesperrte Länder immer
      const pf = await searchPrefs(a.tripId, user, deps);
      const applied: Prefs = {};
      const own = codes(a.from), to = codes(a.to), ch = kids(a.childAges);
      const from = own.length ? own : codes(pf.airports || []);
      if (!from.length) fail("from is required: the user has no home airports in their preferences (ask them)");
      if (!own.length) applied.airports = from;
      const pick = <K extends "maxStops" | "bags" | "maxHours">(k: K, given: unknown, ok: boolean) => {
        if (ok) return given as Prefs[K];
        if (pf[k] != null) applied[k] = pf[k];
        return pf[k];
      };
      const maxStops = pick("maxStops", a.maxStops, Number.isInteger(a.maxStops)) ?? 1;
      const bags = pick("bags", a.bags, typeof a.bags === "boolean") ?? false;
      const maxHours = pick("maxHours", a.maxHours, Number.isInteger(a.maxHours));
      if (pf.avoid?.length) applied.avoid = pf.avoid;
      const q = parseQuery({
        from: from[0], fromAirports: from, to: to[0], toAirports: to, depart: a.depart, ...(a.return ? { ret: a.return } : {}),
        adults: a.adults, children: ch.filter(x => x >= 2).length, infants: ch.filter(x => x < 2).length,
        maxStops, bags, ...(maxHours ? { maxHours } : {}), ...(pf.avoid?.length ? { avoidCountries: pf.avoid } : {}), currency: "EUR"
      });
      if (typeof q === "string") fail(q);
      const fq = q as FlightQuery;
      if (fq.depart < today) fail("Date is in the past");
      const res = await deps.flights(fq);
      const top = res.offers.slice(0, SHOWN);
      const seats = fq.adults + fq.children;
      await Promise.all(top.map(o => deps.offers.put(o.id, { kind: "flight", offer: o, seats })));
      return {
        offers: top.map(o => ({
          id: o.id, priceTotal: Math.round(o.price), currency: o.currency, provider: o.sourceName, link: o.url,
          out: `${o.out.from} ${hm(o.out.dep)} → ${o.out.to} ${hm(o.out.arr)}, ${o.out.stops} stop(s), ${o.out.carriers.join("/")}`,
          ...(o.back ? { back: `${o.back.from} ${hm(o.back.dep)} → ${o.back.to} ${hm(o.back.arr)}, ${o.back.stops} stop(s)` } : {})
        })),
        ...(Object.keys(applied).length ? { appliedPreferences: applied } : {}),
        ...(top.length ? {} : { note: "No flights found" })
      };
    }
    case "search_stays": {
      const pf = await searchPrefs(a.tripId, user, deps);
      const applied: Prefs = {};
      const adults = a.adults;
      const cc = ccOf(GEO, S(a.country, 60));
      const sp = searchParts(GEO, S(a.place), cc);
      const kcc = ccOf(GEO, sp.country) || cc;
      if (kcc && pf.avoid?.includes(kcc)) fail(`${kcc} is in the user's countries to avoid: suggest another destination`);
      const type = typeof a.type === "string" ? a.type : pf.stayType || "all";
      if (typeof a.type !== "string" && pf.stayType) applied.stayType = pf.stayType;
      const minStars = Number.isInteger(a.minStars) ? a.minStars : pf.minStars;
      if (!Number.isInteger(a.minStars) && pf.minStars) applied.minStars = pf.minStars;
      const city = findCity(GEO, sp.place, kcc);
      const q = parseStayQuery({
        place: sp.place, country: sp.country || a.country, ...(kcc ? { cc: kcc } : {}), ...(city ? { lat: city.lat, lon: city.lon } : {}), checkin: a.checkin, checkout: a.checkout, adults, childAges: kids(a.childAges),
        rooms: Number.isInteger(a.rooms) ? a.rooms : Math.max(1, Math.ceil((Number(adults) || 1) / 2)), type, ...(minStars ? { minStars } : {}), currency: "EUR"
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
        ...(Object.keys(applied).length ? { appliedPreferences: applied } : {}),
        ...(top.length ? {} : { note: "No accommodation found" })
      };
    }
    case "search_events": {
      const q = parseEventQuery({ q: S(a.keyword), city: S(a.city), ...(a.from ? { from: a.from, to: a.to || a.from } : {}) });
      if (typeof q === "string") fail(q);
      const res = await deps.events(q as EventQuery);
      return { events: res.events.slice(0, 15).map(e => ({ name: e.name, start: e.start, venue: e.venue, city: e.city, ...(e.category ? { category: e.category } : {}), link: e.url })) };
    }
  }
  const store = deps.store || fail("Trips are not available");
  switch (name) {
    case "get_my_travelers": {
      const d = deps.profile ? await deps.profile(user.uid) : null;
      const day = typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : today;
      if (!d || (!d.people.length && !d.prefs)) return { families: [], groups: [], note: "Nothing saved in the account yet: ask the user who travels (adults, children's ages)." };
      return travelersView(d, day);
    }
    case "list_trips": {
      const list = await store!.list(user.uid);
      return { trips: list.map(r => { const t = parse(r); return { id: r.id, name: r.name, place: t?.place, from: t?.from, to: t?.to, role: roleOf(r, user.uid) }; }) };
    }
    case "get_trip": {
      const r = await readable(store!, a.tripId, user.uid);
      return tripSummary(parse(r) || fail("Trip data unreadable"), roleOf(r, user.uid)!, deps.partner);
    }
    case "create_trip": {
      const place = S(a.place);
      if (!place) fail("place is required");
      const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
      const from = day(a.from), to = day(a.to);
      if (from && to && to < from) fail("to is before from");
      // wer reist: aus dem Konto (Familien, Gruppe) oder vom Nutzer genannt; nie geraten (#595)
      const fromAccount = (Array.isArray(a.families) && a.families.length > 0) || (typeof a.group === "string" && !!a.group.trim());
      let travelers: Traveler[] | undefined, people: Person[] | undefined;
      if (fromAccount) {
        const d = deps.profile ? await deps.profile(user.uid) : null;
        if (!d) fail("No saved families or groups: ask the user who travels (adults, children's ages) and use travelersFrom 'user'");
        try { travelers = travelersFor(d!, { families: a.families, group: a.group }, from || today); } catch (e) { fail((e as Error).message); }
        people = d!.people;
      } else if (a.travelersFrom !== "user" || !Number.isInteger(a.adults)) {
        fail("Who travels? Do not guess: call get_my_travelers and pass families or group, or ask the user for adults and children's ages and pass them with travelersFrom 'user'");
      }
      const adults = Number.isInteger(a.adults) ? a.adults : 1;
      const trip = newTrip({ name: S(a.name, 120), place, country: S(a.country, 60), from, to, adults, childAges: kids(a.childAges), lang: lng(a.language), travelers, people });
      trip.ai = { at: new Date().toISOString() };
      const tp = a.preferences ? prefsFromAi(a.preferences) : undefined;
      if (tp) trip.prefs = tp;
      await store!.create(trip.id, trip.name, JSON.stringify(trip), user.uid, user.name || "Claude");
      return { tripId: trip.id, ...tripSummary(trip, "owner") };
    }
    case "add_flight":
    case "add_stay": {
      const saved = typeof a.offerId === "string" ? await deps.offers.get(a.offerId) : null;
      if (!saved || saved.kind !== (name === "add_flight" ? "flight" : "stay")) fail("Offer not found or expired: search again and use an id from the results");
      return edit(store!, a.tripId, user, t => {
        if (saved!.kind === "flight") {
          const travelers = Number.isInteger(a.travelers) && a.travelers >= 1 ? a.travelers : undefined;
          const items = addFlight(t, saved!.offer, lng(a.language), saved!.seats ? { seats: saved!.seats, travelers } : undefined);
          return { added: items.map(i => i.id), bookings: items.length, name: items[0]?.name };
        }
        const it = addStay(t, saved!.offer, (saved as { q: StayQuery }).q, lng(a.language));
        return { added: it.id, name: it.name };
      });
    }
    case "add_cost": {
      const n = S(a.name, 60), eur = Number(a.amountEur);
      if (!n || !isCat(a.category) || !isFinite(eur) || eur < 0 || eur > 100000) fail("category, name and amountEur (0-100000) are required");
      const link = typeof a.link === "string" && /^https:\/\/[^\s]{4,300}$/.test(a.link) ? a.link : undefined;
      return edit(store!, a.tripId, user, t => {
        const it = addCost(t, { cat: a.category, name: n, eur: Math.round(eur * 100) / 100, perPerson: a.perPerson === true, url: link, arrival: a.arrival === true, estimate: a.estimate === true });
        return { added: it.id, name: it.name };
      });
    }
    case "save_my_preferences": {
      const p = prefsFromAi(a) || fail("No valid preferences given");
      if (!deps.savePrefs) fail("Saving preferences is not available");
      const next = await deps.savePrefs!(user.uid, cur => mergePrefs(cur, p!));
      const { plz: _plz, plzCc: _cc, ...shown } = next;
      return { saved: p, preferences: shown };
    }
    case "set_trip_preferences":
      return edit(store!, a.tripId, user, t => {
        if (a.reset === true) { delete t.prefs; return { preferences: null }; }
        const p = prefsFromAi(a) || fail("No valid preferences given");
        t.prefs = mergePrefs(t.prefs, p!);
        return { preferences: t.prefs };
      });
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

/** Vorlieben für eine Suche: eigene, Gruppe der Reise, Reise (#602) */
async function searchPrefs(tripId: unknown, user: KeyInfo, deps: McpDeps): Promise<Prefs> {
  const d = deps.profile ? await deps.profile(user.uid).catch(() => null) : null;
  const trip = tripId != null && tripId !== "" && deps.store ? parse(await readable(deps.store, tripId, user.uid)) : null;
  return prefsFor(trip, d || { people: [], groups: [] });
}
