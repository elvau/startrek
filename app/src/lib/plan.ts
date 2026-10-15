/*
 * Einstieg von den Inhaltsseiten (/reise/…, #314): Link mit Ziel und Gruppe öffnet eine neue, vorausgefüllte Reise.
 * ?ziel=Palma&land=ES&gruppe=8 (Einzelne, z. B. Junggesellenabschied) oder &fam=2-2,2-1 (Familien: Erw.-Kinder);
 * &idee=<slug> übernimmt die Beispielrechnung der Reiseidee als Posten (#402)
 */
export interface PlanLink { place: string; cc?: string; name?: string; group?: number; fam?: { adults: number; kids: number }[]; idea?: string }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function parsePlan(search: string): PlanLink | null {
  const p = new URLSearchParams(search);
  const place = (p.get("ziel") || "").trim().slice(0, 80);
  if (!place) return null;
  const out: PlanLink = { place };
  const cc = (p.get("land") || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(cc)) out.cc = cc;
  const name = (p.get("name") || "").trim().slice(0, 80);
  if (name) out.name = name;
  const idea = (p.get("idee") || "").trim();
  if (/^[a-z0-9-]{3,80}$/.test(idea)) out.idea = idea;
  const fam = (p.get("fam") || "").split(",").map(s => s.match(/^(\d{1,2})-(\d{1,2})$/)).filter(m => !!m)
    .map(m => ({ adults: clamp(+m![1], 1, 6), kids: clamp(+m![2], 0, 8) })).slice(0, 8);
  const group = parseInt(p.get("gruppe") || "", 10);
  if (fam.length) out.fam = fam;
  else if (group > 0) out.group = clamp(group, 1, 40);
  return out;
}

/** Link aus der Adresse entfernen, damit Neuladen keine zweite Reise anlegt */
export function stripPlan(url: URL): URL {
  for (const k of ["ziel", "land", "name", "gruppe", "fam", "idee"]) url.searchParams.delete(k);
  return url;
}
