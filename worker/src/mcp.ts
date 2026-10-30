/*
 * KI-Konnektor (MCP über HTTP, JSON-RPC): eigener KI-Assistent (Claude, ChatGPT, Cursor …) sucht über Split&Fly
 * und plant Reisen im Konto.
 * Anmeldung mit persönlichem Schlüssel (apikey.ts). Gesucht wird mit unseren Suchen; Angebote merkt sich der
 * Such-Dienst einige Stunden, damit der Assistent sie per Kennung in eine Reise übernehmen kann. Gebucht wird beim Anbieter
 * über den Link des Angebots. Angaben „Nur für dich“ (travelDocs) gibt es hier nicht.
 * Namen, Alter (nie Geburtsdatum) und Wohnort mit PLZ der Reisenden sieht der Assistent, damit er Familien zuordnen und
 * Tippfehler korrigieren kann; Personen und Gruppen im Konto legt er nach Rückfrage an und ändert sie (#608).
 */
import { parseQuery } from "../../app/src/lib/flights/search";
import { parseStayQuery } from "../../app/src/lib/stays/search";
import { parseEventQuery } from "../../app/src/lib/events/search";
import type { FlightOffer, FlightQuery, SearchResult } from "../../app/src/lib/flights/types";
import type { StayOffer, StayQuery, StaySearchResult } from "../../app/src/lib/stays/types";
import type { EventQuery, EventSearchResult } from "../../app/src/lib/events/types";
import { hhKey, type Directory, type Person, type Status, type Traveler, type Trip } from "../../app/src/lib/model";
import { addCost, addFlight, addStay, aiKnows, aiState, aiWrote, changesSinceAi, changeTraveler, isCat, LANGS, markBooked, newTrip, removeItem, renameFamily, setHome, tripPeople, tripSummary, updateTrip } from "../../app/src/lib/connector/trips";
import { joinTarget } from "../../app/src/lib/variants";
import { canEdit, roleOf, type TripRecord, type TripStore } from "./firestore";
import { cleanName, saveGroup, savePeople, travelerColor, travelersFor, travelersView, type PersonInput } from "../../app/src/lib/connector/people";
import { applyPeople } from "../../app/src/lib/people";
import type { HomeHit } from "./home";
import { mergePrefs, prefsFor } from "../../app/src/lib/prefs";
import { prefsFromAi } from "../../app/src/lib/agent/agent";
import { STYLES, uid, type Prefs } from "../../app/src/lib/model";
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
  /** Personen und Gruppen im Konto ändern (#608): liest, ändert, speichert nur unverändert; gibt zurück, was change liefert */
  saveProfile?: <R>(uid: string, change: (d: Directory) => R) => Promise<R>;
  /** Wohnort aus Text („47906 Kempen“) und Land; fehlt: nur Orte aus der Ortsliste */
  home?: (text: string, cc: string) => Promise<HomeHit | null>;
  /** gefundene Angebote merken (je Schlüssel, einige Stunden) */
  offers: { put: (id: string, v: Saved) => Promise<void>; get: (id: string) => Promise<Saved | null> };
  /** zählt eine Suche mit; Fehlermeldung, wenn das Tageslimit erreicht ist */
  allowSearch: () => Promise<string | null>;
  version: string;
  today?: string;
  /** Partner-Links eingeschaltet (sonst Links aus gespeicherten Reisen ohne Partner-Kennung) */
  partner?: boolean;
  /** Adresse der App mit „/“ am Ende: Link zur Reise (?reise=…) und zur Anleitung */
  appUrl?: string;
  /** Anbieter-Link über splitandfly.com/go/ (go.ts); fehlt: Links unverändert */
  go?: (url: string, partner: string, cat: string) => Promise<string>;
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
  "Searches use the user's saved preferences (own, group, trip) for anything you leave out and always skip countries to avoid; pass tripId to use a trip's preferences, and the result lists appliedPreferences. If the user has none yet, offer to set up a short travel profile by asking about airports, budget, accommodation, meals, travel style and countries to avoid, then save it with save_my_preferences after they confirmed. Wishes for one trip only go to set_trip_preferences.",
  "Keep working on one trip instead of creating new ones for every attempt: change it with update_trip, clean up failed attempts with delete_trip. Put alternatives you propose into one comparison (create_trip with compareWith and a compareTitle such as 'Summer holiday 2027', each variant with a short variantName); existing trips join with update_trip.",
  "Ask instead of guessing: call get_my_travelers first (families with names, ages and home town, saved groups, preferences). If destination, time frame, who travels, budget or kind of trip are still unclear, ask the user short questions, each with 2-4 concrete options plus 'something else', before creating a trip. Never invent travelers or children's ages; state any remaining assumption explicitly.",
  "If the user shares a group chat or a list of families, compare it with the saved families and groups: if it matches a saved group, ask whether it is that group; otherwise ask whether to save the new people and the group in their account (save_people, then save_group) or to add them to this trip only (create_trip with travelers). Then create the trip from the group or families, so every family keeps its name and home town (where it starts from).",
  "Correct misspelled names or wrong ages where they are: saved people with save_people, travelers in a trip with update_travelers (saved people are not renamed in existing trips automatically). For a cost that is already booked or paid, pass status, paidBy (the family that paid) and bookingRef to add_cost.",
  "When you propose or finish a trip, end with a booking table from get_trip: one row per item in booking order (flights first, prices change fastest; then accommodation, then the rest) with number, what, dates, price and the link as a clickable markdown link (items without link: say where to book). The user books row by row and tells you which rows are done; then mark them with mark_booked (booking number and paying family only if the user gives them) and show the table again with a status column. If a result has linkNote, mark the links with * and add the note below. Below the table add the trip's appLink: some providers (e.g. package holidays, tours) can only be shown in the Split&Fly app, not here, so tell the user that the trip in the app has search links to more providers for comparing and booking, the split per family and the booking status; add guideLink as help for booking and marking items. Do not claim offers from providers you did not search."
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

