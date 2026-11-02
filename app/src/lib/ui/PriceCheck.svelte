<script lang="ts">
  /*
   * Preise prüfen nach dem Übernehmen aus dem Katalog (#652, Entwurf mit Dani 02.11.): startet von selbst, sobald die Reise
   * einen Reisebeginn hat (sonst fragt die Karte danach). Je Posten: gesucht, Richtwert → gefundener Preis pro Person,
   * nichts gefunden oder ohne Suche (Mietwagen, vor Ort). Antippen zeigt den Posten.
   */
  import { untrack } from "svelte";
  import { locale, t } from "../i18n/index.svelte";
  import { eur } from "../calc";
  import { access, app } from "../store.svelte";
  import { FLIGHTS_URL, nearestAirports, offerToOption, passengers, searchFlights } from "../flights/app";
  import { defaultStayQuery, searchStaysRemote, stayToOption } from "../stays/app";
  import { activityItem, searchActivitiesRemote } from "../activities/app";
  import { airportData, ensureAirports } from "../geo/geo.svelte";
  import { airportsNear, destAround, resolveLoc } from "../geo/locations";
  import { applyStart, checkPrices, checkSum, MAX_APS, pointsOf, toCheck, type PriceDeps, type PriceRow } from "../catalog/pricecheck";
  import { hasAccount, idToken } from "../cloud/cloud.svelte";
  import { today } from "../today";
  import { showItem } from "./showItem";

  let running = $state(false);
  let rows = $state<PriceRow[]>([]);
  let pending = $state<string[]>([]);
  let start = $state("");
  const cat = $derived(app.trip.catalog);
  const shown = $derived(running ? rows : cat?.check?.rows || []);
  const sum = $derived(checkSum(shown));
  const nameOf = (id: string) => app.trip.items.find(i => i.id === id)?.name || "–";

  const deps: PriceDeps = {
    stays: q => searchStaysRemote(q).then(r => r.offers),
    flights: q => searchFlights(q).then(r => r.offers),
    tours: q => searchActivitiesRemote(q).then(r => r.activities),
    stayQuery: (trip, item, place) => ({ ...defaultStayQuery(trip, item, "all"), place }),
    pax: (trip, ids) => passengers(trip, ids),
    homeAirports: (trip, ids, home) => {
      const near = home ? airportsNear(airportData, home, 150, MAX_APS).map(a => a.code) : [];
      return near.length ? near : nearestAirports(trip, MAX_APS, ids);
    },
    // Ort als Stadt oder Flughafen, sonst Flughäfen im Umkreis der Lage (Inseln wie Mallorca)
    dest: (place, near) => {
      const l = resolveLoc(airportData, place, near?.cc) ?? (near ? destAround(airportData, { name: place, ...near }).best : null);
      return l ? { to: l.code, toAirports: l.airports, ...(l.kind === "city" ? { toCityCode: l.code } : {}) } : null;
    },
    stayOption: (o, n, q) => ({ ...stayToOption(o, n, q.place), query: { place: q.place, country: q.country, checkin: q.checkin, checkout: q.checkout, adults: q.adults, childAges: [...q.childAges], rooms: q.rooms } }),
    flightOption: o => offerToOption(o),
    tourOption: h => activityItem(h).options[0],
    lang: locale()
  };

  async function run() {
    const trip = app.trip;
    if (running || !trip.catalog) return;
    running = true; rows = [];
    pending = toCheck(trip).map(i => i.id);
    try {
      await ensureAirports().catch(() => {});
      const done = await checkPrices(trip, deps, r => { rows = [...rows, r]; pending = pending.filter(x => x !== r.item); });
      void send(trip, done);
    } finally { running = false; pending = []; }
  }
  /**
   * Preispunkte an den Katalog (#652 Teil 2): nur mit Konto, einmal je Reise; nur Beträge pro Person, Monat, Gruppengröße,
   * Ort bzw. Tour bzw. Entfernung, ohne Anbieter, Links und Konto (der Such-Dienst zählt nur je Tag mit)
   */
  async function send(trip: typeof app.trip, done: PriceRow[]) {
    const c = trip.catalog;
    if (!c || c.sent || !hasAccount() || !FLIGHTS_URL) return;
    const points = pointsOf(trip, done);
    if (!points.length) return;
    try {
      const token = await idToken();
      if (!token) return;
      const r = await fetch(`${FLIGHTS_URL}/catalog/price`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ entry: c.id, points }) });
      if (r.ok || r.status === 429) c.sent = today();
    } catch { /* nächster Versuch beim nächsten Prüfen */ }
  }
  function begin() { if (!start) return; applyStart(app.trip, start); void run(); }

  // von selbst: einmal je Reise, sobald der Reisebeginn feststeht
  let started = "";
  $effect(() => {
    const c = app.trip.catalog, id = app.trip.id;
    if (!c || c.check || !app.trip.from || access.readonly || !FLIGHTS_URL || started === id) return;
    started = id;
    untrack(() => void run());
  });
  const again = $derived(!running && shown.some(r => r.state === "none" || r.state === "err"));
