<script lang="ts">
  /*
   * Tagesplan: Tag für Tag, was passiert. Flüge, Unterkünfte, Event und Posten mit Tag kommen automatisch dazu,
   * eigene Einträge („Abendessen“, „Ruhetag“, „Zug nach Dubrovnik“) und eine Überschrift je Tag trägt man hier ein.
   * Leere Tage stehen nur als schmale Zeile da (#331); über „+“ aufklappen. Am „+“ eines Tages lassen sich Posten ohne Tag
   * zuordnen oder eigene Einträge mit Uhrzeit anlegen.
   */
  import { autoName, i18n, locale, t, tn } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { hhKey, isActive, uid, type NoteKind } from "../model";
  import { dayRows, itinerary, KIND_ICON, NOTE_KINDS, unplanned, type Day } from "../itinerary";
  import { showItem } from "./showItem";
  import { range } from "../format";
  import { tripRoute } from "../routeApp";
  import { ensureAirports, ensureGeo } from "../geo/geo.svelte";
  import RouteMini from "./RouteMini.svelte";
  import RouteMap from "./RouteMap.svelte";
  import { reveal } from "./reveal";
  import { icsHref, icsName, planEvents, toIcs } from "../calendar";
  import { roadPlan } from "../road/road.svelte";
  import { LONG_H, withPauses } from "../road/trip";
  import { HOLIDAY_SOURCE, holidayName, holidayPlace, workdayHolidays, type HolidayData } from "../holidays";
  import { loadHolidays } from "../holidaysApp.svelte";
  import { imp } from "../importantState.svelte";
  import { dir } from "../directory.svelte";
  import { countryName } from "../geo/locations";

  // Feiertage (#163): im Reiseland als Eintrag am Tag, im Wohnland als Hinweis (Urlaubstage); Termine über den Such-Dienst
  let hol = $state<Record<string, HolidayData | null>>({});
  const homeCc = $derived.by(() => {
    const ccs = app.trip.travelers.filter(isActive).map(x => app.trip.households?.[hhKey(x)]).filter(h => h?.geo).map(h => h!.cc || "DE");
    return ccs[0] || dir.prefs?.plzCc || holidayPlace(dir.prefs?.holidays)?.cc || "DE";
  });
  $effect(() => {
    for (const cc of [...new Set([homeCc, ...imp.countries])].slice(0, 4)) if (!(cc in hol)) { hol[cc] = null; void loadHolidays(cc).then(d => (hol[cc] = d)); }
  });
  const homeRegion = $derived(holidayPlace(dir.prefs?.holidays)?.cc === homeCc ? holidayPlace(dir.prefs?.holidays)?.region : undefined);
  const homeHols = $derived(app.trip.from && app.trip.to && hol[homeCc] ? workdayHolidays(hol[homeCc]!.public, app.trip.from, app.trip.to, homeRegion) : []);

  // Roadtrip (#201): Fahrtage mit Strecke, Fahrzeit (mit Pausen) und Hinweis bei langen Etappen
  const rplan = $derived(roadPlan(app.trip));
  const days = $derived.by(() => {
    const ds = itinerary(app.trip);
    // Feiertage im Reiseland: landesweite und regionale (mit Hinweis), je Tag einmal je Name
    for (const cc of imp.countries) for (const h of hol[cc]?.public || []) for (const d of ds) {
      if (d.date < h.from || d.date > h.to) continue;
      const name = holidayName(h, i18n.lang), key = `hol:${cc}:${d.date}:${name}`;
      if (d.entries.some(e => e.key === key)) continue;
      d.entries.unshift({ key, kind: "holiday", text: t("day.holiday", { name }), order: "00:01",
        sub: [imp.countries.length > 1 ? countryName(cc) : "", h.nationwide ? t("day.holidaySub") : t("day.holidayRegional")].filter(Boolean).join(" · ") });
    }
    for (const [i, e] of (rplan?.etappen || []).entries()) {
      const d = ds.find(x => x.date === e.date);
      if (!d) continue;
      if (e.ferry) {
        const f = e.ferry, h = e.min;
        d.entries.unshift({ key: `ferry:${i}`, kind: "ferry", text: `${f.from.name} → ${f.to.name}`, order: "08:30",
          sub: [t("road.ferryH", { h: `${Math.floor(h / 60)}:${String(h % 60).padStart(2, "0")} h` }), f.ferry.night ? t("road.night") : "", f.ferry.ops.join(", ")].filter(Boolean).join(" · ") });
        continue;
      }
      const h = withPauses(e.min), long = h > LONG_H * 60;
      d.entries.unshift({ key: `drive:${i}`, kind: "drive", text: `${e.from.name} → ${e.to.name}`, order: "08:00",
        sub: [t("day.drive", { km: Math.round(e.km), h: `${Math.floor(h / 60)}:${String(h % 60).padStart(2, "0")}` }), long ? `⚠ ${t("road.long", { h: LONG_H })}` : ""].filter(Boolean).join(" · ") });
    }
    return ds;
  });
  // Reiseroute: Vorschau ohne Karte, auf Klick Karte mit Bild und Animation
  $effect(() => { void ensureGeo(app.trip).catch(() => {}); void ensureAirports().catch(() => {}); });
  const route = $derived(tripRoute(app.trip));
  let mapOpen = $state(false);
  const sub = $derived([app.trip.place, app.trip.from ? range(app.trip.from, app.trip.to || app.trip.from) : ""].filter(Boolean).join(" · "));
  const open = $derived(unplanned(app.trip));
  // aufgeklappte leere Tage (nur in dieser Ansicht)
  let opened = $state<string[]>([]);
  const rows = $derived(dayRows(days, new Set(opened)));
  function openGap(gap: Day[]) { opened = [...opened, ...gap.map(d => d.date)]; startAdd(gap[0].date); }
  const wd = (d: string) => new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

  // Eintrag hinzufügen: ein offenes Formular zur Zeit
  let adding = $state<string | null>(null);
  let kind = $state<NoteKind>("see");
  let text = $state("");
  let time = $state("");
  let to = $state("");
  function startAdd(d: string) { adding = d; kind = "see"; text = ""; time = ""; to = ""; }
  function add(e: Event) {
    e.preventDefault();
    if (!adding || !text.trim()) return;
    const days = (app.trip.days ||= {});
    const p = (days[adding] ||= {});
    (p.notes ||= []).push({ id: uid(), text: text.trim(), kind, ...(time ? { time } : {}), ...(kind === "move" && to.trim() ? { to: to.trim() } : {}) });
    adding = null;
  }
  function remove(d: string, id: string) {
    const p = app.trip.days?.[d];
    if (!p?.notes) return;
    p.notes = p.notes.filter(n => n.id !== id);
    tidy(d);
  }
  function setTitle(d: string, v: string) {
    const days = (app.trip.days ||= {});
    const p = (days[d] ||= {});
    if (v.trim()) p.title = v.trim(); else delete p.title;
    tidy(d);
  }
  /** leere Tage nicht speichern */
  function tidy(d: string) {
    const p = app.trip.days?.[d];
    if (p && !p.title && !p.notes?.length) delete app.trip.days![d];
    if (app.trip.days && !Object.keys(app.trip.days).length) delete app.trip.days;
  }
  function plan(id: string, d: string) {
    const it = app.trip.items.find(i => i.id === id);
    if (it) { if (d) it.day = d; else delete it.day; }
    adding = null;
  }
  const go = (id?: string) => { if (id) showItem(id); };
  const hint = (day: Day) => day.title || day.auto || "";
