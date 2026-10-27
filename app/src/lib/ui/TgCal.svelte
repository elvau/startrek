<script lang="ts">
  /*
   * Termin finden als Monatskalender (#569, Handy): eine Person, oben der Pinsel (kann, vielleicht, kann nicht, leeren),
   * dann Tage antippen oder darüberziehen. Am Handy seitlich ansetzen, senkrecht scrollt die Seite. Punkte je Tag:
   * wie viele andere können. Dieselben Daten wie das Raster (je Tag).
   */
  import { i18n, locale, t } from "../i18n/index.svelte";
  import { dayShort, monthYear } from "../format";
  import { brushed, dayRange, monthWeeks, type Avail } from "../together";

  let { days, off, by, people, writer, editable, apply, hol, fer }: {
    days: string[]; off: (d: string) => boolean; by: Record<string, Record<string, Avail>>; people: { id: string; name: string }[];
    writer: string; editable: boolean; apply: (changes: Record<string, Avail | undefined>) => void;
    hol: (d: string) => string | undefined; fer: (d: string) => boolean;
  } = $props();

  const SIGN: Record<Avail, string> = { yes: "✓", maybe: "~", no: "✕" };
  const inPlan = $derived(new Set(days));
  const skip = (d: string) => !inPlan.has(d) || off(d);
  const months = $derived([...new Set(days.map(d => d.slice(0, 7)))]);
  // Start: Monat des ersten passenden Tages ab heute
  const today = new Date().toISOString().slice(0, 10);
  let ym = $state("");
  $effect(() => {
    if (months.includes(ym)) return;
    ym = (days.find(d => d >= today && !off(d)) || days.find(d => !off(d)) || days[0] || today).slice(0, 7);
  });
  const mi = $derived(months.indexOf(ym));
  const weeks = $derived(ym ? monthWeeks(ym) : []);
  // Wochentage Mo–So in der Sprache der Oberfläche (1.1.2024 war ein Montag)
  const wd = $derived.by(() => {
    void i18n.lang;
    const f = new Intl.DateTimeFormat(locale(), { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i, 12))).replace(/\.$/, ""));
  });

  let brush = $state<Avail | undefined>("yes");
  const BRUSH: [Avail | undefined, string, "tg.yes" | "tg.maybeL" | "tg.no" | "tg.clear"][] = [["yes", "✓", "tg.yes"], ["maybe", "~", "tg.maybeL"], ["no", "✕", "tg.no"], [undefined, "⌫", "tg.clear"]];

  /* Antippen und Ziehen: ein Schritt, gespeichert beim Loslassen */
  let drag = $state<{ start: string; v: Avail | undefined; changes: Record<string, Avail | undefined> } | null>(null);
  const shown = (d: string) => (drag && d in drag.changes ? drag.changes[d] : by[writer]?.[d]);
  function down(e: PointerEvent, d: string) {
    if (!editable || skip(d) || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Starttag schon so markiert: Ziehen nimmt die Markierung weg (wie im Raster)
    const v = brushed(by[writer]?.[d], brush);
    drag = { start: d, v, changes: { [d]: v } };
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-d]");
    const d = el?.dataset.d;
    if (!d) return;
    const g = drag;
    drag = { ...g, changes: Object.fromEntries(dayRange(g.start, d, skip).map(x => [x, g.v])) };
  }
  function up() {
    window.removeEventListener("pointercancel", cancel);
    const g = drag;
    drag = null;
    if (g) apply(g.changes);
  }
  // Seite scrollt (senkrecht gewischt): nichts eintragen
  function cancel() { window.removeEventListener("pointerup", up); drag = null; }
  // Tastatur (Enter, Leertaste): einzelner Tag
  function key(e: MouseEvent, d: string) {
    if (e.detail !== 0 || !editable || skip(d)) return;
    apply({ [d]: brushed(by[writer]?.[d], brush) });
  }
  function others(d: string) {
    let y = 0, m = 0;
    for (const x of people) { if (x.id === writer) continue; const v = by[x.id]?.[d]; if (v === "yes") y++; else if (v === "maybe") m++; }
    return { y, m };
  }
</script>

