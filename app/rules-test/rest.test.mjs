/*
 * Firestore-Regeln von außen (#261): über die REST-Schnittstelle wie ein Angreifer ohne App, je Sammlung Lesen,
 * Auflisten, Abfragen und Ändern fremder Daten. Ohne Browser. Start: npm run test:rules
 * Die Abschnitte bauen aufeinander auf (eine Reise, die sich Schritt für Schritt ändert): Reihenfolge nicht ändern.
 */
import { afterAll, beforeAll, describe, it } from "vitest";
import { fields, sv } from "../e2e/lib/emu.mjs";

const P = "demo-reisekasse";
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const fail = m => { throw new Error(m); };

// unsignierte Anmelde-Tokens nimmt nur der Emulator an
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const token = uid => `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: `https://securetoken.google.com/${P}`, aud: P, sub: uid, user_id: uid, auth_time: now, iat: now, exp: now + 3600, firebase: { sign_in_provider: uid.startsWith("gast") ? "anonymous" : "password" } })}.`;
const H = uid => ({ "content-type": "application/json", ...(uid === "admin" ? { Authorization: "Bearer owner" } : uid ? { Authorization: `Bearer ${token(uid)}` } : {}) });

const req = (uid, path, init = {}) => fetch(`${FS}${path}`, { ...init, headers: H(uid) });
const patch = (uid, path, o, mask) => req(uid, `${path}${mask ? "?" + mask.map(m => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&") : ""}`, { method: "PATCH", body: JSON.stringify({ fields: fields(o) }) });
const query = (uid, coll, where) => req(uid, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], ...(where ? { where } : {}) } }) });
/** Antwort muss den Status haben; what: Text für die Fehlermeldung */
async function status(what, r, status) {
  const res = await r;
  if (res.status !== status) fail(`${what}: ${res.status} statt ${status} ${(await res.text()).slice(0, 200)}`);
}

// Ausgangslage: Anna besitzt die Reise, Ben bearbeitet mit, Einladung als Zuschauer; Mallory gehört nicht dazu
const KEY = "einladung-0123456789abcdef";
const trip = { name: "Regeltest", data: "{}", owner: "anna", memberIds: ["anna", "ben"], members: { anna: "owner", ben: "editor" }, memberNames: { anna: "Anna", ben: "Ben" }, invite: { key: KEY, role: "viewer" } };

// Helfer und Daten der Abschnitte (in ihrem Abschnitt gesetzt, spätere Abschnitte benutzen sie weiter)
let join, claim, vote, self, DOCS, chat, pic, leave, camp, entry, pub, good;

