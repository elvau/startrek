/* Anonyme Platzhalter-Familien („Familie Reh“) für schnelles Planen; nur in der Reise, nicht in Gruppen gespeichert */
import { uid, type Traveler } from "./model";

export const ANIMALS: [name: string, emoji: string][] = [
  ["Reh", "🦌"], ["Bär", "🐻"], ["Fuchs", "🦊"], ["Igel", "🦔"], ["Eule", "🦉"], ["Hase", "🐰"],
  ["Wolf", "🐺"], ["Biber", "🦫"], ["Dachs", "🦡"], ["Luchs", "🐈"], ["Otter", "🦦"], ["Pinguin", "🐧"]
];
const COLORS = ["#D2693C", "#2F6FDB", "#C0487A", "#1F8A70", "#D08A12", "#7A5AC8"];

export const animalEmoji = (household: string) => ANIMALS.find(([n]) => n === household)?.[1] ?? null;

/** erstes Tier, das in der Reise noch nicht als Familie vorkommt */
export function nextAnimal(used: string[]): string {
  return (ANIMALS.find(([n]) => !used.includes(n)) ?? ANIMALS[used.length % ANIMALS.length])[0];
}

export interface FamilyRow { animal: string; adults: number; kids: number; infants?: number }

/** Reisende für die Familien: „Reh Erw. 1“, „Reh Kind 1“, „Reh Kleinkind 1“ … ohne Alter, aber in ihrer Altersklasse gerechnet */
export function placeholderTravelers(rows: FamilyRow[], start = 0): Traveler[] {
  const out: Traveler[] = [];
  rows.forEach((r, i) => {
    const color = COLORS[(start + i) % COLORS.length];
    const mk = (name: string, kind: Traveler["kind"]): Traveler => ({ id: uid(), name, household: r.animal, kind, color, placeholder: true });
    for (let k = 1; k <= r.adults; k++) out.push(mk(`${r.animal} Erw. ${k}`, "adult"));
    for (let k = 1; k <= r.kids; k++) out.push(mk(`${r.animal} Kind ${k}`, "child"));
    for (let k = 1; k <= (r.infants || 0); k++) out.push(mk(`${r.animal} Kleinkind ${k}`, "infant"));
  });
  return out;
}

/** Eine Person, anonym: „Reh“ (Standard für eine neue Reise) */
export function soloTraveler(animal = "Reh"): Traveler {
  return { id: uid(), name: animal, household: animal, kind: "adult", color: COLORS[0], placeholder: true };
}
