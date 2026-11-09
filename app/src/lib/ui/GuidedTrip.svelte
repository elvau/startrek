<script lang="ts">
  /*
   * Geführte neue Reise (#672, Epic #671): Wohin, Wann, Wer, Von wo, je eine Frage pro Bildschirm, jede überspringbar.
   * Danach ist die Reise ausgefüllt (Ziel, Zeitraum oder Monat bzw. Dauer, Personen, Wohnorte je Familie).
   * „Von wo“ fällt weg, wenn der Wohnort bekannt ist (Konto oder letzte Reise) und alle von einem Ort starten.
   * Rechnungen in guided.ts; Bausteine: WhoPicker, HomeInput, HolidayPicker, Ferien über den Such-Dienst.
   */
  import { tick, untrack } from "svelte";
  import { i18n, locale, t, tn, type Key } from "../i18n/index.svelte";
  import { app, startTrip } from "../store.svelte";
  import { dir } from "../directory.svelte";
  import { myHome } from "../prefs";
  import { geo } from "../geo/geo.svelte";
  import { countryNames, loadGeo, suggestCities } from "../geo/places";
  import { dayShort, dateDE } from "../format";
  import { holidayName, holidayPlace, holidaysIn, type Holiday } from "../holidays";
  import { loadHolidays } from "../holidaysApp.svelte";
  import { householdRegion } from "../plzRegion";
  import { animalEmoji, animalName } from "../placeholders";
  import { whoCount, whoGroupName, whoMissing, whoTripName } from "../who";
  import { addDays, daysBetween, defaultRange, holSpan, monthSpan, nextMonths, openStarts, startHouseholds, whenDates, whenPrefs, type FlexLen, type Starts, type When, type WhenMode } from "../guided";
  import type { Home } from "../home";
  import WhoPicker, { newWho, whoTravelers } from "./WhoPicker.svelte";
  import HomeInput from "./HomeInput.svelte";
  import HolidayPicker from "./HolidayPicker.svelte";
  import RangeSlider from "./RangeSlider.svelte";

  let { onclose, ongroups, step = $bindable(0) }: { onclose: () => void; ongroups: () => void; step?: number } = $props();

  const today = new Date().toISOString().slice(0, 10);
  loadGeo(geo, []);

  // bekannter Wohnort: Konto, sonst die zuletzt offene Reise
  const known = untrack((): Home | undefined => {
    const h = myHome(dir);
    if (h?.lat != null) return { cc: h.cc || "DE", plz: h.plz || "", ort: h.ort, lat: h.lat, lon: h.lon };
    const prev = Object.values(app.trip.households || {}).find(x => x.geo);
    return prev?.geo ? { cc: prev.cc || "DE", plz: prev.plz || "", ort: prev.geo.ort, lat: prev.geo.lat, lon: prev.geo.lon } : undefined;
  });

  // Wohin
  let q = $state("");
  let dest = $state<{ place: string; country: string } | null>(null);
  let focusQ = $state(false);
  const hits = $derived.by(() => {
    if (!focusQ || dest || q.trim().length < 2) return [];
    const s = q.trim().toLowerCase();
    const lands = countryNames(geo).filter(c => c.toLowerCase().startsWith(s)).slice(0, 2).map(c => ({ place: c, country: "", sub: t("gt.country") }));
    const cities = suggestCities(geo, q, known?.cc ? [known.cc] : [], 5).map(h => ({ place: h.name, country: h.land, sub: h.land }));
    return [...lands, ...cities].slice(0, 5);
  });
  function pickDest(d: { place: string; country: string }) { dest = d; q = d.country ? `${d.place}, ${d.country}` : d.place; focusQ = false; }

  // Wann
  let when = $state<When>({ mode: "days" });
  const months = nextMonths(today);
  let holRegion = $state<string | undefined>(untrack(() => householdRegion(known)?.region || dir.prefs?.holidays || "DE-NW"));
  let holList = $state<Holiday[] | null>(null);
  let holLoading = $state(false);
  $effect(() => {
    if (when.mode !== "hol") return;
    const p = holidayPlace(holRegion);
    if (!p) { holList = []; return; }
    holLoading = true;
    void loadHolidays(p.cc).then(d => {
      const end = addDays(today, 400);
      const seen = new Set<string>();
      holList = d ? holidaysIn(d.school, today, end, p.region).filter(h => h.to >= today && daysBetween(h.from, h.to) >= 2 && !seen.has(h.from + h.to) && !!seen.add(h.from + h.to)) : [];
      holLoading = false;
    });
  });
  const span = $derived(when.mode === "month" && when.month && !when.open ? monthSpan(when.month) : when.mode === "hol" && when.hol ? holSpan(when.hol) : null);
  const dates = $derived(whenDates(when));
  const nn = $derived(dates.from && dates.to ? daysBetween(dates.from, dates.to) : 0);
  function setMode(m: WhenMode) { when = { ...when, mode: m }; }
  function pickMonth(m: string) { const s = monthSpan(m); const [a, b] = defaultRange(s.start, s.max); when = { ...when, month: m, a, b, open: false }; }
  function pickHol(h: Holiday) { const s = holSpan(h); const [a, b] = defaultRange(s.start, s.max); when = { ...when, hol: { from: h.from, to: h.to }, a, b }; }
  const monthLabel = (m: string) => new Intl.DateTimeFormat(locale(), { month: "short" }).format(new Date(`${m}-15T12:00:00Z`));
  const FLEX: FlexLen[] = ["weekend", "week", "twoWeeks", "long"];
  const MODES: WhenMode[] = ["days", "month", "hol", "flex"];
  const hv = (h?: Home) => (h ? { cc: h.cc, plz: h.plz, ort: h.ort } : null);

  // Wer
  let who = $state(newWho());
  const missing = $derived(whoMissing(who));
  const groupName = $derived(whoGroupName(who, dir));
  const createLabel = $derived(groupName ? t("who.createWith", { name: groupName, p: tn("n.persons", whoCount(who)) }) : t("newtrip.create"));

  // Von wo: je Familie (Familien als Tiere), je Teil der Gruppe (Gruppe als Tiere), sonst ein Ort für alle
  const placeholders = $derived(who.src !== "saved" && who.src !== "new");
  const fams = $derived(who.mode === "family" && placeholders ? who.fams : []);
  const groupN = $derived(who.mode === "group" && placeholders ? whoCount(who) : 0);
  const many = $derived(fams.length > 1 || groupN > 1);
  let same = $state(true);
  let one = $state<Home | undefined>(untrack(() => known));
  let famHomes = $state<(Home | undefined)[]>([]);
  let parts = $state<{ home?: Home; n: number }[]>([]);
  $effect(() => { if (groupN && !parts.length) parts = [{ home: known, n: groupN }]; });
  const starts = $derived<Starts>(!many || same ? { kind: "same", home: one } : fams.length > 1 ? { kind: "fams", homes: fams.map((_, i) => famHomes[i] ?? (i === 0 ? known : undefined)) } : { kind: "parts", parts });
  const rest = $derived(many && !same ? openStarts(starts, fams.length > 1 ? fams.length : groupN) : 0);
  const partsSum = $derived(parts.reduce((n, p) => n + p.n, 0));
  function partN(i: number, d: number) { const p = parts[i]; p.n = Math.max(0, Math.min(p.n + d, p.n + Math.max(0, groupN - partsSum))); }

  // Schritte; „Von wo“ nur, wenn nötig
  const steps = $derived<("where" | "when" | "who" | "from")[]>(known && !many ? ["where", "when", "who"] : ["where", "when", "who", "from"]);
  const cur = $derived(steps[Math.min(step, steps.length - 1)]);
  const last = $derived(step >= steps.length - 1);
  let body = $state<HTMLElement>();
  async function go(n: number) {
    step = Math.max(0, Math.min(steps.length - 1, n));
    await tick();
    body?.scrollTo?.({ top: 0 });
    body?.querySelector<HTMLElement>("h3")?.focus();
  }
  function skip() {
    if (cur === "where") { dest = null; q = ""; }
    if (cur === "when") when = { mode: "days" };
    if (cur === "who" && missing) who = newWho();
    if (cur === "from") { same = true; one = known; }
    if (last) create(); else void go(step + 1);
  }
  const canNext = $derived(cur === "who" ? !missing : cur === "when" ? (when.mode !== "month" || !!when.month) && (when.mode !== "hol" || !!when.hol) : true);
  function next() { if (!canNext) return; if (last) create(); else void go(step + 1); }

  function create() {
    if (whoMissing(who)) who = newWho();
    const travelers = whoTravelers(who);
    const place = dest?.place || q.trim().split(",")[0].trim();
    const country = dest?.country || (dest ? "" : q.split(",")[1]?.trim() || "");
    const region = when.mode === "hol" && when.hol ? holRegion : undefined;
    startTrip(travelers, whoTripName(who, m => t("who.nameGroup", { a: `${animalEmoji(m)} ${animalName(m)}` })), {
      place, country, ...whenDates(when), households: startHouseholds(travelers, starts, region), prefs: whenPrefs(when)
    });
    onclose();
  }
  const range = (a: string, b: string) => t("range.fromTo", { a: dayShort(a), b: dayShort(b) });
