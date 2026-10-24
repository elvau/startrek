/*
 * Reiseidee öffnen (#402): aus der Beispielrechnung einer Inhaltsseite (seo/pages.ts) Posten für die neue Reise.
 * Je Zeile ein Posten mit Richtwert pro Person (Mitte der Spanne), damit Summe und Aufteilung gleich stimmen;
 * echte Preise sucht man danach im Posten (Flug, Unterkunft …) und ersetzt den Richtwert.
 */
import { t } from "./i18n/index.svelte";
import { hhKey, isActive, uid, type Item, type Traveler } from "./model";
import type { Page } from "./seo/pages";

export const mid = (from: number, to: number) => Math.round((from + to) / 2);

/** Kennung der Auto-Anreise aus der Reiseidee: ein eigener Auto-Posten (Unterwegs) ersetzt sie (#552) */
export const IDEA_CAR = "idea:car";

/** Familien der Reise (Name, Personen): Zeilen mit Preis je Auto werden ein Posten je Familie */
export type IdeaFamily = { name: string; ids: string[] };

export function ideaItems(p: Page, stand: string, families: IdeaFamily[] = []): Item[] {
  return p.costs.flatMap((c): Item[] => {
    if (c.car && families.length) {
      const detail = [t("idea.detailCar", { from: c.car.from, to: c.car.to, stand }), c.note].filter(Boolean).join(" · ");
      return families.map(f => ({
        id: uid(), cat: c.cat, name: families.length > 1 ? `${c.label} – ${f.name}` : c.label, status: "idea", hint: IDEA_CAR, participants: [...f.ids],
        options: [{ id: uid(), label: t("idea.option"), estimate: true, detail, price: { mode: "unit", currency: "EUR", unit: mid(c.car!.from, c.car!.to) } }]
      }));
    }
    return [{
      id: uid(), cat: c.cat, name: c.label, status: "idea",
      options: [{
        id: uid(), label: t("idea.option"), estimate: true,
        detail: [t("idea.detail", { from: c.from, to: c.to, stand }), c.note].filter(Boolean).join(" · "),
        price: { mode: "person", currency: "EUR", adult: mid(c.from, c.to) }
      }]
    }];
  });
}

/** Familien der Reisenden (nur Mitfahrende) für Posten je Auto */
export function familiesOf(travelers?: Traveler[]): IdeaFamily[] {
  const by = new Map<string, string[]>();
  for (const x of travelers || []) if (isActive(x)) by.set(hhKey(x), [...(by.get(hhKey(x)) || []), x.id]);
  return [...by].map(([name, ids]) => ({ name, ids }));
}
