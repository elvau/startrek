<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Pauschalreise in die offene Reise (#188): entweder per KI importieren oder von Hand (Anbieter, Preis für alle,
   * was enthalten ist). Flug, Unterkunft und Transfer erscheinen danach in ihren Kapiteln.
   */
  import { app } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { createPackage, type PkgPart } from "../package";
  import Modal from "./Modal.svelte";
  import ImportPanel from "./ImportPanel.svelte";
  import { showItem } from "./showItem";

  let { onclose }: { onclose: () => void } = $props();
  let mode = $state<"import" | "hand">(cloud.configured ? "import" : "hand");
  let provider = $state(""), price = $state<number | null>(null);
  let parts = $state<PkgPart[]>(["flights", "stay", "transport"]);
  const PARTS: { k: PkgPart; icon: string }[] = [{ k: "flights", icon: "✈" }, { k: "stay", icon: "🛏" }, { k: "transport", icon: "🚌" }];
  const toggle = (k: PkgPart) => (parts = parts.includes(k) ? parts.filter(x => x !== k) : [...parts, k]);
  function create(e: Event) {
    e.preventDefault();
    const items = createPackage(app.trip, { provider: provider.trim() || undefined, price: price && price > 0 ? price : undefined, parts });
    onclose();
    if (items[0]) showItem(items[0].id);
  }
</script>

<Modal title={`📦 ${t("pkg.title")}`} {onclose}>
  {#if cloud.configured}
    <div class="chips pkg-mode" role="group">
      <button type="button" class="chip" class:on={mode === "import"} aria-pressed={mode === "import"} onclick={() => (mode = "import")}>📥 {t("pkg.import")}</button>
      <button type="button" class="chip" class:on={mode === "hand"} aria-pressed={mode === "hand"} onclick={() => (mode = "hand")}>✏ {t("pkg.hand")}</button>
    </div>
  {/if}
  {#if mode === "import"}
    <ImportPanel {onclose} into />
  {:else}
    <form class="pkg-hand" onsubmit={create}>
      <div class="pkg-grid">
        <label class="f">🏷 {t("pkg.provider")}<input bind:value={provider} placeholder={t("pkg.providerPh")} /></label>
        <label class="f">💶 {t("pkg.price")}<input type="number" min="0" step="1" inputmode="decimal" bind:value={price} /></label>
      </div>
      <span class="dlabel">{t("pkg.contains")}</span>
      <div class="pkg-parts">
        {#each PARTS as p (p.k)}<button type="button" class="pkg-part" class:on={parts.includes(p.k)} aria-pressed={parts.includes(p.k)} onclick={() => toggle(p.k)}><span aria-hidden="true">{p.icon}</span>{t(`pkg.part.${p.k}` as Key)}</button>{/each}
      </div>
      <div class="ed-foot"><span class="muted small">{t("pkg.later")}</span><button class="btn primary pkg-create" disabled={!parts.length}>📦 {t("pkg.create")}</button></div>
    </form>
  {/if}
</Modal>

<style>
  .pkg-mode { margin-bottom: 12px; }
  .pkg-hand { display: flex; flex-direction: column; gap: 12px; }
  .pkg-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .pkg-parts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .pkg-part { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 56px; border-radius: 14px; border: 1px solid var(--line); background: var(--paper); font: inherit; font-size: 13px; font-weight: 700; color: var(--ink); }
  .pkg-part span { font-size: 20px; }
  .pkg-part.on { border: 2px solid var(--a); background: var(--a-soft); }
</style>
