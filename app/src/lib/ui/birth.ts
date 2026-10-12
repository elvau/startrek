/* Geburtsdatum in Teilen (Tag, Monat, Jahr) für BirthInput */
export type BirthParts = { d: string; m: string; y: string };

export function birthParts(v?: string | null): BirthParts {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { d: String(+m[3]), m: String(+m[2]), y: m[1] } : { d: "", m: "", y: "" };
}

/** JJJJ-MM-TT oder "" (unvollständig, Jahr außerhalb 1900 bis heute, in der Zukunft); Tag passt sich dem Monat an (31. → 28./29.) */
export function birthValue(p: BirthParts, today = new Date()): string {
  const y = Number(p.y), mo = Number(p.m), d = Number(p.d);
  if (!/^\d{4}$/.test(p.y) || !mo || !d || y < 1900) return "";
  const day = Math.min(d, new Date(y, mo, 0).getDate());
  const iso = `${p.y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return iso > now ? "" : iso;
}
