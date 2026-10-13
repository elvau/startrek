/* Probe: Aufbau der Quellen ansehen (wird ersetzt) */
const OWID = ["same-sex-sexual-acts-legal-mignot", "legal-status-of-same-sex-sexual-acts"];
for (const g of OWID) {
  for (const q of ["?csvType=full&useColumnShortNames=true", ""]) {
    const r = await fetch(`https://ourworldindata.org/grapher/${g}.csv${q}`);
    const t = await r.text();
    const lines = t.split("\n");
    console.log(`== ${g}${q} ${r.status} ${lines.length} Zeilen\n${lines.slice(0, 3).join("\n")}`);
    const vals = new Set(lines.slice(1).map(l => l.split(",").slice(3).join(",")));
    console.log("Werte:", [...vals].slice(0, 30));
    const m = await fetch(`https://ourworldindata.org/grapher/${g}.metadata.json`); console.log("meta", m.status, (await m.text()).slice(0, 1500));
    break;
  }
}
const idx = await (await fetch("https://www.gov.uk/api/content/foreign-travel-advice")).json();
const kids = idx.links?.children || [];
console.log("FCDO Länder:", kids.length, JSON.stringify(kids[0]).slice(0, 600));
for (const slug of ["qatar", "saudi-arabia", "united-arab-emirates", "iran", "usa", "russia"]) {
  const d = await (await fetch(`https://www.gov.uk/api/content/foreign-travel-advice/${slug}`)).json();
  console.log(`\n## ${slug} ${d.public_updated_at} country=${JSON.stringify(d.details?.country)}`);
  for (const p of d.details?.parts || []) {
    const hs = [...p.body.matchAll(/<h([23])[^>]*>(.*?)<\/h\1>/g)].map(m => m[1] + ":" + m[2].replace(/<[^>]+>/g, ""));
    console.log(`- ${p.title} [${p.slug}]: ${hs.join(" | ")}`);
    const txt = p.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const re of [/[^.]*\b(?:LGBT|same-sex|homosexual)[^.]*\./gi, /[^.]*\bwom[ae]n\b[^.]*\./gi, /[^.]*(?:[“"']X[”"']|non-binary|gender marker|sex marker|sex field)[^.]*\./gi])
      for (const m of (txt.match(re) || []).slice(0, 4)) console.log("   >", m.trim().slice(0, 300));
  }
}
