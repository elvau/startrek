/*
 * Auskunft über die gespeicherten Daten (Art. 15 DSGVO) zum Ausdrucken bzw. „Als PDF speichern“: alles aus dem Konto
 * (Anmeldung, Personen, Gruppen, Vorlieben, Buchungsdaten, Reisen, Aktionsseiten), dazu was auf diesem Gerät liegt und
 * was der Dienst sonst verarbeitet, ohne es dem Konto zuzuordnen. Entsteht nur im Browser; nichts davon wird verschickt.
 * Die vollständige Kopie (Art. 15 Abs. 3, Art. 20) ist der JSON-Export (accountJson). Sprache wie die Rechtstexte:
 * deutsch, sonst englisch.
 */
import type { AccountData } from "./cloud/firebase";
import type { Directory, Person, Trip, TravelDoc } from "./model";

type Lang = "de" | "en";

const L = {
  de: {
    title: "Auskunft über deine gespeicherten Daten", law: "nach Art. 15 DSGVO", made: "Erstellt am", controller: "Verantwortlich",
    toc: "Diese Auskunft enthält alles, was Split&Fly zu deinem Konto speichert. Die vollständige Kopie in maschinenlesbarer Form bekommst du über „Als Datei (JSON) herunterladen“.",
    s1: "1. Konto (Anmeldung, Google Firebase Authentication)", s2: "2. Gespeicherte Personen, Gruppen und Vorlieben", s3: "3. Angaben „Nur für dich“ (Geschlecht, Ablauf von Ausweis und Pass)",
    s4: "4. Reisen in deinem Konto", s5: "5. Aktionsseiten", s6: "6. Auf diesem Gerät gespeichert (Browser)", s7: "7. Was sonst verarbeitet wird",
    uid: "Konto-ID", email: "E-Mail", name: "Name", providers: "Anmeldung über", verified: "E-Mail bestätigt", created: "Konto angelegt", last: "Letzte Anmeldung",
    yes: "ja", no: "nein", none: "Keine gespeichert.", people: "Personen", groups: "Gruppen", me: "Ich bin", prefs: "Eigene Vorlieben", setup: "Konto eingerichtet am",
    terms: "AGB zugestimmt", termsV: "Fassung {v}, am {at}", members: "Mitglieder", role: "Deine Rolle", roles: { owner: "Besitzer", editor: "Bearbeiten", viewer: "Ansehen" } as Record<string, string>,
    place: "Ziel", dates: "Zeitraum", travelers: "Reisende", items: "Posten", itemsN: "{n} Posten", expenses: "Ausgaben in der Kasse", invite: "Einladungslink aktiv",
    full: "Den vollständigen Inhalt jeder Reise (alle Posten, Beträge, Notizen, Zahlungen) enthält der JSON-Export.",
    local: "Diese Einträge liegen nur in diesem Browser (nicht im Konto) und lassen sich über die Browser-Einstellungen löschen:", key: "Eintrag", size: "Größe",
    other: [
      "KI-Planer und Kontoeinrichtung: Tageszähler je Konto-ID und Datum im Such-Dienst (Cloudflare), nach zwei Tagen gelöscht. Wünsche und Antworten werden nicht gespeichert.",
      "Fehlerberichte: nur wenn du einen sendest, in einem nicht öffentlichen Projekt bei GitHub; Bilder werden nach 30 Tagen gelöscht. Auskunft dazu per E-Mail.",
      "Such-Dienst: Suchen (Orte, Daten, Anzahl Personen) ohne Konto-ID; zum Schutz vor Missbrauch kurzzeitig Zähler je IP-Adresse.",
      "Geteilte Reisen: Mitreisende mit Zugang sehen die Reise und deinen Kontonamen als Mitglied.",
      "Empfänger, Speicherdauer und deine Rechte (Berichtigung, Löschung, Einschränkung, Widerspruch, Datenübertragbarkeit, Beschwerde) stehen in der Datenschutzerklärung."
    ],
    privacy: "Datenschutzerklärung", fields: {
      first: "Vorname", last: "Nachname", birth: "Geburtsdatum", age: "Alter", home: "Wohnort", plz: "Postleitzahl", ort: "Ort", cc: "Land", license: "Führerschein seit",
      creditCard: "Kreditkarte", rail: "Bahnkarten", gender: "Geschlecht", nationality: "Staatsangehörigkeit", idNo: "Personalausweis-Nr.", idExpiry: "Ausweis gültig bis",
      passNo: "Reisepass-Nr.", passExpiry: "Pass gültig bis", passCountry: "Pass ausgestellt in", nats: "Staatsangehörigkeiten", lgbtq: "Hinweise LGBTQ+",
      memberIds: "Mitglieder", airports: "Flughäfen", avoid: "Gesperrte Länder", maxStops: "Höchstens Umstiege", bags: "Koffer", maxHours: "Höchstens Flugstunden",
      stayType: "Unterkunft", minStars: "Sterne ab", board: "Verpflegung", styles: "Reisestil", budget: "Budget", note: "Notiz für die KI", holidays: "Schulferien",
      months: "Monate", nightsMin: "Nächte ab", nightsMax: "Nächte bis", car: "Auto", pet: "Haustier", stepFree: "Stufenlos", diet: "Ernährung", seatsTogether: "Kinder neben Eltern",
      access: "Anfahrt zum Flughafen", homeCare: "Zuhause versorgen", souvenirs: "Souvenirs pro Person", plzCc: "Land des Wohnorts", seats: "Plätze", fuel: "Antrieb", lat: "Breite", lon: "Länge"
    } as Record<string, string>
  },
  en: {
    title: "Information about your stored data", law: "under Art. 15 GDPR", made: "Created on", controller: "Controller",
    toc: "This report contains everything Split&Fly stores for your account. The complete copy in machine-readable form is available via “Download as file (JSON)”.",
    s1: "1. Account (sign-in, Google Firebase Authentication)", s2: "2. Saved people, groups and preferences", s3: "3. “Just for you” details (gender, ID and passport expiry)",
    s4: "4. Trips in your account", s5: "5. Campaign pages", s6: "6. Stored on this device (browser)", s7: "7. Other processing",
    uid: "Account ID", email: "Email", name: "Name", providers: "Signed in with", verified: "Email verified", created: "Account created", last: "Last sign-in",
    yes: "yes", no: "no", none: "None stored.", people: "People", groups: "Groups", me: "I am", prefs: "Own preferences", setup: "Account set up on",
    terms: "Terms accepted", termsV: "version {v}, on {at}", members: "Members", role: "Your role", roles: { owner: "Owner", editor: "Edit", viewer: "View" } as Record<string, string>,
    place: "Destination", dates: "Dates", travelers: "Travellers", items: "Items", itemsN: "{n} items", expenses: "Kitty expenses", invite: "Invite link active",
    full: "The complete content of each trip (all items, amounts, notes, payments) is included in the JSON export.",
    local: "These entries are stored only in this browser (not in your account) and can be deleted in the browser settings:", key: "Entry", size: "Size",
    other: [
      "AI planner and account setup: daily counter per account ID and date in the search service (Cloudflare), deleted after two days. Requests and answers are not stored.",
      "Bug reports: only if you send one, in a private project on GitHub; images are deleted after 30 days. Information about them by email.",
      "Search service: searches (places, dates, number of people) without account ID; to prevent misuse, short-term counters per IP address.",
      "Shared trips: fellow travellers with access see the trip and your account name as a member.",
      "Recipients, storage periods and your rights (rectification, erasure, restriction, objection, data portability, complaint) are described in the privacy policy."
    ],
    privacy: "Privacy policy", fields: {
      first: "First name", last: "Last name", birth: "Date of birth", age: "Age", home: "Home", plz: "Postcode", ort: "Town", cc: "Country", license: "Driving licence since",
      creditCard: "Credit card", rail: "Rail cards", gender: "Gender", nationality: "Nationality", idNo: "ID card no.", idExpiry: "ID valid until",
      passNo: "Passport no.", passExpiry: "Passport valid until", passCountry: "Passport issued in", nats: "Nationalities", lgbtq: "LGBTQ+ advice",
      memberIds: "Members", airports: "Airports", avoid: "Blocked countries", maxStops: "Max. stops", bags: "Checked bags", maxHours: "Max. flight hours",
      stayType: "Accommodation", minStars: "Stars from", board: "Meals", styles: "Travel style", budget: "Budget", note: "Note for the AI", holidays: "School holidays",
      months: "Months", nightsMin: "Nights from", nightsMax: "Nights up to", car: "Car", pet: "Pet", stepFree: "Step-free", diet: "Diet", seatsTogether: "Children next to parents",
      access: "Getting to the airport", homeCare: "Home care", souvenirs: "Souvenirs per person", plzCc: "Country of residence", seats: "Seats", fuel: "Fuel", lat: "Latitude", lon: "Longitude"
    } as Record<string, string>
  }
};

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const parse = <T>(json: string | null | undefined, fb: T): T => { try { return json ? (JSON.parse(json) as T) : fb; } catch { return fb; } };

