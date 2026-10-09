<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /* Haushalte: Wohnort (PLZ), Anreise zum Flughafen, Anwesenheit */
  import { access, app } from "../store.svelte";
  import { ACCESS_MODES, hhKey, isActive, type AccessMode, type Household } from "../model";
  import { busOf, ridersOf, roadKm, airportsOf } from "../calc/travel";
  import { ridePrice } from "../transfer";
  import { eur } from "../calc";
  import { presences } from "../calc";
  import { dateDE } from "../format";
  import { loadPlz, suggest, type Place } from "../plz";
  import { hhFocus } from "./hhFocus.svelte";
  import { flashEl } from "./showItem";
  import { untrack } from "svelte";

  const names = $derived([...new Set(app.trip.travelers.filter(isActive).map(hhKey))]);
  const pres = $derived(presences(app.trip));
  let open = $state<string | null>(null);
  let plz = $state<Map<string, Place> | null>(null);
  let q = $state("");

  function hh(name: string): Household {
    app.trip.households ||= {};
    return (app.trip.households[name] ||= { mode: "car", cars: 1 });
  }
  function toggle(name: string) {
    if (access.readonly) return;
    open = open === name ? null : name;
    if (open) hh(name);
    q = app.trip.households?.[name]?.plz || "";
    if (open && !plz) loadPlz().then(m => (plz = m)).catch(() => {});
  }
  // Sprung von der Anfahrt am Flug (#243): Familie aufklappen, hinscrollen, aufleuchten
  $effect(() => {
    if (!hhFocus.n) return;
    const name = hhFocus.name;
    untrack(() => {
      if (!name || !names.includes(name)) return;
      if (open !== name) toggle(name);
      setTimeout(() => flashEl([...document.querySelectorAll<HTMLElement>(".hh")].find(x => x.dataset.hh === name)), 60);
    });
  });
  function pick(name: string, code: string, p: Place) {
    const h = hh(name);
    h.plz = code; h.geo = { lat: p.lat, lon: p.lon, ort: p.ort };
    q = code;
  }
  function typed(name: string, v: string) {
    q = v;
    if (/^\d{5}$/.test(v.trim()) && plz?.get(v.trim())) pick(name, v.trim(), plz.get(v.trim())!);
  }
  const sugg = $derived(plz && open && !/^\d{5}$/.test(q.trim()) ? suggest(plz, q) : []);

  function members(name: string) { return app.trip.travelers.filter(t => isActive(t) && hhKey(t) === name); }
  function presText(name: string) {
    const p = members(name).map(t => pres[t.id]).find(Boolean);
    if (!p) return t("hh.presOpen");
    return `${t("range.fromTo", { a: dateDE(p.a), b: dateDE(p.d) })} · ${p.src === "manual" ? t("hh.ownDates") : t("hh.fromFlight")}`;
  }
  const MODE_KEY: Record<AccessMode, Key> = { car: "hh.byCar", drop: "hh.byDrop", taxi: "hh.byTaxi", train: "hh.byTrain", bus: "hh.byBus", with: "hh.with" };
  const SHORT_KEY: Record<AccessMode, Key> = { car: "hh.car", drop: "hh.drop", taxi: "hh.taxi", train: "hh.train", bus: "hh.bus", with: "hh.with" };
  function accessText(name: string) {
    const h = app.trip.households?.[name];
    if (h?.mode === "with" && h.link) return t("hh.ridesWith", { name: h.link });
    const home = h?.geo ? `${h.plz} ${h.geo.ort}` : t("hh.noHome");
    const m = h?.mode || "car";
    const riders = ridersOf(app.trip, name);
    return `${home} · ${t(SHORT_KEY[m])}${(m === "car" || m === "drop") && (h?.cars || 1) > 1 ? ` × ${h?.cars}` : ""}${riders.length ? ` · ${t("hh.poolWith", { list: riders.join(", ") })}` : ""}`;
  }
  // Richtwerte für die Eingabefelder (Flughafen: der nächste vom Wohnort)
  const nearestAp = (g?: { lat: number; lon: number }) => g ? airportsOf(app.trip).map(a => ({ a, km: roadKm(g, a)! })).sort((x, y) => x.km - y.km)[0] : undefined;
  function taxiHint(name: string) {
    const n = members(name).length + ridersOf(app.trip, name).reduce((a, k) => a + members(k).length, 0);
    const ap = nearestAp(app.trip.households?.[name]?.geo);
    return ap ? t("hh.ridePh", { v: eur(ridePrice(n, ap.km).perRide), ap: ap.a.code }) : "";
  }
  const bus = $derived(busOf(app.trip));
  const busN = $derived(bus.hhs.reduce((a, k) => a + members(k).length, 0));
  const busHint = $derived.by(() => { const ap = nearestAp(bus.geo); return ap ? t("hh.ridePh", { v: eur(2 * ridePrice(busN, ap.km).perRide), ap: ap.a.code }) : ""; });
  /** Anreise für alle Familien auf einmal */
  function setAll(m: AccessMode | "") {
    if (!m) return;
    for (const n of names) { const h = hh(n); h.mode = m; if (m !== "with") delete h.link; }
  }
  function setBus(k: "from" | "price", v: string | number | undefined) {
    const b = (app.trip.bus ||= {});
    if (v === "" || v == null || (typeof v === "number" && !(v > 0))) delete b[k]; else (b as Record<string, unknown>)[k] = v;
    if (!Object.keys(b).length) delete app.trip.bus;
  }
