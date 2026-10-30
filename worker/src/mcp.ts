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
import { addCost, addFlight, addStay, aiKnows, aiState, aiWrote, changesSinceAi, isCat, LANGS, newTrip, removeItem, tripSummary, updateTrip } from "../../app/src/lib/connector/trips";
import { ensureCompare } from "../../app/src/lib/variants";
import { canEdit, roleOf, type TripRecord, type TripStore } from "./firestore";
import { travelersFor, travelersView } from "../../app/src/lib/connector/people";
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
/** Länge des Namens eigener Kosten (add_cost) */
const NAME_MAX = 120;
/** Verpflegung aufsteigend (search_stays: board als Mindeststufe) */
const BOARDS = ["self", "breakfast", "half", "full", "all"];

const INSTRUCTIONS = [
  "Split&Fly plans group trips and splits the costs fairly. Use these tools to search real flights, accommodation and events, and to plan trips in the user's Split&Fly account.",
  "Search results have an id; add an offer to a trip with add_flight or add_stay (ids stay valid for a few hours). Prices are totals for all travelers in the given currency.",
  "Split&Fly does not book: each offer has a link to the provider, where the user books. Never ask for passport or ID data.",
  "Items you add are marked in the app as suggested or created by AI. The app shows the exact split per person and family.",
  "For every flight the app itself adds the way from home to the departure airport and back (own car incl. airport parking, or train, per household from its settings) and meals; never add these as costs.",
  "Keep working on one trip instead of creating new ones for every attempt: change it with update_trip, clean up failed attempts with delete_trip. Put alternatives you propose into one comparison (create_trip with compareWith).",
  "Ask instead of guessing: call get_my_travelers first (families with children's ages, saved groups, preferences). If destination, time frame, who travels, budget or kind of trip are still unclear, ask the user short questions, each with 2-4 concrete options plus 'something else', before creating a trip. Never invent travelers or children's ages; state any remaining assumption explicitly."
].join(" ");

const str = (d: string) => ({ type: "string", description: d });
const int = (d: string, min: number, max: number) => ({ type: "integer", description: d, minimum: min, maximum: max });
const ages = { type: "array", items: { type: "integer", minimum: 0, maximum: 17 }, description: "Ages of the children (0-17), one per child" };
const lang = { type: "string", enum: LANGS, description: "Language for item names in the app (default de)" };

