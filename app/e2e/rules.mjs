/*
 * Firestore-Regeln von außen (#261): über die REST-Schnittstelle wie ein Angreifer ohne App, je Sammlung Lesen,
 * Auflisten, Abfragen und Ändern fremder Daten. Ohne Browser. Start: npm run test:cloud
 */
const P = "demo-reisekasse";
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };

// unsignierte Anmelde-Tokens nimmt nur der Emulator an
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const token = uid => `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: `https://securetoken.google.com/${P}`, aud: P, sub: uid, user_id: uid, auth_time: now, iat: now, exp: now + 3600, firebase: { sign_in_provider: uid.startsWith("gast") ? "anonymous" : "password" } })}.`;
const H = uid => ({ "content-type": "application/json", ...(uid === "admin" ? { Authorization: "Bearer owner" } : uid ? { Authorization: `Bearer ${token(uid)}` } : {}) });

const sv = v => Array.isArray(v) ? { arrayValue: { values: v.map(sv) } } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) }
  : v === null ? { nullValue: null } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sv(x)])) } };
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sv(v)]));
const req = (uid, path, init = {}) => fetch(`${FS}${path}`, { ...init, headers: H(uid) });
const patch = (uid, path, o, mask) => req(uid, `${path}${mask ? "?" + mask.map(m => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&") : ""}`, { method: "PATCH", body: JSON.stringify({ fields: fields(o) }) });
const query = (uid, coll, where) => req(uid, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], ...(where ? { where } : {}) } }) });
async function expect(what, r, status) {
  const res = await r;
  if (res.status !== status) fail(`${what}: ${res.status} statt ${status} ${(await res.text()).slice(0, 200)}`);
}

// Ausgangslage: Anna besitzt die Reise, Ben bearbeitet mit, Einladung als Zuschauer; Mallory gehört nicht dazu
const KEY = "einladung-0123456789abcdef";
const trip = { name: "Regeltest", data: "{}", owner: "anna", memberIds: ["anna", "ben"], members: { anna: "owner", ben: "editor" }, memberNames: { anna: "Anna", ben: "Ben" }, invite: { key: KEY, role: "viewer" } };
await expect("Reise anlegen (Admin)", patch("admin", "/trips/regeltest", trip), 200);
await expect("Profil anlegen (Admin)", patch("admin", "/profiles/anna", { data: "{\"p\":1}" }), 200);
await expect("travelDocs anlegen (Admin)", patch("admin", "/travelDocs/anna", { data: "{\"pass\":\"X\"}" }), 200);

// Profile und travelDocs: nur die eigene Person
for (const coll of ["profiles", "travelDocs"]) {
  await expect(`${coll}: Anna liest ihre`, req("anna", `/${coll}/anna`), 200);
  for (const who of ["mallory", ""]) {
    await expect(`${coll}: ${who || "ohne Konto"} liest fremde`, req(who, `/${coll}/anna`), 403);
    await expect(`${coll}: ${who || "ohne Konto"} listet`, req(who, `/${coll}`), 403);
    await expect(`${coll}: ${who || "ohne Konto"} fragt ab`, query(who, coll), 403);
    await expect(`${coll}: ${who || "ohne Konto"} überschreibt`, patch(who, `/${coll}/anna`, { data: "{}" }), 403);
  }
  await expect(`${coll}: Ben (Mitreisender) liest Annas`, req("ben", `/${coll}/anna`), 403);
}
log("Profile und travelDocs: nur für die eigene Person, auch nicht für Mitreisende");

// Reisen: lesen nur Mitglieder, auflisten nur die eigenen
await expect("Mallory liest die Reise", req("mallory", "/trips/regeltest"), 403);
await expect("ohne Konto liest die Reise", req("", "/trips/regeltest"), 403);
await expect("Mallory listet alle Reisen", req("mallory", "/trips"), 403);
await expect("Mallory fragt alle Reisen ab", query("mallory", "trips"), 403);
await expect("Mallory fragt Annas Reisen ab", query("mallory", "trips", { fieldFilter: { field: { fieldPath: "memberIds" }, op: "ARRAY_CONTAINS", value: sv("anna") } }), 403);
await expect("Ben fragt seine Reisen ab", query("ben", "trips", { fieldFilter: { field: { fieldPath: "memberIds" }, op: "ARRAY_CONTAINS", value: sv("ben") } }), 200);
await expect("Mallory ändert die Reise", patch("mallory", "/trips/regeltest", { data: "{\"x\":1}" }, ["data"]), 403);
await expect("Mallory löscht die Reise", req("mallory", "/trips/regeltest", { method: "DELETE" }), 403);
log("Reisen: Fremde können weder lesen, auflisten, abfragen, ändern noch löschen");

