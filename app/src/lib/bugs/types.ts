/*
 * Fehlermeldung aus der Beta (Knopf 🐞): gemeinsame Typen und Prüfung für App und Such-Dienst (worker/).
 * Enthält bewusst keine Reisedaten, nur Beschreibung, Umgebung und die letzten Fehler im Browser.
 */

export interface BugReport {
  /** Beschreibung der Person */
  text: string;
  /** Adresse ohne Einladungscode, z. B. https://elvau.github.io/startrek/ */
  page: string;
  lang: string;
  /** Browser und Gerät */
  ua: string;
  /** Bildschirm, z. B. 390×844 */
  screen: string;
  /** App-Stand (Commit) */
  version: string;
  /** letzte Fehlermeldungen im Browser, neueste zuletzt */
  errors: string[];
  /** Ansicht: Startseite oder Reise, Modus, Zahl der Personen (keine Namen) */
  view: string;
}

export const BUG_MAX_TEXT = 4000;
export const BUG_MAX_IMAGE = 3 * 1024 * 1024;
export const BUG_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Meldung prüfen und kürzen; Fehlertext bei ungültiger Meldung */
export function parseBugReport(b: unknown): BugReport | string {
  if (!b || typeof b !== "object") return "Meldung fehlt";
  const o = b as Record<string, unknown>;
  const text = str(o.text, BUG_MAX_TEXT).trim();
  if (text.length < 5) return "Bitte beschreib den Fehler in ein paar Worten";
  return {
    text,
    page: str(o.page, 300).replace(/([?&])join=[^&#]*/g, "$1join=…"),
    lang: str(o.lang, 10),
    ua: str(o.ua, 300),
    screen: str(o.screen, 30),
    version: str(o.version, 40),
    errors: Array.isArray(o.errors) ? o.errors.slice(-10).map(e => str(e, 500)).filter(Boolean) : [],
    view: str(o.view, 200)
  };
}

/** Titel des Issues: erste Zeile der Beschreibung, gekürzt */
export function bugTitle(r: BugReport): string {
  const first = r.text.split("\n")[0].trim();
  return "🐞 " + (first.length > 80 ? first.slice(0, 77) + "…" : first);
}

/** Text des Issues (Markdown); die Beschreibung steht als Zitat, damit sie keine Formatierung auslöst */
export function bugBody(r: BugReport, image?: string, who?: string): string {
  const quote = r.text.split("\n").map(l => "> " + l.replace(/[<>]/g, c => (c === "<" ? "&lt;" : "&gt;"))).join("\n");
  const rows: [string, string][] = [["Seite", r.page], ["Ansicht", r.view], ["Sprache", r.lang], ["Browser", r.ua], ["Bildschirm", r.screen], ["App-Stand", r.version]];
  const cell = (s: string) => (s || "–").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    quote,
    image ? `\n![Bildschirmfoto](${image})\n\n_Bild wird nach 30 Tagen gelöscht._` : "",
    "\n| | |\n|---|---|",
    ...rows.map(([k, v]) => `| ${k} | ${cell(v)} |`),
    who ? `| Gemeldet von | ${cell(who)} |` : "",
    r.errors.length ? "\n**Letzte Fehler im Browser**\n\n```\n" + r.errors.join("\n").replace(/```/g, "ʼʼʼ") + "\n```" : "\n_Keine Fehler im Browser aufgezeichnet._"
  ].filter(Boolean).join("\n");
}
