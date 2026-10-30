<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  import Help from "./Help.svelte";
  /* Haushalte: Wohnort (PLZ), Anreise zum Flughafen, Anwesenheit */
  import { access, app } from "../store.svelte";
  import { ACCESS_MODES, hhKey, isActive, type AccessMode, type Household } from "../model";
  import { busOf, ridersOf, roadKm, airportsOf } from "../calc/travel";
  import { ridePrice } from "../transfer";
  import { eur } from "../calc";
  import { presences } from "../calc";
  import { dateDE } from "../format";
  import { homeText, type Home } from "../home";
  import HomeInput from "./HomeInput.svelte";
  import { hhFocus } from "./hhFocus.svelte";
  import { flashEl } from "./showItem";
  import { untrack } from "svelte";
  import { cloud, cloudSelf, cloudTrip, saveMySelf } from "../cloud/cloud.svelte";
  import { travelerOf } from "../claims";
  import { selfHomeOf } from "../self";
  import SelfFamily from "./SelfFamily.svelte";
  import HolidayPicker from "./HolidayPicker.svelte";
  import { householdRegion } from "../plzRegion";

  const names = $derived([...new Set(app.trip.travelers.filter(isActive).map(hhKey))]);
  const pres = $derived(presences(app.trip));
  let open = $state<string | null>(null);
  // selbst eintragen (#571): die eigene Familie darf ihren Wohnort auch mit „nur ansehen“ setzen
  const ct = $derived(cloudTrip(app.trip.id));
  const claims = $derived(ct?.claims || {});
  const selfs = $derived(cloudSelf.trip === app.trip.id ? cloudSelf.byUid : {});
  const meT = $derived(ct && cloud.user ? travelerOf(app.trip, cloud.user.uid, claims) : undefined);
  const myHh = $derived(meT ? hhKey(meT) : "");
  const selfHome = (name: string) => selfHomeOf(app.trip, name, selfs, claims);

  function hh(name: string): Household {
    app.trip.households ||= {};
    return (app.trip.households[name] ||= { mode: "car", cars: 1 });
  }
  function toggle(name: string) {
    if (access.readonly && name !== myHh) return;
    open = open === name ? null : name;
    if (open && !access.readonly) hh(name);
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
  function setHome(name: string, x: Home) {
    if (name === myHh && ct) void saveMySelf(app.trip.id, { h: { ...(x.plz ? { plz: x.plz } : {}), cc: x.cc, lat: x.lat, lon: x.lon, ort: x.ort } });
    if (access.readonly) return;
    const h = hh(name);
    // neuer Wohnort: Region wieder aus der PLZ schätzen
    delete h.region;
    h.plz = x.plz; h.geo = { lat: x.lat, lon: x.lon, ort: x.ort };
    if (x.cc !== "DE") h.cc = x.cc; else delete h.cc;
  }
  function clearHome(name: string) { const h = hh(name); delete h.plz; delete h.geo; delete h.cc; delete h.region; }

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
    const sh = h?.geo ? undefined : selfHome(name);
    const home = h?.geo ? homeText({ plz: h.plz, ort: h.geo.ort }) : sh?.ort ? homeText({ plz: sh.plz, ort: sh.ort }) : t("hh.noHome");
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
  <div class="hhs-h"><span class="dlabel">{t("hh.title")} <Help k="hh" /></span>
    {#if names.length > 1 && !access.readonly}
      <!-- alle auf einmal: Gruppenbus, alle mit der Bahn … -->
      <select class="hh-all" value="" aria-label={t("hh.all")} onchange={e => { setAll(e.currentTarget.value as AccessMode | ""); e.currentTarget.value = ""; }}>
        <option value="">{t("hh.all")}</option>
        {#each ACCESS_MODES.filter(m => m !== "with") as m (m)}<option value={m}>{t(MODE_KEY[m])}</option>{/each}
      </select>
    {/if}
  </div>
  <SelfFamily />
  {#each names as name (name)}
    <div class="hh" class:open={open === name} data-hh={name}>
      <button class="hh-sum" onclick={() => toggle(name)} aria-expanded={open === name}>
        <b>{name}</b>
        <span>{accessText(name)}</span>
        <span>{presText(name)}</span>
        <span class="hh-car" aria-hidden="true">{open === name ? "▴" : "▾"}</span>
      </button>
      {#if open === name && access.readonly}
        {@const S = selfHome(name)}
        <div class="hh-ed hh-self">
          <div class="ed-row">
            <HomeInput cls="f plzf" label={t("hh.home")} value={{ cc: S?.cc, plz: S?.plz, ort: S?.ort }} onpick={x => setHome(name, x)} onclear={() => {}} />
            {#if S?.ort}<span class="muted ed-note">📍 {S.ort}</span>{/if}
          </div>
          {#if S?.ort}
            {@const R = householdRegion(S)}
            <div class="ed-row hh-region">
              <span class="f">{t("hh.region")}<HolidayPicker value={R?.region} empty={t("hh.regionNone")} onchange={v => S && saveMySelf(app.trip.id, { h: { ...S, ...(v ? { region: v } : {}) } })} /></span>
              {#if R?.guessed}<span class="muted ed-note hh-guess">{R.check ? `⚠ ${t("hh.regionCheck")}` : t("hh.regionGuess")}</span>{/if}
            </div>
          {/if}
          <p class="muted ed-note">{t("self.homeNote")}</p>
        </div>
      {:else if open === name}
        {@const H = app.trip.households![name]}
        <div class="hh-ed">
          <div class="ed-row">
            <HomeInput cls="f plzf" label={t("hh.home")} value={{ cc: H.cc, plz: H.plz, ort: H.geo?.ort }} onpick={x => setHome(name, x)} onclear={() => clearHome(name)} />
            {#if H.geo}<span class="muted ed-note">📍 {H.geo.ort}</span>{/if}
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
              {#if H.mode === "drop"}
                <!-- Spritgeld für den Fahrer: fährt er umsonst, kostet die Anreise nichts -->
                <label class="f">{t("hh.fuel")}
                  <select class="hh-fuel" value={H.dropFree ? "no" : "yes"} onchange={e => { if (e.currentTarget.value === "no") H.dropFree = true; else delete H.dropFree; }}>
                    <option value="yes">{t("hh.fuel.yes")}</option><option value="no">{t("hh.fuel.no")}</option>
                  </select>
                </label>
              {/if}
              {#if H.mode !== "drop" || !H.dropFree}<label class="f">{t("hh.cars")}<input class="n" type="number" min="1" max="9" bind:value={H.cars} /></label>{/if}
              {#if H.mode !== "drop"}
                <!-- Parken am Abflughafen (#419): Richtwert, gebucht mit Preis oder entfällt -->
                <label class="f">{t("hh.park")}
                  <select class="hh-park" value={H.parking?.off ? "off" : H.parking?.paid != null ? "booked" : ""}
                    onchange={e => { const v = e.currentTarget.value; if (v === "off") H.parking = { off: true }; else if (v === "booked") H.parking = { paid: H.parking?.paid ?? 0 }; else delete H.parking; }}>
                    <option value="">{t("hh.park.est")}</option><option value="booked">{t("hh.park.booked")}</option><option value="off">{t("hh.park.off")}</option>
                  </select>
                </label>
                {#if H.parking?.paid != null}<label class="f">{t("hh.parkPaid")}<input class="n hh-parkpaid" type="number" min="0" step="5" value={H.parking.paid || ""}
                  onchange={e => (H.parking = { paid: Math.max(0, +e.currentTarget.value || 0) })} /></label>{/if}
              {/if}
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
          {#if H.mode === "with" || H.mode === "bus" || (H.mode === "drop" && !H.dropFree) || H.mode === "taxi" || ridersOf(app.trip, name).length}
            <p class="muted ed-note hh-acc-note">{H.mode === "bus" ? t("hh.busInfo", { n: busN, list: bus.hhs.join(", ") }) : H.mode === "with" ? t("hh.poolInfo") : H.mode === "drop" ? t("hh.dropInfo") : H.mode === "taxi" ? t("hh.taxiInfo") : t("hh.poolHost", { list: ridersOf(app.trip, name).join(", ") })}</p>
          {/if}
          <div class="ed-row">
            <label class="f">{t("hh.firstNight")}<input type="date" bind:value={H.arrive} /></label>
            <label class="f">{t("hh.departure")}<input type="date" bind:value={H.depart} min={H.arrive} /></label>
            {#if H.arrive || H.depart}<button class="linkbtn" onclick={() => { H.arrive = undefined; H.depart = undefined; }}>{t("hh.useFlight")}</button>
            {:else}<span class="muted ed-note">{t("hh.emptyFlight")}</span>{/if}
          </div>
          {#if H.geo || H.region}
            {@const R = householdRegion(H)}
            <div class="ed-row hh-region">
              <span class="f">{t("hh.region")}<HolidayPicker value={R?.region} empty={t("hh.regionNone")} onchange={v => { if (v) H.region = v; else delete H.region; }} /></span>
              {#if R?.guessed}<span class="muted ed-note hh-guess">{R.check ? `⚠ ${t("hh.regionCheck")}` : t("hh.regionGuess")}</span>{/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