<div class="tc">
  <div class="tc-brush" role="radiogroup" aria-label={t("tg.brush")}>
    {#each BRUSH as [v, s, k] (k)}
      <button type="button" role="radio" class="tc-b {v || 'clear'}" class:on={brush === v} aria-checked={brush === v} disabled={!editable} onclick={() => (brush = v)}>{s} {t(k)}</button>
    {/each}
  </div>
  <div class="tc-nav">
    <button type="button" class="tc-m" aria-label={t("tg.prevMonth")} disabled={mi <= 0} onclick={() => (ym = months[mi - 1])}>‹</button>
    <b>{ym ? monthYear(`${ym}-15`) : ""}</b>
    <button type="button" class="tc-m" aria-label={t("tg.nextMonth")} disabled={mi < 0 || mi >= months.length - 1} onclick={() => (ym = months[mi + 1])}>›</button>
  </div>
  <div class="tc-wd" aria-hidden="true">{#each wd as w, i (i)}<span class:we={i > 4}>{w}</span>{/each}</div>
  <div class="tc-grid" role="grid" tabindex="-1" aria-label={monthYear(`${ym || today.slice(0, 7)}-15`)} onpointermove={move}>
    {#each weeks as w, i (i)}
      <div class="tc-row" role="row">
        {#each w as d, j (j)}
          {#if !d}<span class="tc-x"></span>
          {:else}
            {@const a = shown(d)}
            {@const h = hol(d)}
            {@const o = others(d)}
            {@const no = skip(d)}
            <button type="button" role="gridcell" data-d={d} class="tc-d {no ? '' : a || ''}" class:off={no} class:we={j > 4} class:hol={!!h} class:fer={!no && fer(d)}
              disabled={no || !editable} title={h || ""}
              aria-label="{dayShort(d)}{h ? ` (${h})` : ''}: {a ? t(`tg.${a === 'maybe' ? 'maybeL' : a}`) : t('tg.unset')}{o.y || o.m ? ` · ${t('tg.blockSum', { y: o.y, m: o.m })}` : ''}"
              onpointerdown={e => down(e, d)} onclick={e => key(e, d)}>
              <span class="n">{Number(d.slice(8))}</span>
              {#if !no}<span class="v">{a ? SIGN[a] : ""}</span>
                {#if o.y + o.m}<span class="dots" aria-hidden="true">{#if o.y + o.m <= 4}{#each Array(o.y) as _, k (k)}<i class="y"></i>{/each}{#each Array(o.m) as _, k (k)}<i class="m"></i>{/each}{:else}{o.y}✓{/if}</span>{/if}
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .tc { display: flex; flex-direction: column; gap: 8px; max-width: 420px; }
  .tc-brush { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .tc-b { all: unset; box-sizing: border-box; min-height: 40px; display: grid; place-items: center; text-align: center; border-radius: 10px; border: 1px solid var(--line); background: var(--paper-2); font-size: 12.5px; font-weight: 600; cursor: pointer; line-height: 1.15; padding: 2px 4px; }
  .tc-b:disabled { opacity: .5; cursor: default; }
  .tc-b:focus-visible, .tc-d:focus-visible, .tc-m:focus-visible { outline: 2px solid var(--a); }
  .tc-b.on { border-width: 2px; }
  .tc-b.yes.on, .tc-d.yes { background: color-mix(in srgb, var(--good) 22%, var(--paper)); color: var(--good); border-color: var(--good); }
  .tc-b.maybe.on, .tc-d.maybe { background: color-mix(in srgb, var(--warn) 18%, var(--paper)); color: var(--warn); border-color: var(--warn); }
  .tc-b.no.on, .tc-d.no { background: color-mix(in srgb, #C4452E 16%, var(--paper)); color: #C4452E; border-color: #C4452E; }
  .tc-b.clear.on { background: var(--paper); border-color: var(--ink-3); }
  .tc-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .tc-m { all: unset; box-sizing: border-box; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--line); font-size: 20px; cursor: pointer; }
  .tc-m:disabled { opacity: .35; cursor: default; }
  :global([dir="rtl"]) .tc-m { transform: scaleX(-1); }
  .tc-wd, .tc-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .tc-wd span { text-align: center; font-size: 11px; color: var(--ink-3); }
  .tc-wd span.we { color: var(--ink); font-weight: 700; }
  .tc-grid { display: grid; gap: 4px; touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .tc-d { all: unset; box-sizing: border-box; position: relative; height: 48px; border-radius: 8px; border: 1px solid var(--line); background: var(--paper-2); display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 3px; cursor: pointer; overflow: hidden; }
  .tc-d.we:not(.yes):not(.maybe):not(.no) { background: color-mix(in srgb, var(--ink) 8%, var(--paper-2)); }
  .tc-d .n { font-size: 11px; line-height: 1; color: var(--ink-3); }
  .tc-d.we .n { color: var(--ink); font-weight: 700; }
  .tc-d.hol .n { color: var(--warn); font-weight: 800; }
  .tc-d .v { font-size: 15px; font-weight: 700; line-height: 1.3; min-height: 19px; }
  .tc-d.fer::after { content: ""; position: absolute; inset-inline: 4px; bottom: 2px; height: 3px; border-radius: 2px; background: #5A7FB8; }
  .tc-d.off { cursor: default; background: transparent; border-style: dashed; opacity: .45; }
  .tc-d.off .n { font-weight: 400; color: var(--ink-3); }
  .dots { display: flex; gap: 2px; font-size: 9.5px; line-height: 1; color: var(--good); font-weight: 700; }
  .dots i { width: 5px; height: 5px; border-radius: 50%; }
  .dots i.y { background: var(--good); }
  .dots i.m { background: var(--warn); }
  .tc-x { height: 48px; }
</style>