// Mitbearbeiter: Inhalt ja, Mitglieder, Einladung und Besitz nein
await expect("Ben ändert den Inhalt", patch("ben", "/trips/regeltest", { data: "{\"b\":1}" }, ["data"]), 200);
await expect("Ben macht sich zum Besitzer", patch("ben", "/trips/regeltest", { members: { anna: "owner", ben: "owner" } }, ["members"]), 403);
await expect("Ben übernimmt die Reise", patch("ben", "/trips/regeltest", { owner: "ben", members: { anna: "editor", ben: "owner" } }, ["owner", "members"]), 403);
await expect("Ben liest den Einladungsschlüssel und ändert die Rolle", patch("ben", "/trips/regeltest", { invite: { key: KEY, role: "editor" } }, ["invite"]), 403);
await expect("Ben löscht die Reise", req("ben", "/trips/regeltest", { method: "DELETE" }), 403);
await expect("Ben benennt Anna um", patch("ben", "/trips/regeltest", { memberNames: { anna: "Hacker", ben: "Ben" } }, ["memberNames"]), 403);
log("Mitbearbeiter: Inhalt ja; Besitz, Rollen, Einladung, Namen anderer und Löschen nein");

// Beitreten: nur mit Schlüssel, nur mit der Rolle der Einladung, nur sich selbst
const join = (uid, key, role, extra = {}) => patch(uid, "/trips/regeltest",
  { memberIds: ["anna", "ben", uid], members: { anna: "owner", ben: "editor", [uid]: role }, memberNames: { anna: "Anna", ben: "Ben", [uid]: uid, ...extra }, joinKey: key },
  ["memberIds", "members", "memberNames", "joinKey"]);
await expect("Mallory tritt ohne Schlüssel bei", join("mallory", "geraten-0123456789abcdef", "viewer"), 403);
await expect("Mallory tritt als Mitbearbeiter bei", join("mallory", KEY, "editor"), 403);
await expect("Mallory tritt bei und benennt Anna um", join("mallory", KEY, "viewer", { anna: "Hacker" }), 403);
await expect("Mallory tritt mit Schlüssel als Zuschauer bei", join("mallory", KEY, "viewer"), 200);
await expect("Mallory (Zuschauer) ändert den Inhalt", patch("mallory", "/trips/regeltest", { data: "{\"m\":1}" }, ["data"]), 403);
log("Beitreten nur mit Schlüssel und der Rolle der Einladung; Zuschauer ändern nichts");

// „Wer bist du?“ (#435): jede Rolle setzt nur die eigene Zuordnung { t, n }
const claim = (uid, who, c) => patch(uid, "/trips/regeltest", { claims: { [who]: c } }, [`claims.${who}`]);
await expect("Mallory (Zuschauer) wählt sich", claim("mallory", "mallory", { t: "p2", n: "Mal" }), 200);
await expect("Mallory wählt für Ben", claim("mallory", "ben", { t: "p1", n: "Ben" }), 403);
await expect("Mallory wählt sich mit Zusatzfeld", claim("mallory", "mallory", { t: "p2", n: "Mal", rolle: "owner" }), 403);
await expect("Mallory wählt sich mit zu langem Namen", claim("mallory", "mallory", { t: "p2", n: "x".repeat(41) }), 403);
await expect("Ben (Mitbearbeiter) ändert Inhalt und Mallorys Zuordnung", patch("ben", "/trips/regeltest", { data: "{\"b\":2}", claims: { mallory: { t: "p9", n: "X" } } }, ["data", "claims.mallory"]), 403);
await expect("Ben wählt sich", claim("ben", "ben", { t: "p1", n: "Ben" }), 200);
await expect("Anna (Besitzerin) löst Mallorys Zuordnung", patch("anna", "/trips/regeltest", {}, ["claims.mallory"]), 200);
await expect("Mallory wählt sich wieder", claim("mallory", "mallory", { t: "p2", n: "Mal" }), 200);
log("Wer bist du: jede Rolle nur die eigene Zuordnung, nur Kennung und Vorname; Besitzerin kann lösen");