</script>

<div class="hhs">
  <div class="hhs-h"><span class="dlabel">{t("hh.title")}</span>
    {#if names.length > 1 && !access.readonly}
      <!-- alle auf einmal: Gruppenbus, alle mit der Bahn … -->
      <select class="hh-all" value="" aria-label={t("hh.all")} onchange={e => { setAll(e.currentTarget.value as AccessMode | ""); e.currentTarget.value = ""; }}>
        <option value="">{t("hh.all")}</option>
        {#each ACCESS_MODES.filter(m => m !== "with") as m (m)}<option value={m}>{t(MODE_KEY[m])}</option>{/each}
      </select>
    {/if}
  </div>
  {#each names as name (name)}
    <div class="hh" class:open={open === name} data-hh={name}>
      <button class="hh-sum" onclick={() => toggle(name)} aria-expanded={open === name}>
        <b>{name}</b>
        <span>{accessText(name)}</span>
        <span>{presText(name)}</span>
        <span class="hh-car" aria-hidden="true">{open === name ? "▴" : "▾"}</span>
      </button>
      {#if open === name}
        {@const H = app.trip.households![name]}
        <div class="hh-ed">
          <div class="ed-row">
            <label class="f plzf">{t("hh.home")}
              <input value={q} oninput={e => typed(name, e.currentTarget.value)} placeholder={t("hh.homePh")} autocomplete="off" />
              {#if sugg.length}
                <div class="sugg">{#each sugg as [code, p] (code)}<button onclick={() => pick(name, code, p)}><b>{code}</b> {p.ort}</button>{/each}</div>
              {/if}
            </label>
            {#if H.geo}<span class="muted ed-note">📍 {H.geo.ort}</span>{:else if plz}<span class="muted ed-note">{t("hh.notFound")}</span>{/if}
          </div>
          <div class="ed-row">
            <label class="f">{t("hh.access")}
              <select value={H.mode || "car"} onchange={e => { H.mode = e.currentTarget.value as AccessMode; if (H.mode === "with" && !H.link) H.link = names.find(x => x !== name); }}>
                {#each ACCESS_MODES.filter(m => m !== "with" || names.length > 1) as m (m)}<option value={m}>{t(MODE_KEY[m])}</option>{/each}
              </select>
            </label>
            {#if H.mode === "with"}
              <label class="f">{t("hh.at")}
                <select bind:value={H.link}>
                  {#each names.filter(x => x !== name) as o}<option value={o}>{o}</option>{/each}
                </select>
              </label>
            {:else if H.mode === "car" || H.mode === "drop" || !H.mode}
              <label class="f">{t("hh.cars")}<input class="n" type="number" min="1" max="9" bind:value={H.cars} /></label>
            {:else if H.mode === "taxi"}
              <label class="f">{t("hh.ride")}<input class="n hh-ride" type="number" min="0" step="5" value={H.ride ?? ""} placeholder={taxiHint(name)}
                onchange={e => { const v = +e.currentTarget.value; if (v > 0) H.ride = v; else delete H.ride; }} /></label>
            {:else if H.mode === "bus"}
              <label class="f">{t("hh.busFrom")}
                <select value={bus.from ?? ""} onchange={e => setBus("from", e.currentTarget.value)}>
                  {#each bus.hhs as o (o)}<option value={o} disabled={!app.trip.households?.[o]?.geo}>{o}{app.trip.households?.[o]?.geo ? ` · ${app.trip.households[o].geo!.ort}` : ""}</option>{/each}
                </select>
              </label>
              <label class="f">{t("hh.busPrice")}<input class="n hh-busprice" type="number" min="0" step="10" value={app.trip.bus?.price ?? ""} placeholder={busHint}
                onchange={e => setBus("price", +e.currentTarget.value)} /></label>
            {/if}
          </div>
          {#if H.mode === "with" || H.mode === "bus" || H.mode === "drop" || H.mode === "taxi" || ridersOf(app.trip, name).length}
            <p class="muted ed-note hh-acc-note">{H.mode === "bus" ? t("hh.busInfo", { n: busN, list: bus.hhs.join(", ") }) : H.mode === "with" ? t("hh.poolInfo") : H.mode === "drop" ? t("hh.dropInfo") : H.mode === "taxi" ? t("hh.taxiInfo") : t("hh.poolHost", { list: ridersOf(app.trip, name).join(", ") })}</p>
          {/if}
          <div class="ed-row">
            <label class="f">{t("hh.firstNight")}<input type="date" bind:value={H.arrive} /></label>
            <label class="f">{t("hh.departure")}<input type="date" bind:value={H.depart} min={H.arrive} /></label>
            {#if H.arrive || H.depart}<button class="linkbtn" onclick={() => { H.arrive = undefined; H.depart = undefined; }}>{t("hh.useFlight")}</button>
            {:else}<span class="muted ed-note">{t("hh.emptyFlight")}</span>{/if}
          </div>
        </div>
      {/if}
    </div>
  {/each}
</div>
