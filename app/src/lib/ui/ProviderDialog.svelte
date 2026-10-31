<script lang="ts">
  import { t } from "../i18n/index.svelte";
  /*
   * „Bei anderen Anbietern suchen“ (#619): Suchlinks einer Kategorie gebündelt. Oben, was wir übernehmen; dann die
   * Anbieter mit vorausgefüllter Suche und die, bei denen man nur auf der Startseite landet. Partner-Links gekennzeichnet,
   * Reihenfolge wie im Verzeichnis (nie nach Provision). Unten der Rückweg in die Reise: Angebot übernehmen, selbst eintragen.
   * empty: die eigene Suche hat nichts gefunden (öffnet sich dann von selbst, mit Erklärung).
   */
  import Modal from "./Modal.svelte";
  import ExtLink from "./ExtLink.svelte";
  import { partnerLink, partnersOf, type PartnerCat } from "../partners";
  import { loadPartner, partner } from "../partnerState.svelte";
  import { cloud } from "../cloud/cloud.svelte";

  let { cat, q, summary, empty = false, onclose, ontake, onhand }: {
    cat: PartnerCat; q: unknown; summary: string; empty?: boolean; onclose: () => void; ontake?: () => void; onhand?: () => void;
  } = $props();
  loadPartner();
  const links = $derived(partnersOf(cat).map(id => partnerLink(id, q as never, partner.on)).filter(l => l !== null));
  const search = $derived(links.filter(l => l.fill === "search"));
  const home = $derived(links.filter(l => l.fill === "home"));
  const label = (l: (typeof links)[number]) => (l.nameKey ? t(l.nameKey) : l.name);
</script>

<Modal title={`🔎 ${t("prov.title")}`} {onclose}>
  <div class="prov">
    {#if empty}<p class="prov-empty" role="status">{t("prov.empty")}</p>{/if}
    {#if summary}<p class="muted small prov-we">{t("prov.we", { x: summary })}</p>{/if}
    {#if search.length}
      <h3 class="prov-h">🔎 {t("prov.search")}</h3>
      <ul class="prov-list" data-fill="search">
        {#each search as l (l.id)}<li><ExtLink cls="prov-link" href={l.url} sponsored={l.sponsored} inside track={[l.id, l.cat]} name={label(l)}>{label(l)} ↗</ExtLink></li>{/each}
      </ul>
    {/if}
    {#if home.length}
      <h3 class="prov-h">🏠 {t("prov.home")}</h3>
      <p class="muted small">{t("prov.homeHint")}</p>
      <ul class="prov-list" data-fill="home">
        {#each home as l (l.id)}<li><ExtLink cls="prov-link" href={l.url} sponsored={l.sponsored} inside track={[l.id, l.cat]} name={label(l)}>{label(l)} ↗</ExtLink></li>{/each}
      </ul>
    {/if}
    {#if ontake || onhand}
      <div class="prov-back">
        <b>{t("prov.found")}</b>
        {#if ontake && cloud.configured}<button type="button" class="btn prov-take" onclick={ontake}>📥 {t("imp.take")}</button>{/if}
        {#if onhand}<button type="button" class="btn prov-hand" onclick={onhand}>✏️ {t("prov.hand")}</button>{/if}
      </div>
    {/if}
    {#if links.some(l => l.sponsored)}<p class="muted small">* {t("fs.partnerNote")}</p>{/if}
  </div>
</Modal>

<style>
  .prov { display: flex; flex-direction: column; gap: 10px; }
  .prov-empty { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--warn-soft); color: var(--ink); }
  .prov-we { margin: 0; }
  .prov-h { margin: 6px 0 0; font-size: 15px; }
  .prov-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
  .prov-list :global(.prov-link) { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); font-weight: 700; color: var(--ink); text-decoration: none; }
  .prov-list :global(.prov-link:hover) { border-color: var(--a); }
  .prov-back { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px dashed var(--line); }
  .prov-back b { margin-inline-end: auto; }
</style>
