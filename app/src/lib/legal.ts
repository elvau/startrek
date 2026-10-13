/* Impressum, Datenschutz und AGB: deutsch verbindlich, für alle anderen Sprachen die englische Übersetzung (#167) */
import { i18n } from "./i18n/index.svelte";

const PAGES = { imprint: ["impressum.html", "imprint.html"], privacy: ["datenschutz.html", "privacy.html"], terms: ["agb.html", "terms.html"] } as const;

export function legalUrl(kind: keyof typeof PAGES, base = (import.meta.env.BASE_URL as string) || "/"): string {
  return base + PAGES[kind][i18n.lang === "de" ? 0 : 1];
}
