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
const b = await rolldown({ input: { mcp: "../worker/src/mcp.ts", firestore: "../worker/src/firestore.ts", apikey: "../worker/src/apikey.ts", oauth: "../worker/src/oauth.ts" }, platform: "neutral", logLevel: "silent" });
await b.write({ dir: out, format: "esm", entryFileNames: "[name].mjs" });
const { mcpMessage } = await import(join(out, "mcp.mjs"));
const { tripStore, profileStore, profilePrefsSaver } = await import(join(out, "firestore.mjs"));
const { seal } = await import(join(out, "apikey.mjs"));
const { grantStore } = await import(join(out, "oauth.mjs"));

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

const made = await tool("create_trip", { place: "Palma", country: "Spanien", name: "Palma mit Claude", from: "2027-05-07", to: "2027-05-10", adults: 2, childAges: [8], travelersFrom: "user" });
const id = made.tripId;
await tool("search_flights", { from: ["DUS"], to: ["PMI"], depart: "2027-05-07", return: "2027-05-10", adults: 2, childAges: [8], travelersFrom: "user" });
await tool("add_flight", { tripId: id, offerId: "kiwi:x1" });
const listed = await tool("list_trips", {});
if (!listed.trips.some(t => t.id === id && t.role === "owner")) fail("Reise nicht in der Liste: " + JSON.stringify(listed));
log("Konnektor legt Reise im Konto an (Firestore-REST) und übernimmt einen Flug");

// Familien und Gruppen aus dem Konto (#595): gespeicherte Personen in profiles/{uid}, Reise mit echten Reisenden
const FS = "http://127.0.0.1:8080/v1/projects/demo-reisekasse/databases/(default)/documents";
const dirData = { me: "pc", people: [{ id: "pc", first: "Claudia", last: "Fuchs", age: 41 }, { id: "pk", first: "Tom", last: "Fuchs", age: 6 }], groups: [{ id: "g", name: "Fuchsbau", memberIds: ["pc", "pk"] }], prefs: { airports: ["DUS"], plz: "40210" } };
await fetch(`${FS}/profiles/${uid}`, { method: "PATCH", headers: { authorization: "Bearer owner", "content-type": "application/json" }, body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(dirData) } } }) });
deps.profile = profileStore({ FIRESTORE_EMULATOR: "http://127.0.0.1:8080", FIREBASE_PROJECT_ID: "demo-reisekasse" });
const mine = await tool("get_my_travelers", {});
if (JSON.stringify(mine.families) !== JSON.stringify([{ id: "F1", you: true, adults: 1, childAges: [6] }]) || mine.groups[0]?.name !== "Fuchsbau") fail("get_my_travelers: " + JSON.stringify(mine));
if (/Claudia|Tom|Fuchs\b|40210/.test(JSON.stringify(mine.families) + JSON.stringify(mine.prefs))) fail("Namen oder PLZ an die KI");
const fam = await tool("create_trip", { place: "Usedom", group: "Fuchsbau" });
const famDoc = await (await fetch(`${FS}/trips/${fam.tripId}`, { headers: { authorization: "Bearer owner" } })).json();
const famTrip = JSON.parse(famDoc.fields.data.stringValue);
if (famTrip.travelers.map(t => `${t.name}/${t.household}/${t.age}`).join() !== "Claudia/Fuchs/41,Tom/Fuchs/6") fail("Reisende aus der Gruppe: " + JSON.stringify(famTrip.travelers));
log("Familien und Gruppen aus dem Konto ohne Namen für die KI; Reise aus der Gruppe mit echten Reisenden");

// Vorlieben im Konto speichern (#602): nur die Vorlieben ändern sich, Personen, Gruppen und PLZ bleiben
deps.savePrefs = profilePrefsSaver({ FIRESTORE_EMULATOR: "http://127.0.0.1:8080", FIREBASE_PROJECT_ID: "demo-reisekasse" });
const sv = await tool("save_my_preferences", { budget: "low", board: "half" });
if (sv.saved.budget !== "low") fail("save_my_preferences: " + JSON.stringify(sv));
const profDoc = await (await fetch(`${FS}/profiles/${uid}`, { headers: { authorization: "Bearer owner" } })).json();
const prof = JSON.parse(profDoc.fields.data.stringValue);
if (prof.prefs.budget !== "low" || prof.prefs.board !== "half" || prof.prefs.plz !== "40210" || prof.people.length !== 2 || prof.groups[0].name !== "Fuchsbau") fail("Konto nach dem Speichern: " + JSON.stringify(prof));
const fl2 = await tool("search_flights", { to: ["PMI"], depart: "2027-05-07", adults: 1 });
if (fl2.appliedPreferences?.airports?.join() !== "DUS") fail("Flughafen aus den Vorlieben: " + JSON.stringify(fl2.appliedPreferences));
log("Vorlieben im Konto gespeichert (Rest bleibt), Suche nimmt den Flughafen aus den Vorlieben");

