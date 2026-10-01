/*
 * KI-Konnektor gegen den Firestore-Emulator: der MCP-Kern des Such-Dienstes legt eine Reise im Konto an und
 * ergänzt sie (Suchen nachgestellt); die App zeigt sie, markiert und live. Dazu Schlüssel im Kontomenü erzeugen.
 * Start: npm run test:cloud
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rolldown } from "rolldown";

const URL = "http://127.0.0.1:4183/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };

// Kern des Such-Dienstes für Node bündeln (TypeScript, gemeinsamer Code der App)
const out = await mkdtemp(join(tmpdir(), "mcp-"));
const b = await rolldown({ input: { mcp: "../worker/src/mcp.ts", firestore: "../worker/src/firestore.ts" }, platform: "neutral", logLevel: "silent" });
await b.write({ dir: out, format: "esm", entryFileNames: "[name].mjs" });
const { mcpMessage } = await import(join(out, "mcp.mjs"));
const { tripStore } = await import(join(out, "firestore.mjs"));

// Nutzer im Auth-Emulator (so meldet sich auch die Test-Anmeldung der App an)
const sign = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "claudia@test.de", password: "test-passwort", displayName: "Claudia", returnSecureToken: true })
}).then(r => r.json());
const uid = sign.localId || fail("kein Nutzer im Emulator: " + JSON.stringify(sign));

const leg = (from, to, dep, arr) => ({ from, to, fromCity: from, toCity: to, dep, arr, minutes: 150, stops: 0, route: [from, to], carriers: ["Sun Air"], flights: ["SA1"] });
const saved = new Map();
const deps = {
  flights: async () => ({ offers: [{ id: "kiwi:x1", source: "kiwi", sourceName: "Kiwi.com", price: 480, currency: "EUR", url: "https://kiwi.com/u/x1", out: leg("DUS", "PMI", "2027-05-07T08:00", "2027-05-07T10:30"), back: leg("PMI", "DUS", "2027-05-10T18:00", "2027-05-10T20:30") }], sources: [] }),
  stays: async () => ({ offers: [], sources: [] }), events: async () => ({ events: [], sources: [] }), activities: async () => ({ activities: [], sources: [] }),
  store: tripStore({ FIRESTORE_EMULATOR: "http://127.0.0.1:8080", FIREBASE_PROJECT_ID: "demo-reisekasse" }),
  offers: { put: async (id, v) => { saved.set(id, v); }, get: async id => saved.get(id) || null },
  allowSearch: async () => null, version: "test", today: "2027-04-01"
};
const user = { uid, kid: "k1", name: "Claudia", at: "2027-04-01" };
let n = 0;
async function tool(name, args) {
  const r = await mcpMessage({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }, user, deps);
  if (r.result.isError) fail(`${name}: ${r.result.content[0].text}`);
  return r.result.structuredContent;
}

const made = await tool("create_trip", { place: "Palma", country: "Spanien", name: "Palma mit Claude", from: "2027-05-07", to: "2027-05-10", adults: 2, childAges: [8] });
const id = made.tripId;
await tool("search_flights", { from: ["DUS"], to: ["PMI"], depart: "2027-05-07", return: "2027-05-10", adults: 2, childAges: [8] });
await tool("add_flight", { tripId: id, offerId: "kiwi:x1" });
const listed = await tool("list_trips", {});
if (!listed.trips.some(t => t.id === id && t.role === "owner")) fail("Reise nicht in der Liste: " + JSON.stringify(listed));
log("Konnektor legt Reise im Konto an (Firestore-REST) und übernimmt einen Flug");

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4183", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  for (const f of ["world.json", "packs.json", "airports.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  const keys = [];
  await p.route("https://flights.test/mcp/key", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" } });
    keys.push({ auth: r.request().headers()["authorization"] || "", body: JSON.parse(r.request().postData() || "{}") });
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ key: "sf_test.sig", kid: "abc123", trips: true }) });
  });
  await p.goto(URL);
  await p.locator(".start .home-title").waitFor();
  await p.locator(".tm-btn", { hasText: "Anmelden" }).first().click();
  await p.locator(".login .test input").fill("Claudia");
  await p.locator(".login .test button").click();
  await p.locator(".start .acct-btn").waitFor({ timeout: 15000 });

  // Reise vom Konnektor: in der Liste, öffnen, Flug mit KI-Markierung, Platzhalter statt Namen
  await p.locator(".start .home-trip", { hasText: "Palma mit Claude" }).waitFor({ timeout: 15000 });
  await p.locator(".start .home-trip", { hasText: "Palma mit Claude" }).click();
  await p.locator(".hero h1", { hasText: "Palma mit Claude" }).waitFor();
  // Inhalt kommt aus dem Konto nach (erst Platzhalter): warten, bis Reisende und Daten da sind
  const t0 = Date.now();
  let meta = "";
  while (Date.now() - t0 < 15000) { meta = await p.locator(".hero .meta").innerText(); if (meta.includes("3 Personen") && meta.includes("3 Nächte")) break; await p.waitForTimeout(200); }
  if (!meta.includes("3 Personen") || !meta.includes("3 Nächte")) fail("Kopf: " + meta);
  await p.locator("#flights .card", { hasText: "Sun Air" }).locator(".aif", { hasText: "Von der KI vorgeschlagen" }).waitFor();
  log("App zeigt die Reise mit Flug (markiert), 3 Personen, 3 Nächte");

  // während die Reise offen ist: Claude ergänzt einen Posten → erscheint live
  await tool("add_cost", { tripId: id, category: "transport", name: "Mietwagen", amountEur: 150 });
  await p.locator("#transport .card", { hasText: "Mietwagen" }).locator(".aif", { hasText: "Von der KI erstellt" }).waitFor({ timeout: 15000 });
  const got = await tool("get_trip", { tripId: id });
  if (got.items.length !== 2 || got.approxTotalEur !== 630) fail("Reise für Claude: " + JSON.stringify(got));
  if (JSON.stringify(got).includes("Claudia")) fail("Name in der Reise für Claude");
  log("Ergänzung von Claude erscheint live in der offenen Reise; get_trip ohne Namen");

  // Schlüssel im Kontomenü erzeugen: Anfrage angemeldet, Schlüssel und Befehl für Claude Code
  await p.evaluate(() => scrollTo(0, 0));
  await p.locator(".hero .acct-btn").click();
  await p.locator(".acct-mcp").click();
  await p.locator(".modal .mcp-make").click();
  await p.locator(".modal .mcp-key").waitFor();
  if ((await p.locator(".modal .mcp-key").inputValue()) !== "sf_test.sig") fail("Schlüssel nicht angezeigt");
  const cmd = await p.locator(".modal .mcp-cmd").innerText();
  if (!cmd.includes("claude mcp add --transport http splitandfly https://flights.test/mcp") || !cmd.includes("Bearer sf_test.sig")) fail("Befehl: " + cmd);
  if ((await p.locator(".modal .mcp-url").inputValue()) !== "https://flights.test/mcp") fail("Adresse fehlt");
  if (!(await p.locator(".modal .mcp", { hasText: "Authorization: Bearer" }).count())) fail("Hinweis für andere Programme fehlt");
  if (!keys[0]?.auth.startsWith("Bearer ") || keys[0].body.name !== "Claudia") fail("Schlüssel-Anfrage: " + JSON.stringify(keys[0]));
  if (process.env.SHOTS) await p.locator(".modal").screenshot({ path: `${process.env.SHOTS}/connect.png` });
  log("Schlüssel im Kontomenü erzeugt, mit Adresse, Hinweis für andere Programme und Beispiel Claude Code");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Konnektor ok");
} finally { await browser.close(); server.kill(); }
