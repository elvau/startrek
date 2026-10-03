<script lang="ts">
  import { access, app } from "../store.svelte";
  import { t, t as tt, tn, type Key } from "../i18n/index.svelte";
  import { ageClass } from "../calc";
  import { isActive, isDetailed, uid } from "../model";
  import { dir, saveAsGroup, travelersFrom } from "../directory.svelte";
  import { applyPeople, personAge } from "../people";
  import { prefsFor } from "../prefs";
  import Households from "./Households.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import QuickFamilies from "./QuickFamilies.svelte";
  import { animalEmoji, nextAnimal, placeholderTravelers, type FamilyRow } from "../placeholders";
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
  function addFrom(ids: string[]) {
    app.trip.travelers.push(...travelersFrom(ids, app.trip.travelers, app.trip.from || undefined));
    pick = false;
  }
  function saveGroup() {
    if (incomplete) { edit = true; saved = t("trav.needNames"); return; }
    // Platzhalter bleiben in der Reise und kommen nicht in gespeicherte Gruppen
    const real = app.trip.travelers.filter(t => !t.placeholder);
    if (!real.length) { saved = t("trav.noPlaceholders"); return; }
    const name = prompt(t("trav.groupPrompt"), app.trip.name);
    if (!name?.trim()) return;
    const g = saveAsGroup(name, real, app.trip.households);
    saved = t("trav.savedGroup", { name: g.name, p: tn("n.persons", g.memberIds.length) });
    setTimeout(() => (saved = ""), 4000);
  }
</script>

<div class="people">
  {#each app.trip.travelers as t, i (t.id)}
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
        <button class="linkbtn danger" onclick={() => remove(t.id)}>{tt("remove")}</button>
      {:else}
        <b>{t.placeholder ? t.name : `${t.name || tt("trav.noName")} ${t.household}`}</b>
        <span>{t.age != null && String(t.age) !== "" ? `${tt("trav.ageYears", { n: t.age })} · ` : ""}{#if cls === "adult"}{L(cls)}{:else}<em class="age-pill {cls}">{L(cls)}</em>{/if}{#if t.nat} <span title={countryName(t.nat)}>· {flagOf(t.nat)}</span>{/if}</span>
        <button class="dabei" class:on={isActive(t)} disabled={access.readonly} aria-pressed={isActive(t)}
          onclick={() => (t.active = isActive(t) ? false : undefined)}>{isActive(t) ? `✓ ${tt("trav.in")}` : tt("trav.out")}</button>
        {#if t.placeholder && !access.readonly}
          <button class="linkbtn repl" class:on={replacing === t.id} onclick={() => { replacing = replacing === t.id ? null : t.id; pick = quick = false; }}>{tt("trav.replace")}</button>
        {/if}
      {/if}
    </div>
  {/each}
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
        <button class="chip" disabled={!neu.length} onclick={() => addFrom(g.memberIds)}>{g.name} <small>{neu.length ? `+${neu.length}` : t("trav.allThere")}</small></button>
      {/each}
      {#each dir.people.filter(p => !app.trip.travelers.some(t => t.personId === p.id)) as p (p.id)}
        <button class="chip" onclick={() => addFrom([p.id])}>+ {p.first} {p.last}</button>
      {/each}
    </div>
  {/if}
{/if}
<!-- Wohnort, Anreise und Anwesenheit braucht es erst für detaillierte Flüge oder Unterkünfte -->
{#if isDetailed(app.trip, "flights") || isDetailed(app.trip, "stay")}<Households />{/if}
{#if groups}<GroupsDialog onclose={() => (groups = false)} />{/if}
