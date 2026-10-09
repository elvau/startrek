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
const token = uid => `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: `https://securetoken.google.com/${P}`, aud: P, sub: uid, user_id: uid, auth_time: now, iat: now, exp: now + 3600, firebase: { sign_in_provider: "password" } })}.`;
const H = uid => ({ "content-type": "application/json", ...(uid === "admin" ? { Authorization: "Bearer owner" } : uid ? { Authorization: `Bearer ${token(uid)}` } : {}) });

const sv = v => Array.isArray(v) ? { arrayValue: { values: v.map(sv) } } : typeof v === "string" ? { stringValue: v } : typeof v === "number" ? { integerValue: String(v) }
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
await expect("Buchungsdaten anlegen (Admin)", patch("admin", "/travelDocs/anna", { data: "{\"pass\":\"X\"}" }), 200);

// Profile und Buchungsdaten: nur die eigene Person
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
log("Profile und Buchungsdaten: nur für die eigene Person, auch nicht für Mitreisende");

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

// Verlassen: nur sich selbst entfernen, Namen der anderen bleiben
const leave = names => patch("mallory", "/trips/regeltest", { memberIds: ["anna", "ben"], members: { anna: "owner", ben: "editor" }, memberNames: names }, ["memberIds", "members", "memberNames"]);
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

await req("admin", "/trips/regeltest", { method: "DELETE" });
await req("admin", "/profiles/anna", { method: "DELETE" });
await req("admin", "/travelDocs/anna", { method: "DELETE" });
console.log("\nAlle Schritte erfolgreich.");