/** beliebiger Wert als lesbare Liste: Felder mit Namen, Unterobjekte eingerückt, leere Werte weggelassen */
function value(v: unknown, l: (typeof L)[Lang], names: Map<string, string>): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? l.yes : l.no;
  if (Array.isArray(v)) {
    if (v.every(x => typeof x !== "object" || x == null)) return esc(v.map(x => names.get(String(x)) || x).join(", "));
    return `<ol>${v.map(x => `<li>${value(x, l, names)}</li>`).join("")}</ol>`;
  }
  if (typeof v === "object") {
    const rows = Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, value(x, l, names)]).filter(([, x]) => x !== "");
    return rows.length ? `<dl>${rows.map(([k, x]) => `<dt>${esc(l.fields[k] || k)}</dt><dd>${x}</dd>`).join("")}</dl>` : "";
  }
  return esc(names.get(String(v)) || v);
}

const fullName = (p: Pick<Person, "first" | "last">) => `${p.first || ""} ${p.last || ""}`.trim();

export interface LocalEntry { key: string; size: number }

export function reportHtml(d: AccountData, local: LocalEntry[], lang: Lang = "de", now = new Date()): string {
  const l = L[lang];
  const day = (iso?: string) => { if (!iso) return ""; const x = new Date(iso); return isNaN(+x) ? iso : x.toLocaleString(lang === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }); };
  const dir = parse<Directory>(d.profile, { people: [], groups: [] });
  const names = new Map(dir.people.map(p => [p.id, fullName(p)]));
  const docs = parse<Record<string, TravelDoc>>(d.travelDocs, {});
  const row = (k: string, v: string) => (v ? `<tr><th>${esc(k)}</th><td>${v}</td></tr>` : "");
  const a = d.account;

  const s1 = `<table>${row(l.uid, esc(a.uid))}${row(l.email, esc(a.email))}${row(l.name, esc(a.name))}${row(l.providers, esc(a.providers.join(", ")))}${row(l.verified, a.verified ? l.yes : l.no)}${row(l.created, esc(day(a.created)))}${row(l.last, esc(day(a.lastSignIn)))}</table>`;

  const people = dir.people.map(p => { const { id: _id, ...rest } = p; return `<li><b>${esc(fullName(p) || "–")}</b>${value(rest, l, names)}</li>`; }).join("");
  const groups = dir.groups.map(g => `<li><b>${esc(g.name)}</b>: ${esc(g.memberIds.map(id => names.get(id) || id).join(", "))}${g.prefs ? value({ [l.prefs]: g.prefs }, l, names) : ""}</li>`).join("");
  const s2 = !d.profile ? `<p>${l.none}</p>` : [
    `<h3>${l.people}</h3>${people ? `<ul>${people}</ul>` : `<p>${l.none}</p>`}`,
    `<h3>${l.groups}</h3>${groups ? `<ul>${groups}</ul>` : `<p>${l.none}</p>`}`,
    `<table>${row(l.me, esc(dir.me ? names.get(dir.me) || dir.me : ""))}${row(l.setup, esc(dir.setup || ""))}${row(l.terms, dir.terms ? esc(fill(l.termsV, { v: dir.terms.v, at: dir.terms.at })) : "")}</table>`,
    dir.prefs ? `<h3>${l.prefs}</h3>${value(dir.prefs, l, names)}` : ""
  ].join("");

  const docRows = Object.entries(docs).map(([id, x]) => `<li><b>${esc(names.get(id) || id)}</b>${value(x, l, names)}</li>`).join("");
  const s3 = docRows ? `<ul>${docRows}</ul>` : `<p>${l.none}</p>`;

  const trips = d.trips.map(t => {
    const tr = parse<Partial<Trip>>(t.data, {});
    const travelers = (tr.travelers || []).map(p => `${p.name || ""}${p.age != null && (p.age as unknown) !== "" ? ` (${p.age})` : ""}`).filter(Boolean);
    const exp = (tr.expenses || []).length;
    return `<section class="trip"><h3>${esc(t.name || tr.name || t.id)}</h3><table>${row(l.role, esc(l.roles[t.members?.[a.uid]] || t.members?.[a.uid] || ""))}${row(l.place, esc([tr.place, tr.country].filter(Boolean).join(", ")))}${row(l.dates, esc([tr.from, tr.to].filter(Boolean).join(" – ")))}${row(l.members, esc(Object.values(t.memberNames || {}).join(", ")))}${row(l.travelers, esc(travelers.join(", ")))}${row(l.items, esc(fill(l.itemsN, { n: (tr.items || []).length })))}${exp ? row(l.expenses, String(exp)) : ""}${t.invite ? row(l.invite, esc(l.roles[t.invite.role] || t.invite.role)) : ""}</table></section>`;
  }).join("");
  const s4 = trips ? `${trips}<p class="muted">${l.full}</p>` : `<p>${l.none}</p>`;

  const s5 = d.campaigns.length ? `<ul>${d.campaigns.map(c => { const { owner: _o, id: _i, ...rest } = c; return `<li><b>${esc(c.title)}</b>${value(rest, l, names)}</li>`; }).join("")}</ul>` : `<p>${l.none}</p>`;
  const s6 = local.length ? `<p>${l.local}</p><table><tr><th>${l.key}</th><td><b>${l.size}</b></td></tr>${local.map(e => `<tr><th>${esc(e.key)}</th><td>${(e.size / 1024).toLocaleString(lang === "de" ? "de-DE" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB</td></tr>`).join("")}</table>` : `<p>${l.none}</p>`;
  const s7 = `<ul>${l.other.map(x => `<li>${esc(x)}</li>`).join("")}</ul><p><a href="https://splitandfly.com/${lang === "de" ? "datenschutz" : "privacy"}.html">${l.privacy}</a></p>`;

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(l.title)} · Split&amp;Fly</title><style>
body{font:11pt/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:24px}
h1{font-size:18pt;margin:0 0 4px}h2{font-size:13pt;margin:22px 0 8px;border-bottom:1px solid #ccc;padding-bottom:3px;break-after:avoid}h3{font-size:11pt;margin:12px 0 4px}
table{border-collapse:collapse;margin:4px 0}th,td{text-align:left;vertical-align:top;padding:2px 12px 2px 0}th{font-weight:600;white-space:nowrap}
dl{display:grid;grid-template-columns:max-content 1fr;gap:1px 12px;margin:2px 0 6px 12px}dt{font-weight:600}dd{margin:0}
ul,ol{margin:4px 0;padding-left:20px}li{margin:3px 0}.muted{color:#555;font-size:10pt}.trip{break-inside:avoid}.head{color:#555;font-size:10pt}
@media print{body{margin:0}a{color:inherit}}
</style></head><body>
<h1>${esc(l.title)}</h1><p class="head">${esc(l.law)} · ${esc(l.made)} ${esc(day(now.toISOString()))} · ${esc(l.controller)}: Daniel Jacek Klein, Isaak-Kounen-Straße 10, 47906 Kempen, danielklein@splitandfly.com</p>
<p class="muted">${esc(l.toc)}</p>
<h2>${l.s1}</h2>${s1}<h2>${l.s2}</h2>${s2}<h2>${l.s3}</h2>${s3}<h2>${l.s4}</h2>${s4}<h2>${l.s5}</h2>${s5}<h2>${l.s6}</h2>${s6}<h2>${l.s7}</h2>${s7}
</body></html>`;
}

/** vollständige Kopie als Datei (Art. 15 Abs. 3, Art. 20): Konto, Profil und Reisen als Objekte statt als Text */
export function accountJson(d: AccountData, local: LocalEntry[], now = new Date()): string {
  return JSON.stringify({
    created: now.toISOString(), account: d.account, profile: parse(d.profile, null), travelDocs: parse(d.travelDocs, null),
    trips: d.trips.map(t => ({ ...t, data: parse(t.data, t.data) })), campaigns: d.campaigns, device: local
  }, null, 2);
}
