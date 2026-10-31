/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { issueKey, verifyKey } from "./apikey";
import { fromFs, toFs, type TripRecord, type TripStore } from "./firestore";
import { mcpMessage, type McpDeps, type Saved } from "./mcp";
import type { FlightOffer, FlightQuery } from "../../app/src/lib/flights/types";
import type { StayOffer, StayQuery } from "../../app/src/lib/stays/types";
import type { Directory, Trip } from "../../app/src/lib/model";

const leg = (from: string, to: string, dep: string, arr: string) => ({ from, to, dep, arr, minutes: 150, stops: 0, route: [from, to], carriers: ["EW"], flights: ["EW1"] });
const flight = (id: string, price: number): FlightOffer => ({ id, source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR", url: "https://kiwi.com/x", out: leg("DUS", "PMI", "2027-05-10T08:00", "2027-05-10T10:30"), back: leg("PMI", "DUS", "2027-05-13T18:00", "2027-05-13T20:30") });
const stay = (id: string, total: number): StayOffer => ({ id, source: "booking", sourceName: "Booking.com", name: `Hotel ${id}`, total, currency: "EUR", score: 8.5 });

const ME = { uid: "u1", kid: "k1", name: "Dani", at: "2027-04-01" };

/** Reisen im Speicher statt Firestore, mit Versionsprüfung wie dort */
function memStore(): TripStore & { docs: Map<string, TripRecord> } {
  const docs = new Map<string, TripRecord>();
  let v = 0;
  return {
    docs,
    list: async uid => [...docs.values()].filter(d => d.members[uid]),
    get: async id => (docs.has(id) ? { ...docs.get(id)! } : null),
    create: async (id, name, data, uid) => { if (docs.has(id)) throw new Error("exists"); docs.set(id, { id, name, data, owner: uid, members: { [uid]: "owner" }, updateTime: String(++v) }); },
    update: async (rec, name, data) => {
      const cur = docs.get(rec.id)!;
      if (cur.updateTime !== rec.updateTime) throw Object.assign(new Error("conflict"), { conflict: true });
      docs.set(rec.id, { ...cur, name, data, updateTime: String(++v) });
    },
    remove: async rec => {
      if (docs.get(rec.id)?.updateTime !== rec.updateTime) throw Object.assign(new Error("conflict"), { conflict: true });
      docs.delete(rec.id);
    },
    leave: async (rec, uid) => {
      const cur = docs.get(rec.id)!;
      const members = { ...cur.members };
      delete members[uid];
      docs.set(rec.id, { ...cur, members, updateTime: String(++v) });
    }
  };
}

function deps(over: Partial<McpDeps> = {}) {
  const saved = new Map<string, Saved>();
  let searches = 0;
  const d: McpDeps = {
    flights: async () => ({ offers: [flight("f1", 480), flight("f2", 520)], sources: [] }),
    stays: async () => ({ offers: [stay("s1", 600)], sources: [] }),
    events: async () => ({ events: [{ id: "e1", source: "tm", sourceName: "Ticketmaster", name: "Konzert", start: "2027-05-11T20:00", city: "Palma", url: "https://tm/x" }], sources: [] }),
    store: memStore(),
    offers: { put: async list => { for (const [id, v] of list) saved.set(id, JSON.parse(JSON.stringify(v))); }, get: async id => saved.get(id) || null },
    allowSearch: async () => (++searches > 3 ? "Daily limit reached" : null),
    version: "0.0.0", today: "2027-04-01",
    ...over
  };
  return d;
}
const rpc = (method: string, params?: object, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
async function tool(d: McpDeps, name: string, args: object) {
  const r = await mcpMessage(rpc("tools/call", { name, arguments: args }), ME, d) as any;
  return { error: r.result.isError === true, text: r.result.content[0].text as string, data: r.result.structuredContent };
}

describe("Schlüssel für den Konnektor", () => {
  it("prüft Signatur und Sperrliste", async () => {
    const key = await issueKey("geheim", ME);
    expect(key).toMatch(/^sf_[\w-]+\.[\w-]+$/);
    expect(await verifyKey({ MCP_KEY_SECRET: "geheim" }, key)).toEqual(ME);
    expect(await verifyKey({ MCP_KEY_SECRET: "anders" }, key)).toBeNull();
    expect(await verifyKey({ MCP_KEY_SECRET: "geheim", MCP_REVOKED: "x, k1" }, key)).toBeNull();
    expect(await verifyKey({}, key)).toBeNull();
    // verändertes Konto in der Mitte → Signatur passt nicht mehr
    const [body, sig] = key.slice(3).split(".");
    const other = btoa(JSON.stringify({ u: "fremd", k: "k1", n: "", t: "" })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    expect(await verifyKey({ MCP_KEY_SECRET: "geheim" }, `sf_${other}.${sig}`)).toBeNull();
    expect(body.length).toBeGreaterThan(10);
  });
});

describe("Firestore-Werte", () => {
  it("wandelt hin und zurück", () => {
    const v = { a: "x", n: 3, d: 1.5, b: true, z: null, l: ["p", 2], m: { k: "v" } };
    expect(fromFs(toFs(v))).toEqual(v);
    expect(toFs(3)).toEqual({ integerValue: "3" });
  });
});

describe("KI-Konnektor (MCP)", () => {
  it("Handschlag, Werkzeugliste und Benachrichtigungen", async () => {
    const d = deps();
    const init = await mcpMessage(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }), ME, d) as any;
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities.tools).toBeTruthy();
    expect(await mcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ME, d)).toBeNull();
    const names = ((await mcpMessage(rpc("tools/list"), ME, d)) as any).result.tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(["search_flights", "search_stays", "create_trip", "add_flight", "get_trip"]));
    // ohne Dienstkonto nur Suchen
    const only = ((await mcpMessage(rpc("tools/list"), ME, deps({ store: null }))) as any).result.tools.map((t: any) => t.name);
    expect(only.some((n: string) => n.includes("trip"))).toBe(false);
    expect(((await mcpMessage(rpc("gibtsnicht"), ME, d)) as any).error.code).toBe(-32601);
  });

  it("gibt der Unterkunftssuche Ländercode und Koordinaten mit (#593)", async () => {
    let got: any;
    const d = deps({ stays: async q => { got = q; return { offers: [], sources: [] }; } });
    await tool(d, "search_stays", { place: "Palma", country: "Spain", checkin: "2027-05-07", checkout: "2027-05-10", adults: 2 });
    expect(got).toMatchObject({ cc: "ES", country: "Spain" });
    expect(typeof got.lat).toBe("number");
    expect(typeof got.lon).toBe("number");
    // Ort mit deutschem Land und ohne Land
    await tool(d, "search_stays", { place: "Split", country: "Kroatien", checkin: "2027-05-07", checkout: "2027-05-10", adults: 2 });
    expect(got).toMatchObject({ cc: "HR", country: "Croatia" });
    await tool(d, "search_stays", { place: "Nirgendwo-Dorf", checkin: "2027-05-07", checkout: "2027-05-10", adults: 2 });
    expect(got.cc).toBeUndefined();
  });

  it("findet kleine Orte und ignoriert Gemeinde oder Insel nach dem Komma (#622)", async () => {
    let got: any;
    const d = deps({ stays: async q => { got = q; return { offers: [], sources: [] }; } });
    for (const place of ["Cala Ratjada", "Cala Rajada", "Cala Rajada, Capdepera", "Cala Ratjada, Mallorca"]) {
      await tool(d, "search_stays", { place, country: "Spanien", checkin: "2027-05-07", checkout: "2027-05-10", adults: 2 });
      expect(got, place).toMatchObject({ place: "Cala Ratjada", country: "Spain", cc: "ES", lat: 39.712, lon: 3.463 });
    }
    // ohne Land: kleine Orte aller Länder werden gefunden
    await tool(d, "search_stays", { place: "Cala Rajada, Capdepera", checkin: "2027-05-07", checkout: "2027-05-10", adults: 2 });
    expect(got).toMatchObject({ cc: "ES", lat: 39.712 });
  });

  it("markiert geschätzte Kosten als Schätzung (#594)", async () => {
    const d = deps();
    const id = (await tool(d, "create_trip", { place: "Palma", from: "2027-05-10", to: "2027-05-13", adults: 2, travelersFrom: "user" })).data.tripId;
    await tool(d, "add_cost", { tripId: id, category: "stay", name: "Unterkunft", amountEur: 500, estimate: true });
    await tool(d, "add_cost", { tripId: id, category: "transport", name: "Mietwagen", amountEur: 150 });
    const trip: Trip = JSON.parse((d.store as any).docs.get(id).data);
    expect(trip.items[0].options[0].estimate).toBe(true);
    expect(trip.items[1].options[0].estimate).toBeUndefined();
  });

  it("sagt der KI, dass die App Anreise zum Flughafen samt Parken selbst rechnet (nicht doppelt anlegen)", async () => {
    const d = deps();
    const init = await mcpMessage(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }), ME, d) as any;
    expect(init.result.instructions).toContain("departure airport");
    const tools = ((await mcpMessage(rpc("tools/list"), ME, d)) as any).result.tools;
    const cost = tools.find((t: any) => t.name === "add_cost");
    expect(cost.description).toContain("Not for the way to the departure airport");
    expect(cost.inputSchema.properties.arrival.description).toContain("never for the way to the departure airport");
  });

  it("sucht, legt eine Reise an, übernimmt Angebote und zeigt sie ohne Namen", async () => {
    const d = deps();
    const fl = await tool(d, "search_flights", { from: ["dus"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13", adults: 2, childAges: [8] });
    expect(fl.data.offers[0]).toMatchObject({ id: "f1", priceTotal: 480, link: "https://kiwi.com/x" });
    await tool(d, "search_stays", { place: "Palma", checkin: "2027-05-10", checkout: "2027-05-13", adults: 2, childAges: [8] });

    const made = await tool(d, "create_trip", { place: "Palma", country: "Spanien", from: "2027-05-10", to: "2027-05-13", adults: 2, childAges: [8, 1], travelersFrom: "user" });
    const id = made.data.tripId;
    expect(made.data.travelers).toEqual({ adults: 2, children: 1, infants: 1 });
    expect((await tool(d, "add_flight", { tripId: id, offerId: "f1" })).error).toBe(false);
    expect((await tool(d, "add_stay", { tripId: id, offerId: "s1" })).error).toBe(false);
    expect((await tool(d, "add_cost", { tripId: id, category: "transport", name: "Mietwagen", amountEur: 150 })).error).toBe(false);
    // falsche Art oder unbekanntes Angebot
    expect((await tool(d, "add_flight", { tripId: id, offerId: "s1" })).error).toBe(true);

    const got = await tool(d, "get_trip", { tripId: id });
    expect(got.data.items.map((i: any) => [i.category, i.eur])).toEqual([["flights", 480], ["stay", 600], ["transport", 150]]);
    expect(got.data.approxTotalEur).toBe(1230);
    expect(got.text).not.toMatch(/Dani/);
    const trip: Trip = JSON.parse((d.store as any).docs.get(id).data);
    expect(trip.items.every(i => i.ai)).toBe(true);
    expect(trip.items[1]).toMatchObject({ from: "2027-05-10", to: "2027-05-13", ai: { kind: "suggested" } });
    expect(trip.travelers.every(t => t.placeholder)).toBe(true);

    const list = await tool(d, "list_trips", {});
    expect(list.data.trips).toEqual([{ id, name: "Palma", place: "Palma", from: "2027-05-10", to: "2027-05-13", role: "owner", byAi: true }]);

    const rm = await tool(d, "remove_item", { tripId: id, itemId: got.data.items[2].id });
    expect(rm.error).toBe(false);
    expect((await tool(d, "get_trip", { tripId: id })).data.items).toHaveLength(2);
  });

  it("Buchungstabelle: Links in get_trip, Posten nach der Buchung als gebucht bzw. bezahlt markieren", async () => {
    const d = deps();
    const init = await mcpMessage(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }), ME, d) as any;
    expect(init.result.instructions).toContain("booking table");
    await tool(d, "search_flights", { from: ["DUS"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13", adults: 2 });
    const id = (await tool(d, "create_trip", { place: "Palma", from: "2027-05-10", to: "2027-05-13", adults: 2, travelersFrom: "user" })).data.tripId;
    await tool(d, "add_flight", { tripId: id, offerId: "f1" });
    await tool(d, "add_flight", { tripId: id, offerId: "f2", travelers: 2 });
    await tool(d, "add_cost", { tripId: id, category: "transport", name: "Mietwagen", amountEur: 150 });
    const got = await tool(d, "get_trip", { tripId: id });
    const [fl, , car] = got.data.items;
    expect(fl.link).toBe("https://kiwi.com/x");
    const fam = got.data.families[0].name;

    expect((await tool(d, "mark_booked", { tripId: id, items: [{ itemId: "nix" }] })).text).toContain("not found");
    expect((await tool(d, "mark_booked", { tripId: id, items: [{ itemId: fl.id, paidBy: "Meyer" }] })).text).toContain("Unknown family");
    expect((await tool(d, "mark_booked", { tripId: id, items: [{ itemId: fl.id, status: "booked", paidBy: fam }] })).text).toContain("needs status paid");
    const m = await tool(d, "mark_booked", { tripId: id, items: [{ itemId: fl.id, bookingRef: "ABC123" }, { itemId: car.id, paidBy: fam, paidAt: "2027-04-02" }] });
    expect(m.data.marked.map((x: any) => x.status)).toEqual(["booked", "paid"]);
    const trip: Trip = JSON.parse((d.store as any).docs.get(id).data);
    expect(trip.items[0]).toMatchObject({ status: "booked", booking: { ref: "ABC123" } });
    expect(trip.items[2].payments).toEqual([{ amount: 150, by: fam, at: "2027-04-02" }]);
    // bezahlt bleibt bezahlt; get_trip zeigt Buchungsnummer und Bezahltes
    await tool(d, "mark_booked", { tripId: id, items: [{ itemId: car.id }] });
    const again = (await tool(d, "get_trip", { tripId: id })).data.items;
    expect(again[0]).toMatchObject({ status: "booked", bookingRef: "ABC123" });
    expect(again[2]).toMatchObject({ status: "paid", paidEur: 150 });
    expect((await tool(d, "remove_item", { tripId: id, itemId: fl.id })).text).toMatch(/Booked or paid/);

    // mit Weiterleitung und Partner-Links: Links über splitandfly.com, Kennzeichnung, Link zur Reise und Anleitung
    const d2 = deps({ partner: true, appUrl: "https://splitandfly.com/", go: async (u, p, c) => `https://splitandfly.com/go/?l=${encodeURIComponent(`${p}|${c}|${u}`)}` });
    (d2 as any).store = d.store;
    const fs = await tool(d2, "search_flights", { from: ["DUS"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13", adults: 2 });
    expect(fs.data.offers[0].link).toBe(`https://splitandfly.com/go/?l=${encodeURIComponent("Kiwi.com|flights|https://kiwi.com/x")}`);
    expect(fs.data.linkNote).toContain("commission");
    const g2 = (await tool(d2, "get_trip", { tripId: id })).data;
    expect(g2.items[0].link).toBe(`https://splitandfly.com/go/?l=${encodeURIComponent("|flights|https://kiwi.com/x")}`);
    expect(g2).toMatchObject({ appLink: `https://splitandfly.com/?reise=${id}`, guideLink: "https://splitandfly.com/anleitung/kosten/" });
    expect(g2.linkNote).toBeTruthy();
    expect(got.data.linkNote).toBeUndefined();
  });

  it("schützt fremde, nur lesbare und gebuchte Reisen", async () => {
    const d = deps();
    const store = d.store as ReturnType<typeof memStore>;
    const t = (items: object[]) => JSON.stringify({ id: "x", name: "X", place: "Rom", country: "", travelers: [], items, tiers: {}, settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 } } });
    store.docs.set("fremd", { id: "fremd", name: "X", data: t([]), owner: "u2", members: { u2: "owner" }, updateTime: "1" });
    store.docs.set("lesen", { id: "lesen", name: "X", data: t([]), owner: "u2", members: { u2: "owner", u1: "viewer" }, updateTime: "1" });
    store.docs.set("gebucht", { id: "gebucht", name: "X", data: t([{ id: "b", cat: "stay", name: "Hotel", status: "booked", options: [] }]), owner: "u1", members: { u1: "owner" }, updateTime: "1" });
    expect((await tool(d, "get_trip", { tripId: "fremd" })).text).toMatch(/not found/);
    expect((await tool(d, "get_trip", { tripId: "lesen" })).error).toBe(false);
    expect((await tool(d, "add_cost", { tripId: "lesen", category: "misc", name: "x", amountEur: 1 })).text).toMatch(/only view/);
    expect((await tool(d, "remove_item", { tripId: "gebucht", itemId: "b" })).text).toMatch(/Booked or paid/);
  });

  it("versucht es nach einer gleichzeitigen Änderung noch einmal", async () => {
    const d = deps();
    const store = d.store as ReturnType<typeof memStore>;
    const made = await tool(d, "create_trip", { place: "Rom", adults: 1, travelersFrom: "user" });
    const id = made.data.tripId;
    // erste Speicherung trifft auf eine inzwischen geänderte Reise
    const orig = store.update;
    let first = true;
    store.update = async (rec, name, data, uid) => { if (first) { first = false; const c = store.docs.get(id)!; store.docs.set(id, { ...c, updateTime: c.updateTime + "b" }); } return orig(rec, name, data, uid); };
    expect((await tool(d, "add_cost", { tripId: id, category: "misc", name: "Eis", amountEur: 12 })).error).toBe(false);
    expect(JSON.parse(store.docs.get(id)!.data).items).toHaveLength(1);
  });

  it("hält das Tageslimit für Suchen ein", async () => {
    const d = deps();
    for (let i = 0; i < 3; i++) expect((await tool(d, "search_events", { city: "Palma" })).error).toBe(false);
    const r = await tool(d, "search_events", { city: "Palma" });
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/limit/);
  });

  it("große Gruppe: Flug für 2 Plätze gesucht, in Buchungen auf die Gruppe verteilt, Rest auf einen zweiten Flug", async () => {
    const d = deps();
    const id = (await tool(d, "create_trip", { place: "Cala Rajada", from: "2027-05-10", to: "2027-05-13", adults: 10, travelersFrom: "user" })).data.tripId;
    await tool(d, "search_flights", { from: ["DUS"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13", adults: 2 });
    const a = await tool(d, "add_flight", { tripId: id, offerId: "f1", travelers: 6 });
    expect(a.data.bookings).toBe(3);
    const b = await tool(d, "add_flight", { tripId: id, offerId: "f2" });
    expect(b.data.bookings).toBe(2);
    const trip: Trip = JSON.parse((d.store as any).docs.get(id).data);
    const fl = trip.items.filter(i => i.cat === "flights");
    expect(fl.map(i => i.participants?.length)).toEqual([2, 2, 2, 2, 2]);
    expect(new Set(fl.flatMap(i => i.participants)).size).toBe(10);
    expect(fl.map(i => i.options[0].price.unit)).toEqual([480, 480, 480, 520, 520]);
  });

  it("Zubringer nur für einen Teil der Gruppe (people), danach Weiterflug für alle", async () => {
    const d = deps({ today: "2026-10-30" });
    const made = await tool(d, "create_trip", { place: "Málaga", from: "2027-01-17", to: "2027-01-29", travelers: [
      { first: "Katarzyna", family: "Kronik", age: 50 }, { first: "Lena", family: "Kronik", age: 16 }, { first: "Nina", family: "Kronik", age: 14 }, { first: "Leon", family: "Kronik", age: 13 }
    ] });
    const id = made.data.tripId, ids = made.data.people.map((p: any) => p.id) as string[];
    expect(made.data.travelers).toMatchObject({ adults: 4, children: 0, teens: 3 });
    await tool(d, "search_flights", { from: ["DTM"], to: ["KTW"], depart: "2027-01-17", return: "2027-01-29", adults: 1 });
    expect((await tool(d, "add_flight", { tripId: id, offerId: "f1", people: [ids[0]] })).data.bookings).toBe(1);
    await tool(d, "search_flights", { from: ["KTW"], to: ["AGP"], depart: "2027-01-18", return: "2027-01-28", adults: 1, childAges: [16, 14, 13] });
    expect((await tool(d, "add_flight", { tripId: id, offerId: "f2", people: ids })).data.bookings).toBe(1);
    expect((await tool(d, "add_flight", { tripId: id, offerId: "f2", people: ["gibtsnicht"] })).text).toMatch(/Unknown traveler/);
    const fl = (JSON.parse((d.store as any).docs.get(id).data) as Trip).items.filter(i => i.cat === "flights");
    expect(fl.map(i => i.participants)).toEqual([[ids[0]], ids]);
    expect(fl.map(i => i.options[0].price.unit)).toEqual([480, 520]);
  });

  it("warnt bei doppeltem Flug oder Hotel für dieselben Reisenden und ersetzt mit replace", async () => {
    const d = deps();
    const id = (await tool(d, "create_trip", { place: "Madeira", from: "2027-05-10", to: "2027-05-13", adults: 3, travelersFrom: "user" })).data.tripId;
    await tool(d, "search_flights", { from: ["DUS"], to: ["FNC"], depart: "2027-05-10", return: "2027-05-13", adults: 3 });
    const a = await tool(d, "add_flight", { tripId: id, offerId: "f1" });
    expect(a.data.warning).toBeUndefined();
    const b = await tool(d, "add_flight", { tripId: id, offerId: "f2", travelers: 3 });
    expect(b.data.warning).toMatch(new RegExp(a.data.added[0]));
    const c = await tool(d, "add_flight", { tripId: id, offerId: "f2", replace: b.data.added[0] });
    expect(c.data).toMatchObject({ replaced: b.data.added[0] });
    await tool(d, "remove_item", { tripId: id, itemId: a.data.added[0] });
    await tool(d, "search_stays", { place: "Funchal", checkin: "2027-05-10", checkout: "2027-05-13", adults: 3 });
    const s1 = await tool(d, "add_stay", { tripId: id, offerId: "s1" });
    expect((await tool(d, "add_stay", { tripId: id, offerId: "s1", replace: "gibtsnicht" })).text).toMatch(/not found/);
    expect((await tool(d, "add_stay", { tripId: id, offerId: "s1", replace: c.data.added[0] })).text).toMatch(/accommodation item/);
    const s2 = await tool(d, "add_stay", { tripId: id, offerId: "s1", replace: s1.data.added });
    expect(s2.data.warning).toBeUndefined();
    const t: Trip = JSON.parse((d.store as any).docs.get(id).data);
    expect(t.items.map(i => i.id)).toEqual([c.data.added[0], s2.data.added]);
    // in der App geänderter Posten: erst nach Rückfrage ersetzen, vorher bleibt alles wie es war
    t.items[1].name = "Hotel am Meer"; (d.store as any).docs.get(id).data = JSON.stringify(t);
    expect((await tool(d, "add_stay", { tripId: id, offerId: "s1", replace: s2.data.added })).text).toMatch(/confirm true/);
    expect(JSON.parse((d.store as any).docs.get(id).data).items).toHaveLength(2);
    expect((await tool(d, "add_stay", { tripId: id, offerId: "s1", replace: s2.data.added, confirm: true })).data.replaced).toBe(s2.data.added);
  });

  it("Anreise zum Flughafen, Parken, Kasse und Anwesenheit je Familie übernehmen", async () => {
    const d = deps();
    const made = await tool(d, "create_trip", { place: "Madeira", from: "2027-05-10", to: "2027-05-17", travelers: [
      { first: "Anna", family: "Klein", age: 40 }, { first: "Ben", family: "Groß", age: 42 }
    ], households: [{ family: "klein", toAirport: "drop", fuelMoney: false }] });
    expect(made.data.families.find((f: any) => f.name === "Klein")).toMatchObject({ toAirport: "drop", fuelMoney: false });
    const id = made.data.tripId;
    const u = await tool(d, "update_travelers", { tripId: id, households: [
      { family: "Groß", carpoolWith: "Klein", purse: "each", arrive: "2027-05-11" },
      { family: "Klein", toAirport: "car", cars: 2, parkingEur: 89 }
    ] });
    expect(u.error).toBe(false);
    const t: Trip = JSON.parse((d.store as any).docs.get(id).data);
    expect(t.households).toMatchObject({ Klein: { mode: "car", cars: 2, parking: { paid: 89 } }, "Groß": { mode: "with", link: "Klein", kasse: "each", arrive: "2027-05-11" } });
    await tool(d, "update_travelers", { tripId: id, households: [{ family: "Klein", parkingFree: true }, { family: "Groß", toAirport: "train", arrive: null }] });
    const t2: Trip = JSON.parse((d.store as any).docs.get(id).data);
    expect(t2.households!.Klein.parking).toEqual({ off: true });
    expect(t2.households!["Groß"]).toMatchObject({ mode: "train" });
    expect(t2.households!["Groß"].link).toBeUndefined();
    expect(t2.households!["Groß"].arrive).toBeUndefined();
    expect((await tool(d, "update_travelers", { tripId: id, households: [{ family: "Meier", toAirport: "car" }] })).text).toMatch(/Unknown family/);
    expect((await tool(d, "update_travelers", { tripId: id, households: [{ family: "Klein", carpoolWith: "Klein" }] })).text).toMatch(/another family/);
    expect((await tool(d, "update_travelers", { tripId: id, households: [{ family: "Klein", toAirport: "with" }] })).text).toMatch(/carpoolWith/);
  });

  it("Platzhalter: Jugendliche heißen Kind, zahlen aber Erwachsenentarif", async () => {
    const d = deps();
    const made = await tool(d, "create_trip", { place: "Málaga", adults: 1, childAges: [16, 8, 1], travelersFrom: "user" });
    expect(made.data.people.map((p: any) => p.first)).toEqual(["Fuchs Erw. 1", "Fuchs Kind 1", "Fuchs Kind 2", "Fuchs Kleinkind 1"]);
    expect(made.data.travelers).toMatchObject({ adults: 2, children: 1, infants: 1, teens: 1 });
    const t: Trip = JSON.parse((d.store as any).docs.get(made.data.tripId).data);
    expect(t.travelers.map(x => x.kind)).toEqual(["adult", "child", "child", "infant"]);
  });

  it("Familien und Gruppen aus dem Konto: mit Namen und PLZ sehen, echte Reisende anlegen, nie raten (#595, #608)", async () => {
    const dir: Directory = {
      me: "p1",
      people: [
        { id: "p1", first: "Dani", last: "Klein", birth: "1990-03-01", home: { plz: "47906", ort: "Kempen", lat: 51.36, lon: 6.42 } },
        { id: "p2", first: "Fenia", last: "Klein", birth: "2023-06-01" },
        { id: "p3", first: "Mia", last: "Klein", age: 9 },
        { id: "p4", first: "Lars", last: "Hase", age: 40 }
      ],
      groups: [{ id: "g1", name: "Ostsee-Truppe", memberIds: ["p1", "p2", "p4"], prefs: { budget: "low" } }],
      prefs: { airports: ["DUS", "CGN"], plz: "47906", styles: ["beach"] }
    };
    const d = deps({ profile: async uid => (uid === ME.uid ? JSON.parse(JSON.stringify(dir)) : null) });
    const view = await tool(d, "get_my_travelers", { date: "2027-08-09" });
    expect(view.data.families).toEqual([
      { id: "F1", name: "Klein", you: true, members: [{ id: "p1", first: "Dani", age: 37 }, { id: "p2", first: "Fenia", age: 4 }, { id: "p3", first: "Mia", age: 9 }], adults: 1, childAges: [9, 4], home: "47906 Kempen" },
      { id: "F2", name: "Hase", members: [{ id: "p4", first: "Lars", age: 40 }], adults: 1, childAges: [] }
    ]);
    // Gruppe mit ihren Mitgliedern gezählt (nur ein Teil von F1: partOf)
    expect(view.data.groups).toEqual([{ name: "Ostsee-Truppe", members: ["p1", "p2", "p4"], families: ["F1", "F2"], partOf: ["F1"], adults: 2, childAges: [4], prefs: { budget: "low" } }]);
    expect(view.data.prefs).toEqual({ airports: ["DUS", "CGN"], styles: ["beach"] });
    // Alter statt Geburtsdatum
    expect(view.text).not.toMatch(/1990|2023-06/);

    // ohne Angabe, wer reist: Fehler mit der Bitte nachzufragen
    const guess = await tool(d, "create_trip", { place: "Tirana", adults: 2, childAges: [9, 7, 3] });
    expect(guess.error).toBe(true);
    expect(guess.text).toContain("Do not guess");
    expect((await tool(d, "create_trip", { place: "Tirana", families: ["F9"] })).text).toContain("Unknown family");

    // Familie aus dem Konto: echte Personen, Alter zum Reisebeginn, Wohnort der Familie
    const made = await tool(d, "create_trip", { place: "Tirana", from: "2027-08-09", to: "2027-08-30", families: ["F1"] });
    expect(made.error).toBe(false);
    expect(made.data.travelers).toEqual({ adults: 1, children: 2, infants: 0 });
    const trip = JSON.parse((await d.store!.get(made.data.tripId))!.data) as Trip;
    expect(trip.travelers.map(t => [t.personId, t.household, t.age])).toEqual([["p1", "Klein", 37], ["p2", "Klein", 4], ["p3", "Klein", 9]]);
    expect(trip.households?.Klein?.geo?.ort).toBe("Kempen");
    const shown = await tool(d, "get_trip", { tripId: made.data.tripId });
    expect(shown.data.people.map((p: any) => [p.first, p.family, p.age, p.saved])).toEqual([["Dani", "Klein", 37, "p1"], ["Fenia", "Klein", 4, "p2"], ["Mia", "Klein", 9, "p3"]]);
    expect(shown.data.families).toEqual([{ name: "Klein", home: "47906 Kempen" }]);
    expect(shown.text).not.toMatch(/1990/);

    // Gruppe: nur ihre Mitglieder, mit Herkunft der Gruppe
    const grp = await tool(d, "create_trip", { place: "Usedom", group: "ostsee-truppe" });
    const gt = JSON.parse((await d.store!.get(grp.data.tripId))!.data) as Trip;
    expect(gt.travelers.map(t => t.personId)).toEqual(["p1", "p2", "p4"]);
    expect(gt.travelers.every(t => t.group === "Ostsee-Truppe")).toBe(true);

    // leeres Konto: Hinweis statt Liste
    const empty = deps({ profile: async () => null });
    expect((await tool(empty, "get_my_travelers", {})).data.note).toContain("ask the user");
  });

  it("Gruppenchat (#608): Personen und Gruppe speichern, Reise mit Familien und Startorten, Namen korrigieren, bezahlte Kosten", async () => {
    let dir: Directory = {
      me: "p1",
      people: [
        { id: "p1", first: "Dani", last: "Klein", birth: "1990-03-01", home: { plz: "47906", ort: "Kempen", lat: 51.36, lon: 6.42 } },
        { id: "p2", first: "Mia", last: "Klein", age: 9 }
      ],
      groups: []
    };
    const homes: Record<string, { plz: string; ort: string; lat: number; lon: number }> = {
      kempen: { plz: "47906", ort: "Kempen", lat: 51.364, lon: 6.419 }, wuppertal: { plz: "42103", ort: "Wuppertal", lat: 51.256, lon: 7.148 }
    };
    const d = deps({
      profile: async () => JSON.parse(JSON.stringify(dir)),
      saveProfile: async (_uid, change) => { const next = JSON.parse(JSON.stringify(dir)); const r = change(next); dir = next; return r; },
      home: async text => homes[text.replace(/^\d+\s+/, "").toLowerCase()] || null
    });
    // neue Personen mit Tippfehler, Wohnort per Ort; doppelt genannt wird nicht doppelt angelegt
    const saved = await tool(d, "save_people", { people: [
      { first: "Nora", last: "Brink", age: 35, home: "Kempen" }, { first: "Jon", last: "Brink", age: 1, home: "Kempen" },
      { first: "Ida", last: "Wald", age: 36, home: "Wuppertal" }, { first: "Ida", last: "Wald", age: 36 }
    ] });
    expect(saved.error).toBe(false);
    expect(dir.people).toHaveLength(5);
    expect(dir.people.find(p => p.first === "Ida")?.home).toMatchObject({ plz: "42103", ort: "Wuppertal" });
    expect((await tool(d, "save_people", { people: [{ first: "X", last: "Y", home: "Atlantis" }] })).text).toContain("postal code");
    expect((await tool(d, "save_people", { people: [{ first: "Nur" }] })).text).toContain("first and last name");
    // Alter aus Geburtsdatum bleibt
    const birth = await tool(d, "save_people", { people: [{ id: "p1", age: 20 }] });
    expect(birth.data.notes[0]).toContain("birth date");
    expect(dir.people[0].age).toBeUndefined();

    // Gruppe aus Familie und einzelnen Personen; ändern und umbenennen
    const jon = dir.people.find(p => p.first === "Jon")!.id;
    const g = await tool(d, "save_group", { name: "Ferienhaus", members: ["F1", ...dir.people.filter(p => p.last !== "Klein" && p.id !== jon).map(p => p.id)] });
    expect(g.data).toMatchObject({ created: true, group: { name: "Ferienhaus", adults: 3, childAges: [9], partOf: ["F2"] } });
    expect((await tool(d, "save_group", { name: "ferienhaus", add: ["F2"] })).data.group.partOf).toBeUndefined();
    expect((await tool(d, "save_group", { name: "Leer" })).text).toContain("needs members");
    expect((await tool(d, "save_group", { name: "Ferienhaus", add: ["p9"] })).text).toContain("Unknown person");

    // Reise aus der Gruppe plus eine nicht gespeicherte Familie mit Startort
    const made = await tool(d, "create_trip", { place: "Hümmling", from: "2027-05-05", to: "2027-05-10", group: "Ferienhaus", travelers: [
      { first: "Ole", family: "Berger", age: 35, home: "47906 Kempen" }, { first: "Ella", family: "Berger", age: 3 }
    ] });
    expect(made.error).toBe(false);
    const id = made.data.tripId;
    expect(made.data.families).toEqual([
      { name: "Klein", home: "47906 Kempen" }, { name: "Brink", home: "47906 Kempen" }, { name: "Wald", home: "42103 Wuppertal" }, { name: "Berger", home: "47906 Kempen" }
    ]);
    expect(made.data.travelers).toEqual({ adults: 4, children: 2, infants: 1 });

    // bezahlte Buchung: Zahler ist eine Familie der Reise, mit Buchungsnummer
    expect((await tool(d, "add_cost", { tripId: id, category: "stay", name: "Ferienhaus", amountEur: 1606, paidBy: "Meyer" })).text).toContain("Unknown family");
    expect((await tool(d, "add_cost", { tripId: id, category: "stay", name: "Ferienhaus", amountEur: 1606, paidBy: "wald", perPerson: true })).error).toBe(true);
    const paid = await tool(d, "add_cost", { tripId: id, category: "stay", name: "Ferienhaus", amountEur: 1606, paidBy: "wald", paidAt: "2026-10-20", bookingRef: "123" });
    expect(paid.data.status).toBe("paid");
    let trip = JSON.parse((await d.store!.get(id))!.data) as Trip;
    expect(trip.items[0]).toMatchObject({ status: "paid", booking: { ref: "123" }, payments: [{ amount: 1606, by: "Wald", at: "2026-10-20" }] });
    expect((await tool(d, "add_cost", { tripId: id, category: "misc", name: "X", amountEur: 1, status: "gebucht" })).error).toBe(true);

    // Tippfehler korrigieren: Familie (mit Zahlung) und Vorname; Wohnort ändern; Reisende dazu
    const q = made.data.people.find((p: any) => p.first === "Jon").id;
    const up = await tool(d, "update_travelers", { tripId: id, renameFamily: [{ from: "Brink", to: "Brinck" }, { from: "Wald", to: "Waldner" }], change: [{ id: q, first: "John" }], homes: [{ family: "Berger", home: "Wuppertal" }], add: { travelers: [{ first: "Lina", family: "Berger", age: 5 }] } });
    expect(up.error).toBe(false);
    expect(up.data.families).toContainEqual({ name: "Berger", home: "42103 Wuppertal" });
    trip = JSON.parse((await d.store!.get(id))!.data) as Trip;
    expect(trip.travelers.filter(t => t.household === "Brinck").map(t => t.name)).toEqual(["Nora", "John"]);
    expect(trip.households?.Waldner?.geo?.ort).toBe("Wuppertal");
    expect(trip.households?.Wald).toBeUndefined();
    expect(trip.items[0].payments?.[0].by).toBe("Waldner");
    expect(trip.travelers.filter(t => t.household === "Berger").map(t => t.name)).toEqual(["Ole", "Ella", "Lina"]);
    expect((await tool(d, "update_travelers", { tripId: id, change: [{ id: "nix", first: "A" }] })).text).toContain("Unknown traveler");
    expect((await tool(d, "update_travelers", { tripId: id })).text).toContain("Nothing to change");
    // gespeicherte Personen bleiben, bis sie selbst geändert werden; Familie im Konto umbenennen
    await tool(d, "save_people", { renameFamily: [{ from: "brink", to: "Brinck" }], people: [{ id: jon, first: "John" }] });
    expect(dir.people.filter(p => p.last === "Brinck").map(p => p.first)).toEqual(["Nora", "John"]);
    // gespeicherte Personen nicht doppelt in die Reise
    const again = await tool(d, "update_travelers", { tripId: id, add: { group: "Ferienhaus" } });
    expect(again.data.people).toHaveLength(8);

    // Platzhalter werden mit Vornamen echt
    const ph = await tool(d, "create_trip", { place: "Palma", adults: 2, travelersFrom: "user" });
    const ids = ph.data.people.map((p: any) => p.id);
    const named = await tool(d, "update_travelers", { tripId: ph.data.tripId, change: [{ id: ids[0], first: "Rosa", family: "Berger", age: 37 }] });
    expect(named.data.people[0]).toEqual({ id: ids[0], first: "Rosa", family: "Berger", age: 37 });
    expect(named.data.people[1].placeholder).toBe(true);
  });

  it("Vorlieben (#602): Suchen nehmen fehlende Angaben aus Konto, Gruppe und Reise; speichern und je Reise setzen", async () => {
    let dir: Directory = { people: [], groups: [], prefs: { airports: ["DUS", "CGN"], maxStops: 0, bags: true, avoid: ["TR"], stayType: "whole", plz: "47906" } };
    const fq: FlightQuery[] = [], sq: StayQuery[] = [];
    const d = deps({
      flights: async q => { fq.push(q); return { offers: [flight("f1", 480)], sources: [] }; },
      stays: async q => { sq.push(q); return { offers: [stay("s1", 600)], sources: [] }; },
      profile: async () => JSON.parse(JSON.stringify(dir)),
      savePrefs: async (_uid, change) => { dir = { ...dir, prefs: change(dir.prefs || {}) }; return dir.prefs!; },
      allowSearch: async () => null
    });
    // ohne Abflughafen: aus den Vorlieben, dazu Umstiege, Gepäck, gesperrte Länder
    const a = await tool(d, "search_flights", { to: ["PMI"], depart: "2027-05-10", adults: 2 });
    expect(a.error).toBe(false);
    expect(fq[0]).toMatchObject({ fromAirports: ["DUS", "CGN"], maxStops: 0, bags: true, avoidCountries: ["TR"] });
    expect(a.data.appliedPreferences).toEqual({ airports: ["DUS", "CGN"], maxStops: 0, bags: true, avoid: ["TR"] });
    // ausdrücklich angegeben geht vor
    await tool(d, "search_flights", { from: ["FRA"], to: ["PMI"], depart: "2027-05-10", adults: 2, maxStops: 1 });
    expect(fq[1]).toMatchObject({ fromAirports: ["FRA"], maxStops: 1, avoidCountries: ["TR"] });
    // Unterkunft: Art aus den Vorlieben, gesperrtes Land abgelehnt
    const st = await tool(d, "search_stays", { place: "Palma", country: "Spain", checkin: "2027-05-10", checkout: "2027-05-13", adults: 2 });
    expect(sq[0].type).toBe("whole");
    expect(st.data.appliedPreferences).toEqual({ stayType: "whole" });
    expect((await tool(d, "search_stays", { place: "Antalya", country: "Turkey", checkin: "2027-05-10", checkout: "2027-05-13", adults: 2 })).text).toContain("countries to avoid");

    // Vorlieben je Reise: beim Anlegen und später; gehen den eigenen vor, gelten für Suchen mit tripId
    const made = await tool(d, "create_trip", { place: "Palma", adults: 2, travelersFrom: "user", preferences: { maxStops: 2, budget: "high", plz: "1" } });
    const id = made.data.tripId;
    expect((await tool(d, "get_trip", { tripId: id })).data.preferences).toEqual({ maxStops: 2, budget: "high" });
    await tool(d, "search_flights", { to: ["PMI"], depart: "2027-05-10", adults: 2, tripId: id });
    expect(fq[2].maxStops).toBe(2);
    expect((await tool(d, "set_trip_preferences", { tripId: id, stayType: "hotel" })).data.preferences).toEqual({ maxStops: 2, budget: "high", stayType: "hotel" });
    expect((await tool(d, "set_trip_preferences", { tripId: id, reset: true })).data.preferences).toBeNull();
    expect((await tool(d, "get_trip", { tripId: id })).data.preferences).toBeUndefined();

    // eigene Vorlieben speichern: nur gültige Felder, gesperrte Länder kommen dazu, PLZ bleibt im Konto
    const saved = await tool(d, "save_my_preferences", { budget: "low", board: "half", avoid: ["eg"], minStars: 9 });
    expect(saved.data.saved).toEqual({ budget: "low", board: "half", avoid: ["EG"] });
    expect(dir.prefs).toMatchObject({ airports: ["DUS", "CGN"], budget: "low", board: "half", avoid: ["TR", "EG"], plz: "47906" });
    expect(saved.text).not.toContain("47906");
    expect((await tool(d, "save_my_preferences", { budget: "riesig" })).error).toBe(true);

    // ohne Flughäfen in den Vorlieben: nachfragen
    dir = { people: [], groups: [] };
    expect((await tool(d, "search_flights", { to: ["PMI"], depart: "2027-05-10", adults: 2 })).text).toContain("no home airports");
  });

  it("Unterkünfte nach Verpflegung, Hotelname und Verpflegung in der Reise, lange Kostennamen", async () => {
    const offers: StayOffer[] = [{ ...stay("s1", 400), board: "self" }, { ...stay("s2", 500) }, { ...stay("s3", 600), board: "half", stars: 4 }, { ...stay("s4", 700), board: "all" }];
    const d = deps({ stays: async () => ({ offers, sources: [] }) });
    const q = { place: "Golden Sands", checkin: "2027-08-19", checkout: "2027-08-29", adults: 2, childAges: [3] };
    expect((await tool(d, "search_stays", q)).data.offers.map((o: any) => [o.id, o.board])).toEqual([["s1", "self"], ["s2", undefined], ["s3", "half"], ["s4", "all"]]);
    expect((await tool(d, "search_stays", { ...q, board: "half" })).data.offers.map((o: any) => o.id)).toEqual(["s3", "s4"]);
    expect((await tool(d, "search_stays", { ...q, board: "all" })).data.offers.map((o: any) => o.id)).toEqual(["s4"]);

    const made = await tool(d, "create_trip", { place: "Golden Sands", adults: 2, childAges: [3], travelersFrom: "user" });
    const id = made.data.tripId;
    expect((await tool(d, "add_stay", { tripId: id, offerId: "s3" })).error).toBe(false);
    const long = "Ausflug Baltschik und Kap Kaliakra mit Botanischem Garten und Mittagessen am Meer";
    expect(long.length).toBeGreaterThan(60);
    expect((await tool(d, "add_cost", { tripId: id, category: "attractions", name: long, amountEur: 120 })).data.name).toBe(long);
    const items = (await tool(d, "get_trip", { tripId: id })).data.items;
    expect(items[0]).toMatchObject({ name: "Unterkunft in Golden Sands", offer: "Hotel s3", board: "half", stars: 4 });
    expect(items[1].name).toBe(long);
    expect(items[1].offer).toBeUndefined();
  });

  it("ändert und löscht eigene Reisen, fragt bei Änderungen aus der App nach (#603)", async () => {
    const d = deps();
    const store = d.store as ReturnType<typeof memStore>;
    // in der App ändern: wie ein Speichern der App (ohne den Stand der KI anzufassen)
    const inApp = (id: string, f: (t: Trip) => void) => {
      const r = store.docs.get(id)!, t = JSON.parse(r.data) as Trip;
      f(t);
      store.docs.set(id, { ...r, data: JSON.stringify(t), updateTime: r.updateTime + "a" });
    };
    const mk = async (place = "Alanya") => (await tool(d, "create_trip", { place, from: "2027-08-19", to: "2027-08-29", adults: 2, childAges: [3], travelersFrom: "user" })).data.tripId as string;

    // Fehlversuch der KI: direkt löschen
    const a = await mk();
    expect((await tool(d, "list_trips", {})).data.trips[0]).toMatchObject({ id: a, byAi: true });
    expect((await tool(d, "delete_trip", { tripId: a })).data).toEqual({ deleted: a });
    expect(store.docs.has(a)).toBe(false);

    // ändern statt neu anlegen; Unterkunft außerhalb des neuen Zeitraums wird gemeldet
    const b = await mk("Goldstrand");
    await tool(d, "search_stays", { place: "Goldstrand", checkin: "2027-08-19", checkout: "2027-08-29", adults: 2, childAges: [3] });
    expect((await tool(d, "add_stay", { tripId: b, offerId: "s1" })).error).toBe(false);
    const up = await tool(d, "update_trip", { tripId: b, name: "Sommer 2027", from: "2027-08-20", to: "2027-08-30" });
    expect(up.data).toMatchObject({ updated: true, outOfRange: [{ name: "Unterkunft in Goldstrand" }] });
    expect(store.docs.get(b)!.name).toBe("Sommer 2027");
    expect((await tool(d, "update_trip", { tripId: b })).error).toBe(true);
    expect((await tool(d, "update_trip", { tripId: b, from: "2027-09-10" })).text).toMatch(/before/);

    // in der App geändert: Rückfrage mit Liste, auch nach weiteren Änderungen der KI
    inApp(b, t => { t.name = "Unser Sommer"; t.items.push({ id: "eigen", cat: "misc", name: "Sonnencreme", status: "idea", options: [] }); });
    expect((await tool(d, "add_cost", { tripId: b, category: "misc", name: "Eis", amountEur: 20 })).error).toBe(false);
    expect((await tool(d, "list_trips", {})).data.trips[0]).toMatchObject({ byAi: true, changedInApp: true });
    const no = await tool(d, "delete_trip", { tripId: b });
    expect(no.error).toBe(true);
    expect(no.text).toMatch(/name, destination, dates or travelers changed; item added: Sonnencreme \(eigen\)/);
    expect(no.text).not.toMatch(/Eis/);
    expect((await tool(d, "remove_item", { tripId: b, itemId: "eigen" })).text).toMatch(/Sonnencreme/);
    expect((await tool(d, "get_trip", { tripId: b })).data.changedInApp).toHaveLength(2);
    // nach Rückfrage: ändern, danach kennt die KI den Stand
    expect((await tool(d, "update_trip", { tripId: b, to: "2027-08-31", confirm: true })).error).toBe(false);
    expect((await tool(d, "get_trip", { tripId: b })).data.changedInApp).toBeUndefined();
    expect((await tool(d, "remove_item", { tripId: b, itemId: "eigen" })).error).toBe(false);
    expect((await tool(d, "delete_trip", { tripId: b })).data).toEqual({ deleted: b });

    // in der App angelegt: nur nach Rückfrage ändern oder löschen; Posten des Nutzers nur nach Rückfrage entfernen
    const c = await mk("Belek");
    inApp(c, t => { delete t.aiSeen; t.items.push({ id: "app", cat: "misc", name: "Kuchen", status: "idea", options: [] }); });
    expect((await tool(d, "get_trip", { tripId: c })).data.byAi).toBe(false);
    expect((await tool(d, "update_trip", { tripId: c, name: "x" })).text).toMatch(/created in the app/);
    expect((await tool(d, "remove_item", { tripId: c, itemId: "app" })).error).toBe(true);
    expect((await tool(d, "add_cost", { tripId: c, category: "misc", name: "Eis", amountEur: 20 })).error).toBe(false);
    const eis = JSON.parse(store.docs.get(c)!.data).items.find((i: any) => i.name === "Eis").id;
    expect((await tool(d, "remove_item", { tripId: c, itemId: eis })).error).toBe(false);
    expect((await tool(d, "delete_trip", { tripId: c })).text).toMatch(/created in the app/);
    expect((await tool(d, "delete_trip", { tripId: c, confirm: true })).data).toEqual({ deleted: c });

    // geteilt: als Mitglied nur verlassen (nach Rückfrage), als Besitzer nicht per KI
    const e = await mk("Side");
    store.docs.set(e, { ...store.docs.get(e)!, members: { u1: "owner", u2: "editor" } });
    expect((await tool(d, "delete_trip", { tripId: e })).text).toMatch(/shared with others/);
    store.docs.set(e, { ...store.docs.get(e)!, owner: "u2", members: { u1: "editor", u2: "owner" } });
    expect((await tool(d, "delete_trip", { tripId: e })).text).toMatch(/leaving/);
    expect((await tool(d, "delete_trip", { tripId: e, confirm: true })).data).toEqual({ left: e });
    expect(store.docs.get(e)!.members).toEqual({ u2: "owner" });
  });

  it("legt Vorschläge als Vergleich an (#603, #428)", async () => {
    const d = deps();
    const one = (await tool(d, "create_trip", { place: "Goldstrand", name: "Sommer Goldstrand", adults: 2, travelersFrom: "user" })).data.tripId;
    const two = await tool(d, "create_trip", { place: "Belek", name: "Sommer Belek", adults: 2, travelersFrom: "user", compareWith: one });
    expect(two.error).toBe(false);
    const cmp = (id: string) => (JSON.parse((d.store as any).docs.get(id).data) as Trip).cmp;
    expect(cmp(two.data.tripId)?.id).toBe(cmp(one)?.id);
    // Titel wie in der App aus dem gemeinsamen Namensanfang
    expect(cmp(one)?.title).toBe("Sommer");
    expect((await tool(d, "list_trips", {})).data.trips.map((t: any) => t.compare)).toEqual(["Sommer", "Sommer"]);
    // die erste Reise bleibt „unverändert seit der KI“
    expect((await tool(d, "get_trip", { tripId: one })).data.changedInApp).toBeUndefined();
    expect((await tool(d, "create_trip", { place: "Side", adults: 2, travelersFrom: "user", compareWith: "gibtsnicht" })).text).toMatch(/not found/);

    // Vergleich selbst benennen, Varianten benennen; Titel gilt für alle Varianten
    const three = await tool(d, "create_trip", { place: "Side", adults: 2, travelersFrom: "user", compareWith: one, compareTitle: "Sommerurlaub 2027", variantName: "Side am Meer" });
    expect(three.data.compare).toBe("Sommerurlaub 2027");
    expect([one, two.data.tripId, three.data.tripId].map(id => cmp(id)?.title)).toEqual(["Sommerurlaub 2027", "Sommerurlaub 2027", "Sommerurlaub 2027"]);
    expect(cmp(three.data.tripId)?.label).toBe("Side am Meer");
    expect((await tool(d, "get_trip", { tripId: two.data.tripId })).data.compare).toEqual({ title: "Sommerurlaub 2027", variantName: "Belek" });
    expect((await tool(d, "update_trip", { tripId: two.data.tripId, compareTitle: "Sommer mit Kind", variantName: "Belek (Türkei)" })).error).toBe(false);
    expect([one, two.data.tripId, three.data.tripId].map(id => cmp(id)?.title)).toEqual(["Sommer mit Kind", "Sommer mit Kind", "Sommer mit Kind"]);
    expect(cmp(two.data.tripId)?.label).toBe("Belek (Türkei)");

    // vorhandene Reisen nachträglich zusammen: beide ohne Vergleich → neuer Vergleich mit gemeinsamem Namensanfang
    const x = (await tool(d, "create_trip", { place: "Rom", name: "Herbst Rom", adults: 2, travelersFrom: "user" })).data.tripId;
    const y = (await tool(d, "create_trip", { place: "Lissabon", name: "Herbst Lissabon", adults: 2, travelersFrom: "user" })).data.tripId;
    expect((await tool(d, "update_trip", { tripId: y, compareWith: x })).data.compare).toBe("Herbst");
    expect(cmp(x)?.id).toBe(cmp(y)?.id);
    // dazu in einen bestehenden Vergleich, Variante ohne Vergleich benennen geht nicht, herausnehmen
    expect((await tool(d, "update_trip", { tripId: x, compareWith: one })).data.compare).toBe("Sommer mit Kind");
    expect(cmp(x)?.id).toBe(cmp(one)?.id);
    expect((await tool(d, "update_trip", { tripId: x, leaveCompare: true })).error).toBe(false);
    expect(cmp(x)).toBeUndefined();
    expect((await tool(d, "update_trip", { tripId: x, variantName: "Rom" })).text).toMatch(/no comparison/);
    expect((await tool(d, "update_trip", { tripId: x, compareWith: x })).text).toMatch(/another trip/);
    // nur Titel ohne Vergleich: beginnt einen, dem andere beitreten
    expect((await tool(d, "update_trip", { tripId: x, compareTitle: "Städtetrips" })).data.compare).toBe("Städtetrips");
    expect((await tool(d, "update_trip", { tripId: y, compareWith: x })).data.compare).toBe("Städtetrips");
    // Reise aus der App: auch Vergleich nur nach Rückfrage
    (d.store as any).docs.set(x, { ...(d.store as any).docs.get(x), data: JSON.stringify({ ...JSON.parse((d.store as any).docs.get(x).data), aiSeen: undefined }) });
    expect((await tool(d, "update_trip", { tripId: x, variantName: "Roma" })).text).toMatch(/created in the app/);
  });
});
