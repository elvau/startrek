<script lang="ts">
  /*
   * Tagesplan: Tag für Tag, was passiert. Flüge, Unterkünfte, Event und Posten mit Tag kommen automatisch dazu,
   * eigene Einträge („Abendessen“, „Ruhetag“, „Zug nach Dubrovnik“) und eine Überschrift je Tag trägt man hier ein.
   */
  import { locale, t } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { uid, type NoteKind } from "../model";
  import { itinerary, KIND_ICON, NOTE_KINDS, unplanned, type Day } from "../itinerary";
  import { showItem } from "./showItem";
  import { range } from "../format";
  import { tripRoute } from "../routeApp";
  import { ensureAirports, ensureGeo } from "../geo/geo.svelte";
  import RouteMini from "./RouteMini.svelte";
  import RouteMap from "./RouteMap.svelte";
  import { reveal } from "./reveal";
  import { icsHref, icsName, planEvents, toIcs } from "../calendar";

  const days = $derived(itinerary(app.trip));
  // Reiseroute: Vorschau ohne Karte, auf Klick Karte mit Bild und Animation
  $effect(() => { void ensureGeo(app.trip).catch(() => {}); void ensureAirports().catch(() => {}); });
  const route = $derived(tripRoute(app.trip));
  let mapOpen = $state(false);
  const sub = $derived([app.trip.place, app.trip.from ? range(app.trip.from, app.trip.to || app.trip.from) : ""].filter(Boolean).join(" · "));
  const open = $derived(unplanned(app.trip));
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
  {#if open.length && !access.readonly}
    <div class="dp-open card" use:reveal>
      <span class="dlabel">{t("day.unplanned")}</span>
      <p class="muted small">{t("day.unplannedHint")}</p>
      {#each open as it (it.id)}
        <label class="dp-o"><span>{it.name}</span>
          <select value="" onchange={e => plan(it.id, e.currentTarget.value)} aria-label={t("day.pickDay", { name: it.name })}>
            <option value="">{t("day.pick")}</option>
            {#each days as d (d.date)}<option value={d.date}>{t("day.n", { n: d.n })} · {wd(d.date)}</option>{/each}
          </select>
        </label>
      {/each}
    </div>
  {/if}
  <ol class="dp" use:reveal>
    {#each days as day (day.date)}
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
    {/each}
  </ol>
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
  .dp-open { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; margin-bottom: 12px; border-inline-start: 4px solid var(--c-attractions); }
  .dp-open p { margin: -4px 0 2px; }
  .dp-o { display: flex; justify-content: space-between; gap: 10px; align-items: center; font-size: 14px; font-weight: 600; flex-wrap: wrap; }
  .dp-o select { max-width: 60%; font-size: 13.5px; padding-top: 6px; padding-bottom: 6px; }
  .dp-cal { margin: 0 0 10px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
</style>
