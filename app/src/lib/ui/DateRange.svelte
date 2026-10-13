<script lang="ts">
  /*
   * Zeitraum in einem Kalender (wie bei Airbnb): ein Feld, ein Tipp öffnet den Kalender, erster Tag = von, zweiter = bis.
   * Auf dem Handy als Blatt von unten mit Monaten zum Durchscrollen, sonst als Fenster mit zwei Monaten nebeneinander.
   * openEnd: „bis“ darf leer bleiben (z. B. nur Hinflug).
   */
  import { locale, t, tn } from "../i18n/index.svelte";
  import { dayShort } from "../format";
  import { addMonth, daysBetween, monthGrid, pickDay } from "../daterange";
  import { portal } from "./portal";
  import { tick } from "svelte";

  let { from = $bindable(""), to = $bindable(""), label, fromLabel, toLabel, openEnd = false, openEndLabel = "", unit = "nights", min, cls = "", onchange }: {
    from?: string; to?: string; label: string; fromLabel: string; toLabel: string;
    openEnd?: boolean; openEndLabel?: string; unit?: "nights" | "days"; min?: string; cls?: string;
    onchange?: (from: string, to: string) => void;
  } = $props();

  const today = new Date().toISOString().slice(0, 10);
  const lo = $derived(min ?? today);
  let open = $state(false);
  let draft = $state({ from: "", to: "" });
  let picking = $state<"from" | "to">("from");
  let sheet = $state<HTMLElement>();
  let btn = $state<HTMLButtonElement>();

  // 13 Monate ab dem frühesten (oder dem gewählten, falls früher) zum Durchscrollen
  const months = $derived.by(() => {
    const first = (from && from < lo ? from : lo).slice(0, 7);
    return Array.from({ length: 13 }, (_, i) => addMonth(first, i));
  });
  const mf = $derived(new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }));
  const wd = $derived(Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(), { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + i)))));
  const count = (a: string, b: string) => { const n = daysBetween(a, b); return unit === "days" ? tn("n.days", n + 1) : tn("n.nights", n); };

  async function show() {
    draft = { from, to }; picking = "from"; open = true;
    await tick();
    // zum gewählten Monat scrollen
    sheet?.querySelector(`[data-m="${(from || lo).slice(0, 7)}"]`)?.scrollIntoView({ block: "start" });
    sheet?.querySelector<HTMLElement>(".dr-d.on, .dr-d:not(:disabled)")?.focus({ preventScroll: true });
  }
  function commit(f: string, x: string) {
    const changed = f !== from || x !== to;
    from = f; to = x; open = false;
    if (changed) onchange?.(f, x);
    btn?.focus();
  }
  // schließen ohne „bis“: nur übernehmen, wenn „bis“ leer bleiben darf; sonst bleibt der alte Zeitraum
  function close() {
    if (draft.from && (draft.to || openEnd)) commit(draft.from, draft.to);
    else { open = false; btn?.focus(); }
  }
  function tap(d: string) {
    const r = pickDay(draft, d, picking, unit === "days");
    draft = { from: r.from, to: r.to }; picking = r.picking;
    // kurz stehen lassen, damit man den Zeitraum sieht
    if (r.done) setTimeout(() => commit(r.from, r.to), 220);
  }
  function keys(e: KeyboardEvent) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
  const inSpan = (d: string) => !!draft.from && !!draft.to && d > draft.from && d < draft.to;
</script>

<div class="f dr {cls}">
  <span>{label}</span>
  <button type="button" class="dr-btn" bind:this={btn} onclick={show} aria-haspopup="dialog" data-from={from} data-to={to}>
    <span class="dr-ic" aria-hidden="true">📅</span>
    {#if from}
      <span class="dr-v"><b>{dayShort(from)}</b> → {#if to}<b>{dayShort(to)}</b>{:else}<span class="muted">{openEnd ? openEndLabel || "–" : toLabel}</span>{/if}</span>
      {#if to}<small class="dr-n">{count(from, to)}</small>{/if}
    {:else}
      <span class="muted">{t("dr.pick")}</span>
    {/if}
  </button>
</div>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dr-bg" use:portal onclick={e => { if (e.target === e.currentTarget) close(); }} onkeydown={keys}>
    <div class="dr-sheet" role="dialog" aria-modal="true" aria-label={label} bind:this={sheet}>
      <div class="dr-head">
        <div class="dr-ends">
          <span class:act={picking === "from"}><small>{fromLabel}</small><b>{draft.from ? dayShort(draft.from) : "–"}</b></span>
          <span aria-hidden="true">→</span>
          <span class:act={picking === "to"}><small>{toLabel}</small><b>{draft.to ? dayShort(draft.to) : "–"}</b></span>
          {#if draft.from && draft.to}<small class="dr-n">{count(draft.from, draft.to)}</small>{/if}
        </div>
        <button type="button" class="x" onclick={close} aria-label={t("close")}>×</button>
      </div>
      <div class="dr-wd" aria-hidden="true">{#each wd as w, i (i)}<span>{w}</span>{/each}</div>
      <div class="dr-months">
        {#each months as m (m)}
          <section class="dr-m" data-m={m}>
            <b class="dr-title">{mf.format(new Date(m + "-01T00:00:00Z"))}</b>
            <div class="dr-wd dr-wd-m" aria-hidden="true">{#each wd as w, i (i)}<span>{w}</span>{/each}</div>
            <div class="dr-grid">
              {#each monthGrid(m) as d, i (d ?? "x" + i)}
                {#if !d}<span></span>
                {:else}
                  {@const isEnd = d === draft.from || d === draft.to}
                  <button type="button" class="dr-d" class:on={isEnd} class:mid={inSpan(d)} class:a={d === draft.from && !!draft.to} class:b={d === draft.to}
                    class:today={d === today} disabled={d < lo}
                    aria-pressed={isEnd} aria-label={dayShort(d)} onclick={() => tap(d)}>{+d.slice(8, 10)}</button>
                {/if}
              {/each}
            </div>
          </section>
        {/each}
      </div>
      <div class="dr-foot">
        <button type="button" class="linkbtn" disabled={!draft.from} onclick={() => { draft = { from: "", to: "" }; picking = "from"; }}>{t("dr.clear")}</button>
        <span class="muted small">{picking === "to" ? t("dr.hintTo") : t("dr.hintFrom")}</span>
        {#if openEnd && draft.from && !draft.to}
          <button type="button" class="btn sm primary" onclick={() => commit(draft.from, "")}>{openEndLabel || t("dr.done")}</button>
        {:else}
          <button type="button" class="btn sm primary" disabled={!draft.from || (!draft.to && !openEnd)} onclick={close}>{t("dr.done")}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
