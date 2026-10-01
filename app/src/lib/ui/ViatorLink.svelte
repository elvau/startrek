<script lang="ts">
  import { t } from "../i18n/index.svelte";
  /* Link zur Viator-Suche am Reiseort; mit Partnerkennung und gekennzeichnet, wenn Partner-Links an sind */
  import { viatorLink, type ActivityLinkQuery } from "../links";
  import { loadPartner, partner } from "../partnerState.svelte";
  let { q }: { q: ActivityLinkQuery } = $props();
  loadPartner();
</script>

<a href={viatorLink(q, partner.on)} target="_blank" rel={partner.on ? "noopener noreferrer sponsored" : "noopener noreferrer"}>Viator ↗</a>{#if partner.on}&nbsp;<small>{t("fs.partner")}*</small>{/if}
