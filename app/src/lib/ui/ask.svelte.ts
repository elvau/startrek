/*
 * Rückfragen in der App statt confirm/prompt/alert des Browsers (#665): gleicher Stil wie die übrigen Dialoge, am Handy
 * große Knöpfe. ask() fragt Ja/Nein (Hauptaktion standardmäßig rot, weil die meisten Rückfragen etwas löschen),
 * askText() fragt einen Text ab, tell() zeigt nur einen Hinweis. Angezeigt von AskDialog.svelte.
 */
export interface AskOpts { title?: string; ok?: string; danger?: boolean }
export const asking = $state({
  open: false, text: "", title: "", ok: "", danger: true, input: null as string | null, info: false,
  done: null as ((v: boolean | string | null) => void) | null
});

function open(text: string, o: AskOpts & { input?: string | null; info?: boolean }): Promise<boolean | string | null> {
  // eine Rückfrage zur Zeit: eine offene wird als „Abbrechen“ beendet
  asking.done?.(asking.input != null ? null : false);
  return new Promise(res => Object.assign(asking, { open: true, text, title: o.title || "", ok: o.ok || "", danger: o.danger ?? !o.info, input: o.input ?? null, info: !!o.info, done: res }));
}
export const ask = (text: string, o: AskOpts = {}) => open(text, o) as Promise<boolean>;
export const askText = (text: string, value = "", o: AskOpts = {}) => open(text, { danger: false, ...o, input: value }) as Promise<string | null>;
export const tell = (text: string, o: AskOpts = {}) => open(text, { ...o, info: true }).then(() => undefined);

/** Antwort setzen und schließen (aus dem Dialog) */
export function answer(v: boolean | string | null) {
  const d = asking.done;
  Object.assign(asking, { open: false, done: null });
  d?.(v);
}
