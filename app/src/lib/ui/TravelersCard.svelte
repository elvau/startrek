<script lang="ts">
  import PetsCard from "./PetsCard.svelte";
  import { access, app } from "../store.svelte";
  import { t, t as tt, tn, type Key } from "../i18n/index.svelte";
  import { ageClass } from "../calc";
  import { isActive, isDetailed, uid, type Group } from "../model";
  import { dir, saveAsGroup, tagGroups, travelersFrom } from "../directory.svelte";
  import { applyPeople, personAge } from "../people";
  import { prefsFor } from "../prefs";
  import Households from "./Households.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import QuickFamilies from "./QuickFamilies.svelte";
  import { animalEmoji, exampleFamily, nextAnimal, placeholderTravelers, type FamilyRow } from "../placeholders";
  import { countryName } from "../geo/locations";
  import { flagOf } from "../format";
  import { loadVisa } from "../visa";

  const COLORS = ["#D2693C", "#2F6FDB", "#C0487A", "#1F8A70", "#D08A12", "#7A5AC8"];
  const L = (c: string) => t(`age.class.${c}` as Key);
  // Staatsangehörigkeiten zur Auswahl: alle Pässe der Einreise-Daten, nach Name sortiert (Deutschland ist leer = Standard)
  let natCodes = $state<string[]>([]);
  $effect(() => { void loadVisa().then(d => { if (d) natCodes = Object.keys(d.m); }); });
  const natList = $derived(natCodes.filter(c => c !== "DE").sort((a, b) => countryName(a).localeCompare(countryName(b))));
  let edit = $state(false);
  let pick = $state(false);
  let groups = $state(false);
  let saved = $state("");
  let quick = $state(false);
  let fams = $state<FamilyRow[]>([]);
  const households = $derived([...new Set(app.trip.travelers.map(t => t.household))]);
  // ab 4 Personen Liste statt Kacheln, nach Familien gruppiert (Vorname je Zeile, Familie als Überschrift)
  const LIST_FROM = 4;
  const list = $derived(app.trip.travelers.length >= LIST_FROM);
  const byHh = $derived(households.map(h => ({ h, ms: app.trip.travelers.map((t, i) => ({ t, i })).filter(x => x.t.household === h) })));
  // Zeilen der Liste: Überschrift nur für Familien mit mehreren Personen (sonst stünde der Name doppelt)
  type Row = { fam: (typeof byHh)[number] } | { t: (typeof app.trip.travelers)[number]; i: number; short: boolean };
  const rows = $derived.by(() => {
    const out: Row[] = [];
    for (const f of byHh) {
      const head = f.ms.length > 1 && households.length > 1;
      if (head) out.push({ fam: f });
      for (const x of f.ms) out.push({ ...x, short: head });
    }
    return out;
  });
  // große Gruppen: erst nur die ersten 4 Personen, der Rest über „Alle anzeigen“
  const FOLD_FROM = 7, FOLD_SHOW = 4;
  let showAll = $state(false);
  const folded = $derived(!showAll && app.trip.travelers.length >= FOLD_FROM);
  const shown = $derived.by(() => {
    if (!folded) return rows;
    const out: Row[] = [];
    let n = 0;
    for (const r of rows) {
      if ("t" in r && ++n > FOLD_SHOW) break;
      out.push(r);
    }
    // Familien-Überschrift ohne Person darunter weglassen
    while (out.length && "fam" in out[out.length - 1]) out.pop();
    return out;
  });
  // auf einen Blick: für wie viele (Erwachsene, Kinder, Kleinkinder) gebucht wird; nur wer dabei ist
  const counts = $derived.by(() => {
    const c = { adult: 0, child: 0, infant: 0 };
    for (const x of app.trip.travelers) if (isActive(x)) c[ageClass(x.age, app.trip.settings, x.kind) as keyof typeof c]++;
    return c;
  });
  function openQuick() { fams = [{ animal: nextAnimal(households), adults: 2, kids: 0, infants: 0 }]; quick = !quick; }
  function addQuick() {
    app.trip.travelers.push(...placeholderTravelers(fams, app.trip.travelers.length));
    quick = false;
  }

  // Person oder Platzhalter aus der Reise nehmen, auch aus den Posten, denen sie zugeordnet ist
  function remove(id: string) {
    const x = app.trip.travelers.find(t => t.id === id);
    if (!x || !confirm(t("trav.removeQ", { name: x.placeholder ? x.name : `${x.name} ${x.household}`.trim() || t("trav.noName") }))) return;
    app.trip.travelers = app.trip.travelers.filter(t => t.id !== id);
    for (const it of app.trip.items) if (it.participants?.includes(id)) it.participants = it.participants.filter(p => p !== id);
    if (replacing === id) replacing = null;
  }

  // Platzhalter durch eine gespeicherte Person ersetzen; Reisender bleibt derselbe (Posten-Zuordnung bleibt)
  let replacing = $state<string | null>(null);
  const repl = $derived(app.trip.travelers.find(t => t.id === replacing) || null);
  const candidates = $derived.by(() => {
    if (!repl) return [];
    const want = ageClass(repl.age, app.trip.settings, repl.kind);
    const free = dir.people.filter(p => !app.trip.travelers.some(t => t.personId === p.id));
    // passende Altersklasse zuerst (ohne Alter gespeichert zählt als passend)
    const fits = (a?: number | null) => a == null || ageClass(a, app.trip.settings) === want;
    const day = app.trip.from || undefined;
    return [...free.filter(p => fits(personAge(p, day))), ...free.filter(p => !fits(personAge(p, day)))];
  });
  function replaceWith(pid: string) {
    const p = dir.people.find(x => x.id === pid);
    if (!repl || !p) return;
    Object.assign(repl, { name: p.first, household: p.last, personId: p.id, placeholder: undefined });
    // bekanntes Alter gilt, sonst bleibt die Altersklasse des Platzhalters
    const age = personAge(p, app.trip.from || undefined);
    if (age != null) { repl.age = age; repl.kind = undefined; }
    replacing = null;
  }

  // Geburtsdatum und Wohnort der gespeicherten Personen übernehmen (Alter zum Reisebeginn, Anfahrt zum Flughafen)
  $effect(() => {
    if (access.readonly) return;
    JSON.stringify(dir.people); app.trip.from; app.trip.travelers.length;
    applyPeople(app.trip, dir.people);
    // Vorliebe „Anfahrt mit der Bahn“: für Familien ohne eigene Wahl
    const acc = prefsFor(app.trip, dir).access;
    if (acc === "train") for (const [k, h] of Object.entries(app.trip.households || {})) if (h.geo && !h.mode) app.trip.households![k] = { ...h, mode: "train" };
  });

  const missing = (s: string) => !s || !s.trim();
  const incomplete = $derived(app.trip.travelers.some(t => missing(t.name) || missing(t.household)));

  function add(e: Event) {
    e.stopPropagation();
    const i = app.trip.travelers.length;
    app.trip.travelers.push({ id: uid(), name: "", household: app.trip.travelers[0]?.household || "", color: COLORS[i % COLORS.length] });
    edit = true;
  }
  function addFrom(ids: string[], g?: Group) {
    app.trip.travelers.push(...tagGroups(travelersFrom(ids, app.trip.travelers, app.trip.from || undefined), g ? [g] : []));
    pick = false;
  }
  function saveGroup() {
    if (incomplete) { edit = true; saved = t("trav.needNames"); return; }
    // Platzhalter bleiben in der Reise und kommen nicht in gespeicherte Gruppen
    const real = app.trip.travelers.filter(t => !t.placeholder);
    if (!real.length) { saved = t("trav.noPlaceholders"); return; }
    const name = prompt(t("trav.groupPrompt", { a: exampleFamily() }), app.trip.name);
    if (!name?.trim()) return;
    const g = saveAsGroup(name, real, app.trip.households);
    saved = t("trav.savedGroup", { name: g.name, p: tn("n.persons", g.memberIds.length) });
    setTimeout(() => (saved = ""), 4000);
  }
