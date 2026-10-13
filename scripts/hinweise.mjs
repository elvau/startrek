/*
 * Reisehinweise für Frauen, Passeintrag „X“ und LGBTQ+ je Land erzeugen: public/hinweise.json (#302, Entscheidung #329)
 * Quellen, beide dürfen übernommen werden:
 * - Strafbarkeit gleichgeschlechtlicher Handlungen: Mignot (2026) über Our World in Data (CC BY 4.0), neuestes Jahr je Land
 * - Abschnitte der britischen Reisehinweise (FCDO, GOV.UK Content API, Open Government Licence v3.0):
 *   „LGBT+ travellers“, „Dress code“, „Women/Female travellers“ und Hinweise zum Geschlechtseintrag „X“
 * Die Einstufung aus dem FCDO-Text ist ein Vorschlag (Stichworte): Belege stehen im Log, Änderungen im Diff prüfen,
 * nicht blind übernehmen. Läuft von Hand bzw. über .github/workflows/hinweise.yml, nicht beim Deploy.
 * „xManual“ (von Hand gepflegte Länder für „X“) bleibt beim Neu-Erzeugen erhalten.
 *
 *   node scripts/hinweise.mjs            aus dem Netz, schreibt public/hinweise.json
 *   node scripts/hinweise.mjs --dry      nur Bericht
 *
 * Format: { asOf, sources, lgbt: { CC: "death" | "crime" | "restrict" }, women: { CC: "dress,guardian,safety" },
 *   x: [CC], xManual: [CC], fcdo: { CC: slug } }
 * death = Todesstrafe möglich, crime = strafbar, restrict = nicht strafbar, aber Gesetze gegen LGBTQ+ (z. B. „Propaganda“,
 * Geschlechtsausdruck); dress = Kleidungsvorschriften für Frauen, guardian = Erlaubnis bzw. Begleitung durch Männer,
 * safety = eigener Abschnitt zur Sicherheit von Frauen.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const OUT = new URL("../public/hinweise.json", import.meta.url);
const WORLD = new URL("../public/world.json", import.meta.url);
const OWID = "https://ourworldindata.org/grapher/same-sex-sexual-acts-legal-mignot.csv?csvType=full&useColumnShortNames=true";
const FCDO = "https://www.gov.uk/api/content/foreign-travel-advice";
const dry = process.argv.includes("--dry");

// englische Namen → ISO-2 (world.json), dazu Abweichungen von OWID und FCDO
const world = JSON.parse(readFileSync(WORLD, "utf8")).countries;
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^the /, "").replace(/[^a-z]+/g, " ").trim();
const byName = new Map(world.map(c => [norm(c.en), c.k]));
const ALIAS = {
  "usa": "US", "united states": "US", "uk": "GB", "united kingdom": "GB", "czechia": "CZ", "czech republic": "CZ",
  "democratic republic of congo": "CD", "democratic republic of the congo": "CD", "congo": "CG", "republic of the congo": "CG",
  "cote d ivoire": "CI", "ivory coast": "CI", "eswatini": "SZ", "swaziland": "SZ", "east timor": "TL", "timor leste": "TL",
  "north korea": "KP", "south korea": "KR", "laos": "LA", "micronesia": "FM", "micronesia country": "FM", "moldova": "MD",
  "russia": "RU", "syria": "SY", "iran": "IR", "vietnam": "VN", "brunei": "BN", "bolivia": "BO", "venezuela": "VE",
  "tanzania": "TZ", "palestine": "PS", "the occupied palestinian territories": "PS", "occupied palestinian territories": "PS",
  "cape verde": "CV", "cabo verde": "CV", "burma": "MM", "myanmar": "MM", "macao": "MO", "macau": "MO", "hong kong": "HK",
  "taiwan": "TW", "kosovo": "XK", "vatican": "VA", "vatican city": "VA", "st kitts and nevis": "KN", "saint kitts and nevis": "KN",
  "st lucia": "LC", "saint lucia": "LC", "st vincent and the grenadines": "VC", "saint vincent and the grenadines": "VC",
  "sao tome and principe": "ST", "gambia": "GM", "the gambia": "GM", "bahamas": "BS", "the bahamas": "BS", "turkey": "TR",
  "turkiye": "TR", "north macedonia": "MK", "bosnia and herzegovina": "BA", "kyrgyzstan": "KG", "curacao": "CW",
  "united arab emirates": "AE", "uae": "AE"
};
const ccOf = name => ALIAS[norm(name)] || byName.get(norm(name));

const get = async (url, tries = 3) => {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { "user-agent": "splitandfly-hinweise (github.com/elvau/startrek)" } });
    if (r.ok) return r;
    if (i >= tries - 1) throw new Error(`${r.status} ${url}`);
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
};

// 1) Strafbarkeit (Mignot über OWID): neuestes Jahr je Land
const crime = new Set();
const unmatched = [];
{
  const rows = (await (await get(OWID)).text()).trim().split(/\r?\n/).slice(1).map(l => {
    const m = l.match(/^("(?:[^"]|"")*"|[^,]*),([^,]*),(\d+),(.*)$/);
    return m && { name: m[1].replace(/^"|"$/g, "").replace(/""/g, '"'), code: m[2], year: +m[3], status: m[4].trim() };
  }).filter(Boolean);
  const last = new Map();
  for (const r of rows) if (r.code && !r.code.startsWith("OWID") && (!last.has(r.name) || last.get(r.name).year < r.year)) last.set(r.name, r);
  for (const r of last.values()) {
    const cc = ccOf(r.name);
    if (!cc) { unmatched.push(`OWID: ${r.name}`); continue; }
    if (r.status === "Illegal") crime.add(cc);
  }
  if (last.size < 150) throw new Error(`OWID: zu wenige Länder (${last.size})`);
  console.log(`OWID/Mignot: ${last.size} Länder, strafbar: ${crime.size}`);
}

// 2) FCDO: Abschnitte je Land
const text = html => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "’").replace(/&quot;|&ldquo;|&rdquo;/g, "\"").replace(/\s+/g, " ").trim();
/** Abschnitte (h2/h3 mit Text bis zur nächsten Überschrift) */
function sections(body) {
  const out = [];
  const parts = body.split(/(?=<h[23][^>]*>)/);
  for (const p of parts) {
    const m = p.match(/^<h([23])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*)$/);
    out.push(m ? { h: text(m[2]), t: text(m[3]) } : { h: "", t: text(p) });
  }
  return out;
}
const sentences = t => t.split(/(?<=[.!?])\s+(?=[A-Z“"‘(])/);
const pick = (t, re, n = 2) => sentences(t).filter(s => re.test(s)).slice(0, n).map(s => s.slice(0, 220));

const RE = {
  death: /death penalty|death sentence|executed|execution|capital punishment/i,
  illegal: /\b(illegal|criminal offence|criminalised|against the law|prison|imprison|punishable)/i,
  notIllegal: /\b(not illegal|is legal|are legal|legal in|decriminali[sz]ed)/i,
  restrict: /propaganda|extremis|cross-?dress|impersonat|gender expression|disguis|non-traditional|“?LGBT movement/i,
  womenDress: /(wom[ae]n|female|headscarf|hijab|abaya|chador)/i,
  guardian: /male guardian|guardian’?s? permission|husband’?s? permission|permission (from|of) (her|your) husband|exit permit from your husband|without a male (relative|companion|guardian)|accompanied by a male/i,
  xMarker: /[“"‘']X[”"’'] (in the |as |on )|gender marker|sex marker|‘X’|non-binary|gender-neutral|sex field|gender field|neither male nor female/i
};

const idx = await (await get(FCDO)).json();
const kids = idx.links?.children || [];
if (kids.length < 150) throw new Error(`FCDO: zu wenige Länder (${kids.length})`);
const lgbt = {}, women = {}, xs = new Set(), fcdo = {}, report = [];
for (const k of kids) {
  const slug = k.details?.country?.slug || k.base_path.split("/").pop();
  const name = k.details?.country?.name || k.title;
  const cc = ccOf(name) || (k.details?.country?.synonyms || []).map(ccOf).find(Boolean);
  if (!cc) { unmatched.push(`FCDO: ${name} (${slug})`); continue; }
  let d;
  try { d = await (await get(`${FCDO}/${slug}`)).json(); } catch (e) { console.warn(`! ${slug}: ${e.message}`); continue; }
  const secs = (d.details?.parts || []).flatMap(p => sections(p.body || "").map(s => ({ ...s, part: p.slug })));
  const ev = [];
  // LGBTQ+
  const lg = secs.filter(s => /LGBT/i.test(s.h)).map(s => s.t).join(" ");
  const lgCore = sentences(lg).filter(s => !/^Read more|information and advice page/i.test(s)).join(" ");
  let lv = null;
  if (RE.death.test(lgCore)) lv = "death";
  else if (crime.has(cc)) lv = "crime";
  else if (RE.illegal.test(lgCore) && !RE.notIllegal.test(lgCore)) { lv = "crime"; ev.push("LGBT: FCDO strafbar, Mignot nicht"); }
  else if (RE.restrict.test(lgCore)) lv = "restrict";
  if (crime.has(cc) && lv !== "crime" && lv !== "death") ev.push("LGBT: Mignot strafbar");
  if (lv) { lgbt[cc] = lv; ev.push(...pick(lgCore, lv === "death" ? RE.death : lv === "restrict" ? RE.restrict : RE.illegal, 1).map(s => `LGBT ${lv}: ${s}`)); }
  // Frauen
  const tags = [];
  const dress = secs.filter(s => /dress/i.test(s.h)).map(s => s.t).join(" ");
  const dressW = pick(dress, RE.womenDress, 1);
  if (dressW.length) { tags.push("dress"); ev.push(`dress: ${dressW[0]}`); }
  const all = secs.map(s => s.t).join(" ");
  const g = pick(all, RE.guardian, 1);
  if (g.length) { tags.push("guardian"); ev.push(`guardian: ${g[0]}`); }
  const ws = secs.filter(s => /\b(wom[ae]n|female)\b/i.test(s.h));
  if (ws.length) { tags.push("safety"); ev.push(`safety [${ws.map(s => s.h).join("; ")}]: ${sentences(ws[0].t)[0]?.slice(0, 200)}`); }
  if (tags.length) women[cc] = tags.join(",");
  // Geschlechtseintrag „X“
  const x = pick(all, RE.xMarker, 2);
  if (x.length) { xs.add(cc); ev.push(...x.map(s => `X: ${s}`)); }
  if (lv || tags.length || x.length) fcdo[cc] = slug;
  if (ev.length) report.push(`${cc} ${slug} (${d.public_updated_at?.slice(0, 10)})\n  - ${ev.join("\n  - ")}`);
}
// strafbar laut Mignot, aber ohne FCDO-Seite
for (const cc of crime) if (!lgbt[cc]) { lgbt[cc] = "crime"; report.push(`${cc} (nur Mignot)\n  - LGBT crime`); }

console.log(`\n${report.join("\n")}`);
if (unmatched.length) console.log(`\nohne Ländercode: ${unmatched.join(" | ")}`);
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const sort = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const out = {
  asOf: new Date().toISOString().slice(0, 10),
  sources: ["Mignot (2026), Our World in Data (CC BY 4.0)", "FCDO Foreign travel advice, GOV.UK (Open Government Licence v3.0)"],
  lgbt: sort(lgbt), women: sort(women), x: [...xs].sort(), xManual: old.xManual || [], fcdo: sort(fcdo)
};
console.log(`\nLGBT: ${Object.keys(lgbt).length} (Todesstrafe ${Object.values(lgbt).filter(v => v === "death").length}), Frauen: ${Object.keys(women).length}, X: ${xs.size}`);
console.log(JSON.stringify(out));
if (!dry) writeFileSync(OUT, JSON.stringify(out));
