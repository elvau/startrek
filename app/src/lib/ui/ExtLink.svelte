<script lang="ts">
  /*
   * Link zu einem Anbieter. Mit Partnerkennung (sponsored) überall gleich gekennzeichnet: rel="sponsored", „Partner-Link*“
   * (bei Knöpfen im Link, sonst dahinter) und der Hinweis als Tooltip. Den Hinweis zum Sternchen zeigt die Stelle darunter.
   */
  import type { Snippet } from "svelte";
  import { t } from "../i18n/index.svelte";
  let { href, sponsored = false, cls, inside = false, onclick, children }: {
    href: string; sponsored?: boolean; cls?: string;
    /** Kennzeichnung im Link (Knöpfe) statt dahinter */
    inside?: boolean;
    onclick?: (e: MouseEvent) => void; children: Snippet;
  } = $props();
</script>

<a class={cls} {href} target="_blank" rel={sponsored ? "noopener noreferrer sponsored" : "noopener noreferrer"} title={sponsored ? t("fs.partnerNote") : undefined} {onclick}>{@render children()}{#if sponsored && inside}<small class="fs-ad">{t("fs.partner")}*</small>{/if}</a>{#if sponsored && !inside}&nbsp;<small>{t("fs.partner")}*</small>{/if}
