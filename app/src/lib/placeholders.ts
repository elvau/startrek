/* Platzhalter mit Tiernamen („Familie Fuchs“) für schnelles Planen; nur in der Reise, nicht in Gruppen gespeichert */
import { t, type Key } from "./i18n/index.svelte";
import { uid, type Traveler } from "./model";

export const ANIMALS: [name: string, emoji: string][] = [
  ["Reh", "🦌"], ["Bär", "🐻"], ["Fuchs", "🦊"], ["Igel", "🦔"], ["Eule", "🦉"], ["Hase", "🐰"],
  ["Wolf", "🐺"], ["Biber", "🦫"], ["Dachs", "🦡"], ["Luchs", "🐈"], ["Otter", "🦦"], ["Pinguin", "🐧"],
  ["Koala", "🐨"], ["Panda", "🐼"], ["Frosch", "🐸"], ["Löwe", "🦁"], ["Tiger", "🐯"], ["Affe", "🐵"],
  ["Maus", "🐭"], ["Pferd", "🐴"], ["Hamster", "🐹"], ["Küken", "🐥"]
];
const COLORS = ["#D2693C", "#2F6FDB", "#C0487A", "#1F8A70", "#D08A12", "#7A5AC8"];

/** Tiername in der gewählten Sprache (gespeichert wird der Name, wie er beim Anlegen angezeigt wurde) */
export const animalName = (id: string) => t(`animal.${id}` as Key);

/** Emoji zur Tierfamilie, auch für „Fuchs 2“ (deutscher oder übersetzter Name) */
export const animalEmoji = (household: string) => { const w = household.split(" ")[0]; return ANIMALS.find(([n]) => n === w || animalName(n) === w)?.[1] ?? null; };

/** zufälliges Tier, das noch nicht vergeben ist (sonst irgendeins) */
export function nextAnimal(used: string[] = [], rnd = Math.random): string {
  const free = ANIMALS.filter(([n]) => !used.includes(n));
  const pool = free.length ? free : ANIMALS;
  return pool[Math.floor(rnd() * pool.length)][0];
}

export interface FamilyRow { animal: string; adults: number; kids: number; infants?: number }

/** Reisende für Familien: „Fuchs Erw. 1“, „Fuchs Kind 1“, „Fuchs Kleinkind 1“ … ohne Alter, aber in ihrer Altersklasse gerechnet */
export function placeholderTravelers(rows: FamilyRow[], start = 0): Traveler[] {
  const out: Traveler[] = [];
  rows.forEach((r, i) => {
    const color = COLORS[(start + i) % COLORS.length];
    const a = animalName(r.animal);
    const mk = (name: string, kind: Traveler["kind"]): Traveler => ({ id: uid(), name, household: a, kind, color, placeholder: true });
    for (let k = 1; k <= r.adults; k++) out.push(mk(t("ph.adult", { a, k }), "adult"));
    for (let k = 1; k <= r.kids; k++) out.push(mk(t("ph.child", { a, k }), "child"));
    for (let k = 1; k <= (r.infants || 0); k++) out.push(mk(t("ph.infant", { a, k }), "infant"));
  });
  return out;
}

/** Eine Person als Tier, z. B. „Fuchs“ (Standard für eine neue Reise) */
export function soloTraveler(animal = nextAnimal()): Traveler {
  const a = animalName(animal);
  return { id: uid(), name: a, household: a, kind: "adult", color: COLORS[0], placeholder: true };
}

/** Gruppe (Mannschaft, Verein): jede Person rechnet für sich, jede als eigenes Tier */
export function groupTravelers(adults: number, kids = 0, rnd = Math.random): Traveler[] {
  const out: Traveler[] = [];
  const used: string[] = [];
  const count: Record<string, number> = {};
  for (let i = 0; i < adults + kids; i++) {
    const id = nextAnimal(used, rnd), a = animalName(id);
    used.push(id);
    count[a] = (count[a] || 0) + 1;
    const name = count[a] > 1 ? `${a} ${count[a]}` : a;
    out.push({ id: uid(), name, household: name, kind: i < adults ? "adult" : "child", color: COLORS[i % COLORS.length], placeholder: true });
  }
  return out;
}