</script>

{#if route.points.length > 1}
  <article class="card dp-route" use:reveal>
    <div class="dp-rh"><h3>🗺 {t("route.title")}</h3>
      <button class="btn sm dp-rbtn" aria-expanded={mapOpen} onclick={() => (mapOpen = !mapOpen)}>{mapOpen ? t("route.close") : t("route.open")}</button></div>
    {#if mapOpen}<RouteMap {route} {days} title={app.trip.name || app.trip.place || t("trip")} {sub} />
    {:else}<button class="dp-prev" onclick={() => (mapOpen = true)} aria-label={t("route.open")}><RouteMini {route} w={640} h={180} label={t("route.title")} /></button>{/if}
  </article>
{/if}
{#if !days.length}
  <p class="muted dp-none">{t("day.none")}</p>
{:else}
  <!-- Kalender-Export: Tagesplan mit Flügen, Check-in/-out und Einträgen (Ortszeiten) -->
  <p class="dp-cal small"><a class="btn sm" href={icsHref(toIcs(planEvents(app.trip, days), app.trip.name || app.trip.place))} download={icsName(app.trip.name || app.trip.place)}>📅 {t("cal.plan")}</a> <span class="muted">{t("cal.planNote")}</span></p>
  {#if homeHols.length}<p class="small dp-homehol">🏠 {tn("day.homeHol", homeHols.length, { list: homeHols.map(h => `${wd(h.from)} ${holidayName(h, i18n.lang)}`).join(", ") })}</p>{/if}
  {#if open.length && !access.readonly}<p class="muted small dp-open">📌 {tn("day.unplannedN", open.length)}</p>{/if}
  <ol class="dp" use:reveal>
    {#each rows as r ("gap" in r ? `gap:${r.gap[0].date}` : r.day.date)}
      {#if "gap" in r}
        <li class="dp-gap">
          <span class="muted small">{r.gap.length === 1 ? t("day.gapOne", { n: r.gap[0].n }) : t("day.gapMany", { a: r.gap[0].n, b: r.gap.at(-1)!.n })}</span>
          {#if !access.readonly}<button class="linkbtn dp-gap-add" aria-label={t("day.openGap")} title={t("day.openGap")} onclick={() => openGap(r.gap)}>+</button>{/if}
        </li>
      {:else}
      {@const day = r.day}
      <li class="dp-day" class:moved={day.moved}>
        <div class="dp-h">
          <span class="dp-n">{t("day.n", { n: day.n })}</span>
          <span class="dp-d">{wd(day.date)}</span>
          {#if day.place}<span class="dp-p">📍 {day.place}</span>{/if}
        </div>
        {#if access.readonly}
          {#if hint(day)}<b class="dp-title">{hint(day)}</b>{/if}
        {:else}
          <input class="dp-title-in" value={day.title || ""} placeholder={day.auto || t("day.titlePh")} aria-label={t("day.titleLabel", { n: day.n })}
            onchange={e => setTitle(day.date, e.currentTarget.value)} />
        {/if}
        <ul class="dp-list">
          {#each day.entries as e (e.key)}
            <li class="dp-e dp-{e.kind}">
              <span class="dp-ic" aria-hidden="true">{KIND_ICON[e.kind]}</span>
              {#if e.time}<span class="dp-t num">{e.time}</span>{/if}
              {#if e.itemId}<button class="linkbtn dp-x" onclick={() => go(e.itemId)}>{e.text}</button>{:else}<span class="dp-x">{e.text}</span>{/if}
              {#if e.noteId && !access.readonly}<button class="dp-del" aria-label={t("day.remove", { text: e.text })} onclick={() => remove(day.date, e.noteId!)}>×</button>{/if}
              {#if e.sub || e.who}<small class="muted">{[e.sub, e.who].filter(Boolean).join(" · ")}</small>{/if}
            </li>
          {/each}
        </ul>
        {#if !access.readonly}
          {#if adding === day.date}
            <form class="dp-add" onsubmit={add}>
              {#if open.length}
                <div class="dp-un"><span class="small muted">{t("day.unplanned")}:</span>
                  {#each open as it (it.id)}<button type="button" class="chip sm dp-assign" onclick={() => plan(it.id, day.date)}>📌 {autoName(it.name)}</button>{/each}
                </div>
              {/if}
              <div class="chips" role="radiogroup" aria-label={t("day.kind")}>
                {#each NOTE_KINDS as k (k)}<button type="button" role="radio" aria-checked={kind === k} class="chip sm" class:on={kind === k} onclick={() => (kind = k)}>{KIND_ICON[k]} {t(`day.k.${k}`)}</button>{/each}
              </div>
              <div class="dp-row">
                <input class="dp-text" bind:value={text} placeholder={t(`day.ph.${kind}`)} aria-label={t("day.what")} />
                {#if kind === "move"}<input class="dp-to" bind:value={to} placeholder={t("day.toPh")} aria-label={t("day.to")} />{/if}
                <input class="dp-time" type="time" bind:value={time} aria-label={t("day.time")} />
                <button class="btn sm primary" disabled={!text.trim()}>{t("day.addBtn")}</button>
                <button type="button" class="btn sm" onclick={() => (adding = null)}>{t("cancel")}</button>
              </div>
            </form>
          {:else}
            <button class="linkbtn small dp-plus" onclick={() => startAdd(day.date)}>+ {t("day.add")}</button>
          {/if}
        {/if}
      </li>
      {/if}
    {/each}
  </ol>
  {#if homeHols.length || days.some(d => d.entries.some(e => e.kind === "holiday"))}<p class="muted small dp-holsrc">{t("day.holSource", { src: HOLIDAY_SOURCE })}</p>{/if}
{/if}

<style>
  .dp-route { padding: 14px 16px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px; }
  .dp-rh { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .dp-rh h3 { margin: 0; font-size: 17px; }
  .dp-prev { border: 0; background: var(--paper-2); border-radius: 14px; padding: 0; overflow: hidden; cursor: pointer; display: flex; justify-content: center; }
  .dp-prev :global(svg) { width: 100%; height: auto; }
  .dp { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .dp-day { background: var(--paper); border: 1px solid var(--line); border-radius: 18px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; border-inline-start: 4px solid var(--c-plan); }
  .dp-day.moved { border-inline-start-color: var(--c-transport); }
  .dp-h { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
  .dp-n { font-weight: 800; font-size: 15px; }
  .dp-d { color: var(--ink-2); font-size: 13.5px; }
  .dp-p { margin-inline-start: auto; font-size: 13px; color: var(--ink-2); }
  .dp-title-in { font-family: inherit; border: 0; border-bottom: 1px dashed var(--line); background: transparent; font-weight: 700; font-size: 15px; padding: 2px 0; color: var(--ink); width: 100%; }
  .dp-title-in::placeholder { color: var(--ink-3); font-weight: 600; }
  .dp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .dp-e { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-size: 14px; padding: 3px 0; }
  .dp-ic { width: 20px; text-align: center; }
  .dp-t { font-weight: 700; font-size: 13px; color: var(--ink-2); min-width: 40px; }
  .dp-x { text-align: start; }
  .dp-e small { flex-basis: 100%; padding-inline-start: 28px; font-size: 12px; }
  .dp-del { margin-inline-start: auto; border: 0; background: none; color: var(--ink-3); font-size: 16px; cursor: pointer; }
  .dp-plus { align-self: flex-start; }
  .dp-add { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }
  .dp-add input { font-family: inherit; }
  .dp-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .dp-text { flex: 1 1 180px; min-width: 0; }
  .dp-to { flex: 0 1 140px; min-width: 0; }
  .dp-time { width: 110px; }
  .dp-open, .dp-homehol { margin: 0 0 10px; }
  .dp-holsrc { margin: 8px 0 0; }
  .dp-gap { display: flex; align-items: center; gap: 8px; padding: 2px 16px; border-inline-start: 4px dashed var(--line); margin-inline-start: 0; }
  .dp-gap-add { font-size: 18px; font-weight: 700; padding: 0 6px; }
  .dp-un { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .dp-cal { margin: 0 0 10px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
</style>
