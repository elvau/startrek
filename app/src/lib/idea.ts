/*
 * Reiseidee öffnen (#402): aus der Beispielrechnung einer Inhaltsseite (seo/pages.ts) Posten für die neue Reise.
 * Je Zeile ein Posten mit Richtwert pro Person (Mitte der Spanne), damit Summe und Aufteilung gleich stimmen;
 * echte Preise sucht man danach im Posten (Flug, Unterkunft …) und ersetzt den Richtwert.
 */
import { t } from "./i18n/index.svelte";
import { uid, type Item } from "./model";
import type { Page } from "./seo/pages";

export const mid = (from: number, to: number) => Math.round((from + to) / 2);

export function ideaItems(p: Page, stand: string): Item[] {
  return p.costs.map(c => ({
    id: uid(), cat: c.cat, name: c.label, status: "idea",
    options: [{
      id: uid(), label: t("idea.option"), estimate: true,
      detail: [t("idea.detail", { from: c.from, to: c.to, stand }), c.note].filter(Boolean).join(" · "),
      price: { mode: "person", currency: "EUR", adult: mid(c.from, c.to) }
    }]
  }));
}
