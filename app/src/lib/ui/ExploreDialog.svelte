<script lang="ts">
  /*
   * Erlebnisse finden: was am Reiseort im Reisezeitraum läuft (Ticketmaster, Fußball-Spielpläne) und
   * buchbare Touren und Tickets (Viator). Antippen legt einen Posten in „Erlebnisse“ an, der Dialog bleibt offen.
   */
  import { i18n, t } from "../i18n/index.svelte";
  import { app, setDetailed } from "../store.svelte";
  import { eur } from "../calc";
  import { dayShort, range } from "../format";
  import { ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf, findCity } from "../geo/places";
  import { noteError } from "../bugs/log";
  import { getYourGuideLink, tiqetsLink } from "../links";
  import ViatorLink from "./ViatorLink.svelte";
  import { partner } from "../partnerState.svelte";
  import { uniqueById } from "../events/search";
  import { activityItem, duration, eventItem, searchActivitiesRemote, searchLocalEvents, takeInto } from "../activities/app";
  import { explore } from "../activities/open.svelte";
  import type { EventHit } from "../events/types";
  import type { ActivityHit } from "../activities/types";
  import Modal from "./Modal.svelte";
  import { showItem } from "./showItem";

  let { onclose }: { onclose: () => void } = $props();
  const trip = app.trip;
  const city = (trip.place || "").split(",")[0].trim();
  const when = trip.from ? range(trip.from, trip.to || trip.from) : t("xp.anyDate");

  let kw = $state("");
  let evBusy = $state(false), evErr = $state(""), events = $state<EventHit[] | null>(null);
  let toBusy = $state(false), toErr = $state(""), tours = $state<ActivityHit[] | null>(null), toursOff = $state(false);
  let taken = $state<Record<string, boolean>>({});

  /** Stadtmitte und englischer Name aus den Ortsdaten (für den Umkreis bei Ticketmaster und die Vereine) */
  async function where() {
    await ensureGeo(trip).catch(() => {});
    const cc = ccOf(geo, trip.country);
    const c = findCity(geo, city, cc);
    return { city, ...(c?.en ? { cityEn: c.en } : {}), ...(c?.cc || cc ? { cc: c?.cc || cc! } : {}), ...(c ? { lat: c.lat, lon: c.lon } : {}) };
  }

  async function findEvents(e?: Event) {
    e?.preventDefault();
    if (!city) return;
    evBusy = true; evErr = ""; events = null;
    try {
      const res = await searchLocalEvents({ q: kw.trim(), ...(await where()), ...(trip.from ? { from: trip.from, to: trip.to || trip.from } : {}) });
      if (!res.sources.some(s => s.configured)) { evErr = t("evs.notReady"); return; }
      events = uniqueById(res.events || []);
      if (!events.length && res.sources.every(s => !s.ok)) {
        evErr = res.sources.find(s => s.error)?.error || t("xp.noEvents");
        noteError(`Events vor Ort: ${res.sources.map(s => `${s.id} ${s.error || (s.ok ? "ok" : "aus")}`).join(", ")}`);
      }
    } catch (err) { evErr = (err as Error).message; noteError(`Events vor Ort: ${evErr}`); }
    finally { evBusy = false; }
  }

  async function findTours() {
    if (!city || tours || toBusy) return;
    toBusy = true; toErr = "";
    try {
      const res = await searchActivitiesRemote({ place: city, lang: i18n.lang, ...(trip.from ? { from: trip.from, to: trip.to || trip.from } : {}) });
      toursOff = !res.sources.some(s => s.configured);
      tours = uniqueById(res.activities || []);
      const bad = res.sources.find(s => s.configured && !s.ok);
      if (!tours.length && bad) { toErr = bad.error || t("xp.noTours"); noteError(`Touren: ${bad.error}`); }
    } catch (err) { toErr = (err as Error).message; noteError(`Touren: ${toErr}`); }
    finally { toBusy = false; }
  }

  // beim Öffnen gleich suchen; Touren erst, wenn man den Reiter ansieht
  $effect(() => { if (city) void findEvents(); });
  $effect(() => { if (explore.tab === "tours") void findTours(); });

  function take(id: string, make: () => ReturnType<typeof eventItem>) {
    setDetailed("attractions", true);
    const item = takeInto(app.trip, make());
    taken[id] = true;
    showItem(item.id);
  }
  const money = (n: number, cur: string) => (cur === "EUR" ? eur(n) : `${Math.round(n)} ${cur}`);
  const aq = { place: city, from: trip.from, to: trip.to };
</script>