// Aufräumen (#603): Fehlversuch der KI samt Stimmen löschen; geteilte Reise verlassen (die anderen behalten sie)
const H = { authorization: "Bearer owner", "content-type": "application/json" };
const tryId = (await tool("create_trip", { place: "Alanya", adults: 2, travelersFrom: "user" })).tripId;
await fetch(`${FS}/trips/${tryId}/votes/${uid}`, { method: "PATCH", headers: H, body: JSON.stringify({ fields: { v: { stringValue: "x" } } }) });
await tool("update_trip", { tripId: tryId, name: "Alanya All Inclusive" });
if ((await tool("delete_trip", { tripId: tryId })).deleted !== tryId) fail("delete_trip");
if ((await fetch(`${FS}/trips/${tryId}`, { headers: H })).status !== 404 || (await fetch(`${FS}/trips/${tryId}/votes/${uid}`, { headers: H })).status !== 404) fail("Reise oder Stimme nicht gelöscht");
const v = s => ({ stringValue: s }), m = o => ({ mapValue: { fields: o } });
await fetch(`${FS}/trips/geteilt`, { method: "PATCH", headers: H, body: JSON.stringify({ fields: {
  name: v("Geteilt"), data: v(JSON.stringify({ ...famTrip, id: "geteilt" })), owner: v("u2"), memberIds: { arrayValue: { values: [v("u2"), v(uid)] } },
  members: m({ u2: v("owner"), [uid]: v("editor") }), memberNames: m({ u2: v("Marie"), [uid]: v("Claudia") }), claims: m({ [uid]: m({ t: v("x"), n: v("Claudia") }) })
} }) });
if ((await tool("delete_trip", { tripId: "geteilt", confirm: true })).left !== "geteilt") fail("delete_trip auf geteilter Reise");
const left = (await (await fetch(`${FS}/trips/geteilt`, { headers: H })).json()).fields;
if (JSON.stringify(left.memberIds) !== JSON.stringify({ arrayValue: { values: [v("u2")] } }) || left.members.mapValue.fields[uid] || left.memberNames.mapValue.fields[uid] || left.claims.mapValue.fields?.[uid])
  fail("Verlassen: " + JSON.stringify(left));
log("Aufräumen per KI: eigener Fehlversuch samt Stimmen gelöscht, geteilte Reise verlassen");

