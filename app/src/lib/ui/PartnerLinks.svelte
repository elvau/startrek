<script lang="ts">
  /*
   * Links zu Anbietern aus dem Partner-Verzeichnis, mit „·“ getrennt. Partner-Links (mit Kennung) sind einheitlich
   * gekennzeichnet: rel="sponsored" und „Partner-Link*“; den Hinweis zum Sternchen zeigt die Stelle darunter (sponsoredAny).
   */
  import { t } from "../i18n/index.svelte";
  import ExtLink from "./ExtLink.svelte";
  import { partnerLink, type PartnerId } from "../partners";
  import { loadPartner, partner } from "../partnerState.svelte";
  let { ids, q }: { ids: readonly PartnerId[]; q?: unknown } = $props();
  loadPartner();
  const links = $derived(ids.map(id => partnerLink(id, q as never, partner.on)).filter(l => l !== null));
</script>

{#each links as l, i (l.id)}{i ? " · " : ""}<ExtLink href={l.url} sponsored={l.sponsored} track={[l.id, l.cat]}>{l.nameKey ? t(l.nameKey) : l.name} ↗</ExtLink>{/each}
