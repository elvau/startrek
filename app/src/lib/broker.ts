/* Hinweis beim Wechsel zum Anbieter (broker.svelte.ts): Name des Anbieters */

/** Name des Anbieters für den Hinweis: angegeben, sonst die Adresse ohne „www.“ (Weiterleitungen über tp.media: ohne Namen) */
export function providerName(href: string, name?: string): string {
  if (name) return name;
  try { const h = new URL(href).hostname.replace(/^www\./, ""); return /(^|\.)tp\.media$/.test(h) ? "" : h; } catch { return ""; }
}