const NEW_TRAVELERS = {
  type: "array", description: "Travelers the user named who are not saved (only in this trip)",
  items: { type: "object", properties: { first: str("First name"), family: str("Family name"), age: int("Age at the trip start", 0, 120), home: str("Home town, ideally with postal code, e.g. \"47906 Kempen\" (where the family starts from)"), country: str("Country of the home town, ISO-2 (default DE)") }, required: ["first", "family"] }
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
    description: "Search real accommodation (hotels, apartments) for all travelers. Accommodation type and stars default to the user's preferences; countries to avoid are refused. Returns offers with id, total price for the whole stay, board (self, breakfast, half, full, all) if known and booking link.",
    inputSchema: { type: "object", properties: {
      place: str("City or region"), country: str("Country (English)"), checkin: str("YYYY-MM-DD"), checkout: str("YYYY-MM-DD"),
      adults: int("Adults", 1, 20), childAges: ages, rooms: int("Rooms (default: one per two adults)", 1, 10),
      type: { type: "string", enum: ["all", "hotel", "whole"], description: "all, hotel or whole (apartment/house); default: preferences" },
      minStars: int("Minimum hotel stars (default: preferences)", 1, 5), tripId: str("Use this trip's preferences (default: the user's own)"),
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
    description: "The user's saved families (id, family name, members with id, first name and age, home town with postal code), saved groups (name, member ids, families, adults and children's ages of the group members, group preferences; a group holds only its own members, partOf lists families of which only some members are in the group, e.g. only the adults) and travel preferences (airports, budget, styles …). Call this before planning, to know who travels instead of guessing.",
    inputSchema: { type: "object", properties: { date: str("Ages as of this day, YYYY-MM-DD (default: today; use the trip start)") } }
  },
  { name: "list_trips", title: "List trips", description: "Trips in the user's Split&Fly account (own and shared). byAi: created by you (the assistant); changedInApp: changed by the user in the app since; compare: title of the comparison the trip belongs to.", inputSchema: { type: "object", properties: {} } },
  { name: "get_trip", title: "Show trip", description: "Destination, dates, travelers (number per age class; each with id, first name, family and age), families with home town, and all items with id, status, price, the chosen offer (e.g. hotel name, board, stars), booking link, booking number and amount paid.", inputSchema: { type: "object", properties: { tripId: str("Trip id") }, required: ["tripId"] } },
  {
    name: "create_trip", title: "Create trip",
    description: "Create a new trip in the user's account. Travelers: saved families, a saved group or single saved people from get_my_travelers (real people, ages as of the trip start, home town of their family), plus travelers the user named who are not saved (first name, family name, age, home town; only in this trip), all combinable. Only if the user gave just numbers: adults and childAges with travelersFrom 'user' (placeholders the user can replace). If you don't know who travels, ask first.",
    inputSchema: { type: "object", properties: {
      place: str("Destination"), country: str("Country"), name: str("Trip name (default: destination)"), from: str("Arrival YYYY-MM-DD"), to: str("Departure YYYY-MM-DD"),
      families: { type: "array", items: { type: "string" }, description: "Family ids from get_my_travelers (e.g. [\"F1\"])" },
      group: str("Name of a saved group from get_my_travelers"),
      people: { type: "array", items: { type: "string" }, description: "Member ids of single saved people from get_my_travelers" },
      travelers: NEW_TRAVELERS,
      travelersFrom: { type: "string", enum: ["user"], description: "'user': the user told you adults and children's ages in this conversation (only then use adults/childAges)" },
      adults: int("Adults (with travelersFrom 'user')", 1, 20), childAges: ages, language: lang,
      preferences: { type: "object", properties: PREFS, description: "Preferences only for this trip (override the user's and the group's), e.g. holiday home and higher budget this time" },
      compareWith: str("Trip id: put the new trip into the same comparison as this trip (for 2-3 alternatives you propose)"),
      compareTitle: str("Title of the comparison, e.g. 'Summer holiday 2027' (renames it for all variants; without compareWith: starts a comparison other trips can join)"),
      variantName: str("Short name of this trip within the comparison, e.g. 'Golden Sands' (default: destination)")
    }, required: ["place"] }
  },
  {
    name: "update_trip", title: "Update trip",
    description: "Change name, destination or dates of a trip instead of creating a new one, or put it into a comparison (compareWith), rename the comparison (compareTitle) or its variant (variantName), or take it out (leaveCompare). If the user changed the trip in the app since you last worked on it (or created it in the app), this fails with the list of changes: ask the user, then repeat with confirm true. Pass confirm true right away only if it is clear from the conversation that you and the user are working on this trip together.",
    inputSchema: { type: "object", properties: {
      tripId: str("Trip id"), name: str("New trip name"), place: str("New destination"), country: str("New country"), from: str("New arrival YYYY-MM-DD"), to: str("New departure YYYY-MM-DD"),
      compareWith: str("Trip id: put this trip and that trip into one comparison (that trip's, else this trip's, else a new one)"),
      compareTitle: str("New title of the comparison, for all its variants"), variantName: str("Short name of this trip within the comparison"),
      leaveCompare: { type: "boolean", description: "true: take this trip out of its comparison (nothing is deleted)" },
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
    description: "Add another cost (rental car, transfers at the destination, tickets, an accommodation the user already booked, an estimate) to a trip, in EUR. Already booked or paid: pass status, the booking number and paidBy (family name in the trip that paid; the app then settles the costs between the families). Not for the way to the departure airport or airport parking: the app calculates them for every flight.",
    inputSchema: { type: "object", properties: {
      tripId: str("Trip id"), category: { type: "string", enum: ["flights", "stay", "transport", "attractions", "misc"], description: "flights, stay, transport (rental car, transfers, own arrival instead of a flight), attractions, misc" },
      name: { type: "string", maxLength: NAME_MAX, description: `Short name (max ${NAME_MAX} characters)` }, amountEur: { type: "number", description: "Amount in EUR", minimum: 0 },
      perPerson: { type: "boolean", description: "true: amount per person; false (default): total for the group" }, link: str("Optional https link (e.g. ticket shop)"),
      arrival: { type: "boolean", description: "true only if the travelers reach the destination itself without a flight (own car, train, bus all the way); never for the way to the departure airport" },
      estimate: { type: "boolean", description: "true if the amount is an estimate and not a real offer" },
      status: { type: "string", enum: ["idea", "chosen", "booked", "paid"], description: "idea (default), chosen, booked or paid; booked and paid items can afterwards only be changed in the app" },
      paidBy: str("Family name (as in get_trip) that paid the whole amount; sets status paid"), paidAt: str("Payment date YYYY-MM-DD (default today)"),
      bookingRef: str("Booking number")
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
  {
    name: "update_travelers", title: "Update travelers of a trip",
    description: "Correct the travelers of a trip: rename a family (all its travelers, payments and settings), change first name, family or age of a traveler (ids from get_trip; a placeholder with a first name becomes a real traveler), set a family's home town (where it starts from), add saved families, a group, saved people or new travelers. Saved people in the account stay as they are (use save_people). Same confirm rule as update_trip.",
    inputSchema: { type: "object", properties: {
      tripId: str("Trip id"),
      renameFamily: { type: "array", items: { type: "object", properties: { from: str("Family name in the trip"), to: str("New family name") }, required: ["from", "to"] } },
      change: { type: "array", items: { type: "object", properties: { id: str("Traveler id from get_trip"), first: str("First name"), family: str("Family name"), age: int("Age at the trip start", 0, 120) }, required: ["id"] } },
      homes: { type: "array", items: { type: "object", properties: { family: str("Family name in the trip"), home: str("Home town, ideally with postal code, e.g. \"47906 Kempen\" (where the family starts from)"), country: str("Country of the home town, ISO-2 (default DE)") }, required: ["family", "home"] } },
      add: { type: "object", properties: {
        families: { type: "array", items: { type: "string" }, description: "Family ids from get_my_travelers" }, group: str("Saved group name"),
        people: { type: "array", items: { type: "string" }, description: "Member ids from get_my_travelers" }, travelers: NEW_TRAVELERS
      } },
      confirm: { type: "boolean", description: "true: the user agreed despite changes made in the app" }
    }, required: ["tripId"] }
  },
  {
    name: "save_people", title: "Save people in my account",
    description: "Create or correct saved people in the user's account (like the people list in the app): without id new (first and last name; an existing person with the same name is updated instead), with id change only the given fields; renameFamily renames all saved people of a family. Age only for people without a birth date (a birth date stays and only the app changes it). Only after the user confirmed in this conversation. Deleting people is only possible in the app.",
    inputSchema: { type: "object", properties: {
      people: { type: "array", items: { type: "object", properties: { id: str("Member id from get_my_travelers (to change)"), first: str("First name"), last: str("Family name"), age: int("Age today", 0, 120), home: str("Home town, ideally with postal code, e.g. \"47906 Kempen\" (where the family starts from)"), country: str("Country of the home town, ISO-2 (default DE)") } } },
      renameFamily: { type: "array", items: { type: "object", properties: { from: str("Family name"), to: str("New family name") }, required: ["from", "to"] } }
    } }
  },
  {
    name: "save_group", title: "Save a group in my account",
    description: "Create or change a saved group (e.g. friends you travel with): name of an existing group (case-insensitive) or a new one, members to set, add or remove as member ids or family ids (F1 = the whole family), optional newName. Create missing people first with save_people. Only after the user confirmed in this conversation.",
    inputSchema: { type: "object", properties: {
      name: str("Group name"), newName: str("New name"),
      members: { type: "array", items: { type: "string" }, description: "Replace the members: member or family ids" },
      add: { type: "array", items: { type: "string" }, description: "Add member or family ids" },
      remove: { type: "array", items: { type: "string" }, description: "Remove member or family ids" }
    }, required: ["name"] }
  },
  {
    name: "mark_booked", title: "Mark items as booked",
    description: "After the user booked items via their links: mark them as booked or paid, several in one call. The offer shown in get_trip counts as chosen; parts of a package follow. Booked and paid items can afterwards only be changed in the app.",
    inputSchema: { type: "object", properties: {
      tripId: str("Trip id"),
      items: { type: "array", minItems: 1, maxItems: 30, items: { type: "object", properties: {
        itemId: str("Item id from get_trip"),
        status: { type: "string", enum: ["booked", "paid"], description: "booked (default) or paid" },
        bookingRef: str("Booking number, if the user gives it"),
        paidBy: str("Family name (as in get_trip) that paid; sets status paid"), amountEur: { type: "number", minimum: 0, description: "Amount paid in EUR (default: the open rest)" },
        paidAt: str("Payment date YYYY-MM-DD (default today)")
      }, required: ["itemId"] } }
    }, required: ["tripId", "items"] }
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
      const links = await Promise.all(top.map(o => via(deps, o.url, o.sourceName, "flights")));
      return {
        ...linkNote(deps),
        offers: top.map((o, i) => ({
          id: o.id, priceTotal: Math.round(o.price), currency: o.currency, provider: o.sourceName, link: links[i],
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
      // Verpflegung als Mindeststufe; die Anbieter filtern nicht danach, darum hier
      const want = BOARDS.indexOf(a.board);
      const top = res.offers.filter(o => want < 1 || (!!o.board && BOARDS.indexOf(o.board) >= want)).slice(0, SHOWN);
      await Promise.all(top.map(o => deps.offers.put(o.id, { kind: "stay", offer: o, q: sq })));
      const links = await Promise.all(top.map(o => via(deps, o.url, o.via || o.sourceName, "stay")));
      return {
        ...linkNote(deps),
        offers: top.map((o, i) => ({
          id: o.id, name: o.name, priceTotal: Math.round(o.total), currency: o.currency, provider: o.via || o.sourceName, link: links[i],
          ...(o.score != null ? { rating: o.score } : {}), ...(o.stars ? { stars: o.stars } : {}), ...(o.place ? { area: o.place } : {}),
          ...(o.board ? { board: o.board } : {}), ...(o.facts?.length ? { facts: o.facts } : {})
        })),
        ...(Object.keys(applied).length ? { appliedPreferences: applied } : {}),
        ...(top.length ? {} : { note: want > 0 && res.offers.length ? "No accommodation with this board found: try a lower board or without board" : "No accommodation found" })
      };
    }
    case "search_events": {
      const q = parseEventQuery({ q: S(a.keyword), city: S(a.city), ...(a.from ? { from: a.from, to: a.to || a.from } : {}) });
      if (typeof q === "string") fail(q);
      const res = await deps.events(q as EventQuery);
      const top = res.events.slice(0, 15), links = await Promise.all(top.map(e => via(deps, e.url, e.sourceName, "attractions")));
      return { ...linkNote(deps), events: top.map((e, i) => ({ name: e.name, start: e.start, venue: e.venue, city: e.city, ...(e.category ? { category: e.category } : {}), link: links[i] })) };
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
      const sum = tripSummary(t!, roleOf(r, user.uid)!, deps.partner);
      // Links über splitandfly.com; Link zur Reise in der App mit weiteren Anbietern und Anleitung (Buchungstabelle)
      await Promise.all(sum.items.map(async (i: { link?: string; category: string }) => { if (i.link) i.link = await via(deps, i.link, "", i.category); }));
      return {
        ...sum, ...(deps.appUrl ? { appLink: `${deps.appUrl}?reise=${encodeURIComponent(r.id)}`, guideLink: `${deps.appUrl}anleitung/kosten/` } : {}), ...linkNote(deps),
        byAi: ch != null, ...(ch?.length ? { changedInApp: ch } : {}),
        ...(t!.cmp ? { compare: { title: t!.cmp.title, variantName: t!.cmp.label || t!.place || t!.country } } : {})
      };
    }
    case "create_trip": {
      const place = S(a.place);
      if (!place) fail("place is required");
      const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
      const from = day(a.from), to = day(a.to);
      if (from && to && to < from) fail("to is before from");
      // wer reist: aus dem Konto (Familien, Gruppe, Personen), vom Nutzer genannt (#608) oder nur gezählt; nie geraten (#595)
      const fromAccount = (Array.isArray(a.families) && a.families.length > 0) || (typeof a.group === "string" && !!a.group.trim()) || (Array.isArray(a.people) && a.people.length > 0);
      const named = await newTravelers(a.travelers, deps);
      let travelers: Traveler[] = [], people: Person[] | undefined;
      if (fromAccount) {
        const d = deps.profile ? await deps.profile(user.uid) : null;
        if (!d) fail("No saved families or groups: ask the user who travels (adults, children's ages) and use travelersFrom 'user'");
        travelers = guard(() => travelersFor(d!, { families: a.families, group: a.group, people: a.people }, from || today));
        people = d!.people;
      }
      travelers.push(...named.list.map((n, i) => n.traveler(travelers.length + i)));
      if (!travelers.length && (a.travelersFrom !== "user" || !Number.isInteger(a.adults))) {
        fail("Who travels? Do not guess: call get_my_travelers and pass families, group or people, pass the travelers the user named, or ask the user for adults and children's ages and pass them with travelersFrom 'user'");
      }
      const adults = Number.isInteger(a.adults) ? a.adults : 1;
      const trip = newTrip({ name: S(a.name, 120), place, country: S(a.country, 60), from, to, adults, childAges: kids(a.childAges), lang: lng(a.language), travelers, people });
      for (const [fam, h] of named.homes) setHome(trip, fam, h);
      trip.ai = { at: new Date().toISOString() };
      const tp = a.preferences ? prefsFromAi(a.preferences) : undefined;
      if (tp) trip.prefs = tp;
      aiKnows(trip);
      // Vorschläge als Vergleich (#428): die andere Reise kommt in einen Vergleich, die neue dazu; Titel und Name der Variante wählbar
      const title = S(a.compareTitle, 120), label = S(a.variantName, 60);
      if (a.compareWith != null) trip.cmp = await joinWith(store!, user, a.compareWith, trip);
      else if (title) trip.cmp = { id: uid(), title };
      if (trip.cmp && title) trip.cmp.title = title;
      if (trip.cmp && label) trip.cmp.label = label;
      await store!.create(trip.id, trip.name, JSON.stringify(trip), user.uid, user.name || "Claude");
      if (trip.cmp && title && a.compareWith != null) await renameCompare(store!, user, trip.cmp.id, title);
      return { tripId: trip.id, ...tripSummary(trip, "owner"), ...(trip.cmp ? { compare: trip.cmp.title } : {}) };
    }
    case "update_travelers": {
      const renames = pairs(a.renameFamily);
      const changes = (Array.isArray(a.change) ? a.change : []).slice(0, 40).map((c: any) => ({
        id: String(c?.id || ""), first: cleanName(c?.first) || undefined, family: cleanName(c?.family) || undefined, age: age(c?.age)
      }));
      const homes: [string, HomeHit][] = [];
      for (const h of (Array.isArray(a.homes) ? a.homes : []).slice(0, 20)) homes.push([cleanName(h?.family), await homeOf(h?.home, h?.country, deps)]);
      const add = a.add && typeof a.add === "object" ? a.add : {};
      const named = await newTravelers(add.travelers, deps);
      const fromAccount = (Array.isArray(add.families) && add.families.length > 0) || (typeof add.group === "string" && !!add.group.trim()) || (Array.isArray(add.people) && add.people.length > 0);
      const d = fromAccount ? (deps.profile ? await deps.profile(user.uid) : null) || fail("No saved families or groups in the account") : null;
      if (!renames.length && !changes.length && !homes.length && !named.list.length && !d) fail("Nothing to change: renameFamily, change, homes or add");
      return edit(store!, a.tripId, user, t => {
        if (a.confirm !== true) { const why = needsConfirm(t, "change"); if (why) fail(why); }
        for (const r of renames) if (!renameFamily(t, r.from, r.to)) fail(`Unknown family "${r.from}" in this trip: use a family name from get_trip`);
        for (const c of changes) if (!changeTraveler(t, c)) fail(`Unknown traveler "${c.id}": use ids from get_trip`);
        if (d) {
          const known = new Set(t.travelers.map(x => x.personId).filter(Boolean));
          const more = guard(() => travelersFor(d, add, t.from || today, t.travelers.length)).filter(x => !known.has(x.personId));
          t.travelers.push(...more);
          applyPeople(t, d.people, today);
        }
        t.travelers.push(...named.list.map((n, i) => n.traveler(t.travelers.length + i)));
        if (t.travelers.length > 40) fail("Too many travelers");
        for (const [fam, h] of [...homes, ...named.homes]) {
          const k = t.travelers.map(hhKey).find(x => x.toLowerCase() === fam.toLowerCase()) || fail(`Unknown family "${fam}" in this trip: use a family name from get_trip`);
          setHome(t, k!, h);
        }
        if (a.confirm === true && t.aiSeen) aiKnows(t);
        return tripPeople(t);
      });
    }
    case "save_people": {
      if (!deps.saveProfile) fail("Saving people is not available");
      const list: PersonInput[] = [];
      for (const x of (Array.isArray(a.people) ? a.people : []).slice(0, 40)) {
        list.push({
          ...(typeof x?.id === "string" ? { id: x.id } : {}), first: cleanName(x?.first), last: cleanName(x?.last), ...(age(x?.age) != null ? { age: age(x?.age) } : {}),
          ...(x?.home ? { home: await homeOf(x.home, x.country, deps) } : {})
        });
      }
      const renames = pairs(a.renameFamily);
      if (!list.length && !renames.length) fail("Nothing to save: people or renameFamily");
      const res = await deps.saveProfile!(user.uid, d => guard(() => savePeople(d, list, renames, today)));
      return {
        saved: res.saved.map(p => ({ id: p.id, first: p.first, last: p.last })), ...(res.notes.length ? { notes: res.notes } : {}),
        note: "Saved in the account. Existing trips keep their travelers: correct them with update_travelers. Call get_my_travelers for the families with ids."
      };
    }
    case "save_group": {
      if (!deps.saveProfile) fail("Saving groups is not available");
      const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 60).map(String) : undefined);
      const res = await deps.saveProfile!(user.uid, d => {
        const r = guard(() => saveGroup(d, { name: S(a.name, 60), newName: S(a.newName, 60), members: list(a.members), add: list(a.add), remove: list(a.remove) }));
        return { created: r.created, view: travelersView(d, today).groups.find(g => g.name === r.group.name.trim().slice(0, 60)) };
      });
      return { ...(res.created ? { created: true } : { updated: true }), group: res.view };
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
      // schon gebucht oder bezahlt (#608): Status, Zahler (Familie der Reise), Buchungsnummer
      const paidBy = S(a.paidBy, 60);
      const status: Status = paidBy ? "paid" : STATUS.includes(a.status) ? a.status : "idea";
      if (a.status != null && !STATUS.includes(a.status)) fail("status must be idea, chosen, booked or paid");
      if (paidBy && a.status != null && a.status !== "paid") fail("paidBy needs status paid");
      if (paidBy && a.perPerson === true) fail("paidBy needs the total amount (perPerson false)");
      const paidAt = typeof a.paidAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.paidAt) ? a.paidAt : undefined;
      return edit(store!, a.tripId, user, t => {
        const by = paidBy ? t.travelers.filter(x => x.active !== false).map(hhKey).find(k => k.toLowerCase() === paidBy.toLowerCase()) || fail(`Unknown family "${paidBy}" in this trip: use a family name from get_trip`) : undefined;
        const it = addCost(t, {
          cat: a.category, name: n, eur: Math.round(eur * 100) / 100, perPerson: a.perPerson === true, url: link, arrival: a.arrival === true, estimate: a.estimate === true,
          status, ...(by ? { paidBy: by, paidAt } : {}), ...(S(a.bookingRef, 40) ? { bookingRef: S(a.bookingRef, 40) } : {})
        });
        return { added: it.id, name: it.name, status: it.status };
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
    case "update_trip": {
      const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
      const u = { name: S(a.name, 120) || undefined, place: S(a.place) || undefined, country: typeof a.country === "string" ? S(a.country, 60) : undefined, from: day(a.from), to: day(a.to) };
      const title = S(a.compareTitle, 120), label = S(a.variantName, 60), leave = a.leaveCompare === true;
      if (!Object.values(u).some(v => v != null) && a.compareWith == null && !title && !label && !leave) fail("Nothing to change: name, place, country, from, to, compareWith, compareTitle, variantName or leaveCompare");
      if (leave && (a.compareWith != null || title || label)) fail("leaveCompare cannot be combined with compareWith, compareTitle or variantName");
      if (a.compareWith != null && a.compareWith === a.tripId) fail("compareWith must be another trip");
      // erst prüfen, dann die andere Reise in den Vergleich nehmen (sonst hinge sie allein drin)
      const r0 = await readable(store!, a.tripId, user.uid);
      if (!canEdit(r0, user.uid)) fail("You can only view this trip");
      const t0 = parse(r0) || fail("Trip data unreadable");
      if (a.confirm !== true) { const why = needsConfirm(t0!, "change"); if (why) fail(why); }
      const joined = a.compareWith != null ? await joinWith(store!, user, a.compareWith, t0!) : null;
      const out = await edit(store!, a.tripId, user, t => {
        if (a.confirm !== true) { const why = needsConfirm(t, "change"); if (why) fail(why); }
        const f = u.from || t.from, to = u.to || t.to;
        if (f && to && to < f) fail("to is before from");
        const off = updateTrip(t, u);
        if (leave) delete t.cmp;
        if (joined) t.cmp = t.cmp?.id === joined.id ? t.cmp : { ...joined, ...(t.cmp?.label ? { label: t.cmp.label } : {}) };
        if (label) { if (!t.cmp) fail("This trip is in no comparison: use compareWith or compareTitle"); t.cmp!.label = label; }
        if (title && !t.cmp) t.cmp = { id: uid(), title };
        if (a.confirm === true && t.aiSeen) aiKnows(t);
        return { updated: true, ...(t.cmp ? { compare: title || t.cmp.title } : {}), ...(off.length ? { outOfRange: off, note: "These items no longer fit the dates: search again and remove the old ones with remove_item" } : {}) };
      }) as { compare?: string };
      if (title) {
        const t = parse((await store!.get(String(a.tripId)))!);
        if (t?.cmp) await renameCompare(store!, user, t.cmp.id, title);
      }
      return out;
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
    case "mark_booked": {
      const list = Array.isArray(a.items) ? a.items.slice(0, 30) : [];
      if (!list.length) fail("items is required");
      return edit(store!, a.tripId, user, t => {
        const fams = t.travelers.filter(x => x.active !== false).map(hhKey);
        const done = list.map((x: any) => {
          if (x?.status != null && x.status !== "booked" && x.status !== "paid") fail("status must be booked or paid");
          const paidBy = S(x?.paidBy, 60), amt = x?.amountEur == null ? undefined : Number(x.amountEur);
          if (paidBy && x.status === "booked") fail("paidBy needs status paid");
          if (amt != null && (!isFinite(amt) || amt < 0 || amt > 100000)) fail("amountEur must be 0-100000");
          const by = paidBy ? fams.find(k => k.toLowerCase() === paidBy.toLowerCase()) || fail(`Unknown family "${paidBy}" in this trip: use a family name from get_trip`) : undefined;
          const paidAt = typeof x?.paidAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.paidAt) ? x.paidAt : undefined;
          const it = markBooked(t, String(x?.itemId || ""), { status: by || x?.status === "paid" ? "paid" : "booked", ref: S(x?.bookingRef, 40) || undefined, paidBy: by, paidAt, amountEur: amt });
          if (it === "missing") fail(`Item "${x?.itemId}" not found: use item ids from get_trip`);
          if (it === "dropped") fail(`Item "${x?.itemId}" was dropped in the app`);
          const i = it as Exclude<typeof it, string>;
          return { id: i.id, name: i.name || i.options[0]?.label || i.cat, status: i.status };
        });
        return { marked: done };
      });
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

const STATUS = ["idea", "chosen", "booked", "paid"];
/** Anbieter-Link über splitandfly.com/go/, sonst unverändert */
const via = (deps: McpDeps, url: string | undefined, partner: string, cat: string) => (url && deps.go ? deps.go(url, partner, cat) : Promise.resolve(url));
/** Kennzeichnung: mit Partner-Links ein Hinweis, den der Assistent unter Links und Tabelle setzt */
const linkNote = (deps: McpDeps) => (deps.partner ? { linkNote: "Links can be partner links (*): Split&Fly may get a commission, the price for the user is the same. Mark links with * and put this note below them." } : {});
const age = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 120 ? v as number : undefined);
/** Paare { from, to } zum Umbenennen von Familien */
const pairs = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 20).map((x: any) => ({ from: cleanName(x?.from), to: cleanName(x?.to) })).filter(x => x.from && x.to);
/** Fehler aus den Hilfsfunktionen als Hinweis an den Assistenten */
function guard<T>(f: () => T): T {
  try { return f(); } catch (e) { if (e instanceof ToolError) throw e; return fail((e as Error).message); }
}

/** Wohnort aus Text und Land (#608); unbekannt: Fehler mit Bitte um Postleitzahl */
async function homeOf(text: unknown, country: unknown, deps: McpDeps): Promise<HomeHit> {
  const v = S(text);
  const cc = typeof country === "string" && /^[a-z]{2}$/i.test(country.trim()) ? country.trim().toUpperCase() : "DE";
  if (!v) return fail("home is empty");
  // Postleitzahlen der App, sonst Ort aus der Ortsliste (ohne PLZ)
  const hit = deps.home ? await deps.home(v, cc).catch(() => null) : null;
  const x = hit ? null : findCity(GEO, v.replace(/^\S*\d\S*\s+/, ""), cc);
  const c = hit || (x ? { plz: "", ort: x.name, lat: x.lat, lon: x.lon, ...(cc !== "DE" ? { cc } : {}) } : null);
  return c || fail(`Unknown home town "${v}" (${cc}): ask the user for the postal code, e.g. "47906 Kempen"`);
}

/** vom Nutzer genannte Reisende, die nicht gespeichert sind (#608): Reisende und Wohnorte je Familie */
async function newTravelers(v: unknown, deps: McpDeps) {
  const list: { traveler: (i: number) => Traveler }[] = [], homes: [string, HomeHit][] = [];
  for (const x of (Array.isArray(v) ? v : []).slice(0, 30) as any[]) {
    const first = cleanName(x?.first), family = cleanName(x?.family), a = age(x?.age);
    if (!first || !family) fail("Each traveler needs first and family name");
    list.push({ traveler: i => ({ id: uid(), name: first, household: family, ...(a != null ? { age: a } : {}), color: travelerColor(i) }) });
    if (x?.home && !homes.some(([f]) => f === family)) homes.push([family, await homeOf(x.home, x.country, deps)]);
  }
  return { list, homes };
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

/**
 * Vergleich (#428): andere Reise als Ziel; ist sie in keinem Vergleich, beginnt einer (Titel aus dem gemeinsamen
 * Namensanfang). Gibt Kennung und Titel für die Reise zurück, die dazukommt.
 */
async function joinWith(store: TripStore, user: KeyInfo, otherId: unknown, t: Pick<Trip, "cmp" | "name">): Promise<{ id: string; title: string }> {
  const out = await edit(store, otherId, user, o => {
    // steckt die Reise schon in einem Vergleich und die andere in keinem, kommt die andere dazu
    const j = !o.cmp && t.cmp ? { id: t.cmp.id, title: t.cmp.title } : joinTarget(o, t) || { id: o.cmp!.id, title: o.cmp!.title };
    if (!o.cmp) o.cmp = { ...j };
    return { cmp: { id: o.cmp.id, title: o.cmp.title } };
  }) as { cmp: { id: string; title: string } };
  return out.cmp;
}

/** Titel eines Vergleichs an allen Varianten, die der Nutzer bearbeiten darf (die App zeigt den Titel der ersten) */
async function renameCompare(store: TripStore, user: KeyInfo, cid: string, title: string) {
  for (const r of await store.list(user.uid)) {
    if (parse(r)?.cmp?.id !== cid || !canEdit(r, user.uid)) continue;
    await edit(store, r.id, user, x => { if (x.cmp?.id === cid) x.cmp.title = title; return {}; });
  }
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

/** Vorlieben für eine Suche: eigene, Gruppe der Reise, Reise (#602) */
async function searchPrefs(tripId: unknown, user: KeyInfo, deps: McpDeps): Promise<Prefs> {
  const d = deps.profile ? await deps.profile(user.uid).catch(() => null) : null;
  const trip = tripId != null && tripId !== "" && deps.store ? parse(await readable(deps.store, tripId, user.uid)) : null;
  return prefsFor(trip, d || { people: [], groups: [] });
}