// Stimmen (#432): eigenes Dokument je Mitglied, lesen nur Mitglieder
const vote = (uid, who, v) => patch(uid, `/trips/regeltest/votes/${who}`, { v });
await expect("Mallory (Zuschauer) stimmt ab", vote("mallory", "mallory", { p1: { o1: 3 } }), 200);
await expect("Ben liest Mallorys Stimme", req("ben", "/trips/regeltest/votes/mallory"), 200);
await expect("Mallory sagt „Ohne mich“ mit Grund (#439)", patch("mallory", "/trips/regeltest/votes/mallory", { v: { p1: { o1: -1 } }, w: { p1: { o1: { r: "zu teuer", f: true } } } }), 200);
await expect("Mallory: Grund kein Verzeichnis", patch("mallory", "/trips/regeltest/votes/mallory", { v: { p1: { o1: -1 } }, w: "zu teuer" }), 403);
await expect("Mallory stimmt für Ben", vote("mallory", "ben", { p1: { o1: 1 } }), 403);
await expect("Mallory stimmt mit Zusatzfeld", patch("mallory", "/trips/regeltest/votes/mallory", { v: { p1: { o1: 1 } }, rolle: "owner" }), 403);
await expect("Fremder liest Stimmen", req("fremd", "/trips/regeltest/votes/mallory"), 403);
await expect("Fremder stimmt ab", vote("fremd", "fremd", { p1: { o1: 1 } }), 403);
await expect("Ben löscht Mallorys Stimme", req("ben", "/trips/regeltest/votes/mallory", { method: "DELETE" }), 403);
await expect("Anna (Besitzerin) löscht Mallorys Stimme", req("anna", "/trips/regeltest/votes/mallory", { method: "DELETE" }), 200);
log("Stimmen: nur die eigene, lesen nur Mitglieder, löschen nur selbst oder die Besitzerin");

// Selbst eintragen (#571): eigenes Dokument je Mitglied, jede Rolle, nur bekannte Felder
const self = (uid, who, o) => patch(uid, `/trips/regeltest/self/${who}`, o);
await expect("Mallory (Zuschauer) trägt Termine und Wohnort ein", self("mallory", "mallory", { a: { "2027-09-03": "yes" }, h: { plz: "44787", ort: "Bochum" }, f: { m: [{ n: "Gisela" }], at: "2027-01-01" } }), 200);
await expect("Mallory: Familie stimmt mit (zählt nicht für, wie, entschieden)", self("mallory", "mallory", { x: ["p1"], l: "p2", d: true }), 200);
await expect("Mallory: „wie“ zu lang", self("mallory", "mallory", { l: "x".repeat(41) }), 403);
await expect("Mallory: „entschieden“ kein Wahrheitswert", self("mallory", "mallory", { d: "ja" }), 403);
await expect("Ben liest Mallorys Angaben", req("ben", "/trips/regeltest/self/mallory"), 200);
await expect("Fremder liest Mallorys Angaben", req("fremd", "/trips/regeltest/self/mallory"), 403);
await expect("Fremder trägt sich ein", self("fremd", "fremd", { a: {} }), 403);
await expect("Mallory trägt für Ben ein", self("mallory", "ben", { a: { "2027-09-03": "no" } }), 403);
await expect("Mallory mit Zusatzfeld", self("mallory", "mallory", { a: {}, rolle: "owner" }), 403);
await expect("Mallory mit fremdem Feld im Wohnort", self("mallory", "mallory", { h: { plz: "1", iban: "DE00" } }), 403);
await expect("Mallory mit zu großem Familienvorschlag", self("mallory", "mallory", { f: { m: Array.from({ length: 13 }, (_, i) => ({ n: "K" + i })), at: "x" } }), 403);
await expect("Ben löscht Mallorys Angaben", req("ben", "/trips/regeltest/self/mallory", { method: "DELETE" }), 403);
await expect("Anna (Besitzerin) löscht Mallorys Angaben", req("anna", "/trips/regeltest/self/mallory", { method: "DELETE" }), 200);
log("Selbst eintragen: nur das eigene Dokument, jede Rolle, nur bekannte Felder; lesen nur Mitglieder");