<Modal title={t("xp.title")} {onclose} wide>
  <div class="xp">
    {#if !city}
      <p class="warnline">{t("xp.noPlace")}</p>
    {:else}
      <p class="muted small xp-where">📍 {city} · 📅 {when}</p>
      <div class="xp-tabs" role="tablist">
        <button role="tab" class="xp-tab" class:on={explore.tab === "events"} aria-selected={explore.tab === "events"} onclick={() => (explore.tab = "events")}>🎟 {t("xp.events")}</button>
        <button role="tab" class="xp-tab" class:on={explore.tab === "tours"} aria-selected={explore.tab === "tours"} onclick={() => (explore.tab = "tours")}>🎡 {t("xp.tours")}</button>
      </div>

      {#if explore.tab === "events"}
        <form class="ev-find" onsubmit={findEvents}>
          <label class="f ev-grow">{t("xp.kw")}<input type="search" enterkeyhint="search" bind:value={kw} placeholder={t("xp.kwPh")} /></label>
          <button class="btn" disabled={evBusy}>{evBusy ? t("evs.busy") : t("evs.go")}</button>
        </form>
        {#if evErr}<p class="warnline">{evErr}</p>{/if}
        {#if evBusy && !events}<p class="muted small">{t("evs.busy")}</p>{/if}
        {#if events}
          {#if !events.length && !evErr}<p class="muted small">{t("xp.noEvents")}</p>{/if}
          <div class="xp-list">
            {#each events as h (h.id)}
              <article class="xp-card xp-ev">
                <div class="xp-b">
                  <b>{h.name}</b>
                  <span class="muted small">{dayShort(h.start.slice(0, 10))}{h.start.length > 10 ? ` ${h.start.slice(11, 16)}` : ""}{h.venue ? ` · ${h.venue}` : ""}{h.category ? ` · ${h.category}` : ""}</span>
                  {#if h.price}<span class="xp-price">{t("xp.from", { p: money(h.price.min, h.price.currency) })}</span>{/if}
                </div>
                <div class="xp-acts">
                  {#if h.url}<a class="linkbtn" href={h.url} target="_blank" rel="noopener noreferrer">{t("xp.tickets")} ↗</a>{/if}
                  <button class="btn xp-take" class:primary={!taken[h.id]} disabled={taken[h.id]} onclick={() => take(h.id, () => eventItem(h))}>{taken[h.id] ? t("xp.taken") : t("xp.take")}</button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      {:else}
        {#if toBusy}<p class="muted small">{t("evs.busy")}</p>{/if}
        {#if toErr}<p class="warnline">{toErr}</p>{/if}
        {#if toursOff}
          <p class="muted small">{t("xp.toursSetup")}</p>
        {:else if tours}
          {#if !tours.length && !toErr}<p class="muted small">{t("xp.noTours")}</p>{/if}
          <div class="xp-list">
            {#each tours as a (a.id)}
              <article class="xp-card xp-tour">
                {#if a.image}<img class="xp-img" src={a.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={e => ((e.currentTarget as HTMLImageElement).hidden = true)} />{/if}
                <div class="xp-b">
                  <b>{a.title}</b>
                  <span class="muted small">{a.rating ? `★ ${a.rating.toFixed(1)}${a.reviews ? ` (${a.reviews})` : ""}` : ""}{a.rating && a.minutes ? " · " : ""}{a.minutes ? `⏱ ${duration(a.minutes)}` : ""}</span>
                  {#if a.price}<span class="xp-price">{t("xp.from", { p: money(a.price, a.currency) })}</span>{/if}
                </div>
                <div class="xp-acts">
                  {#if a.url}<a class="linkbtn" href={a.url} target="_blank" rel="noopener noreferrer">{t("xp.details")} ↗</a>{/if}
                  <button class="btn xp-take" class:primary={!taken[a.id]} disabled={taken[a.id]} onclick={() => take(a.id, () => activityItem(a))}>{taken[a.id] ? t("xp.taken") : t("xp.take")}</button>
                </div>
              </article>
            {/each}
          </div>
          {#if tours.some(a => a.sponsored)}<p class="muted small">* {t("fs.partnerNote")}</p>{/if}
        {/if}
        <p class="muted small xp-more">{t("xp.more")} <a href={getYourGuideLink(aq)} target="_blank" rel="noopener noreferrer">GetYourGuide ↗</a> · <ViatorLink q={aq} /> · <a href={tiqetsLink(aq)} target="_blank" rel="noopener noreferrer">Tiqets ↗</a></p>
        {#if partner.on && !tours?.some(a => a.sponsored)}<p class="muted small">* {t("fs.partnerNote")}</p>{/if}
      {/if}
      <p class="muted small">{t("xp.hint")}</p>
    {/if}
  </div>
</Modal>
