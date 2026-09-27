<script lang="ts">
  import type { Item } from "../model";
  import { app } from "../store.svelte";
  import FlightCard from "./FlightCard.svelte";
  import StayCard from "./StayCard.svelte";
  import ItemRow from "./ItemRow.svelte";
  import ItemEditor from "./ItemEditor.svelte";
  import { reveal } from "./reveal";

  let { item, icon }: { item: Item; icon: string } = $props();
  const editing = $derived(app.editing === item.id);
  const hasLegs = $derived(item.options.some(o => o.legs?.length));
  const isStay = $derived(item.cat === "stay");

  function toggle(e: MouseEvent) {
    if ((e.target as HTMLElement).closest("button,input,select,a,label")) return;
    app.editing = editing ? null : item.id;
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Enter" && e.target === e.currentTarget) app.editing = editing ? null : item.id;
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
  {#if editing}<ItemEditor {item} />{/if}
</article>
