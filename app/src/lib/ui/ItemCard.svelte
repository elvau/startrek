<script lang="ts">
  import type { Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import FlightCard from "./FlightCard.svelte";
  import StayCard from "./StayCard.svelte";
  import ItemRow from "./ItemRow.svelte";
  import ItemEditor from "./ItemEditor.svelte";
  import WatchBadge from "./WatchBadge.svelte";
  import AiMark from "./AiMark.svelte";
  import { t, type Key } from "../i18n/index.svelte";
  import { reveal } from "./reveal";

  let { item, icon }: { item: Item; icon: string } = $props();
  const editing = $derived(app.editing === item.id);
  const hasLegs = $derived(!!item.follow || item.options.some(o => o.legs?.length));
  const isStay = $derived(item.cat === "stay");
  // Link zum Anbieter des gewählten Angebots (aus der Suche übernommen), bleibt auf der Karte
  const src = $derived(calc.T.items[item.id]?.option?.source);

  function toggle(e: MouseEvent) {
    if (access.readonly) return;
    if ((e.target as HTMLElement).closest("button,input,select,a,label")) return;
    app.editing = editing ? null : item.id;
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Enter" && e.target === e.currentTarget && !access.readonly) app.editing = editing ? null : item.id;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<article class="card" data-item={item.id} class:edit={editing} class:dropped={item.status === "dropped"} tabindex="0" onclick={toggle} onkeydown={key} use:reveal aria-label={item.name}>
  {#if item.cat === "flights" && hasLegs}
    <FlightCard {item} />
  {:else if isStay}
    <StayCard {item} />
  {:else}
    <ItemRow {item} {icon} />
  {/if}
  {#if src?.url}
    <p class="src-link"><a href={src.url} target="_blank" rel={src.sponsored ? "noopener noreferrer sponsored" : "noopener noreferrer"} title={src.sponsored ? t("fs.partnerNote") : undefined}>{t("search.atProvider")}{src.name ? ` · ${src.name}` : ""} ↗</a>{#if src.sponsored} <small>{t("fs.partner")}*</small>{/if}</p>
  {/if}
  <WatchBadge {item} />
  {#if item.ai}<div class="aif"><AiMark /> {t(`ai.mark.${item.ai.kind}` as Key)}</div>{/if}
  {#if editing}<ItemEditor {item} />{/if}
</article>
