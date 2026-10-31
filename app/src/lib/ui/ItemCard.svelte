<script lang="ts">
  import ExtLink from "./ExtLink.svelte";
  import type { Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import FlightCard from "./FlightCard.svelte";
  import StayCard from "./StayCard.svelte";
  import CruiseCard from "./CruiseCard.svelte";
  import ItemRow from "./ItemRow.svelte";
  import OptionCompare from "./OptionCompare.svelte";
  import PollHint from "./PollHint.svelte";
  import ItemEditor from "./ItemEditor.svelte";
  import WatchBadge from "./WatchBadge.svelte";
  import ExtrasBlock from "./ExtrasBlock.svelte";
  import RentalCheck from "./RentalCheck.svelte";
  import RentalPanel from "./RentalPanel.svelte";
  import ItemSplit from "./ItemSplit.svelte";
  import AiMark from "./AiMark.svelte";
  import PkgBand from "./PkgBand.svelte";
  import { arrow, autoName, t, type Key } from "../i18n/index.svelte";
  import { reveal } from "./reveal";
  import { itemLoc, mapsUrl } from "../geo/maps";
  import { flashEl } from "./showItem";
  import ItemCompact from "./ItemCompact.svelte";
  import { mob } from "../mobile.svelte";

  let { item, icon }: { item: Item; icon: string } = $props();
  const editing = $derived(app.editing === item.id);
  // Handy (#531): zugeklappt eine Zeile, bis man den Posten antippt (immer nur einer offen)
  const compact = $derived(mob.on && mob.openItem !== item.id && !editing);
  const hasLegs = $derived(!!item.follow || item.options.some(o => o.legs?.length));
  const isStay = $derived(item.cat === "stay");
  // Link zum Anbieter des gewählten Angebots (aus der Suche übernommen), bleibt auf der Karte
  const src = $derived(calc.T.items[item.id]?.option?.source);
  // Lage in Google Maps (Unterkunft, Veranstaltungsort): öffnet erst beim Antippen
  const gmap = $derived(mapsUrl(itemLoc(item, calc.T.items[item.id]?.option, app.trip)));

  // Auto-Posten der Runde (#243): zu Strecke, Camper und km-Satz im Kapitel Transport
  function toRoad(e: Event) {
    e.stopPropagation();
    flashEl(document.querySelector<HTMLElement>("#transport .search-row.camper, #transport .road"), "start");
  }

  function toggle(e: MouseEvent) {
    if (compact) { mob.openItem = item.id; return; }
    if (access.readonly) return;
    if ((e.target as HTMLElement).closest("button,input,select,a,label,.xc,.rc")) return;
    app.editing = editing ? null : item.id;
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Enter" && e.target === e.currentTarget && compact) { mob.openItem = item.id; return; }
    if (e.key === "Enter" && e.target === e.currentTarget && !access.readonly) app.editing = editing ? null : item.id;
  }
  function fold(e: Event) {
    e.stopPropagation();
    mob.openItem = "";
    if (editing) app.editing = null;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<article class="card" data-item={item.id} data-more={access.readonly || compact ? null : `${t("card.more")} ${arrow() === "←" ? "‹" : "›"}`} class:edit={editing} class:dropped={item.status === "dropped"} class:compact tabindex="0" onclick={toggle} onkeydown={key} use:reveal aria-label={autoName(item.name)}>
  {#if compact}
    <ItemCompact {item} {icon} />
  {:else}
  {#if mob.on}<button type="button" class="linkbtn ic-fold" onclick={fold}>▴ {t("imp.fold")}</button>{/if}
  {#if item.cat === "flights" && hasLegs}
    <FlightCard {item} />
  {:else if item.cruise}
    <CruiseCard {item} />
  {:else if isStay}
    <StayCard {item} />
  {:else}
    <ItemRow {item} {icon} />
    <!-- mehrere Angebote (Erlebnisse u. a.): Vergleich in der Karte, solange nicht gebucht (#441) -->
    {#if item.options.length > 1 && !item.auto && item.status !== "booked" && item.status !== "paid" && item.status !== "dropped"}<OptionCompare {item} />{/if}
  {/if}
  <PollHint {item} />
  <ExtrasBlock {item} />
  <ItemSplit {item} />
  <RentalPanel {item} />
  <RentalCheck {item} />
  {#if item.hint === "road:car" && !access.readonly}<p class="road-jump"><button class="linkbtn" onclick={toRoad}>🗺 {t("road.editRoute")} ›</button></p>{/if}
  {#if src?.url || gmap || src?.test || src?.imported}
    <p class="src-link">
      {#if src?.test}<span class="pill-test" title={t("test.title")}>{t("test.price")}</span> {/if}
      {#if src?.imported}<span class="muted" title={t("pkg.importedHint")}>📥 {t("pkg.imported", { d: src.at ? src.at.split("-").reverse().join(".") : "" })} · {t("imp.notLive")}</span> {/if}
      {#if src?.url}<ExtLink href={src.url} sponsored={src.sponsored} track={[src.name, item.cat]}>{t("search.atProvider")}{src.name ? ` · ${src.name}` : ""} ↗</ExtLink>{/if}
      {#if src?.url && gmap} · {/if}
      {#if gmap}<a class="gmap" href={gmap} target="_blank" rel="noopener noreferrer" title={t("map.googleTitle")}>📍 Google Maps ↗</a>{/if}
    </p>
  {/if}
  <PkgBand {item} />
  <WatchBadge {item} />
  {#if item.ai}<div class="aif"><AiMark /> {t(`ai.mark.${item.ai.kind}` as Key)}
    {#if item.check}<span class="aif-check">⚠ {t("imp.check")}{#if item.checkWhy?.length}: {item.checkWhy.join(" · ")}{/if}</span>{#if !access.readonly}<button class="linkbtn aif-ok" onclick={() => { item.check = undefined; item.checkWhy = undefined; }}>{t("imp.checked")}</button>{/if}{/if}</div>{/if}
  {#if editing}<ItemEditor {item} />{/if}
  {/if}
</article>
