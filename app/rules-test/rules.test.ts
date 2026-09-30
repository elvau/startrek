/* Sicherheitsregeln gegen den Firestore-Emulator. Start: npm run test:rules */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { arrayRemove, arrayUnion, deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const KEY = "k".repeat(20);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-reisekasse",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const db = (uid?: string) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const base = (owner = "anna") => ({ name: "Kroatien", data: "{}", owner, memberIds: [owner], members: { [owner]: "owner" }, memberNames: { [owner]: "Anna" }, invite: null });

/** Reise mit Anna (Besitzerin), Ben (editor), Vera (viewer) und offener Einladung als editor */
async function seed() {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), "trips/t1"), {
      ...base(), memberIds: ["anna", "ben", "vera"], members: { anna: "owner", ben: "editor", vera: "viewer" },
      memberNames: { anna: "Anna", ben: "Ben", vera: "Vera" }, invite: { key: KEY, role: "editor" }
    });
  });
}

describe("Anlegen", () => {
  it("angemeldet als Besitzer", () => assertSucceeds(setDoc(doc(db("anna"), "trips/n"), base())));
  it("nicht ohne Anmeldung", () => assertFails(setDoc(doc(db(), "trips/n"), base())));
  it("nicht für jemand anderen", () => assertFails(setDoc(doc(db("mallory"), "trips/n"), base("anna"))));
  it("nicht mit weiteren Mitgliedern", () =>
    assertFails(setDoc(doc(db("anna"), "trips/n"), { ...base(), memberIds: ["anna", "x"], members: { anna: "owner", x: "editor" } })));
});

describe("Lesen", () => {
  beforeEach(seed);
  it("Mitglieder dürfen", async () => { await assertSucceeds(getDoc(doc(db("vera"), "trips/t1"))); });
  it("Fremde nicht", async () => { await assertFails(getDoc(doc(db("mallory"), "trips/t1"))); });
  it("ohne Anmeldung nicht", async () => { await assertFails(getDoc(doc(db(), "trips/t1"))); });
  it("nicht vorhandene Reise: angemeldet darf man sehen, dass es sie nicht gibt", async () => {
    await assertSucceeds(getDoc(doc(db("mallory"), "trips/gibtsnicht")));
    await assertFails(getDoc(doc(db(), "trips/gibtsnicht")));
  });
});

describe("Bearbeiten", () => {
  beforeEach(seed);
  it("editor darf den Inhalt ändern", () => assertSucceeds(updateDoc(doc(db("ben"), "trips/t1"), { data: '{"x":1}', name: "Neu" })));
  it("viewer darf nichts ändern", () => assertFails(updateDoc(doc(db("vera"), "trips/t1"), { data: '{"x":1}' })));
  it("editor darf keine Mitglieder ändern", () =>
    assertFails(updateDoc(doc(db("ben"), "trips/t1"), { "members.vera": "editor" })));
  it("editor darf die Einladung nicht lesen oder ändern", () =>
    assertFails(updateDoc(doc(db("ben"), "trips/t1"), { invite: { key: "x".repeat(20), role: "editor" } })));
  it("Besitzerin darf Rollen ändern und Mitglieder entfernen", () =>
    assertSucceeds(updateDoc(doc(db("anna"), "trips/t1"), { "members.vera": deleteField(), memberIds: arrayRemove("vera"), "members.ben": "viewer" })));
  it("Besitzerin darf sich nicht selbst entmachten", () =>
    assertFails(updateDoc(doc(db("anna"), "trips/t1"), { "members.anna": "editor" })));
  it("Einladung als owner ist nicht erlaubt", () =>
    assertFails(updateDoc(doc(db("anna"), "trips/t1"), { invite: { key: KEY, role: "owner" } })));
  it("nur die Besitzerin darf löschen", async () => {
    await assertFails(deleteDoc(doc(db("ben"), "trips/t1")));
    await assertSucceeds(deleteDoc(doc(db("anna"), "trips/t1")));
  });
});

