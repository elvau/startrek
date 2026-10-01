<script lang="ts">
  /*
   * Kopf der Reise: vier Kacheln als Einstieg und Mini-Übersicht.
   * Leer: „Zu den Flügen“, „Zu den Hotels“, „Event hinzufügen“, „Sonstige Kosten“;
   * sonst Strecke, Unterkunft, Event und Betrag. Ein Klick führt ins Kapitel (leer: Suche gleich offen).
   */
  import { t, tn } from "../i18n/index.svelte";
  import { access, app, calc } from "../store.svelte";
  import { activeOption, eur } from "../calc";
  import { dayShort, nights } from "../format";
  import { openEventPlanner } from "../event/open.svelte";
  import { openFlightSearch } from "../flights/open.svelte";
  import { openStaySearch } from "../stays/open.svelte";
  import { FLIGHTS_URL } from "../flights/app";
  import type { Item } from "../model";
  import { openExplore } from "../activities/open.svelte";
  import { eventWindow } from "../activities/window";
  import { stationName } from "../stays/stationName";
  import { airportData, ensureAirports, geo } from "../geo/geo.svelte";

  const trip = $derived(app.trip);
  const T = $derived(calc.T);
  const live = (cat: string) => trip.items.filter(i => i.cat === cat && i.status !== "dropped");

  /** Kurzfassung eines Postens: Strecke beim Flug, sonst Angebot oder Name */
  function label(i: Item): string {
    const o = activeOption(i, trip);
    const out = o?.legs?.find(l => l.dir === "out");
    if (i.cat === "flights" && out) return `${out.from} → ${out.to}${out.dep ? ` ${dayShort(out.dep.slice(0, 10))}` : ""}`;
    if (i.cat === "stay") {
      const nn = i.from && i.to ? nights(i.from, i.to) : 0;
      return `${o?.label || i.name || t("stay.new")}${nn ? ` · ${tn("n.nights", nn)}` : ""}`;
    }
    return i.name || o?.label || t("item.new");
  }
  /** Posten einer Kachel, teuerste zuerst bei „Sonstige Kosten“ */
  function lines(cats: string[], byPrice = false) {
    const its = trip.items.filter(i => cats.includes(i.cat) && i.status !== "dropped");
    const sorted = byPrice ? [...its].sort((a, b) => (T.items[b.id]?.net || 0) - (T.items[a.id]?.net || 0)) : its;
    return { first: sorted[0], list: sorted.slice(0, 2).map(i => ({ id: i.id, text: label(i), v: T.items[i.id]?.net || 0 })), more: Math.max(0, sorted.length - 2) };
  }
  // Erlebnisse (Touren, Tickets) stehen bei „Events & Aktivitäten“, hier nur Vor Ort und Sonstiges
  const OTHER = ["transport", "misc"];
  const fl = $derived(lines(["flights"]));
  const st = $derived(lines(["stay"]));
  const ot = $derived(lines(OTHER, true));
  const other = $derived(OTHER.reduce((s, k) => s + (T.byCat[k as keyof typeof T.byCat] || 0), 0));
  const ev = $derived(trip.event);
  const act = $derived(lines(["attractions"]));
  const actSum = $derived(T.byCat.attractions || 0);
  // Event hinzufügen: mit Ort (Reise oder Flug) zu den Erlebnissen und dort Events im Reisezeitraum suchen,
  // ohne Ort den Event-Planer (Reise rund um ein Event)
  async function addEvent() {
    if (access.readonly) { go("attractions"); return; }
    // Stadt am Ankunftsflughafen braucht die Flughafendaten
    if (!trip.place && trip.items.some(i => i.cat === "flights")) await ensureAirports().catch(() => {});
    const city = eventWindow(trip, ap => stationName(geo, airportData, ap)).city;
    if (!city || !FLIGHTS_URL) { openEventPlanner(); return; }
    openExplore();
    // schon offen: nur hinscrollen
    document.querySelector("#attractions .modal.inline")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** leer: Suche öffnen (falls möglich); befüllt: zum ersten Posten scrollen, sonst ins Kapitel */
  function go(chapter: string, first?: Item, open?: () => void) {
    if (!first && open && !access.readonly && FLIGHTS_URL) { open(); return; }
    const el = (first && document.querySelector(`[data-item="${first.id}"]`)) || document.getElementById(chapter);
    el?.scrollIntoView({ behavior: "smooth", block: first ? "center" : "start" });
  }
  // „Sonstige Kosten“ ohne Posten (einfacher Modus): erstes Kapitel mit Betrag
  const otherChapter = $derived(OTHER.find(k => T.byCat[k as keyof typeof T.byCat]) || "transport");
</script>

{#snippet body(head: string, sum: number, l: ReturnType<typeof lines>)}
  <!-- Summe oben nur, wenn sie nicht schon beim einzigen Posten steht -->
  <small>{head}{l.list.length !== 1 || l.more ? ` · ${eur(sum)}` : ""}</small>
  {#each l.list as x (x.id)}<span class="ht-line"><span>{x.text}</span><i>{eur(x.v)}</i></span>{/each}
  {#if !l.list.length}<span class="ht-line"><span>{t("hero.t.amount")}</span></span>{/if}
  {#if l.more}<span class="ht-sub">{t("hero.t.more", { n: l.more })}</span>{/if}
{/snippet}

<div class="hero-tiles">
  <button class="ht-tile ht-fl" class:empty={!fl.list.length && !T.byCat.flights} onclick={() => go("flights", fl.first, () => openFlightSearch())}>
    <span class="ht-ico" aria-hidden="true">✈</span>
    <span class="ht-b">
      {#if fl.list.length || T.byCat.flights}{@render body(t("ch.flights.label"), T.byCat.flights || 0, fl)}
      {:else}<b>{t("hero.t.flights")}</b><span class="ht-sub">{t("hero.t.flightsSub")}</span>{/if}
    </span>
  </button>
  <button class="ht-tile ht-st" class:empty={!st.list.length && !T.byCat.stay} onclick={() => go("stay", st.first, () => openStaySearch())}>
    <span class="ht-ico" aria-hidden="true">🛏</span>
    <span class="ht-b">
      {#if st.list.length || T.byCat.stay}{@render body(t("ch.stay.label"), T.byCat.stay || 0, st)}
      {:else}<b>{t("hero.t.stay")}</b><span class="ht-sub">{t("hero.t.staySub")}</span>{/if}
    </span>
  </button>
  <!-- Events & Aktivitäten: das Event der Reise und die Erlebnisse (Touren, Tickets) -->
  <button class="ht-tile ht-ev ev-open" class:empty={!ev && !act.list.length && !actSum} disabled={access.readonly && !ev && !act.list.length}
    onclick={() => (ev || act.list.length || actSum ? go("attractions", act.first) : addEvent())}>
    <span class="ht-ico" aria-hidden="true">🎟</span>
    <span class="ht-b">
      {#if ev || act.list.length || actSum}
        <small>{t("hero.t.eventLabel")}{actSum && (act.list.length !== 1 || act.more || ev) ? ` · ${eur(actSum)}` : ""}</small>
        {#if ev}
          <span class="ht-line"><span>{ev.name}</span></span>
          <span class="ht-sub ev-hero">{[`${dayShort(ev.start.slice(0, 10))} ${ev.start.slice(11, 16)}`, ev.venue].filter(Boolean).join(" · ")}</span>
        {/if}
        {#each act.list.slice(0, ev ? 1 : 2) as x (x.id)}<span class="ht-line"><span>{x.text}</span><i>{eur(x.v)}</i></span>{/each}
        {#if act.more + (ev && act.list.length > 1 ? 1 : 0)}<span class="ht-sub">{t("hero.t.more", { n: act.more + (ev && act.list.length > 1 ? 1 : 0) })}</span>{/if}
      {:else}<b>{t("hero.t.event")}</b><span class="ht-sub">{t("hero.t.eventSub")}</span>{/if}
    </span>
  </button>
  <button class="ht-tile ht-misc" class:empty={!other} onclick={() => go(otherChapter, ot.first)}>
    <span class="ht-ico" aria-hidden="true">🧾</span>
    <span class="ht-b">
      {#if other || ot.list.length}{@render body(t("hero.t.other"), other, ot)}
      {:else}<b>{t("hero.t.other")}</b><span class="ht-sub">{t("hero.t.otherSub")}</span>{/if}
    </span>
  </button>
</div>
