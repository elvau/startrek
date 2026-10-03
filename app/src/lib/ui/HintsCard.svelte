<script lang="ts">
  /*
   * Einreise & Tipps: Hinweise je Reiseland und je besonderem Ort mit Links zu offiziellen Stellen; Gebühren vor Ort
   * (Galápagos) lassen sich als Posten übernehmen. Links öffnen erst beim Antippen.
   */
  import { t, type Key } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { GENERAL_LINKS, hintsFor, tripCountries, type Hint } from "../hints";
  import { itinerary } from "../itinerary";
  import { airportData, geo } from "../geo/geo.svelte";
  import { ccOf } from "../geo/places";
  import { locOf } from "../geo/locations";
  import { uid } from "../model";
  import { showItem } from "./showItem";
  import { reveal } from "./reveal";
  import { entryFor, loadVisa, needsAction, type EntryKind, type VisaData } from "../visa";
  import { countryName } from "../geo/locations";
  import { flagOf } from "../format";
  import { isActive } from "../model";
  import { groupLabel } from "../groups";
  import { adviceLevel, adviceUrl, type AdviceMap } from "../advice";

  const countries = $derived(tripCountries(app.trip, n => (n ? ccOf(geo, n) : null), c => locOf(airportData, c, "airport")?.cc));
  const places = $derived([...new Set(itinerary(app.trip).map(d => d.place).filter(Boolean))]);
  // Einreise-Hinweise aus der Liste gelten für deutsche Staatsangehörige
  const hasDe = $derived(app.trip.travelers.filter(isActive).some(p => !p.nat || p.nat === "DE"));
  const list = $derived(hintsFor(app.trip, countries, places).filter(h => h.kind !== "entry" || hasDe));
  const flag = flagOf;
  // Einreise je Land und Staatsangehörigkeit (ohne Angabe: deutsch)
  let visa = $state<VisaData | null>(null);
  $effect(() => { void loadVisa().then(d => (visa = d)); });
  const KIND_KEY: Record<EntryKind, Key> = { home: "ent.home", free: "ent.free", eta: "ent.eta", evisa: "ent.evisa", arrival: "ent.arrival", visa: "ent.visa", none: "ent.none", unknown: "ent.unknown" };
  const entries = $derived.by(() => {
    if (!visa) return [];
    const act = app.trip.travelers.filter(isActive);
    return countries.map(cc => {
      const groups = new Map<string, { kind: EntryKind; days?: number; names: string[]; nat: string }>();
      for (const p of act) {
        const nat = p.nat || "DE", e = entryFor(visa, nat, cc), k = `${nat}|${e.kind}|${e.days ?? ""}`;
        if (!groups.has(k)) groups.set(k, { ...e, names: [], nat });
        groups.get(k)!.names.push(p.name || "?");
      }
      const gs = [...groups.values()].filter(g => g.kind !== "home");
      return { cc, gs, act: gs.some(needsAction) };
    }).filter(x => x.gs.length);
  });
  // Auswärtiges Amt: Warnstufe und Länderseite je Land (über den Such-Dienst)
  let advice = $state<AdviceMap>({});
  $effect(() => { void loadAdvice().then(m => (advice = m)); });
  const LEVEL_KEY = { warning: "aa.warning", partial: "aa.partial", situation: "aa.situation" } as const;
  const mixed = $derived(new Set(app.trip.travelers.filter(isActive).map(p => p.nat || "DE")).size > 1);
  const has = (h: Hint) => app.trip.items.some(i => i.hint === h.id);
  function addFee(h: Hint) {
    if (!h.fee || has(h)) return;
    setDetailed(h.fee.cat, true);
    const it = { id: uid(), cat: h.fee.cat, name: t(`hint.${h.id}.t` as Key), status: "idea" as const, hint: h.id,
      options: [{ id: uid(), label: t("hint.estimate"), estimate: true, price: { mode: "person" as const, currency: h.fee.currency, adult: h.fee.adult, ...(h.fee.child != null ? { child: h.fee.child, infant: h.fee.child } : {}) } }] };
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

<script lang="ts" module>
  import { FLIGHTS_URL as URL_ } from "../flights/app";
  import type { AdviceMap as AM } from "../advice";
  let adv: Promise<AM> | undefined;
  /** einmal je Sitzung; ohne Such-Dienst oder bei Fehlern leer (dann nur der allgemeine Link) */
  function loadAdvice(): Promise<AM> {
    return (adv ??= URL_ ? fetch(`${URL_}/advice`).then(r => (r.ok ? r.json() : null)).then(d => (d?.countries as AM) || {}).catch(() => ({})) : Promise.resolve({}));
  }
</script>

{#if list.length || countries.length}
  <article class="card hints" use:reveal>
    <h3>🛂 {t("hint.title")}</h3>
    <p class="muted small">{mixed ? t("hint.leadMixed") : t("hint.lead")}</p>
    {#if entries.length}
      <!-- Einreise je Reiseland, nach Staatsangehörigkeit (Passport Index Data) -->
      <ul class="hn-entry">
        {#each entries as x (x.cc)}
          {@const a = advice[x.cc]}
          {@const lv = adviceLevel(a)}
          <li class:act={x.act}>
            <b>{flag(x.cc)} {countryName(x.cc)}</b>
            {#if lv}<em class="aa-{lv}">⚠ {t(LEVEL_KEY[lv])}</em>{/if}
            <a class="hn-aa" href={a ? adviceUrl(a) : GENERAL_LINKS[0].url} target="_blank" rel="noopener noreferrer">{t("aa.link")}{a?.modified ? ` (${t("aa.asOf", { d: a.modified.split("-").reverse().join(".") })})` : ""} ↗</a>
            {#each x.gs as g (g.nat + g.kind)}
              <span>{#if mixed}{groupLabel(g.names, -1)} ({flag(g.nat)}):&nbsp;{/if}{t(KIND_KEY[g.kind], { n: g.days ?? 0 })}</span>
            {/each}
          </li>
        {/each}
      </ul>
    {/if}
    {#if list.length}
      <ul class="hn-list">
        {#each list as h (h.id)}
          <li class="hn hn-{h.kind}">
            {#if h.kind === "warn"}<em class="aa-warning hn-warnbadge">⚠ {t("hint.warnBadge")}</em>{/if}
            <b>{#if h.cc}{flag(h.cc[0])}&nbsp;{/if}{t(`hint.${h.id}.t` as Key)}</b>
            <span>{t(`hint.${h.id}.x` as Key)}</span>
            <span class="hn-links">
              {#each h.links as l (l.url)}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>{/each}
              {#if h.fee && !access.readonly}{#if has(h)}<small class="muted">✓ {t("hint.feeAdded")}</small>{:else}<button class="linkbtn hn-fee" onclick={() => addFee(h)}>+ {t("hint.fee")}</button>{/if}{/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if visa?.asOf}<p class="muted small">{t("hint.visaSource", { d: visa.asOf.split("-").reverse().join(".") })}</p>{/if}
    <p class="small hn-general">{t("hint.general")}
      {#each GENERAL_LINKS as l (l.url)} <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>{/each}</p>
  </article>
{/if}

<style>
  .hints { padding: 14px 16px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; border-inline-start: 4px solid var(--c-trav, var(--c-plan)); }
  .hints h3 { margin: 0; font-size: 17px; }
  .hints p { margin: 0; }
  .hn-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .hn { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
  .hn-warn { padding: 10px 12px; border-radius: 12px; outline: 2px solid #c0392b; background: color-mix(in srgb, #c0392b 8%, transparent); }
  .hn-warnbadge { align-self: flex-start; font-style: normal; font-weight: 700; font-size: 12.5px; padding: 1px 8px; border-radius: 999px; }
  .hn-links { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 13px; }
  .hn-general { color: var(--ink-2); }
  .hn-entry { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  .hn-entry li { display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; padding: 6px 10px; border-radius: 10px; background: var(--paper-2); }
  .hn-entry li.act { background: color-mix(in srgb, var(--warn, #d08a12) 14%, transparent); }
  .hn-entry span { color: var(--ink-2); }
  .hn-entry em { font-style: normal; font-weight: 700; font-size: 12.5px; padding: 1px 8px; border-radius: 999px; }
  .aa-warning { background: #c0392b; color: #fff; }
  .aa-partial { background: color-mix(in srgb, #c0392b 18%, transparent); color: #c0392b; }
  .aa-situation { background: color-mix(in srgb, var(--warn, #d08a12) 20%, transparent); }
  .hn-aa { margin-inline-start: auto; font-size: 12.5px; }
  .hn-entry li:has(.aa-warning) { outline: 2px solid #c0392b; }
  .hn-general a { margin-inline-start: 6px; }
</style>
