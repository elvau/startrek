/** Eingetippte Anzahl auf ganze Zahl zwischen min und max bringen; ungültig (leer, Text) behält den alten Wert */
export function clampCount(raw: unknown, min: number, max: number, old: number): number {
  const s = typeof raw === "string" ? raw.trim() : raw;
  if (s === "" || s == null) return old;
  const n = Math.round(Number(s));
  if (!Number.isFinite(n)) return old;
  return Math.max(min, Math.min(max, n));
}
