<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Import (#459): „Was fehlt noch?“ Bausteine im Angebot, von der App gerechnet oder fehlend; je fehlendem Baustein
   * Suchen, Schätzen, Später bzw. Brauchen wir nicht. Ergänztes zählt zur ganzen Reise, nicht zum Angebot.
   */
  import type { ImportedOffer } from "../import/ai";
  import { partsOf, type Choice, type PartId } from "../import/parts";

  let { offer, choices = $bindable(), oncreate, onback }: { offer: ImportedOffer; choices: Partial<Record<PartId, Choice>>; oncreate: () => void; onback: () => void } = $props();
  const parts = $derived(partsOf(offer));
  const STATE: Record<string, Key> = { offer: "imp.parts.inOffer", package: "imp.parts.inPackage", app: "imp.parts.app", missing: "imp.parts.missing" };
  const searchFirst = $derived((["flight", "stay", "fun"] as const).find(k => choices[k] === "search"));
</script>

<div class="parts">
  <h4 class="parts-h">{t("imp.parts.title")}</h4>
  <p class="muted">{t("imp.parts.lead")}</p>
  <ul class="parts-list">
    {#each parts as p (p.id)}
      <li class:missing={p.state === "missing"}>
        <div class="parts-row">
          <span class="parts-mark" aria-hidden="true">{p.state === "missing" ? "?" : "✓"}</span>
          <span class="parts-l"><b>{t(`imp.part.${p.id}` as Key)}</b><small>{t(p.id === "transfer" && p.state === "missing" ? "imp.parts.transferEst" : STATE[p.state])}</small></span>
        </div>
        {#if p.choices.length}
          <div class="chips" role="group" aria-label={t(`imp.part.${p.id}` as Key)}>
            {#each p.choices as c (c)}<button type="button" class="chip" class:on={choices[p.id] === c} aria-pressed={choices[p.id] === c} onclick={() => (choices = { ...choices, [p.id]: c })}>{t(`imp.c.${c}` as Key)}</button>{/each}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="muted small">{searchFirst ? t("imp.parts.searchNext", { x: t(`imp.part.${searchFirst}` as Key) }) : t("imp.parts.laterHint")} {t("imp.parts.whole")}</p>
  <div class="ed-foot"><button type="button" class="btn" onclick={onback}>{t("imp.rev.back")}</button><button type="button" class="btn primary imp-parts-go" onclick={oncreate}>{t("imp.rev.create")}</button></div>
</div>

<style>
  .parts { display: flex; flex-direction: column; gap: 10px; }
  .parts > p, .parts-h { margin: 0; }
  .parts-h { font-size: 16px; }
  .parts-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .parts-list li { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); }
  .parts-row { display: flex; align-items: center; gap: 12px; }
  .parts-mark { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; background: var(--good-soft); color: var(--good); }
  li.missing .parts-mark { background: var(--warn-soft); color: var(--warn); }
  .parts-l { display: flex; flex-direction: column; min-width: 0; }
  .parts-l small { color: var(--ink-2); }
</style>
