<script lang="ts">
  /*
   * Konto einrichten (#160): Assistent in 7 Schritten, alles überspringbar. Arbeitet auf einem Entwurf, der mit „Weiter“
   * ins Konto geht (Personenverzeichnis, Vorlieben). Geschlecht, Staatsangehörigkeiten und LGBTQ+-Hinweise nur mit Konto,
   * in den Buchungsdaten (travelDocs). Optional füllt die KI aus freiem Text vor; der Text enthält keine Namen o. Ä.
   */
  import { untrack } from "svelte";
  import { i18n, t, tn, type Key } from "../i18n/index.svelte";
  import { portal } from "./portal";
  import { BOARDS, STYLES, type Prefs } from "../model";
  import { dir } from "../directory.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { docs, loadDocs, saveDocsNow, setDocFields } from "../traveldocs.svelte";
  import { geo } from "../geo/geo.svelte";
  import { loadGeo } from "../geo/places";
  import { loadPlz, type Place } from "../plz";
  import { FLIGHTS_URL, homeGuess } from "../flights/app";
  import { guessAirports } from "../flights/origin";
  import { loadOrigin } from "../flights/origin.svelte";
  import { airportData, ensureAirports } from "../geo/geo.svelte";
  import type { Loc } from "../geo/locations";
  import BirthInput from "./BirthInput.svelte";
  import LocationPicker from "./LocationPicker.svelte";
  import { openChat } from "../agent/open.svelte";
  import { FUELS, LICENSES, RAIL_DE, SETUP_TEXT_MAX, STATES } from "../setup/ai";
  import { applyAi, applyDraft, draftFrom, type SetupDraft } from "../setup/setup";
  import { askSetup, markSeen, setupWizard } from "../setup/app.svelte";

  const STEPS = ["me", "go", "who", "how", "when", "more", "done"] as const;
  // -1: Einstieg (mit KI oder Schritt für Schritt)
  let step = $state(-1);
  let d = $state<SetupDraft>(untrack(() => draftFrom($state.snapshot(dir), undefined)));
  let filled = $state<string[]>([]);

  // Buchungsdaten (Geschlecht, Staatsangehörigkeiten) erst laden, dann in den Entwurf
  $effect(() => { if (cloud.user) void loadDocs(); });
  let docsIn = false;
  $effect(() => {
    if (docsIn || docs.status !== "ready" || !dir.me) return;
    docsIn = true;
    const doc = docs.map[dir.me];
    // nur, solange nichts davon schon im Entwurf eingegeben ist
    untrack(() => { if (doc && !d.gender && !d.nats.length && !d.lgbtq) { d.gender = doc.gender || ""; d.nats = (doc.nats || "").split(",").filter(Boolean); d.lgbtq = doc.lgbtq === "1"; } });
  });
  $effect(() => { void loadGeo(geo, []); });

  /* ---------- KI ---------- */
  let text = $state("");
  let busy = $state(false);
  let aiErr = $state("");
  let left = $state<number | null>(null);
  async function fillAi() {
    busy = true; aiErr = "";
    try {
      const r = await askSetup(text);
      left = r.remaining ?? null;
      filled = applyAi(d, r.fields);
      if (filled.includes("companions") && !d.group) d.group = t("setup.groupDefault");
      step = 0;
    } catch (e) { aiErr = (e as Error).message; }
    busy = false;
  }
  const ai = (k: string) => filled.includes(k);

  /* ---------- Länder ---------- */
  const countries = $derived.by(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([i18n.lang], { type: "region" }); } catch {}
    return geo.world.map(w => ({ k: w.k, name: dn?.of(w.k) || w.l })).sort((a, b) => a.name.localeCompare(b.name, i18n.lang));
  });
  const cname = (k: string) => countries.find(c => c.k === k)?.name || k;
  let natPick = $state("");

  /* ---------- Wohnort ---------- */
  let plzErr = $state(false);
  let plzMap: Map<string, Place> | null = null;
  async function setPlz(v: string) {
    d.plz = v.trim(); plzErr = false;
    if (!d.plz) { d.home = undefined; return; }
    if (!/^\d{5}$/.test(d.plz)) return;
    plzMap ??= await loadPlz().catch(() => null);
    const pl = plzMap?.get(d.plz);
    if (pl) d.home = { plz: d.plz, ort: pl.ort, lat: pl.lat, lon: pl.lon }; else plzErr = true;
  }

  /* ---------- Vorlieben ---------- */
  function setP<K extends keyof Prefs>(k: K, v: Prefs[K] | undefined) { if (v == null || (Array.isArray(v) && !v.length)) delete d.prefs[k]; else d.prefs[k] = v; }
  const pick = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setP(k, d.prefs[k] === v ? undefined : v);
  function toggleIn<K extends "styles" | "months">(k: K, v: NonNullable<Prefs[K]>[number]) {
    const cur = (d.prefs[k] || []) as (typeof v)[];
    const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    setP(k, (k === "months" ? (next as number[]).sort((a, b) => a - b) : next) as Prefs[K]);
  }
  /* Abflughäfen: Vorschläge am Wohnort (PLZ), sonst aus der Verbindung; die zwei nächsten sind vorausgewählt, bis man selbst wählt */
  ensureAirports(); loadOrigin();
  const nearAps = $derived((d.home ? guessAirports({ lat: d.home.lat, lon: d.home.lon }, airportData, 4) : homeGuess(4))?.codes ?? []);
  const apChips = $derived([...new Set([...nearAps, ...(d.prefs.airports || [])])]);
  let apsTouched = false, apsAuto = false;
  $effect(() => {
    const near = nearAps;
    if (STEPS[step] !== "how" || !near.length) return;
    untrack(() => { if (!apsTouched && (apsAuto || !d.prefs.airports?.length)) { setP("airports", near.slice(0, 2)); apsAuto = true; } });
  });
  const apName = (c: string) => { const a = airportData.airports.find(x => x[0] === c); return a ? `${a[2]} · ${a[1]}` : c; };
  function toggleAp(c: string) { apsTouched = true; const cur = d.prefs.airports || []; setP("airports", cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]); }
  function addAp(l: Loc) { apsTouched = true; setP("airports", [...new Set([...(d.prefs.airports || []), ...(l.kind === "airport" ? [l.code] : l.airports)])]); }
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const monthName = (m: number) => new Date(2027, m - 1, 1).toLocaleDateString(i18n.lang, { month: "short" });
  const STATE_NAMES: Record<string, string> = { BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg", HE: "Hessen", MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz", SL: "Saarland", SN: "Sachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen" };
  function setCar(k: "seats" | "fuel", v: number | string | undefined) {
    const car = { ...(d.prefs.car || {}) } as NonNullable<Prefs["car"]>;
    if (v == null || v === "" || car[k] === v) delete car[k]; else (car as Record<string, unknown>)[k] = v;
    setP("car", car.seats || car.fuel ? car : undefined);
  }

  /* ---------- Mitreisende ---------- */
  function addCompanion() { d.companions = [...d.companions, { first: "", age: null, on: true }]; if (!d.group) d.group = t("setup.groupDefault"); }
  function dropCompanion(i: number) { d.companions = d.companions.filter((_, k) => k !== i); }

  /* ---------- Speichern und Ablauf ---------- */
  function save() {
    const { meId, companions, doc } = applyDraft(dir, $state.snapshot(d) as SetupDraft);
    // Mitreisende haben jetzt IDs: in den Entwurf zurück, sonst entstünden sie beim nächsten Speichern doppelt
    companions.forEach((id, i) => { if (id && d.companions[i]) d.companions[i].id = id; });
    if (cloud.user && meId) setDocFields(meId, { gender: doc.gender, nats: doc.nats, lgbtq: doc.lgbtq });
  }
  function next(store = true) { if (store) save(); step = Math.min(step + 1, STEPS.length - 1); }
  function close() {
    if (!dir.setup) dir.setup = new Date().toISOString().slice(0, 10);
    markSeen();
    void saveDocsNow();
    setupWizard.open = false;
  }
  function finish() { save(); close(); }
  function firstTrip() { finish(); openChat(); }
  $effect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });

  const LIC_KEYS: Record<string, Key> = { none: "setup.lic.none", lt1: "setup.lic.lt1", gt1: "setup.lic.gt1", gt2: "setup.lic.gt2", gt5: "setup.lic.gt5" };
  const yesNo = (v: boolean | undefined | null) => (v == null ? "" : v ? t("setup.yes") : t("setup.no"));
  const joinNon = (xs: (string | number | false | undefined | null)[]) => xs.filter(Boolean).join(" · ");
  const ageNow = $derived(d.birth ? Math.floor((Date.now() - new Date(d.birth).getTime()) / (365.25 * 864e5)) : d.age);
  const summary = $derived([
    { s: 0, icon: "👤", k: "setup.step.me", v: joinNon([d.first && `${d.first} ${d.last}`.trim(), ageNow != null && t("trav.ageYears", { n: ageNow }), d.nats.map(cname).join(", "), d.home && `${d.home.plz} ${d.home.ort}`]) },
    { s: 1, icon: "🚗", k: "setup.step.go", v: joinNon([d.license && t(LIC_KEYS[d.license]), d.creditCard != null && `${t("setup.card")}: ${yesNo(d.creditCard)}`, d.prefs.car && joinNon([d.prefs.car.fuel && t(`setup.fuel.${d.prefs.car.fuel}` as Key), d.prefs.car.seats && t("setup.seatsN", { n: d.prefs.car.seats })]), d.rail.map(r => t(`setup.rail.${r}` as Key)).join(", ")]) },
    { s: 2, icon: "👨‍👩‍👧", k: "setup.step.who", v: joinNon([d.group, d.companions.filter(c => c.on && (c.first || c.id)).map(c => c.first).join(", ")]) },
    { s: 3, icon: "🏖️", k: "setup.step.how", v: joinNon([(d.prefs.styles || []).map(s => t(`prefs.s.${s}` as Key)).join(", "), d.prefs.budget && t(`prefs.b.${d.prefs.budget}` as Key), d.prefs.stayType === "whole" ? t("st.whole") : d.prefs.stayType === "hotel" ? t("st.hotel") : "", d.prefs.board && t(`board.${d.prefs.board}` as Key), d.prefs.airports?.join(", ")]) },
    { s: 4, icon: "📅", k: "setup.step.when", v: joinNon([d.prefs.holidays && STATE_NAMES[d.prefs.holidays], (d.prefs.months || []).map(monthName).join(", "), (d.prefs.nightsMin || d.prefs.nightsMax) && tn("n.nights", d.prefs.nightsMax || d.prefs.nightsMin || 0).replace(/^\d+/, [d.prefs.nightsMin, d.prefs.nightsMax].filter(Boolean).join("–"))]) },
    { s: 5, icon: "🐾", k: "setup.step.more", v: joinNon([d.prefs.pet && t("setup.pet"), d.prefs.stepFree && t("setup.stepFree"), d.prefs.diet && t(`setup.diet.${d.prefs.diet}` as Key)]) }
  ]);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="modal-bg wz-bg" use:portal>
  <div class="wz" role="dialog" aria-modal="true" aria-label={t("setup.title")}>
    <div class="wz-h">
      <div class="wz-t"><h3>{t("setup.title")}</h3><button class="x" onclick={close} aria-label={t("close")}>×</button></div>
      <div class="wz-steps" aria-hidden="true">{#each STEPS as _, k}<i class:done={k < step} class:cur={k === Math.max(step, 0)}></i>{/each}</div>
      <div class="wz-lbl"><span>{t("setup.stepOf", { n: Math.max(step, 0) + 1, of: STEPS.length })} · <b>{t(`setup.step.${STEPS[Math.max(step, 0)]}` as Key)}</b></span><span>{t("setup.skippable")}</span></div>
    </div>

    <div class="wz-b" data-step={step < 0 ? "start" : STEPS[step]}>
      {#if step === -1}
        <p class="wz-lead">{t("setup.lead")}</p>
        {#if cloud.user && FLIGHTS_URL}
          <div class="wz-ai">
            <h4>✨ {t("setup.aiTitle")}</h4>
            <span class="muted">{t("setup.aiQuota")}</span>
            <textarea class="wz-text" rows="4" maxlength={SETUP_TEXT_MAX} bind:value={text} placeholder={t("setup.aiPh")}></textarea>
            <div class="wz-row"><button class="btn primary wz-ai-go" onclick={fillAi} disabled={busy || text.trim().length < 3}>{busy ? t("setup.aiBusy") : t("setup.aiGo")}</button>
              <span class="muted">{t("setup.aiPrivacy")}</span></div>
            {#if aiErr}<p class="err small" role="alert">{aiErr}</p>{/if}
          </div>
          <div class="wz-or">{t("setup.or")}</div>
        {:else if cloud.configured && !cloud.user}
          <p class="muted small">{t("setup.aiLogin")}</p>
        {/if}
        <button class="btn wz-manual" onclick={() => (step = 0)}>{t("setup.manual")}</button>

      {:else if STEPS[step] === "me"}
        {#if filled.length}<p class="wz-note">✨ {t("setup.aiFilled", { n: filled.length })}{left != null ? ` · ${tn("ai.left", left)}` : ""}</p>{/if}
        <div class="wz-grid">
          <label class="f">{t("setup.first")}<input bind:value={d.first} autocomplete="given-name" /></label>
          <label class="f">{t("setup.last")}<input bind:value={d.last} autocomplete="family-name" /></label>
        </div>
        <div class="wz-grid">
          <div class="f">{t("per.birth")}<BirthInput bind:value={d.birth} /></div>
          {#if !d.birth}<label class="f">{t("setup.orAge")}<input class="n sm" type="number" min="0" max="120" value={d.age ?? ""} oninput={e => (d.age = num(e.currentTarget.value) ?? null)} /></label>{/if}
        </div>
        <div class="wz-grid">
          <label class="f plzf">{t("setup.home")}<input class="wz-plz" inputmode="numeric" maxlength="5" value={d.plz} oninput={e => setPlz(e.currentTarget.value)} placeholder={t("fs.plzPh")} />
            {#if plzErr}<small class="err">{t("fs.plzUnknown")}</small>{:else if d.home}<small class="muted">{d.home.ort}</small>{/if}</label>
          <span class="muted small wz-hint">{t("setup.homeHint")}</span>
        </div>
        <div class="wz-sec">
          <span class="dlabel">{t("setup.nats")}</span>
          {#if cloud.user}
            <div class="chips">
              {#each d.nats as k (k)}<button type="button" class="chip on" onclick={() => (d.nats = d.nats.filter(x => x !== k))} aria-label={t("prefs.remove", { name: cname(k) })}>{cname(k)} ×</button>{/each}
              <select class="wz-nat" bind:value={natPick} onchange={() => { if (natPick && !d.nats.includes(natPick)) d.nats = [...d.nats, natPick]; natPick = ""; }} aria-label={t("setup.natAdd")}>
                <option value="">{t("setup.natAdd")}</option>{#each countries as c (c.k)}<option value={c.k}>{c.name}</option>{/each}
              </select>
            </div>
          {/if}
          <span class="dlabel">{t("setup.gender")}</span>
          {#if cloud.user}
            <div class="chips wz-gender">
              {#each [["f", "per.g.f"], ["m", "per.g.m"], ["x", "per.g.x"], ["", "setup.genderNone"]] as [v, k] (v)}
                <button type="button" class="chip" class:on={d.gender === v} aria-pressed={d.gender === v} onclick={() => (d.gender = v as SetupDraft["gender"])}>{t(k as Key)}</button>
              {/each}
            </div>
            <div class="wz-lock">🔒 <span><b>{t("setup.lockTitle")}</b> {t("setup.lockText")}</span></div>
            <label class="wz-tg"><span class="tx"><b>{t("setup.lgbtq")}</b><span>{t("setup.lgbtqHint")}</span></span><input type="checkbox" class="sw" bind:checked={d.lgbtq} /></label>
          {:else}
            <p class="muted small">{t("setup.sensitiveLogin")}</p>
          {/if}
        </div>

      {:else if STEPS[step] === "go"}
        <div class="wz-sec">
          <span class="dlabel">{t("setup.license")}{#if ai("license")} <span class="wz-ai-tag">{t("setup.fromText")}</span>{/if}</span>
          <div class="chips wz-lic">{#each LICENSES as b (b)}<button type="button" class="chip" class:on={d.license === b} aria-pressed={d.license === b} onclick={() => (d.license = d.license === b ? "" : b)}>{t(LIC_KEYS[b])}</button>{/each}</div>
          <span class="muted small">{t("setup.licenseHint")}</span>
        </div>
        <div class="wz-sec">
          <span class="dlabel">{t("setup.card")}{#if ai("creditCard")} <span class="wz-ai-tag">{t("setup.fromText")}</span>{/if}</span>
          <div class="chips">{#each [true, false] as v (v)}<button type="button" class="chip" class:on={d.creditCard === v} aria-pressed={d.creditCard === v} onclick={() => (d.creditCard = d.creditCard === v ? null : v)}>{yesNo(v)}</button>{/each}</div>
          <span class="muted small">{t("setup.cardHint")}</span>
        </div>
        <div class="wz-sec">
          <span class="dlabel">{t("setup.car")}{#if ai("car")} <span class="wz-ai-tag">{t("setup.fromText")}</span>{/if}</span>
          <div class="wz-grid">
            <label class="f">{t("setup.carSeats")}<select value={d.prefs.car?.seats ?? ""} onchange={e => setCar("seats", num(e.currentTarget.value))}><option value="">{t("setup.noCar")}</option>{#each [2, 3, 4, 5, 6, 7, 8, 9] as n}<option value={n}>{n}</option>{/each}</select></label>
            <div class="chips wz-fuel">{#each FUELS as f (f)}<button type="button" class="chip" class:on={d.prefs.car?.fuel === f} aria-pressed={d.prefs.car?.fuel === f} onclick={() => setCar("fuel", f)}>{t(`setup.fuel.${f}` as Key)}</button>{/each}</div>
          </div>
        </div>
        <div class="wz-sec">
          <span class="dlabel">{t("setup.rail")}{#if ai("rail")} <span class="wz-ai-tag">{t("setup.fromText")}</span>{/if}</span>
          <div class="chips">{#each RAIL_DE as r (r)}<button type="button" class="chip" class:on={d.rail.includes(r)} aria-pressed={d.rail.includes(r)} onclick={() => (d.rail = d.rail.includes(r) ? d.rail.filter(x => x !== r) : [...d.rail, r])}>{t(`setup.rail.${r}` as Key)}</button>{/each}</div>
        </div>

      {:else if STEPS[step] === "who"}
        <p class="wz-lead">{t("setup.whoLead")}</p>
        {#if ai("companions")}<p class="wz-note">✨ {t("setup.whoAi")}</p>{/if}
        <div class="wz-people">
          {#each d.companions as c, i (i)}
            <div class="wz-person" class:off={!c.on}>
              {#if c.id}
                <label class="wz-check"><input type="checkbox" bind:checked={c.on} /> <b>{c.first}</b>{#if c.age != null}<span class="muted"> · {t("trav.ageYears", { n: c.age })}</span>{/if}</label>
              {:else}
                <input class="inp wz-pfirst" bind:value={c.first} placeholder={t("setup.firstPh")} aria-label={t("setup.first")} />
                <input class="inp n sm wz-page" type="number" min="0" max="120" value={c.age ?? ""} oninput={e => (c.age = num(e.currentTarget.value) ?? null)} placeholder={t("trav.age")} aria-label={t("trav.age")} />
                <button type="button" class="linkbtn danger" onclick={() => dropCompanion(i)} aria-label={t("setup.remove")}>×</button>
              {/if}
            </div>
          {/each}
        </div>
        <button type="button" class="btn wz-add" onclick={addCompanion}>+ {t("setup.addPerson")}</button>
        {#if d.companions.some(c => c.on)}
          <label class="f">{t("setup.group")}<input class="wz-group" bind:value={d.group} placeholder={t("setup.groupDefault")} /></label>
          {#if d.companions.some(c => c.on && !c.id && !c.first.trim())}<p class="muted small">{t("setup.unnamed")}</p>{/if}
        {/if}

      {:else if STEPS[step] === "how"}
        <div class="wz-sec"><span class="dlabel">{t("prefs.style")}{#if ai("styles")} <span class="wz-ai-tag">{t("setup.fromText")}</span>{/if}</span>
          <div class="chips">{#each STYLES as s (s)}<button type="button" class="chip" class:on={d.prefs.styles?.includes(s)} aria-pressed={!!d.prefs.styles?.includes(s)} onclick={() => toggleIn("styles", s)}>{t(`prefs.s.${s}` as Key)}</button>{/each}</div></div>
        <div class="wz-sec"><span class="dlabel">{t("prefs.budget")}</span>
          <div class="chips">{#each ["low", "mid", "high"] as const as b (b)}<button type="button" class="chip" class:on={d.prefs.budget === b} aria-pressed={d.prefs.budget === b} onclick={() => pick("budget", b)}>{t(`prefs.b.${b}` as Key)}</button>{/each}</div></div>
        <div class="wz-sec"><span class="dlabel">{t("prefs.stay")}{#if ai("stayType") || ai("board")} <span class="wz-ai-tag">{t("setup.fromText")}</span>{/if}</span>
          <div class="chips">{#each [["whole", "st.whole"], ["hotel", "st.hotel"], ["all", "prefs.anyType"]] as const as [v, k] (v)}<button type="button" class="chip" class:on={d.prefs.stayType === v} aria-pressed={d.prefs.stayType === v} onclick={() => pick("stayType", v)}>{t(k)}</button>{/each}</div>
          <div class="chips">{#each BOARDS as b (b)}<button type="button" class="chip" class:on={d.prefs.board === b} aria-pressed={d.prefs.board === b} onclick={() => pick("board", b)}>{t(`board.${b}` as Key)}</button>{/each}</div>
          <div class="chips">{#each [2, 3, 4, 5] as n (n)}<button type="button" class="chip" class:on={d.prefs.minStars === n} aria-pressed={d.prefs.minStars === n} onclick={() => pick("minStars", n)}>{"★".repeat(n)}</button>{/each}</div></div>
        <div class="wz-sec"><span class="dlabel">{t("prefs.flights")}{#if ai("airports")} <span class="wz-ai-tag">{t("setup.fromText")}</span>{/if}</span>
          <span class="muted small">{t("prefs.airports")}</span>
          <div class="chips wz-aps">
            {#each apChips as c (c)}<button type="button" class="chip" class:on={d.prefs.airports?.includes(c)} aria-pressed={!!d.prefs.airports?.includes(c)} title={apName(c)} onclick={() => toggleAp(c)}>{c}</button>{/each}
            <LocationPicker cls="fs-add" placeholder={t("fs.addOrigin")} clearOnPick onpick={addAp} />
          </div>
          {#if nearAps.length}<span class="muted small">{t("setup.apsNear")}</span>{/if}
          <div class="chips"><span class="muted small">{t("prefs.maxStops")}:</span>{#each [0, 1, 2] as n (n)}<button type="button" class="chip" class:on={d.prefs.maxStops === n} aria-pressed={d.prefs.maxStops === n} onclick={() => pick("maxStops", n)}>{n}</button>{/each}</div>
          <div class="chips"><span class="muted small">{t("prefs.bags")}:</span>{#each [true, false] as v (v)}<button type="button" class="chip" class:on={d.prefs.bags === v} aria-pressed={d.prefs.bags === v} onclick={() => pick("bags", v)}>{v ? t("prefs.bagsYes") : t("prefs.bagsNo")}</button>{/each}</div></div>

      {:else if STEPS[step] === "when"}
        <label class="f">{t("prefs.holidays")}{#if ai("holidays")} <span class="wz-ai-tag">{t("setup.fromText")}</span>{/if}
          <select class="wz-hol" value={d.prefs.holidays ?? ""} onchange={e => setP("holidays", e.currentTarget.value || undefined)}>
            <option value="">{t("prefs.unset")}</option>{#each STATES as s (s)}<option value={s}>{STATE_NAMES[s]}</option>{/each}
          </select></label>
        <div class="wz-sec"><span class="dlabel">{t("prefs.months")}</span>
          <div class="chips">{#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}<button type="button" class="chip sm" class:on={d.prefs.months?.includes(m)} aria-pressed={!!d.prefs.months?.includes(m)} onclick={() => toggleIn("months", m)}>{monthName(m)}</button>{/each}</div></div>
        <label class="f">{t("prefs.nights")}
          <span class="in-row">
            <input class="n sm" type="number" min="1" max="60" value={d.prefs.nightsMin ?? ""} oninput={e => setP("nightsMin", num(e.currentTarget.value))} aria-label={t("setup.nightsMin")} />
            –
            <input class="n sm" type="number" min="1" max="60" value={d.prefs.nightsMax ?? ""} oninput={e => setP("nightsMax", num(e.currentTarget.value))} aria-label={t("setup.nightsMax")} />
          </span></label>

      {:else if STEPS[step] === "more"}
        <label class="wz-tg"><span class="tx"><b>{t("setup.pet")}</b><span>{t("setup.petHint")}</span></span><input type="checkbox" class="sw wz-pet" checked={!!d.prefs.pet} onchange={e => setP("pet", e.currentTarget.checked || undefined)} /></label>
        <label class="wz-tg"><span class="tx"><b>{t("setup.stepFree")}</b><span>{t("setup.stepFreeHint")}</span></span><input type="checkbox" class="sw" checked={!!d.prefs.stepFree} onchange={e => setP("stepFree", e.currentTarget.checked || undefined)} /></label>
        <div class="wz-sec"><span class="dlabel">{t("setup.diet")}</span>
          <div class="chips">{#each ["veg", "vegan"] as const as v (v)}<button type="button" class="chip" class:on={d.prefs.diet === v} aria-pressed={d.prefs.diet === v} onclick={() => pick("diet", v)}>{t(`setup.diet.${v}` as Key)}</button>{/each}</div></div>
        <p class="muted small">{t("setup.noHealth")}</p>

      {:else}
        <p class="wz-lead">{t("setup.doneLead")}</p>
        <div class="wz-sum">
          {#each summary as r (r.s)}
            <div class="wz-it" class:skip={!r.v}><span class="ic">{r.icon}</span>
              <div class="tx"><b>{t(r.k as Key)}</b>{r.v || t("setup.skipped")}</div>
              <button type="button" class="linkbtn" onclick={() => (step = r.s)}>{t("setup.change")}</button></div>
          {/each}
        </div>
        {#if cloud.user && FLIGHTS_URL}
          <div class="wz-idea">💡 <b>{t("setup.firstTrip")}</b> {t("setup.firstTripHint")}
            <button type="button" class="btn wz-first" onclick={firstTrip}>{t("setup.firstTripGo")}</button></div>
        {/if}
      {/if}
    </div>

    <div class="wz-f">
      {#if step > 0}<button type="button" class="linkbtn" onclick={() => (step -= 1)}>{t("setup.back")}</button>{/if}
      <span class="sp"></span>
      {#if step === -1}
        <button type="button" class="linkbtn wz-later" onclick={close}>{t("setup.later")}</button>
      {:else if step < STEPS.length - 1}
        <button type="button" class="linkbtn wz-skip" onclick={() => next(false)}>{t("setup.skip")}</button>
        <button type="button" class="btn primary wz-next" onclick={() => next()}>{t("setup.next")}</button>
      {:else}
        <button type="button" class="btn primary wz-done" onclick={finish}>{t("setup.finish")}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .wz-bg { --a: var(--c-trav); --a-soft: var(--c-trav-s); }
  .wz { width: min(640px, 100%); max-height: calc(100dvh - 32px); display: flex; flex-direction: column; background: var(--paper); color: var(--ink); border-radius: 22px; box-shadow: var(--shadow); overflow: hidden; text-align: start; }
  .wz-h { padding: 16px 20px 12px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--line); }
  .wz-t { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .wz-t h3 { font-size: 21px; }
  .wz-steps { display: flex; gap: 4px; }
  .wz-steps i { flex: 1; height: 5px; border-radius: 9px; background: var(--line); }
  .wz-steps i.done { background: var(--a); }
  .wz-steps i.cur { background: linear-gradient(90deg, var(--a) 50%, var(--line) 50%); }
  :global([dir="rtl"]) .wz-steps i.cur { background: linear-gradient(270deg, var(--a) 50%, var(--line) 50%); }
  .wz-lbl { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--ink-3); font-weight: 600; }
  .wz-lbl b { color: var(--a); }
  .wz-b { flex: 1; padding: 18px 20px; overflow: auto; display: flex; flex-direction: column; gap: 16px; }
  .wz-f { padding: 12px 20px; border-top: 1px solid var(--line); display: flex; gap: 12px; align-items: center; }
  .wz-f .sp { flex: 1; }
  .wz-f .linkbtn { font-weight: 600; font-size: 14px; padding: 9px 4px; }
  .wz-lead { font-size: 15px; color: var(--ink-2); margin: 0; }
  .wz-note { margin: 0; font-size: 13px; color: var(--idea); font-weight: 600; }
  .wz-ai { border: 1px solid var(--idea); background: var(--idea-soft); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .wz-ai h4 { margin: 0; font-size: 15px; color: var(--idea); }
  .wz-ai .muted { margin-top: -6px; }
  .wz-text { font: inherit; font-size: 14px; border: 1px solid var(--line); border-radius: 12px; padding: 10px; background: var(--paper); color: var(--ink); resize: vertical; min-height: 96px; }
  .wz-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .wz-ai .btn.primary { background: var(--idea); border-color: var(--idea); }
  .wz-or { display: flex; align-items: center; gap: 10px; color: var(--ink-3); font-size: 12.5px; font-weight: 600; }
  .wz-or::before, .wz-or::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .wz-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: end; }
  .wz-hint { align-self: center; }
  .wz-sec { display: flex; flex-direction: column; gap: 8px; }
  .wz-lock { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--ink-2); background: var(--paper-2); border: 1px solid var(--line); border-radius: 12px; padding: 9px 11px; }
  .wz-lock b { color: var(--ink); }
  .wz-tg { display: flex; align-items: flex-start; gap: 12px; padding: 11px 12px; border: 1px solid var(--line); border-radius: 14px; cursor: pointer; }
  .wz-tg .tx { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .wz-tg .tx b { font-size: 14px; }
  .wz-tg .tx span { font-size: 12.5px; color: var(--ink-2); }
  .sw { appearance: none; -webkit-appearance: none; width: 42px; height: 24px; border-radius: 99px; background: var(--line); position: relative; flex-shrink: 0; margin: 2px 0 0; cursor: pointer; transition: background .2s; }
  .sw::after { content: ""; position: absolute; top: 3px; inset-inline-start: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .2); transition: inset-inline-start .2s; }
  .sw:checked { background: var(--a); }
  .sw:checked::after { inset-inline-start: 21px; }
  .sw:focus-visible { outline: 2px solid var(--a); outline-offset: 2px; }
  .chips .chip { padding: 7px 14px; font-size: 13.5px; }
  .chips .chip.sm { padding: 5px 10px; }
  .wz-nat { width: auto; font-size: 13px; padding: 6px 30px 6px 10px; border-radius: 99px; }
  .wz-ai-tag { font-size: 10.5px; font-weight: 700; color: var(--idea); background: var(--idea-soft); border-radius: 99px; padding: 1px 7px; text-transform: none; letter-spacing: 0; }
  .wz-people { display: flex; flex-direction: column; gap: 8px; }
  .wz-person { display: flex; gap: 8px; align-items: center; }
  .wz-person.off { opacity: .6; }
  .wz-pfirst { flex: 1; min-width: 0; }
  .wz-page { width: 80px; }
  .wz-check { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; padding: 6px 0; }
  .wz-add { align-self: flex-start; }
  .wz-sum { display: flex; flex-direction: column; gap: 8px; }
  .wz-it { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; }
  .wz-it .ic { width: 30px; height: 30px; border-radius: 10px; background: var(--a-soft); display: grid; place-items: center; font-size: 16px; flex-shrink: 0; }
  .wz-it .tx { flex: 1; font-size: 13.5px; min-width: 0; overflow-wrap: anywhere; }
  .wz-it .tx b { display: block; font-size: 11.5px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .05em; }
  .wz-it.skip .tx { color: var(--ink-3); }
  .wz-it .linkbtn { font-weight: 700; font-size: 13px; }
  .wz-idea { border: 1px dashed var(--a); border-radius: 16px; padding: 12px 14px; background: var(--a-soft); font-size: 14px; }
  .wz-idea b { color: var(--a); }
  .wz-idea .btn { display: block; margin-top: 8px; }
  @media (max-width: 560px) {
    .wz-bg { padding: 0; place-items: stretch; }
    .wz { max-height: none; height: 100dvh; border-radius: 0; width: 100%; }
    .wz-grid { grid-template-columns: 1fr; }
    .wz-f .btn { padding: 11px 16px; }
  }
</style>
