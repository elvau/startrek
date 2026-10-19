<script lang="ts">
  /*
   * Vorlieben bearbeiten (#161): eigene (mit „Ich bin“) oder die einer Gruppe, in Karten mit Auswahl zum Antippen.
   * Leere Felder heißen „keine Vorgabe“ bzw. bei Gruppen „wie meine“: dann gestrichelt mit dem Wert von meinen;
   * von der Gruppe gesetzte Werte orange mit „↺ wie meine“. Gesperrte Länder einer Gruppe kommen zu meinen dazu.
   */
  import { untrack, type Snippet } from "svelte";
  import { i18n, t, type Key } from "../i18n/index.svelte";
  import { BOARDS, STYLES, type Prefs } from "../model";
  import { dir } from "../directory.svelte";
  import { SOUVENIR_DEFAULT } from "../souvenir";
  import { geo } from "../geo/geo.svelte";
  import { loadGeo } from "../geo/places";
  import { cloud } from "../cloud/cloud.svelte";
  import type { Home } from "../home";
  import HomeInput from "./HomeInput.svelte";
  import { diffCount, monthsText, resetKey, summary, type CardId } from "../prefsView";
  import HolidayPicker from "./HolidayPicker.svelte";
  import { holidayText, loadRegions } from "../holidaysApp.svelte";
  import type { Regions } from "../holidays";

  let { p, base, onai }: { p: Prefs; base?: Prefs; onai?: () => void } = $props();
  const group = $derived(!!base);

  $effect(() => { void loadGeo(geo, []); });

  // Länder mit Namen in der Sprache der App
  const countries = $derived.by(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([i18n.lang], { type: "region" }); } catch {}
    return geo.world.map(w => ({ k: w.k, name: dn?.of(w.k) || w.l })).sort((a, b) => a.name.localeCompare(b.name, i18n.lang));
  });
  const cname = (k: string) => countries.find(c => c.k === k)?.name || k;
  let q = $state("");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hits = $derived(q.trim().length < 2 ? [] : countries.filter(c => !(p.avoid || []).includes(c.k) && !(base?.avoid || []).includes(c.k) && (norm(c.name).startsWith(norm(q.trim())) || c.k === q.trim().toUpperCase())).slice(0, 6));
  function addAvoid(k: string) { p.avoid = [...new Set([...(p.avoid || []), k])]; q = ""; }
  function removeAvoid(k: string) { p.avoid = (p.avoid || []).filter(x => x !== k); if (!p.avoid.length) delete p.avoid; }

  // leerer Wert entfernt die Vorgabe; bei Gruppen heißt das „wie meine“
  function set<K extends keyof Prefs>(k: K, v: Prefs[K] | undefined) { if (v == null || (v as unknown) === "") delete p[k]; else p[k] = v; }
  /** Auswahl antippen: nochmal antippen hebt sie auf (keine Vorgabe bzw. wie meine) */
  function pick<K extends keyof Prefs>(k: K, v: Prefs[K]) { set(k, p[k] === v ? undefined : v); }

  /** Zustand eines Werts: on = gesetzt, inh = wie meine (Gruppe), chg = für die Gruppe gesetzt */
  function st<K extends keyof Prefs>(k: K, v: Prefs[K] | undefined): "" | "on" | "inh" | "chg" {
    if (p[k] != null) return p[k] === v ? (group ? "chg" : "on") : "";
    if (group && base?.[k] === v && v != null) return "inh";
    return !group && v == null ? "on" : "";
  }
  const own = (k: keyof Prefs) => p[k] != null && !(Array.isArray(p[k]) && !(p[k] as unknown[]).length);

  // Eingabefeld startet mit den gespeicherten Codes, danach zählt das Getippte
  let aps = $state(untrack(() => (p.airports || []).join(", ")));
  // Wohnort (#163): PLZ bzw. ohne PLZ-Daten der Ort, dazu das Land (fehlt: DE)
  function setHome(h: Home) { set("plz", h.plz || h.ort); set("plzCc", h.cc !== "DE" ? h.cc : undefined); }
  function setAps(v: string) {
    aps = v;
    const codes = [...new Set(v.toUpperCase().split(/[\s,;]+/).filter(c => /^[A-Z]{3}$/.test(c)))];
    set("airports", codes.length ? codes : undefined);
  }
  function resetAps() { resetKey(p, "airports"); aps = ""; }
  function toggleIn<T>(k: "styles" | "months", v: T) {
    const cur = (p[k] as T[] | undefined) || [];
    const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    set(k, (next.length ? (k === "months" ? (next as number[]).sort((a, b) => a - b) : next) : undefined) as Prefs[typeof k]);
  }
  const listSt = (k: "styles" | "months", v: string | number): "" | "on" | "inh" | "chg" =>
    own(k) ? ((p[k] as (string | number)[]).includes(v) ? (group ? "chg" : "on") : "") : group && ((base?.[k] as (string | number)[] | undefined) || []).includes(v) ? "inh" : "";
  function step(k: "maxHours" | "nightsMin" | "nightsMax" | "souvenirs", d: number, lo: number, hi: number) {
    const cur = p[k] ?? base?.[k] ?? (k === "maxHours" ? 6 : k === "nightsMin" ? 3 : k === "souvenirs" ? SOUVENIR_DEFAULT : 7);
    set(k, Math.max(lo, Math.min(hi, cur + d)));
  }
  function setCar<K extends "seats" | "fuel">(k: K, v: NonNullable<Prefs["car"]>[K] | undefined) {
    const car = { ...(p.car || {}) };
    if (v == null || car[k] === v) delete car[k]; else car[k] = v;
    set("car", Object.keys(car).length ? car : undefined);
  }
  const monthName = (m: number) => new Date(2027, m - 1, 1).toLocaleDateString(i18n.lang, { month: "short" });
  let regions = $state<Regions | null>(null);
  $effect(() => { void loadRegions().then(r => (regions = r)); });
  const FUELS = ["petrol", "diesel", "hybrid", "electric"] as const;

  const sum = $derived(summary(p, base, cname));
  const ICONS: Record<CardId, string> = { flights: "✈️", stay: "🏨", style: "🎒", times: "📅", avoid: "🚫", special: "💡", note: "✨" };
  const TITLES: Record<CardId, Key> = { flights: "prefs.flights", stay: "prefs.stay", style: "prefs.c.style", times: "prefs.times", avoid: "prefs.c.avoid", special: "prefs.c.special", note: "prefs.c.note" };
  let cards = $state<Record<string, HTMLElement>>({});
  const jump = (c: CardId) => cards[c]?.scrollIntoView({ behavior: "smooth", block: "start" });
  /** „wie meine: …“ für Gruppen; v: angezeigter Wert von meinen */
  const inhText = (v: string | false | undefined | null) => (v ? t("prefs.likeMineV", { v }) : t("prefs.likeMine"));