</script>

<form class="newtrip gt" onsubmit={e => { e.preventDefault(); next(); }}>
  <div class="gt-top">
    <button type="button" class="gt-nav gt-back" style:visibility={step ? "visible" : "hidden"} onclick={() => go(step - 1)}>‹ {t("gt.back")}</button>
    <span class="gt-dots" role="img" aria-label={t("gt.step", { n: step + 1, m: steps.length })}>{#each steps as s, i (s)}<i class:on={i <= step}></i>{/each}</span>
    <button type="button" class="gt-nav gt-skip" onclick={skip}>{t("gt.skip")}</button>
  </div>

  <div class="gt-body" bind:this={body}>
    <span class="dlabel">{t("gt.step", { n: step + 1, m: steps.length })}</span>
    {#if cur === "where"}
      <h3 tabindex="-1">{t("gt.where")}</h3>
      <label class="gt-field"><span aria-hidden="true">⌕</span>
        <input class="gt-q" bind:value={q} placeholder={t("gt.wherePh")} autocomplete="off" aria-label={t("gt.where")}
          onfocus={() => (focusQ = true)} oninput={() => (dest = null)} onblur={() => setTimeout(() => (focusQ = false), 150)} /></label>
      {#if hits.length}
        <div class="gt-sugg" role="listbox" aria-label={t("gt.where")}>
          {#each hits as h (h.place + h.country)}<button type="button" role="option" aria-selected="false" onmousedown={e => e.preventDefault()} onclick={() => pickDest(h)}><b>{h.place}</b><small>{h.sub}</small></button>{/each}
        </div>
      {/if}
      <button type="button" class="gt-alt" onclick={() => { dest = null; q = ""; void go(step + 1); }}><b>{t("gt.dunno")}</b><small>{t("gt.dunnoSub")}</small></button>

    {:else if cur === "when"}
      <h3 tabindex="-1">{t("gt.when")}</h3>
      <div class="gt-seg" role="group" aria-label={t("gt.when")}>
        {#each MODES as m (m)}<button type="button" class:on={when.mode === m} aria-pressed={when.mode === m} onclick={() => setMode(m)}>{t(`gt.mode.${m}` as Key)}</button>{/each}
      </div>
      {#if when.mode === "days"}
        <div class="gt-dates">
          <label class="f">{t("te.from")}<input type="date" min={today} value={when.from || ""} onchange={e => (when = { ...when, from: e.currentTarget.value })} /></label>
          <label class="f">{t("te.to")}<input type="date" min={when.from || today} value={when.to || ""} onchange={e => (when = { ...when, to: e.currentTarget.value })} /></label>
        </div>
      {:else if when.mode === "month"}
        <div class="gt-months">
          {#each months as m (m)}<button type="button" class="chip" class:on={when.month === m} aria-pressed={when.month === m} onclick={() => pickMonth(m)}>{monthLabel(m)}<small>{m.slice(0, 4)}</small></button>{/each}
        </div>
        {#if when.month}<button type="button" class="chip gt-open" class:on={when.open} aria-pressed={!!when.open} onclick={() => (when = { ...when, open: !when.open })}>{t("gt.daysOpen")}</button>{/if}
      {:else if when.mode === "hol"}
        <div class="gt-hol"><span class="dlabel">{t("gt.holWhere")}</span>
          <HolidayPicker value={holRegion} empty={t("gt.holPick")} onchange={v => { holRegion = v; when = { ...when, hol: undefined }; }} /></div>
        {#if known}<p class="small muted">{t("gt.holKnown")}</p>{/if}
        {#if holLoading}<p class="small muted">{t("gt.holLoading")}</p>
        {:else if holList && !holList.length}<p class="small muted">{t("gt.holNone")}</p>
        {:else if holList}
          <div class="chips gt-hols">
            {#each holList as h (h.from + h.to)}<button type="button" class="chip" class:on={when.hol?.from === h.from && when.hol?.to === h.to} aria-pressed={when.hol?.from === h.from} onclick={() => pickHol(h)}>{holidayName(h, i18n.lang)}<small>{dateDE(h.from)}–{dateDE(h.to)}</small></button>{/each}
          </div>
        {/if}
      {:else}
        <p class="small muted">{t("gt.flexHint")}</p>
        <div class="chips">{#each FLEX as f (f)}<button type="button" class="chip" class:on={when.flex === f} aria-pressed={when.flex === f} onclick={() => (when = { ...when, flex: f })}>{t(`gt.flex.${f}` as Key)}</button>{/each}</div>
      {/if}
      {#if span}
        <RangeSlider max={span.max} bind:a={() => when.a ?? defaultRange(span.start, span.max)[0], v => (when = { ...when, a: v })} bind:b={() => when.b ?? defaultRange(span.start, span.max)[1], v => (when = { ...when, b: v })}
          labelA={t("gt.depart")} labelB={t("gt.return")} startText={dateDE(span.start)} endText={dateDE(addDays(span.start, span.max))} />
      {/if}
      {#if dates.from && dates.to}<p class="gt-range" aria-live="polite"><b>{range(dates.from, dates.to)}</b> · {tn("n.nights", nn)}</p>
      {:else if when.mode === "month" && when.month && when.open}<p class="small muted">{t("gt.monthOpen")}</p>
      {:else if when.mode === "month" && !when.month}<p class="small muted">{t("gt.monthHint")}</p>{/if}

    {:else if cur === "who"}
      <h3 tabindex="-1">{t("newtrip.who")}</h3>
      <WhoPicker bind:who />
      <!-- bei Solo steht derselbe Hinweis schon im WhoPicker -->
      <p class="small muted">{#if who.mode !== "solo"}{t("gt.whoLater")} {/if}<button type="button" class="linkbtn" onclick={ongroups}>{t("groups.manage")}</button></p>

    {:else}
      <h3 tabindex="-1">{t("gt.from")}</h3>
      <p class="small muted">{t(many ? "gt.fromHintMany" : "gt.fromHint")}</p>
      {#if many}
        <div class="gt-seg gt-seg2" role="group" aria-label={t("gt.from")}>
          <button type="button" class:on={same} aria-pressed={same} onclick={() => (same = true)}>{t("gt.same")}</button>
          <button type="button" class:on={!same} aria-pressed={!same} onclick={() => (same = false)}>{t("gt.diff")}</button>
        </div>
      {/if}
      {#if !many || same}
        <HomeInput cls="f gt-home" label={t("gt.home")} value={hv(one)} onpick={h => (one = h)} onclear={() => (one = undefined)} />
      {:else if fams.length > 1}
        {#each fams as f, i (f.animal)}
          <HomeInput cls="f gt-home" label="{animalEmoji(f.animal)} {animalName(f.animal)}" value={hv(famHomes[i] ?? (i === 0 ? known : undefined))}
            onpick={h => (famHomes[i] = h)} onclear={() => (famHomes[i] = undefined)} />
        {/each}
      {:else}
        {#each parts as p, i (i)}
          <div class="gt-part">
            <div class="gt-part-h"><b>{t("gt.startN", { n: i + 1 })}</b>
              <span class="gt-step"><button type="button" class="btn" aria-label={t("gt.fewer")} onclick={() => partN(i, -1)}>−</button><output>{p.n}</output><button type="button" class="btn" aria-label={t("gt.more")} onclick={() => partN(i, 1)}>+</button><small class="muted">{t("gt.persons")}</small></span>
              {#if i > 0}<button type="button" class="btn ghost" aria-label={t("gt.removeStart")} onclick={() => parts.splice(i, 1)}>×</button>{/if}
            </div>
            <HomeInput cls="f gt-home" label={t("gt.home")} value={hv(p.home)} onpick={h => (p.home = h)} onclear={() => (p.home = undefined)} />
          </div>
        {/each}
        <button type="button" class="gt-alt" onclick={() => parts.push({ n: Math.max(0, groupN - partsSum) })}><b>+ {t("gt.addStart")}</b><small>{t("gt.addStartSub")}</small></button>
      {/if}
      {#if rest}<p class="small muted">{tn(fams.length > 1 ? "gt.restFam" : "gt.rest", rest)}</p>{/if}
    {/if}
  </div>

  <div class="gt-foot">
    <button class="btn primary gt-next" disabled={!canNext}>{last ? createLabel : t("gt.next")}</button>
  </div>
  {#if cur === "who" && missing}<p class="small muted gt-miss">{t(missing as Key)}</p>{/if}
</form>

<style>
  .gt { display: flex; flex-direction: column; gap: 10px; }
  .gt-top { display: flex; align-items: center; gap: 6px; }
  .gt-nav { min-height: var(--tap); padding: 0 8px; border: 0; border-radius: var(--r-s); background: transparent; color: var(--ink-2); font: inherit; font-weight: 600; font-size: var(--fs-b); white-space: nowrap; }
  .gt-nav:hover { background: var(--paper-2); }
  .gt-dots { flex: 1; display: flex; justify-content: center; gap: 6px; }
  .gt-dots i { width: 26px; height: 6px; border-radius: var(--r-pill); background: var(--line); transition: background .3s; }
  .gt-dots i.on { background: var(--a); }
  .gt-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .gt-body h3 { font-size: 28px; line-height: 1.1; margin: 0; outline: none; }
  .gt-field { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 14px; border: 2px solid var(--line); border-radius: var(--r-m); background: var(--paper); }
  .gt-field:focus-within { border-color: var(--a); }
  .gt-field input { flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; font-size: var(--fs-l); font-weight: 600; color: var(--ink); outline: none; }
  .gt-sugg { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-m); overflow: hidden; }
  .gt-sugg button { min-height: 50px; border: 0; background: var(--paper); color: var(--ink); text-align: start; padding: 4px 14px; display: flex; flex-direction: column; justify-content: center; font: inherit; }
  .gt-sugg button + button { border-top: 1px solid var(--line); }
  .gt-sugg small, .gt-alt small { color: var(--ink-3); font-size: var(--fs-s); }
  .gt-alt { min-height: 52px; border: 1.5px dashed var(--line); border-radius: var(--r-m); background: transparent; color: var(--ink); text-align: start; padding: 8px 14px; display: flex; flex-direction: column; justify-content: center; font: inherit; }
  .gt-seg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 4px; background: var(--paper-2); border-radius: var(--r-m); }
  .gt-seg2 { grid-template-columns: 1fr 1fr; }
  .gt-seg button { min-height: var(--tap); border: 0; border-radius: var(--r-s); background: transparent; color: var(--ink); font: inherit; font-weight: 600; font-size: var(--fs-b); padding: 0 4px; }
  .gt-seg button.on { background: var(--a); color: var(--on-a); }
  .gt-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .gt-dates input { width: 100%; }
  .gt-months { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .gt-months .chip, .gt-hols .chip { display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.15; padding: 4px 8px; border-radius: var(--r-m); }
  .gt-months small, .gt-hols small { font-weight: 500; font-size: var(--fs-xs); opacity: .8; }
  .gt-open { align-self: flex-start; }
  .gt-hol { display: flex; flex-direction: column; gap: 4px; }
  .gt-range { margin: 0; font-size: var(--fs-l); }
  .gt-part { display: flex; flex-direction: column; gap: 6px; }
  .gt-part-h { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
  .gt-step { display: flex; align-items: center; gap: 6px; }
  .gt-step .btn { min-width: var(--tap); padding: 0; font-size: var(--fs-xl); }
  .gt-step output { min-width: 22px; text-align: center; font-weight: 800; font-variant-numeric: tabular-nums; }
  .gt-foot { display: flex; }
  .gt-next { flex: 1; min-height: 52px; font-size: var(--fs-l); }
  .gt-miss { margin: 0; text-align: center; }
</style>
