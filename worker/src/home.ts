/*
 * Wohnort aus Text für den KI-Konnektor (#608): „47906 Kempen“, „Kempen“ oder „1010 Wien“ mit Land. Postleitzahlen wie in
 * der App (plz.txt für Deutschland, plz/<LAND>.txt), geladen von der App-Adresse und je Isolate gemerkt; sonst Ort aus
 * der Ortsliste (mcp.ts). Ergebnis wie der Wohnort einer gespeicherten Person.
 */
/** Postleitzahl, Ort, Breite, Länge (wie app/src/lib/home.ts; die Dateien der App laden import.meta.env, darum hier eigen) */
type PostalRow = [string, string, number, number];

/** plz.txt (wie app/src/lib/plz.ts): je Eintrag PLZ, Breite, Länge, Ort ohne Trenner, Einträge mit „|“ getrennt */
const parsePlzTxt = (t: string): PostalRow[] => t.split("|").filter(x => x.length > 15)
  .map(x => [x.slice(0, 5), x.slice(15), (+x.slice(5, 10) + 47000) / 1000, (+x.slice(10, 15) + 5000) / 1000]);
/** plz/<LAND>.txt: „PLZ<TAB>Ort<TAB>Breite<TAB>Länge“ */
const parsePostal = (t: string): PostalRow[] => t.split("\n").map(l => l.split("\t")).filter(([c, o, la, lo]) => c && o && isFinite(+la) && isFinite(+lo)).map(([c, o, la, lo]) => [c, o, +la, +lo]);
const flat = (s: string) => s.toLowerCase().replace(/\s/g, "");
/** genau diese Postleitzahl (in den Daten gekürzte wie „SW1A“ oder „1012“ über den Anfang) */
const byCode = (rows: PostalRow[], code: string) => rows.find(r => flat(r[0]) === flat(code)) || rows.find(r => flat(code).startsWith(flat(r[0])) && r[0].length >= 3);

export interface HomeHit { plz: string; ort: string; lat: number; lon: number; cc?: string }

const tables = new Map<string, Promise<PostalRow[] | null>>();
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

function load(appUrl: string, cc: string, f: typeof fetch): Promise<PostalRow[] | null> {
  const key = `${appUrl}|${cc}`;
  if (!tables.has(key)) {
    const p = cc === "DE"
      ? f(`${appUrl}plz.txt`).then(r => (r.ok ? r.text() : "")).then(parsePlzTxt)
      : f(`${appUrl}plz/${cc}.txt`).then(r => (r.ok ? r.text() : "")).then(parsePostal);
    // leer (nicht erreichbar, kein Land mit Postleitzahlen): beim nächsten Mal neu versuchen
    tables.set(key, p.then(rows => (rows.length ? rows : (tables.delete(key), null))).catch(() => (tables.delete(key), null)));
  }
  return tables.get(key)!;
}

/** Wohnort finden: Postleitzahl (ggf. mit Ort), sonst Ort mit der ersten Postleitzahl; null: nicht gefunden */
export async function findHome(text: string, cc: string, appUrl: string, f: typeof fetch = fetch): Promise<HomeHit | null> {
  const v = text.trim().slice(0, 80);
  if (!v || !/^[A-Z]{2}$/.test(cc)) return null;
  const rows = await load(appUrl, cc, f);
  const out = (r: PostalRow): HomeHit => ({ plz: r[0], ort: r[1], lat: r[2], lon: r[3], ...(cc !== "DE" ? { cc } : {}) });
  const m = /^([A-Za-z]{0,3}[\d][\dA-Za-z -]{1,8}?)\s+(\D.*)$/.exec(v);
  const code = m ? m[1] : /\d/.test(v) ? v : "", name = m ? m[2] : code ? "" : v;
  if (rows && code) {
    const r = byCode(rows, code);
    if (r) return out(r);
  }
  if (rows && name) {
    const r = rows.find(x => norm(x[1]) === norm(name));
    if (r) return out(r);
  }
  return null;
}
