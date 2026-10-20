<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Realitätscheck (#461): beworbener Preis, „Angebot realistisch“ als Spanne pro Kopf, ggf. „Ganze Reise“, Verpflegung
   * (nur Stufen laut Angebot) und „Essen einrechnen“, Aufschlüsselung mit Annahmen zum Antippen. Keine Wertungen.
   * Kompakt (#469): Erklärungen hinter „?“ bzw. aufklappbar, Emoji je Zeile, Zuordnung und Annahme als Chips.
   */
  import Help from "./Help.svelte";
  import { BOARD_ICON } from "../import/icons";
  import { eur } from "../calc";
  import { dateDE } from "../format";
  import type { Board, Trip } from "../model";
  import { reality, round10, type Assumption, type Pin, type RealRow } from "../import/reality";
  import { autoReady, loadAutoData, syncAuto } from "../import/auto.svelte";
  import ExtLink from "./ExtLink.svelte";

  let { trip, preview = false, ontake }: { trip: Trip; preview?: boolean; ontake?: () => void } = $props();
  let food = $state(true);
  let board = $state<Board | undefined>(undefined);
  let pin = $state<Pin>({});
  loadAutoData();
  const r = $derived.by(() => { void autoReady(); return reality(trip, { food, board, pin }, syncAuto); });
  const real = $derived(round10(r.real));
  const whole = $derived(r.whole ? round10(r.whole) : null);
  const span = (x: { lo: number; hi: number }) => (Math.round(x.lo) === Math.round(x.hi) ? eur(x.lo) : `${eur(x.lo)} – ${eur(x.hi)}`);
  // Balken: Angebot, sicher dazu, je nach Annahme (Anteile an der Obergrenze)
  const bar = $derived.by(() => {
    const hi = Math.max(1, r.real.hi);
    const sure = r.rows.filter(x => x.part === "real").reduce((a, x) => a + x.lo, 0);
    return { offer: (r.offer.lo / hi) * 100, sure: (sure / hi) * 100 };
  });
  const cycle = (a: Assumption) => { const c = pin[a]; pin = { ...pin, [a]: c === undefined ? "lo" : c === "lo" ? "hi" : undefined }; };
  const PIN_ICON = { range: "↔", lo: "⬇", hi: "⬆" } as const;
  const pinOf = (a: Assumption) => pin[a] ?? "range";
  const howOf = (x: RealRow) => (x.assumption ? t(`real.ass.${x.assumption}` as Key) : x.how);
  const url = $derived(trip.offer?.url);
</script>

<div class="real">
  {#if preview}<p class="real-prev" role="status">👁 {t("real.preview")}</p>{/if}
  {#if !trip.offer}<p class="muted small">{t("real.noOffer")}</p>{/if}
  <div class="real-top">
    {#if r.advertised}<div><small>{t("real.advertised")}</small><s class="real-adv">{eur(r.advertised)}</s></div>{/if}
    <div class="real-main"><small>{t("real.realistic")} <Help k="realOnly" /></small><b>{span(real)}</b></div>
  </div>
  <div class="real-bar" aria-hidden="true"><i class="o" style="width:{bar.offer}%"></i><i class="s" style="width:{bar.sure}%"></i><i class="v"></i></div>
  <div class="real-legend muted small" aria-hidden="true"><span>{t("real.bar.offer")}</span><span>{t("real.bar.sure")}</span><span>{t("real.bar.vary")}</span></div>
  {#if whole}<div class="real-whole"><small>{t("real.whole")}</small><b>{span(whole)}</b></div>
  {:else if !r.has.stay || !r.has.flight}<p class="real-hint small">{t("real.wholeHint")}</p>{/if}

  {#if r.has.stay}
    <div class="real-board">
      <div class="real-board-h"><b>{t("real.board")}</b>
        <label class="real-food">{t("real.food")} <input type="checkbox" class="sw" role="switch" bind:checked={food} /></label></div>
      {#if r.boards.length > 1}
        <div class="chips" role="group" aria-label={t("real.board")}>
          {#each r.boards as b (b.board)}<button type="button" class="chip" class:on={r.board === b.board} aria-pressed={r.board === b.board} onclick={() => (board = b.board)}><span aria-hidden="true">{BOARD_ICON[b.board]}</span> {t(`board.${b.board}` as Key)}{#if b.included} · {t("real.inOffer")}{:else if b.extra} · +{eur(b.extra)}{/if}</button>{/each}
        </div>
      {:else}
        <p class="muted small">{r.board ? `${BOARD_ICON[r.board]} ${t("real.boardIn", { b: t(`board.${r.board}` as Key) })}` : ""} {t("real.boardFixed")}</p>
      {/if}
    </div>
  {/if}

  <details class="real-note small"><summary><span aria-hidden="true">ⓘ</span> {t("real.noteShort")}</summary><p>{t("real.note")}</p></details>
  <div class="real-rows-h"><b>{t("real.rows")}</b><span class="muted small">{t("real.rowsSub")}</span></div>
  <ul class="real-rows">
    {#each r.rows as x (x.key)}
      <li class="p-{x.part}">
        <span class="real-ic" aria-hidden="true">{x.icon}</span>
        <span class="real-l"><span>{x.name} <span class="real-part {x.part}">{t(`real.part.${x.part}` as Key)}</span></span>{#if howOf(x)}<small>{howOf(x)}</small>{/if}</span>
        {#if x.assumption}<button type="button" class="chip sm real-pin" onclick={() => cycle(x.assumption!)} title={howOf(x)}
          aria-label={t("real.pinAria", { v: t(`real.pin.${pinOf(x.assumption)}` as Key), x: howOf(x) || "" })}><span aria-hidden="true">{PIN_ICON[pinOf(x.assumption)]}</span></button>{/if}
        <b>{span(x)}</b>
      </li>
    {/each}
  </ul>
  {#if trip.offer?.validUntil}<p class="muted small">{t("real.valid", { d: dateDE(trip.offer.validUntil) })}</p>{/if}
  {#if preview || url}
    <div class="ed-foot">
      {#if url}<ExtLink href={url}>{t("real.toOffer")} ↗</ExtLink>{:else}<span></span>{/if}
      {#if preview && ontake}<button type="button" class="btn primary real-take" onclick={ontake}>{t("real.take")}</button>{/if}
    </div>
  {/if}
</div>

<style>
  .real { display: flex; flex-direction: column; gap: 10px; }
  .real p { margin: 0; }
  .real-prev { padding: 10px 12px; border-radius: 12px; background: var(--idea-soft); color: var(--idea); font-weight: 600; }
  .real-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); }
  .real-top small, .real-whole small { display: block; color: var(--ink-2); font-size: 12.5px; }
  .real-adv { font-size: 18px; color: var(--ink-2); }
  .real-main { text-align: end; }
  .real-main b { font-size: 28px; line-height: 1.1; font-family: "Bricolage Grotesque Variable", sans-serif; }
  .real-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; border: 1px solid var(--line); background: repeating-linear-gradient(45deg, var(--warn-soft) 0 6px, color-mix(in srgb, var(--warn) 25%, var(--warn-soft)) 6px 12px); }
  .real-bar .o { background: var(--a); }
  .real-bar .s { background: color-mix(in srgb, var(--a) 40%, var(--paper)); }
  .real-legend { display: flex; justify-content: space-between; }
  .real-whole { padding: 10px 14px; border: 1px dashed var(--line); border-radius: 14px; }
  .real-whole b { font-size: 18px; }
  .real-hint { padding: 10px 12px; border: 1px dashed var(--line); border-radius: 12px; color: var(--ink-2); }
  .real-board { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); }
  .real-board-h { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .real-food { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 14px; cursor: pointer; }
  .sw { appearance: none; -webkit-appearance: none; width: 42px; height: 24px; border-radius: 99px; background: var(--line); position: relative; flex-shrink: 0; margin: 0; cursor: pointer; transition: background .2s; }
  .sw::after { content: ""; position: absolute; top: 3px; inset-inline-start: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .2); transition: inset-inline-start .2s; }
  .sw:checked { background: var(--a); }
  .sw:checked::after { inset-inline-start: 21px; }
  .sw:focus-visible { outline: 2px solid var(--a); outline-offset: 2px; }
  .real-note { padding: 8px 12px; border-radius: 12px; background: var(--warn-soft); color: var(--ink); }
  .real-note summary { cursor: pointer; min-height: 28px; display: flex; align-items: center; gap: 6px; }
  .real-note p { margin: 6px 0 0; }
  .real-ic { flex: none; width: 24px; text-align: center; font-size: 17px; }
  .real-part { display: inline-block; margin-inline-start: 4px; padding: 1px 7px; border-radius: 99px; font-size: 11px; font-weight: 700; vertical-align: 1px; background: var(--a-soft); color: var(--a); }
  .real-part.real { background: var(--warn-soft); color: var(--warn); }
  .real-part.whole { background: var(--paper-2); color: var(--ink-2); }
  .real-rows-h { display: flex; justify-content: space-between; align-items: baseline; }
  .real-rows { list-style: none; margin: 0; padding: 0 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); }
  .real-rows li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); }
  .real-rows li:first-child { border-top: 0; }
  .real-rows li.p-whole { opacity: .8; }
  .real-l { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .real-l small { color: var(--ink-2); font-size: 12px; }
  .real-rows b { white-space: nowrap; }
  .real-pin { flex: none; min-width: 36px; justify-content: center; font-size: 15px; }
</style>