</script>

{#snippet lbl(text: string, k: keyof Prefs | null, mine?: string | false | null)}
  <div class="pv-lbl">
    <span>{text}</span>
    {#if group && k}
      {#if own(k)}<button type="button" class="pv-reset" onclick={() => (k === "airports" ? resetAps() : resetKey(p, k))}>↺ {t("prefs.likeMine")}</button>
      {:else}<span class="pv-inh">· {inhText(mine)}</span>{/if}
    {/if}
  </div>
{/snippet}

{#snippet chip(label: string, state: string, onclick: () => void)}
  <button type="button" class="pv-c {state}" aria-pressed={state === "on" || state === "chg"} {onclick}>{label}</button>
{/snippet}

{#snippet card(id: CardId, body: Snippet)}
  <section class="pv-card" class:wide={id === "note"} data-card={id} bind:this={cards[id]}>
    <div class="pv-ch">
      <span class="pv-ico pv-{id}" aria-hidden="true">{ICONS[id]}</span><h3>{t(TITLES[id])}</h3>
      {#if group && diffCount(p, base, id)}<span class="pv-badge">{id === "avoid" ? t("prefs.addedN", { n: diffCount(p, base, id) }) : t("prefs.diffN", { n: diffCount(p, base, id) })}</span>{/if}
    </div>
    {@render body()}
  </section>
{/snippet}

<div class="prefs pv" class:group>
  {#if !group}
    <div class="pv-me">
      <span class="pv-ico" aria-hidden="true">👤</span>
      <label class="f grow">{t("prefs.me")}
        <select value={dir.me ?? ""} onchange={e => { const v = e.currentTarget.value; if (v) dir.me = v; else delete dir.me; }}>
          <option value="">{t("prefs.meNone")}</option>
          {#each dir.people as x (x.id)}<option value={x.id}>{x.first} {x.last}</option>{/each}
        </select>
      </label>
      <p class="muted small">{t("prefs.meHint")}</p>
    </div>
  {/if}

  <div class="pv-sum">
    <div class="pv-sum-b">
      <span class="dlabel">{t("prefs.glance")}</span>
      <div class="pv-chips">
        {#each sum as s, i (i)}<button type="button" class="pv-sc" class:grp={s.group} class:inh={group && !s.group} onclick={() => jump(s.card)}>{s.text}</button>
        {:else}<span class="muted small">{group ? t("prefs.groupHint") : t("prefs.hint")}</span>{/each}
      </div>
      {#if group}<p class="pv-legend"><span><i class="lg-chg"></i>{t("prefs.legendChg")}</span><span><i class="lg-inh"></i>{t("prefs.likeMine")}</span></p>{/if}
    </div>
    {#if onai}<button type="button" class="pv-ai" onclick={onai}>✨ {t("prefs.aiEdit")}</button>{/if}
  </div>

  <div class="pv-grid">
    {#snippet flights()}
      {#if !group}
        <div class="pv-two">
          {#if cloud.user}<HomeInput cls="f pv-plz" label={t("prefs.plz")} value={{ cc: p.plzCc, plz: p.plz }} onpick={setHome} onclear={() => { set("plz", undefined); set("plzCc", undefined); }} />{/if}
          <label class="f grow">{t("prefs.airports")}<input value={aps} oninput={e => setAps(e.currentTarget.value)} placeholder={t("prefs.airportsPh")} /></label>
        </div>
        {#if cloud.user}<p class="muted small">{t("prefs.plzHint")} {t("prefs.plzAccount")}</p>{/if}
      {:else}
        {@render lbl(t("prefs.airports"), "airports", base?.airports?.join(", "))}
        <input class="pv-in" aria-label={t("prefs.airports")} value={aps} oninput={e => setAps(e.currentTarget.value)} placeholder={base?.airports?.length ? base.airports.join(", ") : t("prefs.airportsPh")} />
      {/if}
      {@render lbl(t("prefs.maxStops"), "maxStops", base?.maxStops == null ? null : base.maxStops === 0 ? t("prefs.direct") : String(base.maxStops))}
      <div class="pv-seg">
        {#if !group}{@render chip(t("prefs.any"), st("maxStops", undefined), () => set("maxStops", undefined))}{/if}
        {#each [0, 1, 2] as n}{@render chip(n === 0 ? t("prefs.direct") : String(n), st("maxStops", n), () => pick("maxStops", n))}{/each}
      </div>
      {@render lbl(t("prefs.bags"), "bags", base?.bags == null ? null : base.bags ? t("prefs.bagsYes") : t("prefs.bagsNo"))}
      <div class="pv-seg">
        {#if !group}{@render chip(t("prefs.any"), st("bags", undefined), () => set("bags", undefined))}{/if}
        {@render chip(t("prefs.bagsNo"), st("bags", false), () => pick("bags", false))}{@render chip(t("prefs.bagsYes"), st("bags", true), () => pick("bags", true))}
      </div>
      {@render lbl(t("prefs.seats"), "seatsTogether", base?.seatsTogether == null ? null : base.seatsTogether ? t("prefs.seatsYes") : t("prefs.seatsNo"))}
      <div class="pv-seg">
        {#if !group}{@render chip(t("prefs.any"), st("seatsTogether", undefined), () => set("seatsTogether", undefined))}{/if}
        {@render chip(t("prefs.seatsYes"), st("seatsTogether", true), () => pick("seatsTogether", true))}{@render chip(t("prefs.seatsNo"), st("seatsTogether", false), () => pick("seatsTogether", false))}
      </div>
      <div class="pv-two">
        <div>
          {@render lbl(t("prefs.maxHours"), "maxHours", base?.maxHours ? String(base.maxHours) : null)}
          <span class="pv-step" class:inh={group && !own("maxHours")} class:chg={group && own("maxHours")}>
            <button type="button" aria-label="−" onclick={() => step("maxHours", -1, 1, 48)}>−</button>
            <b>{p.maxHours ?? base?.maxHours ?? t("prefs.any")}</b>
            <button type="button" aria-label="+" onclick={() => step("maxHours", 1, 1, 48)}>+</button>
          </span>
          {#if !group && p.maxHours}<button type="button" class="pv-x" onclick={() => set("maxHours", undefined)}>{t("prefs.any")}</button>{/if}
        </div>
        <div>
          {@render lbl(t("prefs.access"), "access", base?.access ? t(`prefs.${base.access}` as Key) : null)}
          <div class="pv-seg">
            {#if !group}{@render chip(t("prefs.any"), st("access", undefined), () => set("access", undefined))}{/if}
            {@render chip("🚗 " + t("prefs.car"), st("access", "car"), () => pick("access", "car"))}{@render chip("🚆 " + t("prefs.train"), st("access", "train"), () => pick("access", "train"))}
          </div>
        </div>
      </div>
    {/snippet}
    {@render card("flights", flights)}

    {#snippet stay()}
      {@render lbl(t("st.type"), "stayType", base?.stayType ? (base.stayType === "all" ? t("prefs.anyType") : t(base.stayType === "whole" ? "st.whole" : "st.hotel")) : null)}
      <div class="pv-seg">
        {#if !group}{@render chip(t("prefs.any"), st("stayType", undefined), () => set("stayType", undefined))}{/if}
        {@render chip(t("st.hotel"), st("stayType", "hotel"), () => pick("stayType", "hotel"))}{@render chip(t("st.whole"), st("stayType", "whole"), () => pick("stayType", "whole"))}
        {#if group}{@render chip(t("prefs.anyType"), st("stayType", "all"), () => pick("stayType", "all"))}{/if}
      </div>
      {@render lbl(t("prefs.minStars"), "minStars", base?.minStars ? "★".repeat(base.minStars) : null)}
      <div class="pv-seg">
        {#if !group}{@render chip(t("prefs.any"), st("minStars", undefined), () => set("minStars", undefined))}{/if}
        {#each [2, 3, 4, 5] as n}{@render chip("★".repeat(n), st("minStars", n), () => pick("minStars", n))}{/each}
      </div>
      {@render lbl(t("board.title"), "board", base?.board ? t(`board.${base.board}` as Key) : null)}
      <div class="pv-seg">
        {#if !group}{@render chip(t("prefs.any"), st("board", undefined), () => set("board", undefined))}{/if}
        {#each BOARDS as b}{@render chip(t(`board.${b}` as Key), st("board", b), () => pick("board", b))}{/each}
      </div>
    {/snippet}
    {@render card("stay", stay)}

    {#snippet style()}
      {@render lbl(t("prefs.style"), "styles", base?.styles?.length ? base.styles.map(s => t(`prefs.s.${s}` as Key)).join(", ") : null)}
      <div class="pv-seg">
        {#each STYLES as s}{@render chip(t(`prefs.s.${s}` as Key), listSt("styles", s), () => toggleIn("styles", s))}{/each}
      </div>
      {@render lbl(t("prefs.budget"), "budget", base?.budget ? t(`prefs.b.${base.budget}` as Key) : null)}
      <div class="pv-seg">
        {#if !group}{@render chip(t("prefs.any"), st("budget", undefined), () => set("budget", undefined))}{/if}
        {#each ["low", "mid", "high"] as const as b}{@render chip(t(`prefs.b.${b}` as Key), st("budget", b), () => pick("budget", b))}{/each}
      </div>
      {@render lbl(t("prefs.souvenirs"), "souvenirs", base?.souvenirs != null ? `${base.souvenirs} €` : null)}
      <div class="pv-nights">
        <span class="pv-step pv-souv" class:inh={group && !own("souvenirs")} class:chg={group && own("souvenirs")}>
          <button type="button" aria-label={t("souv.less")} onclick={() => step("souvenirs", -10, 0, 500)}>−</button>
          <b>{p.souvenirs ?? base?.souvenirs ?? SOUVENIR_DEFAULT} €</b>
          <button type="button" aria-label={t("souv.more")} onclick={() => step("souvenirs", 10, 0, 500)}>+</button>
        </span>
        <span class="muted small">{t("prefs.souvenirsHint")}</span>
      </div>
    {/snippet}
    {@render card("style", style)}

    {#snippet times()}
      {@render lbl(t("prefs.holidays"), "holidays", base?.holidays ? holidayText(base.holidays, regions, i18n.lang) : null)}
      <HolidayPicker value={p.holidays} empty={group ? t("prefs.likeMine") : t("prefs.unset")} onchange={v => set("holidays", v)} />
      {#if !group}<div class="pv-seg">{@render chip("📅 " + t("prefs.calHolidays"), p.calHolidays === false ? "" : "on", () => set("calHolidays", p.calHolidays === false ? undefined : false))}</div>{/if}
      {@render lbl(t("prefs.months"), "months", base?.months?.length ? monthsText(base.months) : null)}
      <div class="pv-seg pv-months">
        {#each Array.from({ length: 12 }, (_, i) => i + 1) as m}{@render chip(monthName(m), listSt("months", m), () => toggleIn("months", m))}{/each}
      </div>
      {@render lbl(t("prefs.nights"), group ? (own("nightsMin") ? "nightsMin" : "nightsMax") : null, base?.nightsMin || base?.nightsMax ? `${base?.nightsMin ?? "…"}–${base?.nightsMax ?? "…"}` : null)}
      <div class="pv-nights">
        {#each ["nightsMin", "nightsMax"] as const as k, i (k)}
          {#if i}<span>–</span>{/if}
          <span class="pv-step" class:inh={group && !own(k)} class:chg={group && own(k)}>
            <button type="button" aria-label="−" onclick={() => step(k, -1, 1, 60)}>−</button>
            <b>{p[k] ?? base?.[k] ?? "…"}</b>
            <button type="button" aria-label="+" onclick={() => step(k, 1, 1, 60)}>+</button>
          </span>
        {/each}
        {#if !group && (p.nightsMin || p.nightsMax)}<button type="button" class="pv-x" onclick={() => { set("nightsMin", undefined); set("nightsMax", undefined); }}>{t("prefs.any")}</button>{/if}
        {#if group && (own("nightsMin") || own("nightsMax"))}<button type="button" class="pv-reset" onclick={() => { resetKey(p, "nightsMin"); resetKey(p, "nightsMax"); }}>↺ {t("prefs.likeMine")}</button>{/if}
      </div>
    {/snippet}
    {@render card("times", times)}

    {#snippet avoid()}
      <div class="chips">
        {#if group}{#each base?.avoid || [] as k (k)}<span class="chip on locked pv-lock">🔒 {cname(k)}</span>{/each}{/if}
        {#each p.avoid || [] as k (k)}<button type="button" class="chip on pv-av" aria-label={t("prefs.remove", { name: cname(k) })} onclick={() => removeAvoid(k)}>{cname(k)} ×</button>{/each}
      </div>
      <label class="f plzf">
        <input bind:value={q} placeholder={t("prefs.avoidPh")} autocomplete="off" aria-label={t("prefs.avoidPh")} />
        {#if hits.length}<div class="sugg">{#each hits as c (c.k)}<button type="button" onclick={() => addAvoid(c.k)}>{c.name}</button>{/each}</div>{/if}
      </label>
      <p class="muted small">{group ? t("prefs.avoidGroupHint") : t("prefs.avoidHint")}</p>
    {/snippet}
    {@render card("avoid", avoid)}

    {#snippet special()}
      {@render lbl(t("prefs.c.specialWho"), null)}
      <div class="pv-seg">
        {@render chip("🐾 " + t("setup.pet"), p.pet ? (group ? "chg" : "on") : group && base?.pet ? "inh" : "", () => set("pet", p.pet ? undefined : true))}
        {@render chip("🏠 " + t("home.pref"), p.homeCare ? (group ? "chg" : "on") : group && base?.homeCare ? "inh" : "", () => set("homeCare", p.homeCare ? undefined : true))}
        {@render chip("♿ " + t("setup.stepFree"), p.stepFree ? (group ? "chg" : "on") : group && base?.stepFree ? "inh" : "", () => set("stepFree", p.stepFree ? undefined : true))}
        {#each ["veg", "vegan"] as const as v}{@render chip((v === "veg" ? "🥗 " : "🌱 ") + t(`setup.diet.${v}` as Key), st("diet", v), () => pick("diet", v))}{/each}
      </div>
      {#if !group}
        {@render lbl(t("setup.car"), null)}
        <div class="pv-two">
          <select class="pv-in pv-seats" aria-label={t("setup.carSeats")} value={p.car?.seats ?? ""} onchange={e => setCar("seats", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}>
            <option value="">{t("setup.noCar")}</option>{#each [2, 3, 4, 5, 6, 7, 8, 9] as n}<option value={n}>{t("setup.seatsN", { n })}</option>{/each}
          </select>
          <div class="pv-seg">{#each FUELS as f (f)}{@render chip(t(`setup.fuel.${f}` as Key), p.car?.fuel === f ? "on" : "", () => setCar("fuel", f))}{/each}</div>
        </div>
      {/if}
    {/snippet}
    {@render card("special", special)}

    {#snippet note()}
      {@render lbl(t("prefs.note"), "note", base?.note ? base.note.slice(0, 40) + (base.note.length > 40 ? "…" : "") : null)}
      <textarea rows="2" maxlength="300" aria-label={t("prefs.note")} value={p.note ?? ""} placeholder={group && base?.note ? base.note : t("prefs.notePh")} oninput={e => set("note", e.currentTarget.value.trim() ? e.currentTarget.value : undefined)}></textarea>
    {/snippet}
    {@render card("note", note)}
  </div>
</div>

<style>
  .pv{gap:12px;padding:0}
  .pv-me{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:12px 14px}
  .pv-me .grow{flex:1 1 220px}
  .pv-me p{flex-basis:100%;margin:0}
  .pv-sum{display:flex;gap:12px;align-items:flex-start;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:12px 14px}
  .pv-sum-b{flex:1;min-width:0}
  .pv-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
  .pv-sc{font-size:13.5px;background:var(--paper-2);border:1px solid var(--line);border-radius:99px;padding:4px 10px;color:var(--ink)}
  .pv-sc.inh{color:var(--ink-3)}
  .pv-sc.grp{background:var(--warn-soft);border-color:var(--warn);color:var(--warn)}
  .pv-legend{display:flex;flex-wrap:wrap;gap:14px;margin:8px 0 0;font-size:12.5px;color:var(--ink-2)}
  .pv-legend i{display:inline-block;width:11px;height:11px;border-radius:4px;margin-inline-end:6px;vertical-align:-1px}
  .lg-chg{background:var(--warn-soft);border:1px solid var(--warn)}
  .lg-inh{background:var(--a-soft);border:1px dashed var(--a)}
  .pv-ai{white-space:nowrap;border:0;background:var(--idea-soft);color:var(--idea);font-weight:700;border-radius:99px;padding:9px 14px;font-size:14px}
  .pv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
  .pv-card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;scroll-margin-top:12px;min-width:0}
  .pv-card.wide{grid-column:1/-1}
  .pv-ch{display:flex;align-items:center;gap:10px;margin-bottom:2px}
  .pv-ch h3{margin:0;font-size:16px;flex:1}
  .pv-ico{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-size:17px;background:var(--paper-2);flex:none}
  .pv-flights{background:var(--c-flights-s)} .pv-stay{background:var(--c-stay-s)} .pv-style{background:var(--c-attractions-s)}
  .pv-times{background:var(--c-transport-s)} .pv-avoid{background:var(--c-trav-s)} .pv-special,.pv-note{background:var(--c-misc-s)}
  .pv-badge{font-size:11.5px;font-weight:700;border-radius:99px;padding:3px 9px;background:var(--warn-soft);color:var(--warn);white-space:nowrap}
  .pv-lbl{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;font-size:13px;font-weight:600;color:var(--ink-2);margin-top:6px}
  .pv-inh{font-weight:500;color:var(--ink-3)}
  .pv-reset{margin-inline-start:auto;border:0;background:none;padding:0;font-size:12.5px;font-weight:700;color:var(--warn)}
  .pv-seg{display:flex;flex-wrap:wrap;gap:6px}
  .pv-c{border:1px solid var(--line);background:var(--paper);border-radius:99px;padding:7px 13px;min-height:38px;font-size:14px;color:var(--ink)}
  .pv-c.on{background:var(--a);border-color:var(--a);color:#fff;font-weight:600}
  .group .pv-c{background:var(--paper-2);color:var(--ink-3)}
  .pv-c.inh,.group .pv-c.inh{background:var(--a-soft);border:1px dashed var(--a);color:var(--a);font-weight:600}
  .pv-c.chg,.group .pv-c.chg{background:var(--warn);border-color:var(--warn);color:#fff;font-weight:600}
  .pv-in{width:100%;border:1px solid var(--line);background:var(--paper-2);border-radius:10px;padding:9px 11px;font:inherit;font-size:14px;color:var(--ink)}
  .pv-two{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:flex-end}
  .pv-two > *{min-width:0}
  .pv-plz{flex:1 1 260px}
  .pv-seats{width:auto}
  .pv-step{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--paper)}
  .pv-step button{border:0;background:var(--paper-2);width:38px;height:38px;font-size:17px;color:var(--ink-2)}
  .pv-step b{min-width:46px;text-align:center;padding:0 6px}
  .pv-step.inh{border:1px dashed var(--a);color:var(--a)}
  .pv-step.chg{border-color:var(--warn)} .pv-step.chg b{color:var(--warn)}
  .pv-nights{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
  .pv-x{border:0;background:none;color:var(--ink-3);font-size:13px;text-decoration:underline;padding:0 4px}
  .pv-lock{opacity:.6}
  .pv textarea{min-height:52px}
  @media (max-width:560px){
    .pv-sum{flex-direction:column}
    .pv-grid{grid-template-columns:1fr}
  }
</style>