// Gruppenchat: Mitglieder schreiben im eigenen Namen mit Serverzeit, nichts ändern; Bild als data:-Adresse daneben
const DOCS = `projects/${P}/databases/(default)/documents/trips/regeltest`;
const chat = (uid, id, o, at = true) => req(uid, ":commit", { method: "POST", body: JSON.stringify({ writes: [{
  update: { name: `${DOCS}/chat/${id}`, fields: fields(o) },
  ...(at ? { updateTransforms: [{ fieldPath: "at", setToServerValue: "REQUEST_TIME" }] } : {})
}] }) });
const pic = (uid, id, d) => patch(uid, `/trips/regeltest/chatImg/${id}`, { u: uid, d });
await expect("Mallory (Zuschauer) schreibt", chat("mallory", "m1", { u: "mallory", n: "Mal", t: "Hallo 🎳" }), 200);
await expect("Ben liest den Chat", req("ben", "/trips/regeltest/chat/m1"), 200);
await expect("Ben listet den Chat", req("ben", "/trips/regeltest/chat"), 200);
await expect("Fremder liest den Chat", req("fremd", "/trips/regeltest/chat/m1"), 403);
await expect("Fremder listet den Chat", req("fremd", "/trips/regeltest/chat"), 403);
await expect("Fremder schreibt", chat("fremd", "f1", { u: "fremd", n: "F", t: "Spam" }), 403);
await expect("Mallory schreibt als Ben", chat("mallory", "m2", { u: "ben", n: "Ben", t: "Ich zahle alles" }), 403);
await expect("Mallory schreibt ohne Serverzeit", chat("mallory", "m3", { u: "mallory", n: "Mal", t: "x" }, false), 403);
await expect("Mallory schreibt leer", chat("mallory", "m4", { u: "mallory", n: "Mal", t: "" }), 403);
await expect("Mallory schreibt zu lang", chat("mallory", "m5", { u: "mallory", n: "Mal", t: "x".repeat(1001) }), 403);
await expect("Mallory schreibt mit Zusatzfeld", chat("mallory", "m6", { u: "mallory", n: "Mal", t: "x", video: "https://x" }), 403);
await expect("Mallory ändert ihre Nachricht", chat("mallory", "m1", { u: "mallory", n: "Mal", t: "geändert" }), 403);
await expect("Ben ändert Mallorys Nachricht", chat("ben", "m1", { u: "ben", n: "Ben", t: "geändert" }), 403);
await expect("Mallory schickt ein Bild", pic("mallory", "m7", "data:image/jpeg;base64,/9j/4AAQSkZJRg=="), 200);
await expect("Mallory schickt die Nachricht zum Bild", chat("mallory", "m7", { u: "mallory", n: "Mal", t: "", img: true }), 200);
await expect("Ben liest das Bild", req("ben", "/trips/regeltest/chatImg/m7"), 200);
await expect("Fremder liest das Bild", req("fremd", "/trips/regeltest/chatImg/m7"), 403);
await expect("Mallory schickt ein Video", pic("mallory", "m8", "data:video/mp4;base64,AAAA"), 403);
await expect("Mallory schickt ein SVG", pic("mallory", "m8", "data:image/svg+xml;base64,PHN2Zz4="), 403);
await expect("Mallory schickt einen Link statt Bild", pic("mallory", "m8", "https://example.com/a.jpg"), 403);
await expect("Mallory schickt ein zu großes Bild", pic("mallory", "m8", "data:image/jpeg;base64," + "A".repeat(340000)), 403);
await expect("Mallory schickt ein Bild als Ben", patch("mallory", "/trips/regeltest/chatImg/m8", { u: "ben", d: "data:image/jpeg;base64,AAAA" }), 403);
await expect("Ben löscht Mallorys Nachricht", req("ben", "/trips/regeltest/chat/m1", { method: "DELETE" }), 403);
await expect("Ben löscht Mallorys Bild", req("ben", "/trips/regeltest/chatImg/m7", { method: "DELETE" }), 403);
await expect("Mallory löscht ihre Nachricht", req("mallory", "/trips/regeltest/chat/m1", { method: "DELETE" }), 200);
await expect("Anna (Besitzerin) löscht Mallorys Bild", req("anna", "/trips/regeltest/chatImg/m7", { method: "DELETE" }), 200);
await expect("Anna (Besitzerin) löscht Mallorys Nachricht", req("anna", "/trips/regeltest/chat/m7", { method: "DELETE" }), 200);
log("Gruppenchat: nur Mitglieder, nur im eigenen Namen mit Serverzeit, nicht ändern, nur Bilder bis 340 KB; löschen selbst oder Besitzerin");

// Gast ohne Konto (anonyme Anmeldung): beitreten und sich wählen ja, eigene Reisen und Aktionsseiten nein
await expect("Gast legt eine Reise an", patch("gast1", "/trips/gastreise", { name: "G", data: "{}", owner: "gast1", memberIds: ["gast1"], members: { gast1: "owner" }, invite: null }), 403);
await expect("Gast tritt mit Schlüssel bei", patch("gast1", "/trips/regeltest",
  { memberIds: ["anna", "ben", "mallory", "gast1"], members: { anna: "owner", ben: "editor", mallory: "viewer", gast1: "viewer" }, memberNames: { anna: "Anna", ben: "Ben", mallory: "mallory", gast1: "Jonas" }, joinKey: KEY },
  ["memberIds", "members", "memberNames", "joinKey"]), 200);