const SEARCH_TOOLS = [
  {
    name: "search_flights", title: "Search flights",
    description: "Search real round-trip or one-way flights. A booking holds at most 9 seats; for bigger groups (or cheaper fares) search 2 seats and add the offer with add_flight and travelers, which splits the group into bookings. Returns the cheapest offers with id, total price for the searched seats and booking link.",
    inputSchema: { type: "object", properties: {
      from: { type: "array", items: { type: "string" }, description: "IATA codes of departure airports (1-3), e.g. [\"DUS\",\"CGN\"]" },
      to: { type: "array", items: { type: "string" }, description: "IATA codes of destination airports (1-3)" },
      depart: str("Outbound date YYYY-MM-DD"), return: str("Return date YYYY-MM-DD (omit for one-way)"),
      adults: int("Adults in this booking (max 9)", 1, 9), childAges: ages, maxStops: int("Maximum stops per direction (default 1)", 0, 2),
      bags: { type: "boolean", description: "Include a checked bag per person" }
    }, required: ["from", "to", "depart", "adults"] }
  },
  {
    name: "search_stays", title: "Search accommodation",
    description: "Search real accommodation (hotels, apartments) for all travelers. Returns offers with id, total price for the whole stay, board (self, breakfast, half, full, all) if known and booking link.",
    inputSchema: { type: "object", properties: {
      place: str("City or region"), country: str("Country (English)"), checkin: str("YYYY-MM-DD"), checkout: str("YYYY-MM-DD"),
      adults: int("Adults", 1, 20), childAges: ages, rooms: int("Rooms (default: one per two adults)", 1, 10),
      type: { type: "string", enum: ["all", "hotel", "whole"], description: "all, hotel or whole (apartment/house)" },
      board: { type: "string", enum: ["breakfast", "half", "full", "all"], description: "At least this board: breakfast, half (half board), full (full board), all (all inclusive). Drops offers without board info" }
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
    description: "The user's saved families (id, adults, children's ages, home town; no names), saved groups (name, families, adults and children's ages of the group members, group preferences; a group can hold only part of a family) and travel preferences (airports, budget, styles …). Call this before planning, to know who travels instead of guessing.",
    inputSchema: { type: "object", properties: { date: str("Ages as of this day, YYYY-MM-DD (default: today; use the trip start)") } }
  },
  { name: "list_trips", title: "List trips", description: "Trips in the user's Split&Fly account (own and shared). byAi: created by you (the assistant); changedInApp: changed by the user in the app since; compare: title of the comparison the trip belongs to.", inputSchema: { type: "object", properties: {} } },
  { name: "get_trip", title: "Show trip", description: "Destination, dates, number of travelers (no names) and all items with id, status, price and the chosen offer (e.g. hotel name, board, stars).", inputSchema: { type: "object", properties: { tripId: str("Trip id") }, required: ["tripId"] } },
  {
    name: "create_trip", title: "Create trip",
    description: "Create a new trip in the user's account. Travelers: saved families or a saved group from get_my_travelers (real people, ages as of the trip start), or, only if the user told you who travels, adults and childAges with travelersFrom 'user' (placeholders the user can replace in the app). If you don't know who travels, ask first.",
    inputSchema: { type: "object", properties: {
      place: str("Destination"), country: str("Country"), name: str("Trip name (default: destination)"), from: str("Arrival YYYY-MM-DD"), to: str("Departure YYYY-MM-DD"),
      families: { type: "array", items: { type: "string" }, description: "Family ids from get_my_travelers (e.g. [\"F1\"])" },
      group: str("Name of a saved group from get_my_travelers"),
      travelersFrom: { type: "string", enum: ["user"], description: "'user': the user told you adults and children's ages in this conversation (only then use adults/childAges)" },
      adults: int("Adults (with travelersFrom 'user')", 1, 20), childAges: ages, language: lang,
      compareWith: str("Trip id: put the new trip into the same comparison as this trip (for 2-3 alternatives you propose)")
    }, required: ["place"] }
  },
  {
    name: "update_trip", title: "Update trip",
    description: "Change name, destination or dates of a trip instead of creating a new one. If the user changed the trip in the app since you last worked on it (or created it in the app), this fails with the list of changes: ask the user, then repeat with confirm true. Pass confirm true right away only if it is clear from the conversation that you and the user are working on this trip together.",
    inputSchema: { type: "object", properties: {
      tripId: str("Trip id"), name: str("New trip name"), place: str("New destination"), country: str("New country"), from: str("New arrival YYYY-MM-DD"), to: str("New departure YYYY-MM-DD"),
      confirm: { type: "boolean", description: "true: the user agreed despite changes made in the app" }
    }, required: ["tripId"] }
  },
  {
    name: "delete_trip", title: "Delete trip",
    description: "Delete a trip, e.g. a failed attempt of yours. Own trips you created and nobody changed since are deleted directly; otherwise this fails with the reason (changes in the app, created in the app): ask the user and repeat with confirm true only if they explicitly want it deleted. A trip shared with you is left (you are no longer a member), not deleted for the others. Shared trips you own cannot be deleted here (use the app).",
    inputSchema: { type: "object", properties: {
      tripId: str("Trip id"), confirm: { type: "boolean", description: "true: the user explicitly wants to delete (or leave) it despite the reason given" }
    }, required: ["tripId"] }
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
      name: { type: "string", maxLength: NAME_MAX, description: `Short name (max ${NAME_MAX} characters)` }, amountEur: { type: "number", description: "Amount in EUR", minimum: 0 },
      perPerson: { type: "boolean", description: "true: amount per person; false (default): total for the group" }, link: str("Optional https link (e.g. ticket shop)"),
      arrival: { type: "boolean", description: "true only if the travelers reach the destination itself without a flight (own car, train, bus all the way); never for the way to the departure airport" },
      estimate: { type: "boolean", description: "true if the amount is an estimate and not a real offer" }
    }, required: ["tripId", "category", "name", "amountEur"] }
  },
  { name: "remove_item", title: "Remove item", description: "Remove an item from a trip (booked or paid items stay). Items the user added or changed in the app need confirm true after asking the user.", inputSchema: { type: "object", properties: { tripId: str("Trip id"), itemId: str("Item id from get_trip"), confirm: { type: "boolean", description: "true: the user agreed" } }, required: ["tripId", "itemId"] } }
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
      const seats = fq.adults + fq.children;
      await Promise.all(top.map(o => deps.offers.put(o.id, { kind: "flight", offer: o, seats })));
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
      const cc = ccOf(GEO, S(a.country, 60));
      const sp = searchParts(GEO, S(a.place), cc);
      const kcc = ccOf(GEO, sp.country) || cc;
      const city = findCity(GEO, sp.place, kcc);
      const q = parseStayQuery({
        place: sp.place, country: sp.country || a.country, ...(kcc ? { cc: kcc } : {}), ...(city ? { lat: city.lat, lon: city.lon } : {}), checkin: a.checkin, checkout: a.checkout, adults, childAges: kids(a.childAges),
        rooms: Number.isInteger(a.rooms) ? a.rooms : Math.max(1, Math.ceil((Number(adults) || 1) / 2)), type: a.type || "all", currency: "EUR"
      });
      if (typeof q === "string") fail(q);
      const sq = q as StayQuery;
      if (sq.checkin < today) fail("Date is in the past");
      const res = await deps.stays(sq);
      // Verpflegung als Mindeststufe; die Anbieter filtern nicht danach, darum hier
      const want = BOARDS.indexOf(a.board);
      const top = res.offers.filter(o => want < 1 || (!!o.board && BOARDS.indexOf(o.board) >= want)).slice(0, SHOWN);
      await Promise.all(top.map(o => deps.offers.put(o.id, { kind: "stay", offer: o, q: sq })));
      return {
        offers: top.map(o => ({
          id: o.id, name: o.name, priceTotal: Math.round(o.total), currency: o.currency, provider: o.via || o.sourceName, link: o.url,
          ...(o.score != null ? { rating: o.score } : {}), ...(o.stars ? { stars: o.stars } : {}), ...(o.place ? { area: o.place } : {}),
          ...(o.board ? { board: o.board } : {}), ...(o.facts?.length ? { facts: o.facts } : {})
        })),
        ...(top.length ? {} : { note: want > 0 && res.offers.length ? "No accommodation with this board found: try a lower board or without board" : "No accommodation found" })
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
      return { trips: list.map(r => {
        const t = parse(r), ch = t ? changesSinceAi(t) : null;
        return {
          id: r.id, name: r.name, place: t?.place, from: t?.from, to: t?.to, role: roleOf(r, user.uid),
          ...(ch ? { byAi: true } : {}), ...(ch?.length ? { changedInApp: true } : {}), ...(t?.cmp ? { compare: t.cmp.title } : {})
        };
      }) };
    }
    case "get_trip": {
      const r = await readable(store!, a.tripId, user.uid);
      const t = parse(r) || fail("Trip data unreadable"), ch = changesSinceAi(t!);
      return { ...tripSummary(t!, roleOf(r, user.uid)!, deps.partner), byAi: ch != null, ...(ch?.length ? { changedInApp: ch } : {}) };
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
      aiKnows(trip);
      // Vorschläge als Vergleich (#428): die andere Reise kommt in einen Vergleich, die neue dazu
      if (a.compareWith != null) {
        const cmp = await edit(store!, a.compareWith, user, t => { ensureCompare(t); return { cmp: { id: t.cmp!.id, title: t.cmp!.title } }; }) as { cmp: { id: string; title: string } };
        trip.cmp = cmp.cmp;
      }
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
      const n = S(a.name, NAME_MAX), eur = Number(a.amountEur);
      if (!n || !isCat(a.category) || !isFinite(eur) || eur < 0 || eur > 100000) fail("category, name and amountEur (0-100000) are required");
      const link = typeof a.link === "string" && /^https:\/\/[^\s]{4,300}$/.test(a.link) ? a.link : undefined;
      return edit(store!, a.tripId, user, t => {
        const it = addCost(t, { cat: a.category, name: n, eur: Math.round(eur * 100) / 100, perPerson: a.perPerson === true, url: link, arrival: a.arrival === true, estimate: a.estimate === true });
        return { added: it.id, name: it.name };
      });
    }
    case "update_trip": {
      const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
      const u = { name: S(a.name, 120) || undefined, place: S(a.place) || undefined, country: typeof a.country === "string" ? S(a.country, 60) : undefined, from: day(a.from), to: day(a.to) };
      if (!Object.values(u).some(v => v != null)) fail("Nothing to change: name, place, country, from or to");
      return edit(store!, a.tripId, user, t => {
        if (a.confirm !== true) { const why = needsConfirm(t, "change"); if (why) fail(why); }
        const f = u.from || t.from, to = u.to || t.to;
        if (f && to && to < f) fail("to is before from");
        const off = updateTrip(t, u);
        if (a.confirm === true && t.aiSeen) aiKnows(t);
        return { updated: true, ...(off.length ? { outOfRange: off, note: "These items no longer fit the dates: search again and remove the old ones with remove_item" } : {}) };
      });
    }
    case "delete_trip": {
      const r = await readable(store!, a.tripId, user.uid);
      const t = parse(r) || fail("Trip data unreadable");
      const others = Object.keys(r.members).filter(u => u !== user.uid);
      // geteilte Reisen: nur verlassen; Besitzer übergeben und Löschen für alle folgt mit #604
      if (roleOf(r, user.uid) !== "owner") {
        if (a.confirm !== true) fail("This trip was shared with the user: deleting means leaving it (the user loses access, the others keep it). Ask the user, then repeat with confirm true.");
        await store!.leave(r, user.uid);
        return { left: r.id };
      }
      if (others.length) fail("This trip is shared with others: the user can delete or leave it in the app");
      if (a.confirm !== true) { const why = needsConfirm(t!, "delete"); if (why) fail(why); }
      try { await store!.remove(r); } catch (e) { if ((e as { conflict?: boolean }).conflict) fail("The trip was just changed: call get_trip and try again"); throw e; }
      return { deleted: r.id };
    }
    case "remove_item":
      return edit(store!, a.tripId, user, t => {
        const it = t.items.find(i => i.id === a.itemId);
        if (it && it.status !== "booked" && it.status !== "paid" && a.confirm !== true) {
          // nur, was die KI angelegt hat und seitdem niemand geändert hat; sonst erst fragen
          const ch = changesSinceAi(t);
          if (ch ? ch.some(c => c.id === it.id) : !it.ai) fail(`The user added or changed "${it.name || it.cat}" in the app: ask the user, then repeat with confirm true`);
        }
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

/** Rückfrage nötig, bevor die KI eine Reise ändert oder löscht (#603)? Grund für die KI, sonst null */
function needsConfirm(t: Trip, what: string): string | null {
  const ch = changesSinceAi(t);
  if (ch == null) return `This trip was created in the app, not by you: ask the user whether to ${what} it, then repeat with confirm true.`;
  if (!ch.length) return null;
  const list = ch.map(c => (c.id === "meta" ? `${c.name} changed` : `item ${c.what}: ${c.name} (${c.id})`)).join("; ");
  return `The user changed this trip in the app since you last worked on it (${list}). Tell the user and ask whether to ${what} it anyway, then repeat with confirm true.`;
}

/** Reise ändern: lesen, ändern, speichern, nur wenn sie inzwischen niemand geändert hat (sonst einmal neu) */
async function edit(store: TripStore, id: unknown, user: KeyInfo, change: (t: Trip) => object): Promise<object> {
  for (let attempt = 0; ; attempt++) {
    const r = await readable(store, id, user.uid);
    if (!canEdit(r, user.uid)) fail("You can only view this trip");
    const t = parse(r) || fail("Trip data unreadable");
    const before = aiState(t!);
    const out = change(t!);
    // Stand der KI fortschreiben; Änderungen aus der App bleiben als geändert stehen
    aiWrote(t!, before);
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