// Verbindungen der Chat-Apps (OAuth, #590) in Firestore: anlegen, nur unverändert ändern, Liste, aufräumen, trennen
const gs = grantStore({ FIRESTORE_EMULATOR: "http://127.0.0.1:8080", FIREBASE_PROJECT_ID: "demo-reisekasse" });
const base = { uid, client: "Claude", host: "claude.ai", at: new Date().toISOString(), used: new Date().toISOString().slice(0, 10), rt: "", code: "c1" };
await gs.create({ ...base, id: "gA" });
await gs.create({ ...base, id: "gOld", rt: "r0", used: "2020-01-01" });
await gs.create({ ...base, id: "gOpen", at: "2020-01-01T00:00:00.000Z" });
const gA = await gs.get("gA");
await gs.update(gA, { rt: "r1", code: "" });
const stale = await gs.update(gA, { rt: "r2" }).then(() => false, e => e.conflict === true);
if (!stale) fail("Verbindung: Änderung trotz veraltetem Stand");
if ((await gs.get("gA")).rt !== "r1") fail("Verbindung nicht geändert");
if ((await gs.list(uid)).length !== 3) fail("Liste der Verbindungen");
if ((await gs.sweep()) !== 2 || (await gs.get("gOld")) || (await gs.get("gOpen"))) fail("Aufräumen der Verbindungen");
await gs.remove("gA");
if (await gs.get("gA")) fail("Trennen");
log("Verbindungen der Chat-Apps in Firestore: anlegen, ändern mit Versionsprüfung, aufräumen, trennen");

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
  // Chat-Apps per OAuth (#590): Such-Dienst nachgestellt
  const oauth = [];
  let grants = [{ id: "g1", client: "Claude", host: "claude.ai", at: "2027-03-30", used: "2027-04-01" }];
  await p.route("https://flights.test/oauth/**", async r => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" };
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const path = new globalThis.URL(r.request().url()).pathname;
    oauth.push({ path, auth: r.request().headers()["authorization"] || "", body: JSON.parse(r.request().postData() || "{}") });
    let body = {};
    if (path === "/oauth/grants") body = { grants };
    if (path === "/oauth/grants/remove") { grants = grants.filter(g => g.id !== oauth.at(-1).body.id); body = { removed: oauth.at(-1).body.id }; }
    if (path === "/oauth/approve") body = { redirect: "https://claude.test/cb?code=sfo_x&state=st" };
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
  });
  await p.route("https://claude.test/**", r => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Claude</h1>" }));
  await p.goto(URL);
  await p.locator(".start .home-title").waitFor();
  await p.locator(".tm-btn", { hasText: "Anmelden" }).first().click();
  await p.locator(".login .test input").fill("Claudia");
  await p.locator(".login .test button").click();
  await p.locator(".top .acct-btn").waitFor({ timeout: 15000 });

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
  await p.locator("#transport .card:not(.plan-card)", { hasText: "Mietwagen" }).locator(".aif", { hasText: "Von der KI erstellt" }).waitFor({ timeout: 15000 });
  const got = await tool("get_trip", { tripId: id });
  if (got.items.length !== 2 || got.approxTotalEur !== 630) fail("Reise für Claude: " + JSON.stringify(got));
  if (JSON.stringify(got).includes("Claudia")) fail("Name in der Reise für Claude");
  // die App ändert beim Öffnen nichts, was als „in der App geändert“ zählt (#603)
  if (got.byAi !== true || got.changedInApp) fail("Stand der KI nach dem Öffnen in der App: " + JSON.stringify(got.changedInApp));
  log("Ergänzung von Claude erscheint live in der offenen Reise; get_trip ohne Namen");

  // Schlüssel im Kontomenü erzeugen: Anfrage angemeldet, Schlüssel und Befehl für Claude Code
  await p.evaluate(() => scrollTo(0, 0));
  await p.locator(".top .acct-btn").click();
  await p.locator(".acct-mcp").click();
  // verbundene Chat-Apps: Liste und Trennen
  await p.locator(".modal .oauth-conns li", { hasText: "Claude" }).waitFor();
  if (!(await p.locator(".modal .oauth-conns li", { hasText: "claude.ai" }).count())) fail("Ziel der Verbindung fehlt");
  if (process.env.SHOTS) await p.locator(".modal").screenshot({ path: `${process.env.SHOTS}/connect-list.png` });
  await p.locator(".modal .oauth-remove").click();
  await p.locator(".modal .oauth-none").waitFor();
  const rm = oauth.find(o => o.path === "/oauth/grants/remove");
  if (rm?.body.id !== "g1" || !rm.auth.startsWith("Bearer ")) fail("Trennen: " + JSON.stringify(rm));
  log("Verbundene Chat-Apps im Kontomenü, Trennen");
  // persönlicher Schlüssel (eingeklappt)
  await p.locator(".modal .mcp-keys summary").click();
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

  await p.locator(".modal .x").click();

  // Chat-App leitet zur Zustimmung um (?verbinden=…): Name und Ziel, Erlauben → zurück zur Chat-App mit Code
  const req = await seal("egal", "req", { k: "k", n: "Claude", h: "claude.ai", r: "https://claude.test/cb", s: "st", p: "p", x: Date.now() + 600_000 });
  await p.goto(`${URL}?verbinden=${encodeURIComponent(req)}`);
  await p.locator(".modal .oauth-who", { hasText: "Claude möchte auf dein Split&Fly zugreifen" }).waitFor({ timeout: 15000 });
  if (!(await p.locator(".modal .oauth-who", { hasText: "claude.ai" }).count())) fail("Ziel fehlt in der Zustimmung");
  if (new globalThis.URL(p.url()).searchParams.has("verbinden")) fail("Anfrage bleibt in der Adresse");
  if (process.env.SHOTS) {
    await p.locator(".modal").screenshot({ path: `${process.env.SHOTS}/consent.png` });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.screenshot({ path: `${process.env.SHOTS}/consent-mobile.png` });
    await p.setViewportSize({ width: 1280, height: 900 });
  }
  await p.locator(".modal .oauth-allow").click();
  await p.waitForURL("https://claude.test/cb?code=sfo_x&state=st", { timeout: 15000 });
  const ok = oauth.find(o => o.path === "/oauth/approve");
  if (ok?.body.req !== req || ok.body.allow !== true || !ok.auth.startsWith("Bearer ")) fail("Zustimmung: " + JSON.stringify(ok));
  log("Zustimmung für Chat-App: Name und Ziel, Erlauben, zurück zur Chat-App");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Konnektor ok");
} finally { await browser.close(); server.kill(); }
