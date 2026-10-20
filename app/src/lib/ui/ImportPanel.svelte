<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Reise per KI importieren (#457): Dateien (auch per Ziehen, Einfügen oder Teilen-Menü), Text oder Link einwerfen,
   * auslesen lassen, daraus eine Reise anlegen. Über „Neue Reise“ entsteht immer eine Reise. Nur mit Anmeldung.
   */
  import { app, startTrip } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { IMPORT_FILES_MAX } from "../import/ai";
  import { ACCEPT, prepare, type Prepared } from "../import/files";
  import { askImport, ImportError } from "../import/app";
  import { importToTrip } from "../import/apply";
  import { reviewOf } from "../import/review";
  import type { ImportedOffer } from "../import/ai";
  import ImportReview from "./ImportReview.svelte";
  import ImportParts from "./ImportParts.svelte";
  import { applyParts, defaultChoices, hasMissing, type Choice, type PartId } from "../import/parts";
  import { openFlightSearch } from "../flights/open.svelte";
  import { openStaySearch } from "../stays/open.svelte";
  import { openExplore } from "../activities/open.svelte";
  import type { Traveler } from "../model";

  let { onclose, travelers, peopleKnown = false, shared = [], sharedText = "", sharedUrl = "" }: { onclose: () => void; travelers?: () => Traveler[] | undefined; peopleKnown?: boolean; shared?: File[]; sharedText?: string; sharedUrl?: string } = $props();
  // ausgelesen, noch nicht angelegt: Übersicht mit Sicherheit und Rückfragen (#458)
  let found = $state<ImportedOffer | null>(null);
  // danach (#459): was fehlt noch? Auswahl je fehlendem Baustein
  let stage = $state<"review" | "parts">("review");
  let choices = $state<Partial<Record<PartId, Choice>>>({});
  type Src = "file" | "text" | "link" | "paste";
  const SRCS: Src[] = ["file", "text", "link", "paste"];
  let src = $state<Src>("file");
  let prepared = $state<Prepared[]>([]);
  let text = $state(""), url = $state("");
  let notes = $state<string[]>([]);
  let busy = $state(false), err = $state(""), over = $state(false);
  let ctrl: AbortController | undefined;
  const ready = $derived(prepared.length > 0 || text.trim().length >= 3 || /^https?:\/\/\S+\.\S+/i.test(url.trim()));

  async function add(files: Iterable<File>) {
    const list = [...files];
    const msgs: string[] = [];
    for (const f of list) {
      if (prepared.length >= IMPORT_FILES_MAX) { msgs.push(t("imp.tooMany", { n: IMPORT_FILES_MAX })); break; }
      const p = await prepare(f);
      if ("error" in p) msgs.push(t(`imp.${p.error}` as Key, { name: p.name }));
      else prepared = [...prepared, p];
    }
    notes = msgs;
    if (prepared.length) src = "file";
  }
  // Dateien aus dem Teilen-Menü (Handy) gleich übernehmen
  let took = false;
  $effect(() => {
    if (took || !(shared.length || sharedText || sharedUrl)) return;
    took = true;
    text = sharedText; url = sharedUrl;
    if (!shared.length) src = sharedUrl && !sharedText ? "link" : "text";
    void add(shared).then(() => (notes = [t("imp.shared"), ...notes]));
  });

  async function paste() {
    notes = [];
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const it of items) {
        const type = it.types.find(x => x.startsWith("image/"));
        if (type) files.push(new File([await it.getType(type)], `clipboard.${type.split("/")[1]}`, { type }));
      }
      if (files.length) { await add(files); return; }
    } catch { /* ohne Berechtigung oder ohne Bild: Text versuchen */ }
    try {
      const s = (await navigator.clipboard.readText()).trim();
      if (/^https?:\/\/\S+$/i.test(s)) { url = s; src = "link"; return; }
      if (s) { text = s; src = "text"; return; }
    } catch { /* keine Berechtigung */ }
    notes = [t("imp.pasteNone")];
  }
  // Strg+V im Dialog: Bilder als Datei, sonst landet der Text im Textfeld (dort normal einfügen)
  function onpaste(e: ClipboardEvent) {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); void add(files); }
  }

  async function go() {
    if (!ready || busy) return;
    busy = true; err = "";
    ctrl = new AbortController();
    try {
      const offer = await askImport({ prepared, text, url }, ctrl.signal);
      // alles sicher erkannt: gleich anlegen, sonst erst die Übersicht
      found = offer;
      choices = defaultChoices(offer);
      // alles sicher erkannt: Übersicht überspringen
      if (reviewOf(offer, new Set(), peopleKnown).direct) next();
      else stage = "review";
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      err = (e as Error).message;
      if (e instanceof ImportError && e.needScreenshot) src = "file";
    } finally { busy = false; }
  }
  /** nach der Übersicht: fehlt etwas, erst „Was fehlt noch?“, sonst anlegen */
  function next() { if (found && hasMissing(found)) stage = "parts"; else create(); }
  function create() {
    if (!found) return;
    startTrip(travelers?.());
    importToTrip(app.trip, found);
    const open = applyParts(app.trip, choices);
    onclose();
    // erste gewählte Suche öffnen, vorbelegt aus der Reise (Ziel, Daten, Personen); erst nach dem Wechsel der Reise,
    // der offene Suchen zuklappt
    setTimeout(() => {
      if (open[0] === "flight") openFlightSearch();
      else if (open[0] === "stay") openStaySearch();
      else if (open[0] === "fun") openExplore("tours");
    });
  }
  $effect(() => () => ctrl?.abort());
