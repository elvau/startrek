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

  const trip = $derived(app.trip);
  const T = $derived(calc.T);
  const live = (cat: string) => trip.items.filter(i => i.cat === cat && i.status !== "dropped");

  const fl = $derived.by(() => {
    const its = live("flights");
    const legs = its.map(i => activeOption(i, trip)?.legs?.find(l => l.dir === "out")).filter(l => !!l);
    const l = legs[0];
    return { n: its.length, text: l ? `${l.from} → ${l.to}` : its[0]?.name || "", sub: l?.dep ? dayShort(l.dep.slice(0, 10)) : "" };
  });
  const st = $derived.by(() => {
    const its = live("stay");
    const i = its[0];
    const nn = i?.from && i?.to ? nights(i.from, i.to) : 0;
    return { n: its.length, text: i ? activeOption(i, trip)?.label || i.name : "", sub: nn ? tn("n.nights", nn) : "" };
  });
  const other = $derived((T.byCat.transport || 0) + (T.byCat.attractions || 0) + (T.byCat.misc || 0));
  const ev = $derived(trip.event);

  function go(id: string, open?: () => void) {
    if (open && !access.readonly && FLIGHTS_URL) open();
    else document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
</script>

<div class="hero-tiles">
  <button class="ht-tile ht-fl" class:empty={!fl.n && !T.byCat.flights} onclick={() => go("flights", fl.n ? undefined : () => openFlightSearch())}>
    <span class="ht-ico" aria-hidden="true">✈</span>
    {#if fl.n || T.byCat.flights}
      <small>{t("ch.flights.label")}</small>
      <b>{fl.text || t("hero.t.amount")}</b>
      <span class="ht-sub">{[fl.sub, fl.n > 1 ? t("hero.t.more", { n: fl.n - 1 }) : "", eur(T.byCat.flights || 0)].filter(Boolean).join(" · ")}</span>
    {:else}<b>{t("hero.t.flights")}</b><span class="ht-sub">{t("hero.t.flightsSub")}</span>{/if}
  </button>
  <button class="ht-tile ht-st" class:empty={!st.n && !T.byCat.stay} onclick={() => go("stay", st.n ? undefined : () => openStaySearch())}>
    <span class="ht-ico" aria-hidden="true">🛏</span>
    {#if st.n || T.byCat.stay}
      <small>{t("ch.stay.label")}</small>
      <b>{st.text || t("hero.t.amount")}</b>
      <span class="ht-sub">{[st.sub, st.n > 1 ? t("hero.t.more", { n: st.n - 1 }) : "", eur(T.byCat.stay || 0)].filter(Boolean).join(" · ")}</span>
    {:else}<b>{t("hero.t.stay")}</b><span class="ht-sub">{t("hero.t.staySub")}</span>{/if}
  </button>
  <button class="ht-tile ht-ev ev-open" class:empty={!ev} disabled={access.readonly && !ev} onclick={() => (access.readonly ? go("attractions") : openEventPlanner())}>
    <span class="ht-ico" aria-hidden="true">🎟</span>
    {#if ev}
      <small>{t("hero.t.eventLabel")}</small>
      <b>{ev.name}</b>
      <span class="ht-sub ev-hero">{[`${dayShort(ev.start.slice(0, 10))} ${ev.start.slice(11, 16)}`, ev.venue].filter(Boolean).join(" · ")}</span>
    {:else}<b>{t("hero.t.event")}</b><span class="ht-sub">{t("hero.t.eventSub")}</span>{/if}
  </button>
  <button class="ht-tile ht-misc" class:empty={!other} onclick={() => go("transport")}>
    <span class="ht-ico" aria-hidden="true">🧾</span>
    {#if other}
      <small>{t("hero.t.other")}</small>
      <b>{eur(other)}</b>
      <span class="ht-sub">{t("hero.t.otherSub")}</span>
    {:else}<b>{t("hero.t.other")}</b><span class="ht-sub">{t("hero.t.otherSub")}</span>{/if}
  </button>
</div>
