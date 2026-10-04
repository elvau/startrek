<script lang="ts">
  /*
   * Link zu einem Anbieter. Mit Partnerkennung (sponsored) überall gleich gekennzeichnet: rel="sponsored", „Partner-Link*“
   * (bei Knöpfen im Link, sonst dahinter) und der Hinweis als Tooltip. Den Hinweis zum Sternchen zeigt die Stelle darunter.
   * track: Klick zählen (Partner, Kategorie), ohne Personenbezug (partners/click.ts).
   */
  import type { Snippet } from "svelte";
  import { t } from "../i18n/index.svelte";
  import { countClick } from "../partners/click";
  let { href, sponsored = false, cls, inside = false, track, onclick, children }: {
    href: string; sponsored?: boolean; cls?: string;
    /** Kennzeichnung im Link (Knöpfe) statt dahinter */
    inside?: boolean;
    /** [Partner, Kategorie] für die Klickzählung */
    track?: readonly [string, string];
    onclick?: (e: MouseEvent) => void; children: Snippet;
  } = $props();
  const count = () => { if (track) countClick(track[0], track[1]); };
</script>

<a class={cls} {href} target="_blank" rel={sponsored ? "noopener noreferrer sponsored" : "noopener noreferrer"} title={sponsored ? t("fs.partnerNote") : undefined} onclick={e => { count(); onclick?.(e); }} onauxclick={e => { if (e.button === 1) count(); }}>{@render children()}{#if sponsored && inside}<small class="fs-ad">{t("fs.partner")}*</small>{/if}</a>{#if sponsored && !inside}&nbsp;<small>{t("fs.partner")}*</small>{/if}