</script>

<div class="imp" role="group" aria-label={t("newtrip.mode.import")} {onpaste}>
  {#if !cloud.user}
    <p class="muted">{t("imp.login")}</p>
    <div class="ed-foot"><span></span><button type="button" class="btn primary" onclick={() => (cloud.showLogin = true)}>{t("acct.login")}</button></div>
  {:else if found && stage === "parts"}
    <ImportParts offer={found} bind:choices oncreate={create} onback={() => (stage = "review")} />
  {:else if found}
    <ImportReview bind:offer={found} {peopleKnown} oncreate={next} onback={() => (found = null)} />
  {:else}
    <p class="imp-lead">{t("imp.lead")}</p>
    <div class="chips imp-src">
      {#each SRCS as s (s)}<button type="button" class="chip" class:on={src === s} aria-pressed={src === s} onclick={() => (s === "paste" ? void paste() : (src = s))}>{t(`imp.src.${s}` as Key)}</button>{/each}
    </div>
    {#if src === "file" || src === "paste"}
      <label class="imp-drop" class:over ondragover={e => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)} ondrop={e => { e.preventDefault(); over = false; if (e.dataTransfer?.files.length) void add(e.dataTransfer.files); }}>
        <b>{t("imp.pick")}</b>
        <span class="muted small">{t("imp.pickHint")}</span>
        <input type="file" multiple accept={ACCEPT} onchange={e => { const f = e.currentTarget.files; if (f) void add(f); e.currentTarget.value = ""; }} />
      </label>
    {:else if src === "text"}
      <label class="f">{t("imp.textLabel")}<textarea rows="7" bind:value={text} placeholder={t("imp.textPh")}></textarea></label>
    {:else}
      <label class="f">{t("imp.linkLabel")}<input type="url" inputmode="url" bind:value={url} placeholder="https://…" /></label>
      <span class="muted small">{t("imp.linkHint")}</span>
    {/if}
    {#if prepared.length}
      <ul class="imp-files">
        {#each prepared as p, i (p.name + i)}<li><span>{p.name}</span><button type="button" class="x" aria-label={t("imp.remove", { name: p.name })} onclick={() => (prepared = prepared.filter((_, k) => k !== i))}>×</button></li>{/each}
      </ul>
    {/if}
    {#each notes as n (n)}<p class="small imp-note" role="status">{n}</p>{/each}
    <p class="small imp-priv">🔒 {t("imp.privacy")}</p>
    {#if err}<p class="err small" role="alert">{err}</p>{/if}
    <div class="ed-foot"><span class="muted small" aria-live="polite">{busy ? t("imp.busy") : ""}</span><button type="button" class="btn primary imp-go" disabled={!ready || busy} onclick={go}>{busy ? t("imp.busy") : t("imp.go")}</button></div>
  {/if}
</div>

<style>
  .imp { display: flex; flex-direction: column; gap: 12px; }
  .imp-lead { margin: 0; color: var(--ink-2); }
  .imp-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 150px; padding: 18px; text-align: center; border: 2px dashed color-mix(in srgb, var(--a) 40%, var(--line)); border-radius: 16px; background: var(--paper); cursor: pointer; }
  .imp-drop.over, .imp-drop:focus-within { border-color: var(--a); background: var(--a-soft); }
  .imp-drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .imp textarea { width: 100%; resize: vertical; }
  .imp-files { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .imp-files li { display: flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border: 1px solid var(--line); border-radius: 99px; background: var(--paper-2); font-size: 13px; max-width: 100%; }
  .imp-files span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .imp-files .x { width: 32px; height: 32px; border: 0; background: transparent; font-size: 18px; color: var(--ink-2); }
  .imp-note { margin: 0; color: var(--warn); }
  .imp-priv { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--paper-2); color: var(--ink-2); }
</style>
