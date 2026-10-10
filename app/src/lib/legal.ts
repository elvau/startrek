/* Impressum und Datenschutz: deutsch verbindlich, für alle anderen Sprachen die englische Übersetzung (#167) */
import { i18n } from "./i18n/index.svelte";

export function legalUrl(kind: "imprint" | "privacy", base = (import.meta.env.BASE_URL as string) || "/"): string {
  const de = i18n.lang === "de";
  return base + (kind === "imprint" ? (de ? "impressum.html" : "imprint.html") : de ? "datenschutz.html" : "privacy.html");
}