</script>

{#snippet person(t: (typeof app.trip.travelers)[number], i: number, short: boolean)}
  {@const emoji = t.placeholder ? animalEmoji(t.household) : null}
  {@const cls = ageClass(t.age, app.trip.settings, t.kind)}
  <div class="person" class:off={!isActive(t)} class:kid={cls !== "adult"}>
    {#if !edit && !access.readonly}<button class="p-x" aria-label={tt("trav.removeAria", { name: t.name || tt("trav.noName") })} title={tt("remove")} onclick={() => remove(t.id)}>×</button>{/if}
    <span class="av" class:emoji style:--ring={t.color || COLORS[i % COLORS.length]} style:background={emoji ? null : t.color || COLORS[i % COLORS.length]}>{emoji || (t.name || "?")[0]}</span>
    {#if edit}
      <!-- ein echter Name macht aus dem Platzhalter eine Person -->
      <input class="inp" class:need={missing(t.name)} bind:value={t.name} oninput={() => (t.placeholder = undefined)} placeholder="{tt('trav.first')} *" aria-label={tt("trav.first")} />
      <input class="inp" class:need={missing(t.household)} bind:value={t.household} oninput={() => (t.placeholder = undefined)} placeholder="{tt('trav.last')} *" aria-label={tt("trav.last")} />
      <label class="in-row"><input class="inp num" type="number" min="0" max="120" bind:value={t.age} placeholder="?" aria-label={tt("trav.age")} /> {tt("trav.years")}</label>
      <!-- Staatsangehörigkeit: für die Einreise-Hinweise (Visum, Reisegenehmigung); leer = deutsch -->
      <select class="inp t-nat" value={t.nat || ""} aria-label={tt("trav.nat")} title={tt("trav.nat")} onchange={e => { const v = e.currentTarget.value; if (v && v !== "DE") t.nat = v; else delete t.nat; }}>
        <option value="">{flagOf("DE")} {countryName("DE")}</option>
        {#each natList as c (c)}<option value={c}>{flagOf(c)} {countryName(c)}</option>{/each}
      </select>
      <!-- zweiter Pass (optional): für die Einreise zählt der günstigere -->
      <select class="inp t-nat2" value={t.nat2 || ""} aria-label={tt("trav.nat2")} title={tt("trav.nat2")} onchange={e => { const v = e.currentTarget.value; if (v && v !== (t.nat || "DE")) t.nat2 = v; else delete t.nat2; }}>
        <option value="">{tt("trav.nat2")}</option>
        {#each ["DE", ...natList] as c (c)}<option value={c}>{flagOf(c)} {countryName(c)}</option>{/each}
      </select>
      <button class="linkbtn danger" onclick={() => remove(t.id)}>{tt("remove")}</button>
    {:else}
      <b>{t.placeholder || short ? t.name || tt("trav.noName") : `${t.name || tt("trav.noName")} ${t.household}`}</b>
      <span>{t.age != null && String(t.age) !== "" ? `${tn("trav.ageYears", Number(t.age))} · ` : ""}{#if cls === "adult"}{L(cls)}{:else}<em class="age-pill {cls}">{L(cls)}</em>{/if}{#if t.nat || t.nat2} <span title={[t.nat || "DE", t.nat2].filter(Boolean).map(c => countryName(c!)).join(" · ")}>· {flagOf(t.nat || "DE")}{t.nat2 ? flagOf(t.nat2) : ""}</span>{/if}{#if list && t.placeholder && !access.readonly}{" · "}<button class="linkbtn repl" class:on={replacing === t.id} onclick={() => { replacing = replacing === t.id ? null : t.id; pick = quick = false; }}>{tt("trav.replace")}</button>{/if}</span>
      <button class="dabei" class:on={isActive(t)} disabled={access.readonly} aria-pressed={isActive(t)}
        onclick={() => (t.active = isActive(t) ? false : undefined)}>{isActive(t) ? `✓ ${tt("trav.in")}` : tt("trav.out")}</button>
      {#if t.placeholder && !access.readonly && !list}
        <button class="linkbtn repl" class:on={replacing === t.id} onclick={() => { replacing = replacing === t.id ? null : t.id; pick = quick = false; }}>{tt("trav.replace")}</button>
      {/if}
    {/if}
  </div>
{/snippet}

<div class="people" class:list class:editing={edit}>
  <!-- beim Bearbeiten nicht gruppieren: sonst springt die Zeile beim Tippen des Nachnamens in eine andere Familie -->
  {#if list}
    <p class="p-sum"><b>👥 {tn("n.persons", counts.adult + counts.child + counts.infant)}</b>
      <span>{counts.adult} {t("age.adultShort")}</span>{#if counts.child}<span>{tn("n.kids", counts.child)}</span>{/if}{#if counts.infant}<span>{counts.infant} {t("age.infantShort")}</span>{/if}</p>
  {/if}
  {#if list && !edit}
    {#each shown as r ("fam" in r ? `f:${r.fam.h}` : r.t.id)}
      {#if "fam" in r}<div class="p-fam"><b>{animalEmoji(r.fam.h) || "👪"} {r.fam.h || tt("trav.noName")}</b> <span class="muted">{tn("n.persons", r.fam.ms.length)}</span></div>
      {:else}{@render person(r.t, r.i, r.short)}{/if}
    {/each}
    {#if app.trip.travelers.length >= FOLD_FROM}
      <button type="button" class="linkbtn p-more" onclick={() => (showAll = !showAll)}>{showAll ? t("trav.showLess") : `▾ ${t("trav.showAll", { n: app.trip.travelers.length })}`}</button>
    {/if}
  {:else}
    {#each app.trip.travelers as t, i (t.id)}{@render person(t, i, false)}{/each}
  {/if}
  {#if !access.readonly}<button class="person add" onclick={add}><span class="av plus">+</span><b>{t("trav.person")}</b></button>{/if}
</div>

{#if !access.readonly && !edit && app.trip.travelers.some(x => x.placeholder)}<p class="muted small ph-note">{t("trav.phNote")}</p>{/if}
{#if !access.readonly}
  <div class="home trav-acts">
    <button class="linkbtn" onclick={e => { e.stopPropagation(); edit = !edit; }}>{edit ? t("done") : t("trav.edit")}</button>
    {#if dir.groups.length || dir.people.length}<button class="linkbtn" onclick={() => (pick = !pick)}>{t("trav.fromGroup")}</button>{/if}
    <button class="linkbtn" onclick={() => { openQuick(); replacing = null; }}>{t("trav.quick")}</button>
    {#if app.trip.travelers.length}<button class="linkbtn" onclick={saveGroup}>{t("trav.saveGroup")}</button>{/if}
    <button class="linkbtn" onclick={() => (groups = true)}>{t("groups.manageShort")}</button>
  </div>
  {#if edit && incomplete}<p class="warnline trav-note">{t("trav.namesRequired")}</p>{/if}
  {#if saved}<p class="muted trav-note">{saved}</p>{/if}
  {#if repl}
    <div class="pick repl-pick">
      <span class="dlabel">{t("trav.replaceWith", { name: repl.name })}</span>
      {#if candidates.length}
        <div class="chips">
          {#each candidates as p (p.id)}
            <button class="chip" onclick={() => replaceWith(p.id)}>{p.first} {p.last}{#if p.age != null} <small>{p.age}</small>{/if}</button>
          {/each}
        </div>
      {:else if dir.people.length}
        <p class="muted small">{t("trav.allIn")}</p>
      {:else}
        <p class="muted small">{t("trav.noPeople")}</p>
      {/if}
      <div class="repl-acts">
        <button class="linkbtn" onclick={() => (groups = true)}>{dir.people.length ? t("groups.manageShort") : t("trav.createPeople")}</button>
        <button class="linkbtn" onclick={() => (replacing = null)}>{t("cancel")}</button>
      </div>
    </div>
  {/if}
  {#if quick}
    <div class="pick quick">
      <QuickFamilies bind:rows={fams} used={households} />
      <button class="btn primary" disabled={!fams.some(r => r.adults + r.kids + (r.infants || 0))} onclick={addQuick}>{t("add")}</button>
      <p class="muted small">{t("trav.quickHint")}</p>
    </div>
  {/if}
  {#if pick}
    <div class="pick">
      {#each dir.groups as g (g.id)}
        {@const neu = g.memberIds.filter(id => !app.trip.travelers.some(t => t.personId === id))}
        <button class="chip" disabled={!neu.length} onclick={() => addFrom(g.memberIds, g)}>{g.name} <small>{neu.length ? `+${neu.length}` : t("trav.allThere")}</small></button>
      {/each}
      {#each dir.people.filter(p => !app.trip.travelers.some(t => t.personId === p.id)) as p (p.id)}
        <button class="chip" onclick={() => addFrom([p.id])}>+ {p.first} {p.last}</button>
      {/each}
    </div>
  {/if}
{/if}
<!-- Haustiere je Familie (#322) -->
<PetsCard />
<!-- Wohnort, Anreise und Anwesenheit braucht es erst für detaillierte Flüge oder Unterkünfte -->
{#if isDetailed(app.trip, "flights") || isDetailed(app.trip, "stay")}<Households />{/if}
{#if groups}<GroupsDialog onclose={() => (groups = false)} />{/if}
