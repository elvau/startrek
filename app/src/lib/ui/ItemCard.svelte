<script lang="ts">
  import ExtLink from "./ExtLink.svelte";
  import type { Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import FlightCard from "./FlightCard.svelte";
  import StayCard from "./StayCard.svelte";
  import ItemRow from "./ItemRow.svelte";
  import ItemEditor from "./ItemEditor.svelte";
  import WatchBadge from "./WatchBadge.svelte";
  import ExtrasBlock from "./ExtrasBlock.svelte";
  import RentalCheck from "./RentalCheck.svelte";
  import ItemSplit from "./ItemSplit.svelte";
  import AiMark from "./AiMark.svelte";
  import { t, type Key } from "../i18n/index.svelte";
  import { reveal } from "./reveal";
  import { itemLoc, mapsUrl } from "../geo/maps";

  let { item, icon }: { item: Item; icon: string } = $props();
  const editing = $derived(app.editing === item.id);
  const hasLegs = $derived(!!item.follow || item.options.some(o => o.legs?.length));
  const isStay = $derived(item.cat === "stay");
  // Link zum Anbieter des gewählten Angebots (aus der Suche übernommen), bleibt auf der Karte
  const src = $derived(calc.T.items[item.id]?.option?.source);
  // Lage in Google Maps (Unterkunft, Veranstaltungsort): öffnet erst beim Antippen
  const gmap = $derived(mapsUrl(itemLoc(item, calc.T.items[item.id]?.option, app.trip)));

  function toggle(e: MouseEvent) {
    if (access.readonly) return;
    if ((e.target as HTMLElement).closest("button,input,select,a,label,.xc,.rc")) return;
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
  <ExtrasBlock {item} />
  <ItemSplit {item} />
  <RentalCheck {item} />
  {#if src?.url || gmap || src?.test}
    <p class="src-link">
      {#if src?.test}<span class="pill-test" title={t("test.title")}>{t("test.price")}</span> {/if}
      {#if src?.url}<ExtLink href={src.url} sponsored={src.sponsored} track={[src.name, item.cat]}>{t("search.atProvider")}{src.name ? ` · ${src.name}` : ""} ↗</ExtLink>{/if}
      {#if src?.url && gmap} · {/if}
      {#if gmap}<a class="gmap" href={gmap} target="_blank" rel="noopener noreferrer" title={t("map.googleTitle")}>📍 Google Maps ↗</a>{/if}
    </p>
  {/if}
  <WatchBadge {item} />
  {#if item.ai}<div class="aif"><AiMark /> {t(`ai.mark.${item.ai.kind}` as Key)}</div>{/if}
  {#if editing}<ItemEditor {item} />{/if}
</article>
