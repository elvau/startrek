/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { issueKey, verifyKey } from "./apikey";
import { fromFs, toFs, type TripRecord, type TripStore } from "./firestore";
import { mcpMessage, type McpDeps, type Saved } from "./mcp";
import type { FlightOffer } from "../../app/src/lib/flights/types";
import type { StayOffer } from "../../app/src/lib/stays/types";
import type { Trip } from "../../app/src/lib/model";

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
    offers: { put: async (id, v) => { saved.set(id, JSON.parse(JSON.stringify(v))); }, get: async id => saved.get(id) || null },
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

  it("sucht, legt eine Reise an, übernimmt Angebote und zeigt sie ohne Namen", async () => {
    const d = deps();
    const fl = await tool(d, "search_flights", { from: ["dus"], to: ["PMI"], depart: "2027-05-10", return: "2027-05-13", adults: 2, childAges: [8] });
    expect(fl.data.offers[0]).toMatchObject({ id: "f1", priceTotal: 480, link: "https://kiwi.com/x" });
    await tool(d, "search_stays", { place: "Palma", checkin: "2027-05-10", checkout: "2027-05-13", adults: 2, childAges: [8] });

    const made = await tool(d, "create_trip", { place: "Palma", country: "Spanien", from: "2027-05-10", to: "2027-05-13", adults: 2, childAges: [8, 1] });
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
    expect(list.data.trips).toEqual([{ id, name: "Palma", place: "Palma", from: "2027-05-10", to: "2027-05-13", role: "owner" }]);

    const rm = await tool(d, "remove_item", { tripId: id, itemId: got.data.items[2].id });
    expect(rm.error).toBe(false);
    expect((await tool(d, "get_trip", { tripId: id })).data.items).toHaveLength(2);
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
    const made = await tool(d, "create_trip", { place: "Rom", adults: 1 });
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
    const id = (await tool(d, "create_trip", { place: "Cala Rajada", from: "2027-05-10", to: "2027-05-13", adults: 10 })).data.tripId;
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
});