await expect("Gast wählt sich", claim("gast1", "gast1", { t: "p3", n: "Jonas" }), 200);
await expect("Gast legt Aktionsseite an", patch("gast1", "/campaigns/gastcamp1", { owner: "gast1", trip: "regeltest", title: "T", text: "", place: "", from: "", to: "", goal: 0, raised: 0, pledged: 0, paypal: "", link: "" }), 403);
await expect("Gast verlässt die Reise samt Zuordnung", patch("gast1", "/trips/regeltest",
  { memberIds: ["anna", "ben", "mallory"], members: { anna: "owner", ben: "editor", mallory: "viewer" }, memberNames: { anna: "Anna", ben: "Ben", mallory: "mallory" } },
  ["memberIds", "members", "memberNames", "claims.gast1"]), 200);
log("Gäste: beitreten und sich wählen ja; keine eigenen Reisen oder Aktionsseiten; verlassen samt Zuordnung");

// Verlassen: nur sich selbst entfernen, Namen der anderen bleiben
const leave = names => patch("mallory", "/trips/regeltest", { memberIds: ["anna", "ben"], members: { anna: "owner", ben: "editor" }, memberNames: names }, ["memberIds", "members", "memberNames", "claims.mallory"]);
await expect("Mallory verlässt die Reise und benennt Anna um", leave({ anna: "Hacker", ben: "Ben" }), 403);
await expect("Mallory verlässt die Reise", leave({ anna: "Anna", ben: "Ben" }), 200);
await expect("Mallory liest nach dem Verlassen", req("mallory", "/trips/regeltest"), 403);
log("Verlassen: nur sich selbst entfernen, Namen der anderen bleiben unverändert");

// Aktionsseiten: Fremde legen keine im Namen anderer an
const camp = { owner: "anna", trip: "regeltest", title: "T", text: "", place: "", from: "", to: "", goal: 0, raised: 0, pledged: 0, paypal: "AnnaK", link: "" };
await expect("Mallory legt Aktionsseite für Anna an", patch("mallory", "/campaigns/regeltestcamp1", camp), 403);
await expect("Anna legt Aktionsseite mit IBAN an", patch("anna", "/campaigns/regeltestcamp1", { ...camp, iban: "DE89370400440532013000" }), 403);
await expect("Anna legt Aktionsseite mit fremdem Link an", patch("anna", "/campaigns/regeltestcamp1", { ...camp, link: "https://evil.example/x" }), 403);
await expect("Anna legt Aktionsseite mit Link einer Sammelaktion an", patch("anna", "/campaigns/regeltestcamp1", { ...camp, link: "https://gofund.me/abc" }), 200);
await expect("Mallory ändert Annas Aktionsseite", patch("mallory", "/campaigns/regeltestcamp1", { ...camp, owner: "mallory", paypal: "Mallory" }), 403);
await expect("Mallory löscht Annas Aktionsseite", req("mallory", "/campaigns/regeltestcamp1", { method: "DELETE" }), 403);
await expect("Mallory listet Aktionsseiten", req("mallory", "/campaigns"), 403);
await expect("Anna löscht ihre Aktionsseite", req("anna", "/campaigns/regeltestcamp1", { method: "DELETE" }), 200);
log("Aktionsseiten: nur im eigenen Namen, ohne IBAN, nur Links bekannter Anbieter; Fremde ändern und löschen nichts");

// sonstige Sammlungen gibt es nicht: alles andere ist zu
await expect("unbekannte Sammlung schreiben", patch("mallory", "/sonstiges/x", { a: "b" }), 403);
await expect("unbekannte Sammlung lesen", req("mallory", "/users/anna"), 403);
log("Unbekannte Sammlungen: kein Lesen und Schreiben");
await expect("Angebotsspeicher lesen", req("anna", "/offers/x"), 403);
await expect("Angebotsspeicher schreiben", patch("anna", "/offers/x", { data: "{}" }), 403);
await expect("Eingaben des Angebotsspeichers lesen", req("anna", "/offerInputs/x"), 403);
log("Angebotsspeicher (#462): App kann weder lesen noch schreiben");
await expect("Verbindungen der Chat-Apps lesen", req("anna", "/mcpGrants/x"), 403);
await expect("Verbindungen der Chat-Apps schreiben", patch("anna", "/mcpGrants/x", { uid: "anna" }), 403);
log("Verbindungen der Chat-Apps (#590): App kann weder lesen noch schreiben");

await req("admin", "/trips/regeltest", { method: "DELETE" });
await req("admin", "/profiles/anna", { method: "DELETE" });
await req("admin", "/travelDocs/anna", { method: "DELETE" });
console.log("\nAlle Schritte erfolgreich.");
