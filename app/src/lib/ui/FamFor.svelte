<script lang="ts">
  /*
   * „Zählt auch für“ (#585): meine Stimmen und Termine zählen automatisch für stimmberechtigte Familienmitglieder ohne
   * Konto (verknüpfte, noch nicht entschiedene bekommen den Hinweis); einzeln abwählbar, gilt für die ganze Reise.
   */
  import { t } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { saveMySelf } from "../cloud/cloud.svelte";
  import { myFam } from "../polls.svelte";
  import { forWhom } from "../famvote";

  const f = $derived(myFam());
  const who = $derived(f ? forWhom(app.trip, f.me.id, f.acct) : []);
  const off = $derived(new Set(f?.cfg.x || []));
  function toggle(id: string) {
    const x = off.has(id) ? [...off].filter(v => v !== id) : [...off, id];
    void saveMySelf(app.trip.id, { x });
  }
</script>

{#if who.length}
  <div class="ff small">
    <span class="ff-l">{t("fam.for")}</span>
    {#each who as x (x.id)}
      <button type="button" class="chip sm ff-p" class:on={!off.has(x.id)} aria-pressed={!off.has(x.id)} onclick={() => toggle(x.id)}>{off.has(x.id) ? "" : "✓ "}{x.name}</button>
    {/each}
    <span class="muted ff-h">{t("fam.forHint")}</span>
  </div>
{/if}

<style>
  .ff { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
  .ff-l { font-weight: 600; }
  .ff-h { flex-basis: 100%; }
</style>
