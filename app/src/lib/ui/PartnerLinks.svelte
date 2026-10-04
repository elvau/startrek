<script lang="ts">
  /*
   * Links zu Anbietern aus dem Partner-Verzeichnis, mit „·“ getrennt. Partner-Links (mit Kennung) sind einheitlich
   * gekennzeichnet: rel="sponsored" und „Partner-Link*“; den Hinweis zum Sternchen zeigt die Stelle darunter (sponsoredAny).
   */
  import { t } from "../i18n/index.svelte";
  import { partnerLink, type PartnerId } from "../partners";
  import { loadPartner, partner } from "../partnerState.svelte";
  let { ids, q }: { ids: readonly PartnerId[]; q?: unknown } = $props();
  loadPartner();
  const links = $derived(ids.map(id => partnerLink(id, q as never, partner.on)).filter(l => l !== null));
</script>

{#each links as l, i (l.id)}{i ? " · " : ""}<a href={l.url} target="_blank" rel={l.sponsored ? "noopener noreferrer sponsored" : "noopener noreferrer"}>{l.nameKey ? t(l.nameKey) : l.name} ↗</a>{#if l.sponsored}&nbsp;<small>{t("fs.partner")}*</small>{/if}{/each}