describe("Beitreten per Einladung", () => {
  beforeEach(seed);
  const join = (uid: string, key: string, role: string) =>
    updateDoc(doc(db(uid), "trips/t1"), { memberIds: arrayUnion(uid), [`members.${uid}`]: role, [`memberNames.${uid}`]: "Oma", joinKey: key });
  it("mit richtigem Schlüssel und der Rolle der Einladung", () => assertSucceeds(join("oma", KEY, "editor")));
  it("nicht mit falschem Schlüssel", () => assertFails(join("oma", "f".repeat(20), "editor")));
  it("nicht mit höherer Rolle", () => assertFails(join("oma", KEY, "owner")));
  it("nicht ohne offene Einladung", async () => {
    await updateDoc(doc(db("anna"), "trips/t1"), { invite: null });
    await assertFails(join("oma", KEY, "editor"));
  });
  it("dabei nichts anderes ändern", () =>
    assertFails(updateDoc(doc(db("oma"), "trips/t1"), { memberIds: arrayUnion("oma"), "members.oma": "editor", joinKey: KEY, data: '{"hack":1}' })));
  it("dabei niemand anderen hinzufügen", () =>
    assertFails(updateDoc(doc(db("oma"), "trips/t1"), { memberIds: arrayUnion("oma", "opa"), "members.oma": "editor", "members.opa": "editor", joinKey: KEY })));
});

describe("Verlassen", () => {
  beforeEach(seed);
  it("Mitglieder dürfen gehen", () =>
    assertSucceeds(updateDoc(doc(db("vera"), "trips/t1"), { memberIds: arrayRemove("vera"), "members.vera": deleteField(), "memberNames.vera": deleteField() })));
  it("aber niemand anderen entfernen", () =>
    assertFails(updateDoc(doc(db("vera"), "trips/t1"), { memberIds: arrayRemove("ben"), "members.ben": deleteField() })));
  it("die Besitzerin kann nicht einfach gehen", () =>
    assertFails(updateDoc(doc(db("anna"), "trips/t1"), { memberIds: arrayRemove("anna"), "members.anna": deleteField() })));
});

describe("Personen und Gruppen", () => {
  const prof = { data: '{"people":[],"groups":[]}' };
  it("jeder liest und schreibt nur das eigene Profil", async () => {
    await assertSucceeds(setDoc(doc(db("anna"), "profiles/anna"), prof));
    await assertSucceeds(getDoc(doc(db("anna"), "profiles/anna")));
    await assertFails(getDoc(doc(db("ben"), "profiles/anna")));
    await assertFails(setDoc(doc(db("ben"), "profiles/anna"), prof));
    await assertFails(getDoc(doc(db(), "profiles/anna")));
  });
  it("nur erlaubte Felder", () => assertFails(setDoc(doc(db("anna"), "profiles/anna"), { ...prof, admin: true })));
});

describe("Buchungsdaten", () => {
  const d = { data: '{"p1":{"passNo":"C01X00T47"}}' };
  it("nur für einen selbst, auch nicht für Mitreisende", async () => {
    await assertSucceeds(setDoc(doc(db("anna"), "travelDocs/anna"), d));
    await assertSucceeds(getDoc(doc(db("anna"), "travelDocs/anna")));
    await assertFails(getDoc(doc(db("ben"), "travelDocs/anna")));
    await assertFails(getDoc(doc(db("vera"), "travelDocs/anna")));
    await assertFails(setDoc(doc(db("ben"), "travelDocs/anna"), d));
    await assertFails(getDoc(doc(db(), "travelDocs/anna")));
    await assertSucceeds(deleteDoc(doc(db("anna"), "travelDocs/anna")));
  });
  it("nur erlaubte Felder", () => assertFails(setDoc(doc(db("anna"), "travelDocs/anna"), { ...d, x: 1 })));
});