describe("Regeln von außen (REST)", () => {
  beforeAll(async () => {
    await status("Reise anlegen (Admin)", patch("admin", "/trips/regeltest", trip), 200);
    await status("Profil anlegen (Admin)", patch("admin", "/profiles/anna", { data: "{\"p\":1}" }), 200);
    await status("travelDocs anlegen (Admin)", patch("admin", "/travelDocs/anna", { data: "{\"pass\":\"X\"}" }), 200);
  });
  afterAll(async () => {
    for (const path of ["/trips/regeltest", "/profiles/anna", "/travelDocs/anna"]) await req("admin", path, { method: "DELETE" });
  });

  it("Profile und travelDocs: nur für die eigene Person, auch nicht für Mitreisende", async () => {
    // Profile und travelDocs: nur die eigene Person
    for (const coll of ["profiles", "travelDocs"]) {
      await status(`${coll}: Anna liest ihre`, req("anna", `/${coll}/anna`), 200);
      for (const who of ["mallory", ""]) {
        await status(`${coll}: ${who || "ohne Konto"} liest fremde`, req(who, `/${coll}/anna`), 403);
        await status(`${coll}: ${who || "ohne Konto"} listet`, req(who, `/${coll}`), 403);
        await status(`${coll}: ${who || "ohne Konto"} fragt ab`, query(who, coll), 403);
        await status(`${coll}: ${who || "ohne Konto"} überschreibt`, patch(who, `/${coll}/anna`, { data: "{}" }), 403);
      }
      await status(`${coll}: Ben (Mitreisender) liest Annas`, req("ben", `/${coll}/anna`), 403);
    }
  });

  it("Reisen: Fremde können weder lesen, auflisten, abfragen, ändern noch löschen", async () => {
    // Reisen: lesen nur Mitglieder, auflisten nur die eigenen
    await status("Mallory liest die Reise", req("mallory", "/trips/regeltest"), 403);
    await status("ohne Konto liest die Reise", req("", "/trips/regeltest"), 403);
    await status("Mallory listet alle Reisen", req("mallory", "/trips"), 403);
    await status("Mallory fragt alle Reisen ab", query("mallory", "trips"), 403);
    await status("Mallory fragt Annas Reisen ab", query("mallory", "trips", { fieldFilter: { field: { fieldPath: "memberIds" }, op: "ARRAY_CONTAINS", value: sv("anna") } }), 403);
    await status("Ben fragt seine Reisen ab", query("ben", "trips", { fieldFilter: { field: { fieldPath: "memberIds" }, op: "ARRAY_CONTAINS", value: sv("ben") } }), 200);
    await status("Mallory ändert die Reise", patch("mallory", "/trips/regeltest", { data: "{\"x\":1}" }, ["data"]), 403);
    await status("Mallory löscht die Reise", req("mallory", "/trips/regeltest", { method: "DELETE" }), 403);
  });

  it("Mitbearbeiter: Inhalt ja; Besitz, Rollen, Einladung, Namen anderer und Löschen nein", async () => {
    // Mitbearbeiter: Inhalt ja, Mitglieder, Einladung und Besitz nein
    await status("Ben ändert den Inhalt", patch("ben", "/trips/regeltest", { data: "{\"b\":1}" }, ["data"]), 200);
    await status("Ben macht sich zum Besitzer", patch("ben", "/trips/regeltest", { members: { anna: "owner", ben: "owner" } }, ["members"]), 403);
    await status("Ben übernimmt die Reise", patch("ben", "/trips/regeltest", { owner: "ben", members: { anna: "editor", ben: "owner" } }, ["owner", "members"]), 403);
    await status("Ben liest den Einladungsschlüssel und ändert die Rolle", patch("ben", "/trips/regeltest", { invite: { key: KEY, role: "editor" } }, ["invite"]), 403);
    await status("Ben löscht die Reise", req("ben", "/trips/regeltest", { method: "DELETE" }), 403);
    await status("Ben benennt Anna um", patch("ben", "/trips/regeltest", { memberNames: { anna: "Hacker", ben: "Ben" } }, ["memberNames"]), 403);
  });

  it("Beitreten nur mit Schlüssel und der Rolle der Einladung; Zuschauer ändern nichts", async () => {
    // Beitreten: nur mit Schlüssel, nur mit der Rolle der Einladung, nur sich selbst
    join = (uid, key, role, extra = {}) => patch(uid, "/trips/regeltest",
      { memberIds: ["anna", "ben", uid], members: { anna: "owner", ben: "editor", [uid]: role }, memberNames: { anna: "Anna", ben: "Ben", [uid]: uid, ...extra }, joinKey: key },
      ["memberIds", "members", "memberNames", "joinKey"]);
    await status("Mallory tritt ohne Schlüssel bei", join("mallory", "geraten-0123456789abcdef", "viewer"), 403);
    await status("Mallory tritt als Mitbearbeiter bei", join("mallory", KEY, "editor"), 403);
    await status("Mallory tritt bei und benennt Anna um", join("mallory", KEY, "viewer", { anna: "Hacker" }), 403);
    await status("Mallory tritt mit Schlüssel als Zuschauer bei", join("mallory", KEY, "viewer"), 200);
    await status("Mallory (Zuschauer) ändert den Inhalt", patch("mallory", "/trips/regeltest", { data: "{\"m\":1}" }, ["data"]), 403);
  });

  it("Wer bist du: jede Rolle nur die eigene Zuordnung, nur Kennung und Vorname; Besitzerin kann lösen", async () => {
    // „Wer bist du?“ (#435): jede Rolle setzt nur die eigene Zuordnung { t, n }
    claim = (uid, who, c) => patch(uid, "/trips/regeltest", { claims: { [who]: c } }, [`claims.${who}`]);
    await status("Mallory (Zuschauer) wählt sich", claim("mallory", "mallory", { t: "p2", n: "Mal" }), 200);
    await status("Mallory wählt für Ben", claim("mallory", "ben", { t: "p1", n: "Ben" }), 403);
    await status("Mallory wählt sich mit Zusatzfeld", claim("mallory", "mallory", { t: "p2", n: "Mal", rolle: "owner" }), 403);
    await status("Mallory wählt sich mit zu langem Namen", claim("mallory", "mallory", { t: "p2", n: "x".repeat(41) }), 403);
    await status("Ben (Mitbearbeiter) ändert Inhalt und Mallorys Zuordnung", patch("ben", "/trips/regeltest", { data: "{\"b\":2}", claims: { mallory: { t: "p9", n: "X" } } }, ["data", "claims.mallory"]), 403);
    await status("Ben wählt sich", claim("ben", "ben", { t: "p1", n: "Ben" }), 200);
    await status("Anna (Besitzerin) löst Mallorys Zuordnung", patch("anna", "/trips/regeltest", {}, ["claims.mallory"]), 200);
    await status("Mallory wählt sich wieder", claim("mallory", "mallory", { t: "p2", n: "Mal" }), 200);
  });

  it("Stimmen: nur die eigene, lesen nur Mitglieder, löschen nur selbst oder die Besitzerin", async () => {
    // Stimmen (#432): eigenes Dokument je Mitglied, lesen nur Mitglieder
    vote = (uid, who, v) => patch(uid, `/trips/regeltest/votes/${who}`, { v });
    await status("Mallory (Zuschauer) stimmt ab", vote("mallory", "mallory", { p1: { o1: 3 } }), 200);
    await status("Ben liest Mallorys Stimme", req("ben", "/trips/regeltest/votes/mallory"), 200);
    await status("Mallory sagt „Ohne mich“ mit Grund (#439)", patch("mallory", "/trips/regeltest/votes/mallory", { v: { p1: { o1: -1 } }, w: { p1: { o1: { r: "zu teuer", f: true } } } }), 200);
    await status("Mallory: Grund kein Verzeichnis", patch("mallory", "/trips/regeltest/votes/mallory", { v: { p1: { o1: -1 } }, w: "zu teuer" }), 403);
    await status("Mallory stimmt für Ben", vote("mallory", "ben", { p1: { o1: 1 } }), 403);
    await status("Mallory stimmt mit Zusatzfeld", patch("mallory", "/trips/regeltest/votes/mallory", { v: { p1: { o1: 1 } }, rolle: "owner" }), 403);
    await status("Fremder liest Stimmen", req("fremd", "/trips/regeltest/votes/mallory"), 403);
    await status("Fremder stimmt ab", vote("fremd", "fremd", { p1: { o1: 1 } }), 403);
    await status("Ben löscht Mallorys Stimme", req("ben", "/trips/regeltest/votes/mallory", { method: "DELETE" }), 403);
    await status("Anna (Besitzerin) löscht Mallorys Stimme", req("anna", "/trips/regeltest/votes/mallory", { method: "DELETE" }), 200);
  });

  it("Selbst eintragen: nur das eigene Dokument, jede Rolle, nur bekannte Felder; lesen nur Mitglieder", async () => {
    // Selbst eintragen (#571): eigenes Dokument je Mitglied, jede Rolle, nur bekannte Felder
    self = (uid, who, o) => patch(uid, `/trips/regeltest/self/${who}`, o);
    await status("Mallory (Zuschauer) trägt Termine und Wohnort ein", self("mallory", "mallory", { a: { "2027-09-03": "yes" }, h: { plz: "44787", ort: "Bochum" }, f: { m: [{ n: "Gisela" }], at: "2027-01-01" } }), 200);
    await status("Mallory: Familie stimmt mit (zählt nicht für, wie, entschieden)", self("mallory", "mallory", { x: ["p1"], l: "p2", d: true }), 200);
    await status("Mallory: „wie“ zu lang", self("mallory", "mallory", { l: "x".repeat(41) }), 403);
    await status("Mallory: „entschieden“ kein Wahrheitswert", self("mallory", "mallory", { d: "ja" }), 403);
    await status("Ben liest Mallorys Angaben", req("ben", "/trips/regeltest/self/mallory"), 200);
    await status("Fremder liest Mallorys Angaben", req("fremd", "/trips/regeltest/self/mallory"), 403);
    await status("Fremder trägt sich ein", self("fremd", "fremd", { a: {} }), 403);
    await status("Mallory trägt für Ben ein", self("mallory", "ben", { a: { "2027-09-03": "no" } }), 403);
    await status("Mallory mit Zusatzfeld", self("mallory", "mallory", { a: {}, rolle: "owner" }), 403);
    await status("Mallory mit fremdem Feld im Wohnort", self("mallory", "mallory", { h: { plz: "1", iban: "DE00" } }), 403);
    await status("Mallory mit zu großem Familienvorschlag", self("mallory", "mallory", { f: { m: Array.from({ length: 13 }, (_, i) => ({ n: "K" + i })), at: "x" } }), 403);
    await status("Ben löscht Mallorys Angaben", req("ben", "/trips/regeltest/self/mallory", { method: "DELETE" }), 403);
    await status("Anna (Besitzerin) löscht Mallorys Angaben", req("anna", "/trips/regeltest/self/mallory", { method: "DELETE" }), 200);
  });

  it("Gruppenchat: nur Mitglieder, nur im eigenen Namen mit Serverzeit, nicht ändern, nur Bilder bis 340 KB; löschen selbst oder Besitzerin", async () => {
    // Gruppenchat: Mitglieder schreiben im eigenen Namen mit Serverzeit, nichts ändern; Bild als data:-Adresse daneben
    DOCS = `projects/${P}/databases/(default)/documents/trips/regeltest`;
    chat = (uid, id, o, at = true) => req(uid, ":commit", { method: "POST", body: JSON.stringify({ writes: [{
      update: { name: `${DOCS}/chat/${id}`, fields: fields(o) },
      ...(at ? { updateTransforms: [{ fieldPath: "at", setToServerValue: "REQUEST_TIME" }] } : {})
    }] }) });
    pic = (uid, id, d) => patch(uid, `/trips/regeltest/chatImg/${id}`, { u: uid, d });
    await status("Mallory (Zuschauer) schreibt", chat("mallory", "m1", { u: "mallory", n: "Mal", t: "Hallo 🎳" }), 200);
    await status("Ben liest den Chat", req("ben", "/trips/regeltest/chat/m1"), 200);
    await status("Ben listet den Chat", req("ben", "/trips/regeltest/chat"), 200);
    await status("Fremder liest den Chat", req("fremd", "/trips/regeltest/chat/m1"), 403);
    await status("Fremder listet den Chat", req("fremd", "/trips/regeltest/chat"), 403);
    await status("Fremder schreibt", chat("fremd", "f1", { u: "fremd", n: "F", t: "Spam" }), 403);
    await status("Mallory schreibt als Ben", chat("mallory", "m2", { u: "ben", n: "Ben", t: "Ich zahle alles" }), 403);
    await status("Mallory schreibt ohne Serverzeit", chat("mallory", "m3", { u: "mallory", n: "Mal", t: "x" }, false), 403);
    await status("Mallory schreibt leer", chat("mallory", "m4", { u: "mallory", n: "Mal", t: "" }), 403);
    await status("Mallory schreibt zu lang", chat("mallory", "m5", { u: "mallory", n: "Mal", t: "x".repeat(1001) }), 403);
    await status("Mallory schreibt mit Zusatzfeld", chat("mallory", "m6", { u: "mallory", n: "Mal", t: "x", video: "https://x" }), 403);
    await status("Mallory ändert ihre Nachricht", chat("mallory", "m1", { u: "mallory", n: "Mal", t: "geändert" }), 403);
    await status("Ben ändert Mallorys Nachricht", chat("ben", "m1", { u: "ben", n: "Ben", t: "geändert" }), 403);
    await status("Mallory schickt ein Bild", pic("mallory", "m7", "data:image/jpeg;base64,/9j/4AAQSkZJRg=="), 200);
    await status("Mallory schickt die Nachricht zum Bild", chat("mallory", "m7", { u: "mallory", n: "Mal", t: "", img: true }), 200);
    await status("Ben liest das Bild", req("ben", "/trips/regeltest/chatImg/m7"), 200);
    await status("Fremder liest das Bild", req("fremd", "/trips/regeltest/chatImg/m7"), 403);
    await status("Mallory schickt ein Video", pic("mallory", "m8", "data:video/mp4;base64,AAAA"), 403);
    await status("Mallory schickt ein SVG", pic("mallory", "m8", "data:image/svg+xml;base64,PHN2Zz4="), 403);
    await status("Mallory schickt einen Link statt Bild", pic("mallory", "m8", "https://example.com/a.jpg"), 403);
    await status("Mallory schickt ein zu großes Bild", pic("mallory", "m8", "data:image/jpeg;base64," + "A".repeat(340000)), 403);
    await status("Mallory schickt ein Bild als Ben", patch("mallory", "/trips/regeltest/chatImg/m8", { u: "ben", d: "data:image/jpeg;base64,AAAA" }), 403);
    await status("Ben löscht Mallorys Nachricht", req("ben", "/trips/regeltest/chat/m1", { method: "DELETE" }), 403);
    await status("Ben löscht Mallorys Bild", req("ben", "/trips/regeltest/chatImg/m7", { method: "DELETE" }), 403);
    await status("Mallory löscht ihre Nachricht", req("mallory", "/trips/regeltest/chat/m1", { method: "DELETE" }), 200);
    await status("Anna (Besitzerin) löscht Mallorys Bild", req("anna", "/trips/regeltest/chatImg/m7", { method: "DELETE" }), 200);
    await status("Anna (Besitzerin) löscht Mallorys Nachricht", req("anna", "/trips/regeltest/chat/m7", { method: "DELETE" }), 200);
  });

  it("Gäste: beitreten und sich wählen ja; keine eigenen Reisen oder Aktionsseiten; verlassen samt Zuordnung", async () => {
    // Gast ohne Konto (anonyme Anmeldung): beitreten und sich wählen ja, eigene Reisen und Aktionsseiten nein
    await status("Gast legt eine Reise an", patch("gast1", "/trips/gastreise", { name: "G", data: "{}", owner: "gast1", memberIds: ["gast1"], members: { gast1: "owner" }, invite: null }), 403);
    await status("Gast tritt mit Schlüssel bei", patch("gast1", "/trips/regeltest",
      { memberIds: ["anna", "ben", "mallory", "gast1"], members: { anna: "owner", ben: "editor", mallory: "viewer", gast1: "viewer" }, memberNames: { anna: "Anna", ben: "Ben", mallory: "mallory", gast1: "Jonas" }, joinKey: KEY },
      ["memberIds", "members", "memberNames", "joinKey"]), 200);
    await status("Gast wählt sich", claim("gast1", "gast1", { t: "p3", n: "Jonas" }), 200);
    await status("Gast legt Aktionsseite an", patch("gast1", "/campaigns/gastcamp1", { owner: "gast1", trip: "regeltest", title: "T", text: "", place: "", from: "", to: "", goal: 0, raised: 0, pledged: 0, paypal: "", link: "" }), 403);
    await status("Gast verlässt die Reise samt Zuordnung", patch("gast1", "/trips/regeltest",
      { memberIds: ["anna", "ben", "mallory"], members: { anna: "owner", ben: "editor", mallory: "viewer" }, memberNames: { anna: "Anna", ben: "Ben", mallory: "mallory" } },
      ["memberIds", "members", "memberNames", "claims.gast1"]), 200);
  });

  it("Verlassen: nur sich selbst entfernen, Namen der anderen bleiben unverändert", async () => {
    // Verlassen: nur sich selbst entfernen, Namen der anderen bleiben
    leave = names => patch("mallory", "/trips/regeltest", { memberIds: ["anna", "ben"], members: { anna: "owner", ben: "editor" }, memberNames: names }, ["memberIds", "members", "memberNames", "claims.mallory"]);
    await status("Mallory verlässt die Reise und benennt Anna um", leave({ anna: "Hacker", ben: "Ben" }), 403);
    await status("Mallory verlässt die Reise", leave({ anna: "Anna", ben: "Ben" }), 200);
    await status("Mallory liest nach dem Verlassen", req("mallory", "/trips/regeltest"), 403);
  });

  it("Aktionsseiten: nur im eigenen Namen, ohne IBAN, nur Links bekannter Anbieter; Fremde ändern und löschen nichts", async () => {
    // Aktionsseiten: Fremde legen keine im Namen anderer an
    camp = { owner: "anna", trip: "regeltest", title: "T", text: "", place: "", from: "", to: "", goal: 0, raised: 0, pledged: 0, paypal: "AnnaK", link: "" };
    await status("Mallory legt Aktionsseite für Anna an", patch("mallory", "/campaigns/regeltestcamp1", camp), 403);
    await status("Anna legt Aktionsseite mit IBAN an", patch("anna", "/campaigns/regeltestcamp1", { ...camp, iban: "DE89370400440532013000" }), 403);
    await status("Anna legt Aktionsseite mit fremdem Link an", patch("anna", "/campaigns/regeltestcamp1", { ...camp, link: "https://evil.example/x" }), 403);
    await status("Anna legt Aktionsseite mit Link einer Sammelaktion an", patch("anna", "/campaigns/regeltestcamp1", { ...camp, link: "https://gofund.me/abc" }), 200);
    await status("Mallory ändert Annas Aktionsseite", patch("mallory", "/campaigns/regeltestcamp1", { ...camp, owner: "mallory", paypal: "Mallory" }), 403);
    await status("Mallory löscht Annas Aktionsseite", req("mallory", "/campaigns/regeltestcamp1", { method: "DELETE" }), 403);
    await status("Mallory listet Aktionsseiten", req("mallory", "/campaigns"), 403);
    await status("Anna löscht ihre Aktionsseite", req("anna", "/campaigns/regeltestcamp1", { method: "DELETE" }), 200);
  });

  it("Unbekannte Sammlungen: kein Lesen und Schreiben", async () => {
    // sonstige Sammlungen gibt es nicht: alles andere ist zu
    await status("unbekannte Sammlung schreiben", patch("mallory", "/sonstiges/x", { a: "b" }), 403);
    await status("unbekannte Sammlung lesen", req("mallory", "/users/anna"), 403);
  });

  it("Angebotsspeicher (#462): App kann weder lesen noch schreiben", async () => {
    await status("Angebotsspeicher lesen", req("anna", "/offers/x"), 403);
    await status("Angebotsspeicher schreiben", patch("anna", "/offers/x", { data: "{}" }), 403);
    await status("Eingaben des Angebotsspeichers lesen", req("anna", "/offerInputs/x"), 403);
  });

  it("Verbindungen der Chat-Apps (#590): App kann weder lesen noch schreiben", async () => {
    await status("Verbindungen der Chat-Apps lesen", req("anna", "/mcpGrants/x"), 403);
    await status("Verbindungen der Chat-Apps schreiben", patch("anna", "/mcpGrants/x", { uid: "anna" }), 403);
  });

  it("Benutzernamen (#650): eindeutig, nur für sich, keine Gäste, lesen ja, auflisten nur eigene", async () => {
    // Öffentlicher Benutzername (#650): eindeutig, nur für sich selbst, Gäste nicht, lesen darf jeder, auflisten nur die eigenen
    await status("Name: Anna belegt reh42", patch("anna", "/usernames/reh42", { uid: "anna", name: "Reh42" }), 200);
    await status("Name: jeder liest ihn", req("", "/usernames/reh42"), 200);
    await status("Name: Mallory übernimmt ihn", patch("mallory", "/usernames/reh42", { uid: "mallory", name: "reh42" }), 403);
    await status("Name: Mallory belegt einen für Anna", patch("mallory", "/usernames/anna2", { uid: "anna", name: "anna2" }), 403);
    await status("Name: Schlüssel passt nicht zum Namen", patch("mallory", "/usernames/xyz", { uid: "mallory", name: "abc" }), 403);
    await status("Name: zu kurz", patch("mallory", "/usernames/ab", { uid: "mallory", name: "ab" }), 403);
    await status("Name: Leerzeichen", patch("mallory", "/usernames/a b c", { uid: "mallory", name: "a b c" }), 403);
    await status("Name: fremde Felder", patch("mallory", "/usernames/mallo", { uid: "mallory", name: "mallo", email: "x@y.de" }), 403);
    await status("Name: Gast belegt", patch("gast1", "/usernames/gastname", { uid: "gast1", name: "gastname" }), 403);
    await status("Name: Umlaut erlaubt", patch("mallory", "/usernames/bär12", { uid: "mallory", name: "Bär12" }), 200);
    await status("Name: Mallory löscht Annas", req("mallory", "/usernames/reh42", { method: "DELETE" }), 403);
    await status("Name: alle auflisten", req("mallory", "/usernames"), 403);
    await status("Name: eigene abfragen", query("mallory", "usernames", { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: "mallory" } } }), 200);
    await status("Name: fremde abfragen", query("mallory", "usernames", { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: "anna" } } }), 403);
    await status("Name: Anna gibt ihn frei", req("anna", "/usernames/reh42", { method: "DELETE" }), 200);
    await req("admin", "/usernames/bär12", { method: "DELETE" });
  });

  it("Reisekatalog (#644): lesen alle, veröffentlichen nur unter eigenem Namen, keine Gäste, keine Links/E-Mail, zurückziehen nur der Ersteller", async () => {
    // Reisekatalog (#644): lesen alle, veröffentlichen nur mit Konto unter dem eigenen Benutzernamen, ohne Links, ändern und
    // zurückziehen nur der Ersteller. Zeitstempel über die REST-Schnittstelle als Feldtransformation (wie serverTimestamp)
    entry = (o = {}) => JSON.stringify({ v: 1, title: "Toskana mit Kindern", stops: [{ place: "Siena", nights: 7 }], ...o });
    pub = (uid, id, o, method = "PATCH") => req(uid, ":commit", { method: "POST", body: JSON.stringify({ writes: [{
      update: { name: `projects/${P}/databases/(default)/documents/catalog/${id}`, fields: fields(o) },
      ...(method === "CREATE" ? { currentDocument: { exists: false } } : {}),
      updateTransforms: [{ fieldPath: "at", setToServerValue: "REQUEST_TIME" }]
    }] }) });
    await status("Katalog: Anna belegt ihren Namen", patch("anna", "/usernames/reh42", { uid: "anna", name: "reh42" }), 200);
    good = { uid: "anna", by: "reh42", data: entry(), terms: "2026-11-02" };
    await status("Katalog: Anna veröffentlicht", pub("anna", "kat1", good, "CREATE"), 200);
    await status("Katalog: ohne Konto lesen", req("", "/catalog/kat1"), 200);
    await status("Katalog: ohne Konto auflisten", req("", "/catalog"), 200);
    await status("Katalog: Anna aktualisiert", pub("anna", "kat1", { ...good, data: entry({ title: "Toskana im Mai" }) }), 200);
    await status("Katalog: Mallory überschreibt Annas", pub("mallory", "kat1", { ...good, uid: "mallory" }), 403);
    await status("Katalog: Mallory unter Annas Namen", pub("mallory", "kat2", { ...good, uid: "mallory" }, "CREATE"), 403);
    await status("Katalog: Mallory für Anna", pub("mallory", "kat2", good, "CREATE"), 403);
    await status("Katalog: Mallory ohne Benutzernamen", pub("mallory", "kat2", { ...good, uid: "mallory", by: "mallo" }, "CREATE"), 403);
    await status("Katalog: Gast veröffentlicht", pub("gast1", "kat2", { ...good, uid: "gast1" }, "CREATE"), 403);
    await status("Katalog: mit Link", pub("anna", "kat2", { ...good, data: entry({ summary: "Infos unter https://example.com" }) }, "CREATE"), 403);
    await status("Katalog: mit www", pub("anna", "kat2", { ...good, data: entry({ summary: "siehe WWW.example.com" }) }, "CREATE"), 403);
    await status("Katalog: mit E-Mail", pub("anna", "kat2", { ...good, data: entry({ summary: "Fragen an anna@example.com" }) }, "CREATE"), 403);
    await status("Katalog: fremde Felder", pub("anna", "kat2", { ...good, email: "x" }, "CREATE"), 403);
    await status("Katalog: zu groß", pub("anna", "kat2", { ...good, data: entry({ summary: "x".repeat(100000) }) }, "CREATE"), 403);
    await status("Katalog: Zeit selbst gesetzt", patch("anna", "/catalog/kat3", { ...good, at: "2020-01-01" }), 403);
    await status("Katalog: Mallory zieht Annas zurück", req("mallory", "/catalog/kat1", { method: "DELETE" }), 403);
    await status("Katalog: Anna zieht zurück", req("anna", "/catalog/kat1", { method: "DELETE" }), 200);
    await req("admin", "/usernames/reh42", { method: "DELETE" });
    await status("Katalog-Preise: Admin legt an", patch("admin", "/catalogStats/kat1", { p: "[]" }), 200);
    await status("Katalog-Preise: ohne Konto lesen", req("", "/catalogStats/kat1"), 200);
    await status("Katalog-Preise: auflisten", req("", "/catalogStats"), 200);
    await status("Katalog-Preise: Anna schreibt", patch("anna", "/catalogStats/kat1", { p: "[{\"pp\":1}]" }), 403);
    await status("Katalog-Preise: Anna legt an", patch("anna", "/catalogStats/kat9", { p: "[]" }), 403);
    await status("Katalog-Preise: Anna löscht", req("anna", "/catalogStats/kat1", { method: "DELETE" }), 403);
    await req("admin", "/catalogStats/kat1", { method: "DELETE" });
  });
});
