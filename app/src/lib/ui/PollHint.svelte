<script lang="ts">
  /* Laufende Abstimmung über die Angebote eines Postens (#432): kurzer Hinweis in der Karte, führt zur Abstimmung */
  import { t, tn } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { mergedVotes, pollOpen, tallyMode } from "../together";
  import { remoteVotes } from "../polls.svelte";
  import type { Item } from "../model";

  let { item }: { item: Item } = $props();
  const p = $derived((app.trip.polls || []).find(x => x.mode && pollOpen(x) && x.options.some(o => o.itemId === item.id)));
  const top = $derived(p ? tallyMode(p, mergedVotes(p, remoteVotes(p)), app.trip)[0] : undefined);
  const go = () => document.querySelector(`[data-poll="${p!.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
</script>

{#if p}
  <button class="linkbtn small poll-hint" onclick={go}>🗳 {t("poll.running")}{top && top.score > 0 ? ` · ${top.label.split(" · ")[0]}: ${p.mode === "miles" ? tn("poll.milesN", Math.round(top.score * 10) / 10) : tn("poll.forN", top.score)}` : ""}</button>
{/if}

<style>
  .poll-hint { align-self: flex-start; padding: 2px 14px 6px; text-align: start; }
</style>