</script>

{#if cat && !cat.hide}
  <article class="card pc" aria-live="polite">
    <div class="pc-h">
      <h3>🔎 {t("pc.title")}</h3>
      {#if !running}<button class="linkbtn pc-x" onclick={() => { if (app.trip.catalog) app.trip.catalog.hide = true; }} aria-label={t("pc.hide")} title={t("pc.hide")}>×</button>{/if}
    </div>
    {#if !app.trip.from}
      <p class="muted small">{t("pc.needDate")}</p>
      <div class="pc-date">
        <input type="date" bind:value={start} aria-label={t("pc.when")} />
        <button class="btn primary pc-go" disabled={!start || access.readonly} onclick={begin}>{t("pc.start")}</button>
      </div>
    {:else}
      {#if !shown.length && !pending.length}<p class="muted small">{t("pc.lead")}</p>{/if}
      <ul class="pc-rows">
        {#each shown as r (r.item)}
          <li class="pc-{r.state}">
            <button class="pc-row" onclick={() => showItem(r.item)}>
              <span class="pc-ico" aria-hidden="true">{r.state === "ok" ? "✓" : r.state === "skip" ? "–" : r.state === "none" ? "○" : "!"}</span>
              <span class="pc-name">{nameOf(r.item)}</span>
              <small class="pc-v">{r.state === "ok" ? t("pc.ok", { est: r.est ? `~${eur(r.est)}` : "–", pp: eur(r.pp || 0) }) : t(`pc.${r.state}`)}</small>
            </button>
          </li>
        {/each}
        {#each pending as id (id)}<li class="pc-wait"><span class="pc-row"><span class="pc-ico" aria-hidden="true">…</span><span class="pc-name">{nameOf(id)}</span><small class="pc-v">{t("pc.wait")}</small></span></li>{/each}
      </ul>
      {#if sum.n && !running}<p class="pc-sum"><b>{t("pc.sum", { est: eur(sum.est), pp: eur(sum.pp) })}</b></p>{/if}
      {#if shown.length && !running}<p class="muted small">{t("pc.note")}</p>{/if}
      {#if again && !access.readonly}<button class="btn pc-again" onclick={run}>{t("pc.again")}</button>{/if}
    {/if}
  </article>
{/if}

<style>
  .pc { display: grid; gap: 10px; }
  .pc-h { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pc-h h3 { margin: 0; font-size: 17px; }
  .pc-x { min-width: 44px; min-height: 44px; font-size: 22px; line-height: 1; }
  .pc p { margin: 0; }
  .pc-date { display: flex; gap: 8px; flex-wrap: wrap; }
  .pc-date input { flex: 1; min-width: 150px; min-height: 44px; border-radius: 10px; border: 1px solid var(--line); background: var(--paper-2); color: var(--ink); padding: 0 10px; font: inherit; }
  .pc-go, .pc-again { min-height: 44px; }
  .pc-rows { list-style: none; margin: 0; padding: 0; display: grid; }
  .pc-rows li { border-top: 1px solid var(--line); }
  .pc-row { display: grid; grid-template-columns: 22px 1fr; column-gap: 8px; width: 100%; min-height: 44px; padding: 6px 0; background: none; border: 0; color: var(--ink); text-align: start; font: inherit; align-items: center; }
  .pc-v { grid-column: 2; color: var(--ink-2); font-size: 13px; }
  .pc-name { font-weight: 600; overflow-wrap: anywhere; }
  .pc-ico { grid-row: span 2; font-weight: 800; text-align: center; }
  .pc-ok .pc-ico { color: var(--good); }
  .pc-none .pc-ico, .pc-err .pc-ico { color: var(--warn); }
  .pc-wait { opacity: .7; }
  .pc-sum { font-size: 15px; }
</style>
