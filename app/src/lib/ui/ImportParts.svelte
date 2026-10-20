<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Import (#459): „Was fehlt noch?“ Bausteine im Angebot, von der App gerechnet oder fehlend; je fehlendem Baustein
   * Suchen, Schätzen, Später bzw. Brauchen wir nicht. Ergänztes zählt zur ganzen Reise, nicht zum Angebot.
   * Ohne Flug (#475): Anreise mit Auto, Bahn oder Fernbus, ohne bekannten Wohnort mit Frage danach.
   * Kompakt (#468): Kapitel-Emoji je Baustein, Status als kurzer Chip, ein Hinweissatz; „ganze Reise“ hinter „?“.
   */
  import Help from "./Help.svelte";
  import { PART_ICON } from "../import/icons";
  import type { ImportedOffer } from "../import/ai";
  import { arrivalOf, partsOf, pick, type Choices } from "../import/parts";
  import type { Home } from "../home";
  import HomeInput from "./HomeInput.svelte";

  let { offer, choices = $bindable(), askHome = false, home = $bindable(null), oncreate, onback }: { offer: ImportedOffer; choices: Choices; askHome?: boolean; home?: Home | null; oncreate: () => void; onback: () => void } = $props();
  const parts = $derived(partsOf(offer, choices));
  const STATE: Record<string, Key> = { offer: "imp.parts.inOffer", package: "imp.parts.inPackage", app: "imp.parts.app", missing: "imp.parts.missing" };
  const MARK: Record<string, string> = { offer: "✓", package: "📦", app: "🧮", missing: "?" };
  const ICON: Record<string, string> = { car: "🚗 ", train: "🚆 ", bus: "🚌 " };
  const sub = (id: string, state: string): Key => id === "transfer" && state === "missing" ? "imp.parts.transferEst" : id === "arrival" ? "imp.parts.arrivalEst" : STATE[state];
  const searchFirst = $derived((["flight", "stay", "fun"] as const).find(k => choices[k] === "search"));
</script>

<div class="parts">
  <h4 class="parts-h">{t("imp.parts.title")} <Help k="impWhole" /></h4>
  <ul class="parts-list">
    {#each parts as p (p.id)}
      <li class:missing={p.state === "missing"}>
        <div class="parts-row">
          <span class="parts-mark" aria-hidden="true">{PART_ICON[p.id]}</span>
          <b class="parts-l">{t(`imp.part.${p.id}` as Key)}</b>
          <span class="parts-st {p.state}"><span aria-hidden="true">{MARK[p.state]}</span> {t(sub(p.id, p.state))}</span>
        </div>
        {#if p.choices.length}
          <div class="chips" role="group" aria-label={t(`imp.part.${p.id}` as Key)}>
            {#each p.choices as c (c)}<button type="button" class="chip" class:on={choices[p.id] === c} aria-pressed={choices[p.id] === c} onclick={() => (choices = pick(choices, p.id, c))}>{ICON[c] || ""}{t(`imp.c.${c}` as Key)}</button>{/each}
          </div>
        {/if}
        {#if p.id === "arrival" && askHome && arrivalOf(choices)}
          <div class="f"><HomeInput cls="imp-home" label={t("imp.parts.home")} value={home} onpick={h => (home = h)} onclear={() => (home = null)} /></div>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="muted small">{searchFirst ? t("imp.parts.searchNext", { x: t(`imp.part.${searchFirst}` as Key) }) : t("imp.parts.laterHint")}</p>
  <div class="ed-foot"><button type="button" class="btn" onclick={onback}>{t("imp.rev.back")}</button><button type="button" class="btn primary imp-parts-go" onclick={oncreate}>{t("imp.rev.create")}</button></div>
</div>

<style>
  .parts { display: flex; flex-direction: column; gap: 10px; }
  .parts > p, .parts-h { margin: 0; }
  .parts-h { font-size: 16px; }
  .parts-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .parts-list li { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); }
  .parts-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .parts-mark { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; background: var(--good-soft); }
  li.missing .parts-mark { background: var(--warn-soft); }
  .parts-l { flex: 1; min-width: 0; }
  .parts-st { flex: none; padding: 3px 9px; border-radius: 99px; font-size: 12px; font-weight: 700; background: var(--good-soft); color: var(--good); }
  .parts-st.app { background: var(--paper-2); color: var(--ink-2); }
  .parts-st.missing { background: var(--warn-soft); color: var(--warn); }
</style>
