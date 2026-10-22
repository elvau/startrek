<script lang="ts">
  // Kreuzfahrt bearbeiten (#516): Schiff & Route (Häfen zum Antippen, Seetage), Kabinen & Preis mit Angeboten
  import { untrack } from "svelte";
  import { arrow, t, tn, type Key } from "../i18n/index.svelte";
  import { CABIN_TYPES, isActive, uid, type Cabin, type Item, type Option, type Port } from "../model";
  import { app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { dayShort } from "../format";
  import { addDays, okDate } from "../calc/travel";
  import { portTime, routeLine, suggestCabins, syncCruise, withoutCabin } from "../cruise";
  import { ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf, suggestCities, type CityHit } from "../geo/places";

  let { item, opt, fresh = false }: { item: Item; opt: Option | undefined; fresh?: boolean } = $props();
  const cr = $derived(item.cruise!);
  // neu, solange keine Kabine einen Preis hat (das geschätzte Trinkgeld zählt nicht): Abschnitte offen
  const start = untrack(() => fresh || !item.options.some(o => o.cabins?.some(c => c.price > 0)));
  const people = $derived(app.trip.travelers.filter(isActive));
  // Zeitraum, Pauschalpreis und Teilnehmende bei jeder Änderung nachziehen
  $effect(() => {
    JSON.stringify(item.cruise); JSON.stringify(item.options.map(o => o.cabins)); void item.chosen;
    untrack(() => syncCruise(item));
  });

  // Häfen mit Ortssuche (#518): Land und Lage für Einreise, Karte und Anreise
  $effect(() => { void ensureGeo(app.trip).catch(() => {}); });
  let portFocus = $state(false);
  const prefer = $derived([...new Set([ccOf(geo, app.trip.country), ...cr.ports.map(p => p.cc)].filter((x): x is string => !!x))]);
  const portSugg = (q: string | undefined) => (portFocus && q ? suggestCities(geo, q, prefer).filter(h => h.name !== q.trim()) : []);
  function pickPort(p: Port, h: CityHit) {
    p.place = h.name; p.cc = h.cc; p.lat = h.lat; p.lon = h.lon;
    portFocus = false;
  }
  // getippt: genau ein bekannter Ort mit diesem Namen → Land und Lage gleich übernehmen (die Liste zeigt ihn dann nicht mehr)
  function typedPort(p: Port) {
    portFocus = true;
    const exact = p.place?.trim() ? suggestCities(geo, p.place, prefer).find(h => h.name === p.place!.trim()) : undefined;
    p.cc = exact?.cc; p.lat = exact?.lat; p.lon = exact?.lon;
  }
  // Hafen zum Bearbeiten (Index); neue Kreuzfahrt: erster Hafen offen
  let open = $state<number | null>(untrack(() => (start && !item.cruise?.ports[0]?.place ? 0 : null)));
  const last = $derived(cr.ports.length - 1);
  function tag(i: number) { return i === 0 ? t("cr.embark") : i === last ? t("cr.disembark") : ""; }
  function timeOf(p: Port) {
    const tm = portTime(p);
    if (tm.arr && tm.dep) return `${tm.arr}–${tm.dep}`;
    if (tm.dep) return t("cr.depAt", { t: tm.dep });
    if (tm.arr) return t("cr.arrAt", { t: tm.arr });
    return "";
  }
  // neuer Hafen bzw. Seetag vor der Ausschiffung, Datum einen Tag nach dem vorigen
  function addPort(sea: boolean) {
    const at = Math.max(1, cr.ports.length - 1), prev = cr.ports[at - 1]?.date;
    const p: Port = { date: okDate(prev) ? addDays(prev, 1) : "", ...(sea ? { sea: true } : { place: "" }) };
    cr.ports.splice(at, 0, p);
    open = sea ? null : at;
  }
  function dropPort(i: number) {
    if (cr.ports.length <= 2) return;
    cr.ports.splice(i, 1);
    open = null;
  }
  const routeSum = $derived([item.cruise?.ship, routeLine(item, arrow()), item.from && item.to && calc.T.items[item.id]?.stay?.nights.length ? tn("n.nights", calc.T.items[item.id]!.stay!.nights.length) : ""].filter(Boolean).join(" · ") || t("ie.open"));

  // Kabinen
  const cabins = $derived(opt?.cabins || []);
  const missing = $derived(withoutCabin(opt, app.trip));
  function addCabin() {
    if (!opt) return;
    opt.cabins = [...cabins, { id: uid(), type: cabins[cabins.length - 1]?.type || "inside", price: 0, who: missing.slice(0, 2).map(x => x.id) }];
  }
  function dropCabin(id: string) { if (opt) opt.cabins = cabins.filter(c => c.id !== id); }
  function suggest() {
    if (!opt) return;
    // Typ und Preise bleiben, soweit es gleich viele Kabinen sind
    const s = suggestCabins(people, cabins[0]?.type);
    opt.cabins = s.map((c, i) => (cabins[i] ? { ...c, type: cabins[i].type, price: cabins[i].price, per: cabins[i].per } : c));
  }
  // eine Person ist in höchstens einer Kabine: beim Hinzufügen aus der anderen nehmen
  function toggle(c: Cabin, id: string) {
    if (!opt) return;
    if (c.who.includes(id)) { c.who = c.who.filter(x => x !== id); return; }
    for (const o of cabins) if (o !== c && o.who.includes(id)) o.who = o.who.filter(x => x !== id);
    c.who = [...c.who, id];
  }
  const num = (v: string) => { const n = Number(String(v).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
  function addOffer() {
    if (!opt) return;
    const o: Option = { ...JSON.parse(JSON.stringify(opt)), id: uid(), label: "", source: undefined, pkg: undefined };
    item.options.push(o);
    item.chosen = o.id;
  }
  function dropOffer() {
    if (item.options.length < 2 || !opt) return;
    item.options = item.options.filter(o => o.id !== opt.id);
    item.chosen = item.options[0].id;
  }
  const cabinSum = $derived(`${tn("n.cabins", cabins.length)} · ${eur(calc.T.items[item.id]?.base ?? calc.T.items[item.id]?.net ?? 0)}${item.options.length > 1 ? ` · ${tn("n.offers", item.options.length)}` : ""}`);
</script>

<details class="ed-acc cr-sec" data-sec="route" open={start}>
  <summary><span class="dlabel">{t("cr.route")}</span><span class="ed-sum">{routeSum}</span></summary>
  <div class="ed-row">
    <label class="f grow">{t("cr.line")}<input class="cr-linein" bind:value={cr.line} /></label>
    <label class="f grow">{t("cr.ship")}<input class="cr-shipin" bind:value={cr.ship} /></label>
  </div>
  <div class="cr-plist">
    {#each cr.ports as p, i (i)}
      <button type="button" class="cr-pl" class:on={open === i} class:seaday={p.sea} aria-expanded={open === i} onclick={() => (open = open === i ? null : i)}>
        <span class="d">{okDate(p.date) ? dayShort(p.date) : "–"}</span>
        <b>{p.sea ? t("cr.sea") : p.place?.trim() || t("cr.port")}</b>
        <span class="tm">{p.sea ? "" : timeOf(p)}</span>
        {#if tag(i)}<span class="tag">{tag(i)}</span>{/if}
      </button>
      {#if open === i}
        <div class="cr-pedit">
          {#if !p.sea}
            {@const sg = portSugg(p.place)}
            <label class="f cr-pname">{t("cr.port")}<input class="cr-port" bind:value={p.place} placeholder={t("cr.portPh")} autocomplete="off"
              onfocus={() => (portFocus = true)} onblur={() => setTimeout(() => (portFocus = false), 150)}
              oninput={() => typedPort(p)} />
              {#if sg.length}<div class="sugg">{#each sg as h (h.cc + h.name)}<button type="button" onmousedown={e => e.preventDefault()} onclick={() => pickPort(p, h)}>{h.name} <small class="muted">{h.land}</small></button>{/each}</div>{/if}
            </label>
          {/if}
          <label class="f">{t("ks.date")}<input class="cr-date" type="date" bind:value={p.date} /></label>
          {#if !p.sea}
            <label class="f">{t("cr.arr")}<input class="cr-arr" type="time" value={p.arr ?? ""} onchange={e => (p.arr = e.currentTarget.value || undefined)} /></label>
            <label class="f">{t("cr.dep")}<input class="cr-dep" type="time" value={p.dep ?? ""} onchange={e => (p.dep = e.currentTarget.value || undefined)} /></label>
          {/if}
          {#if cr.ports.length > 2}<button type="button" class="linkbtn danger cr-pdrop" onclick={() => dropPort(i)}>{t("cr.dropPort")}</button>{/if}
        </div>
      {/if}
    {/each}
  </div>
  <div class="ed-row">
    <button type="button" class="linkbtn cr-addport" onclick={() => addPort(false)}>+ {t("cr.addPort")}</button>
    <button type="button" class="linkbtn cr-addsea" onclick={() => addPort(true)}>+ {t("cr.addSea")}</button>
  </div>
  <p class="muted small">{t("cr.periodHint")}</p>
</details>

{#if opt}
  <details class="ed-acc cr-sec" data-sec="cabins" open={start}>
    <summary><span class="dlabel">{t("cr.cabins")}</span><span class="ed-sum">{cabinSum}</span></summary>
    {#if item.options.length > 1}
      <div class="chips">
        {#each item.options as o, i (o.id)}
          <button class="chip" class:on={o.id === opt.id} onclick={() => (item.chosen = o.id)}>{o.label || t("ie.offerN", { n: i + 1 })}</button>
        {/each}
      </div>
    {/if}
    <div class="ed-row">
      <label class="f grow">{t("ie.offer")}<input bind:value={opt.label} placeholder={t("ie.offerPh")} /></label>
      <label class="f">{t("ie.currency")}<input class="short" bind:value={opt.price.currency} maxlength="3" /></label>
    </div>
    {#each cabins as c, i (c.id)}
      <div class="cr-cabed" data-cabin={i}>
        <div class="hd">{t("cr.cabin", { n: i + 1 })} <button type="button" class="cr-x" aria-label={t("cr.dropCabin")} onclick={() => dropCabin(c.id)}>×</button></div>
        <div class="ed-row">
          <label class="f">{t("cr.type")}<select class="cr-type" bind:value={c.type}>{#each CABIN_TYPES as k (k)}<option value={k}>{t(`cr.type.${k}` as Key)}</option>{/each}</select></label>
          <label class="f">{t("cr.price")}<input class="n cr-price" inputmode="decimal" value={c.price || ""} oninput={e => (c.price = num(e.currentTarget.value))} /></label>
          <label class="f">{t("cr.per")}<select value={c.per || "cabin"} onchange={e => (c.per = e.currentTarget.value === "person" ? "person" : undefined)}>
            <option value="cabin">{t("cr.perCabin")}</option><option value="person">{t("cr.perPerson")}</option></select></label>
        </div>
        <div class="chips">
          {#each people as p (p.id)}<button type="button" class="chip" class:on={c.who.includes(p.id)} onclick={() => toggle(c, p.id)}>{p.name || t("trav.noName")}</button>{/each}
        </div>
      </div>
    {/each}
    <div class="ed-row">
      <button type="button" class="linkbtn cr-addcabin" onclick={addCabin}>+ {t("cr.addCabin")}</button>
      <button type="button" class="linkbtn cr-suggest" onclick={suggest}>{t("cr.suggest")}</button>
    </div>
    {#if missing.length}<p class="cr-warn">⚠ {t("cr.noCabin", { list: missing.map(x => x.name || "?").join(", ") })}</p>{/if}
    <p class="muted small">{t("cr.cabinHint")}</p>
    <div class="ed-row">
      <button class="linkbtn" onclick={addOffer}>+ {t("ie.addOffer")}</button>
      {#if item.options.length > 1}<button class="linkbtn danger" onclick={dropOffer}>{t("ie.dropOffer")}</button>{/if}
    </div>
  </details>
{/if}

<style>
  .cr-plist { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--paper); }
  .cr-pl { display: grid; grid-template-columns: 6em 1fr auto auto; gap: 10px; align-items: baseline; padding: 8px 12px; font: inherit; font-size: 14px; text-align: start; color: var(--ink); background: none; border: 0; border-top: 1px solid var(--line); cursor: pointer; }
  .cr-pl:first-child { border-top: 0; }
  .cr-pl .d { font-size: 12.5px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .cr-pl .tm { font-size: 13px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .cr-pl .tag { font-size: 11.5px; font-weight: 700; color: var(--a); }
  .cr-pl.seaday b { font-weight: 500; color: var(--ink-3); font-style: italic; }
  .cr-pl.on { background: var(--a-soft); }
  .cr-pedit { display: grid; grid-template-columns: 1.6fr 1.2fr .8fr .8fr; gap: 8px; padding: 8px 12px 12px; background: var(--a-soft); align-items: end; }
  .cr-pedit > * { min-width: 0; }
  .cr-pedit .f input { width: 100%; box-sizing: border-box; background: var(--paper); }
  .cr-pdrop { grid-column: 1 / -1; justify-self: start; }
  .cr-pname { position: relative; }
  .cr-cabed { border: 1px solid var(--line); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: var(--paper-2); }
  .cr-cabed .hd { display: flex; gap: 8px; align-items: center; font-weight: 700; font-size: 13.5px; }
  .cr-x { margin-inline-start: auto; border: 0; background: none; color: var(--ink-3); font-size: 18px; padding: 2px 6px; cursor: pointer; }
  .cr-cabed .f input, .cr-cabed .f select { background: var(--paper); }
  .cr-warn { font-size: 13px; color: var(--warn); font-weight: 600; margin: 0; }
  @media (max-width: 640px) {
    .cr-pedit { grid-template-columns: 1fr 1fr; }
    .cr-pname { grid-column: 1 / -1; }
    .cr-pedit .f input { padding: 8px 4px; }
    .cr-pl { grid-template-columns: 5.4em 1fr auto; gap: 8px; padding: 8px 10px; }
    .cr-pl .tag { grid-column: 2; margin-top: -4px; }
  }
</style>
