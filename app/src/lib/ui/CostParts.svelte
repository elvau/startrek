<script lang="ts">
  /* Zusammensetzung des Gesamtbetrags (#418): Balken und Reiter gebucht, geplant, versteckt; Klick klappt die Posten auf, zweiter Klick zu */
  import { t, type Key } from "../i18n/index.svelte";
  import { app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { costParts, PART_KEYS, type PartKey } from "../calc/parts";

  const parts = $derived(costParts(app.trip, calc.T));
  let open = $state<PartKey | null>(null);
  // Rechenweg je Zeile: beim Darüberfahren als title, per Tippen bzw. Tastatur eingeblendet
  let shown = $state<string | null>(null);
  const LABEL: Record<PartKey, Key> = { booked: "parts.booked", planned: "parts.planned", hidden: "parts.hidden" };
  const est = (k: PartKey) => parts.rows[k].some(r => r.est);
  const amount = (k: PartKey) => (est(k) ? t("parts.ca", { v: eur(parts.sum[k]) }) : eur(parts.sum[k]));
  function pick(k: PartKey) { open = open === k ? null : k; shown = null; }
</script>

<div class="cp">
  <div class="cp-bar" role="img" aria-label={PART_KEYS.map(k => `${t(LABEL[k])} ${amount(k)}`).join(", ")}>
    {#each PART_KEYS as k (k)}{#if parts.sum[k] > 0}<i class="cp-{k}" style="flex:{parts.sum[k]} 1 0"></i>{/if}{/each}
  </div>
  <div class="cp-tabs" role="group" aria-label={t("parts.aria")}>
    {#each PART_KEYS as k (k)}
      <button type="button" class="cp-tab cp-t-{k}" class:on={open === k} aria-expanded={open === k} aria-controls="cp-list" onclick={() => pick(k)}>
        <span class="cp-l"><i class="cp-dot cp-{k}" aria-hidden="true"></i>{t(LABEL[k])}</span>
        <b class="num">{amount(k)}</b>
      </button>
    {/each}
  </div>
  {#if open}
    <div class="cp-list" id="cp-list">
      <p class="cp-intro">{t(`parts.intro.${open}` as Key)}</p>
      {#each parts.rows[open] as r (r.key)}
        <div class="cp-row" title={r.calc || undefined}>
          {#if r.calc}
            <button type="button" class="cp-name" aria-expanded={shown === r.key} onclick={() => (shown = shown === r.key ? null : r.key)}>
              <span>{r.name}</span>{#if r.how}<small>{r.how}</small>{/if}
            </button>
          {:else}
            <span class="cp-name"><span>{r.name}</span>{#if r.how}<small>{r.how}</small>{/if}</span>
          {/if}
          <b class="num">{r.est ? t("parts.ca", { v: eur(r.v) }) : eur(r.v)}</b>
          {#if shown === r.key && r.calc}<p class="cp-calc">{r.calc}</p>{/if}
        </div>
      {:else}
        <p class="cp-empty">{t("parts.empty")}</p>
      {/each}
      {#if open !== "booked" && parts.deposit > 0}<p class="cp-dep">{t("parts.deposit", { v: eur(parts.deposit) })}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .cp{display:flex;flex-direction:column;gap:8px;width:min(400px,calc(100vw - 72px));margin-top:10px;text-align:start}
  .cp-bar{display:flex;gap:2px;height:10px;border-radius:99px;overflow:hidden;background:var(--line)}
  .cp-booked{background:var(--good)}
  .cp-planned{background:var(--c-flights)}
  .cp-hidden{background:repeating-linear-gradient(135deg,var(--warn) 0 4px,color-mix(in srgb,var(--warn) 45%,transparent) 4px 7px)}
  .cp-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  .cp-tab{display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-height:44px;padding:5px 9px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;text-align:start;cursor:pointer}
  .cp-tab b{font-size:15px}
  .cp-l{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:var(--ink-2)}
  .cp-dot{display:inline-block;width:9px;height:9px;border-radius:3px;flex:none}
  .cp-t-hidden{border-style:dashed;border-color:var(--warn)}
  .cp-t-hidden .cp-l{color:var(--warn)}
  .cp-t-booked.on{background:var(--good-soft);border-color:var(--good)}
  .cp-t-planned.on{background:var(--c-flights-s);border-color:var(--c-flights)}
  .cp-t-hidden.on{background:var(--warn-soft)}
  .cp-list{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:6px 12px}
  .cp-intro,.cp-empty,.cp-dep{margin:6px 0 4px;font-size:12.5px;color:var(--ink-2)}
  .cp-dep{padding-top:6px;border-top:1px solid var(--line)}
  .cp-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:4px 10px;padding:7px 0;border-top:1px solid var(--line)}
  .cp-row[title]{cursor:help}
  .cp-name{display:flex;flex-direction:column;min-width:0;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:start}
  button.cp-name{cursor:help}
  .cp-name span{font-size:14px;font-weight:600;overflow-wrap:anywhere}
  .cp-name small{font-size:12px;color:var(--ink-2)}
  .cp-row b{font-size:14px;white-space:nowrap}
  .cp-calc{grid-column:1/-1;margin:0;font-size:12px;color:var(--ink-2)}
</style>
