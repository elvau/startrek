<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  import SearchLoading from "./SearchLoading.svelte";
  /*
   * Reise per KI importieren (#457): Dateien (auch per Ziehen, Einfügen oder Teilen-Menü), Text oder Link einwerfen,
   * auslesen lassen, daraus eine Reise anlegen. Über „Neue Reise“ entsteht immer eine Reise. Nur mit Anmeldung.
   * Realitätscheck (#461, check): dieselben Schritte, danach nur der Bericht an einem Entwurf; „Als Reise übernehmen“
   * legt die Reise erst dann an. Paket (#188, into): in die offene Reise, ohne eine neue anzulegen.
   * Ohne Flug (#475): Anreise als Posten, sobald Wohnort und Ziel (Ortsdaten) bekannt sind.
   * Import je Einstieg (#615, into mit scope): nur die Teile des Kapitels; weitere Funde als Rückfrage zum Anhaken.
   * Mit itemId kommen die Angebote an diesen Posten statt als neuer Posten.
   */
  import { app, draftTrip, startTrip } from "../store.svelte";
  import RealityReport from "./RealityReport.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { IMPORT_FILES_MAX } from "../import/ai";
  import { ACCEPT, prepare, type Prepared } from "../import/files";
  import { askImport, ImportError } from "../import/app";
  import { importParty, importToTrip } from "../import/apply";
  import { reviewOf } from "../import/review";
  import type { ImportedOffer } from "../import/ai";
  import ImportReview from "./ImportReview.svelte";
  import ImportParts from "./ImportParts.svelte";
  import { applyArrival, applyParts, arrivalOf, defaultChoices, hasMissing, type Choices } from "../import/parts";
  import { homeOf, type Spot } from "../ground";
  import { ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf, findCity } from "../geo/places";
  import { withHome } from "../plz";
  import type { Home } from "../home";
  import { hhKey, isActive } from "../model";
  import { openFlightSearch } from "../flights/open.svelte";
  import { openStaySearch } from "../stays/open.svelte";
  import { openExplore } from "../activities/open.svelte";
  import type { Item, Traveler, Trip } from "../model";
  import { SRC_ICON } from "../import/icons";
  import { mergeInto, packagePriced, pickParts, preselectMore, splitScope, type ImportScope, type OfferPart } from "../import/scope";

  let { onclose, travelers, peopleKnown = false, check = false, into = false, scope = "all", itemId, onitems, shared = [], sharedText = "", sharedUrl = "" }: { onclose: () => void; travelers?: () => Traveler[] | undefined; peopleKnown?: boolean; check?: boolean; into?: boolean; scope?: ImportScope; itemId?: string; onitems?: (items: Item[]) => void; shared?: File[]; sharedText?: string; sharedUrl?: string } = $props();
  // ausgelesen, noch nicht angelegt: Übersicht mit Sicherheit und Rückfragen (#458)
  let found = $state<ImportedOffer | null>(null);
  // schon geprüft (Angebotsspeicher, #462): gültig bis
  let cachedUntil = $state("");
  // danach (#459): was fehlt noch? Auswahl je fehlendem Baustein
  let stage = $state<"more" | "review" | "parts" | "report">("review");
  // Import je Einstieg (#615): Teile im Kapitel und weitere Funde, angehakt = mit übernehmen
  let inScope = $state<OfferPart[]>([]), more = $state<OfferPart[]>([]), picked = $state<OfferPart[]>([]);
  const PART_KEY: Record<OfferPart, Key> = { flights: "imp.f.flights", stay: "imp.f.stay", cruise: "imp.f.cruise", transfer: "imp.f.transfer", rental: "imp.kind.rental", offer: "imp.kind.other" };
  // Preis gilt nur für das ganze Paket: Hinweis bei der Rückfrage
  const packagePrice = $derived(!!found && packagePriced(found));
  const PART_ICO: Record<OfferPart, string> = { flights: "✈", stay: "🛏", cruise: "🚢", transfer: "🚌", rental: "🚗", offer: "🎟" };
  // Realitätscheck: Entwurf der Reise, nicht gespeichert
  let draft = $state<Trip | null>(null);
  let choices = $state<Choices>({});
  // Wohnort für die Anreise ohne Flug, wenn die neue Reise keinen kennt
  let home = $state<Home | null>(null);
  const askHome = $derived.by(() => {
    if (!found || !arrivalOf(choices)) return false;
    const d = draftTrip(travelers?.());
    importParty(d, found);
    return !homeOf(d);
  });
  type Src = "file" | "text" | "link" | "paste";
  const SRCS: Src[] = ["file", "text", "link", "paste"];
  let src = $state<Src>("file");
  let prepared = $state<Prepared[]>([]);
  let text = $state(""), url = $state("");
  let notes = $state<string[]>([]);
  let busy = $state(false), err = $state(""), retryable = $state(false), slow = $state(false), over = $state(false);
  let ctrl: AbortController | undefined;
  const ready = $derived(prepared.length > 0 || text.trim().length >= 3 || /^https?:\/\/\S+\.\S+/i.test(url.trim()));

  async function add(files: Iterable<File>) {
    const list = [...files];
    const msgs: string[] = [];
    for (const f of list) {
      if (prepared.length >= IMPORT_FILES_MAX) { msgs.push(t("imp.tooMany", { n: IMPORT_FILES_MAX })); break; }
      const p = await prepare(f);
      if ("error" in p) msgs.push(t(`imp.${p.error}` as Key, { name: p.name }));
      else prepared = [...prepared, p];
    }
    notes = msgs;
    if (prepared.length) src = "file";
  }
  // Dateien aus dem Teilen-Menü (Handy) gleich übernehmen
  let took = false;
  $effect(() => {
    if (took || !(shared.length || sharedText || sharedUrl)) return;
    took = true;
    text = sharedText; url = sharedUrl;
    if (!shared.length) src = sharedUrl && !sharedText ? "link" : "text";
    void add(shared).then(() => (notes = [t("imp.shared"), ...notes]));
  });

  async function paste() {
    notes = [];
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const it of items) {
        const type = it.types.find(x => x.startsWith("image/"));
        if (type) files.push(new File([await it.getType(type)], `clipboard.${type.split("/")[1]}`, { type }));
      }
      if (files.length) { await add(files); return; }
    } catch { /* ohne Berechtigung oder ohne Bild: Text versuchen */ }
    try {
      const s = (await navigator.clipboard.readText()).trim();
      if (/^https?:\/\/\S+$/i.test(s)) { url = s; src = "link"; return; }
      if (s) { text = s; src = "text"; return; }
    } catch { /* keine Berechtigung */ }
    notes = [t("imp.pasteNone")];
  }
  // Strg+V im Dialog: Bilder als Datei, sonst landet der Text im Textfeld (dort normal einfügen)
  function onpaste(e: ClipboardEvent) {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); void add(files); }
  }

  async function go() {
    if (!ready || busy) return;
    busy = true; err = ""; retryable = false; slow = false;
    ctrl = new AbortController();
    const later = setTimeout(() => (slow = true), 12000);
    try {
      const res = await askImport({ prepared, text, url }, ctrl.signal);
      const offer = res.offer;
      cachedUntil = res.until || "";
      // alles sicher erkannt: gleich anlegen, sonst erst die Übersicht
      found = offer;
      choices = defaultChoices(offer);
      if (into && scope !== "all") {
        const sp = splitScope(offer, scope);
        if (!sp.inScope.length && !sp.more.length) { found = null; err = t("imp.nothing"); return; }
        inScope = sp.inScope; more = sp.more; picked = preselectMore(offer, scope);
        if (more.length) { stage = "more"; return; }
      }
      review();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      err = (e as Error).message;
      retryable = e instanceof ImportError && e.overloaded;
      if (e instanceof ImportError && e.needScreenshot) src = "file";
    } finally { busy = false; slow = false; clearTimeout(later); }
  }
  /** alles sicher erkannt: Übersicht überspringen */
  function review() {
    if (!found) return;
    if (reviewOf(found, new Set(), peopleKnown || into).direct) next();
    else stage = "review";
  }
  /** Rückfrage „Habe auch das gefunden“ (#615): nur die Teile des Kapitels und die angehakten */
  function takeMore() {
    if (!found) return;
    found = pickParts(found, [...inScope, ...picked]);
    review();
  }
  const togglePart = (x: OfferPart) => (picked = picked.includes(x) ? picked.filter(y => y !== x) : [...picked, x]);
  /** nach der Übersicht: fehlt etwas, erst „Was fehlt noch?“, sonst anlegen */
  function next() {
    if (!found) return;
    if (check) { const d = draftTrip(); importToTrip(d, found); draft = d; stage = "report"; return; }
    // Paket in die offene Reise (#188): Ziel, Daten, Name bleiben, kein „Was fehlt noch?“
    if (into) { const items = mergeInto(app.trip, importToTrip(app.trip, found, undefined, true), itemId); onitems?.(items); onclose(); return; }
    if (hasMissing(found)) stage = "parts"; else create();
  }
  function create() {
    if (!found) return;
    startTrip(travelers?.());
    importToTrip(app.trip, found);
    const open = check ? [] : applyParts(app.trip, choices);
    if (!check && arrivalOf(choices)) void addArrival(app.trip, choices, home);
    onclose();
    // erste gewählte Suche öffnen, vorbelegt aus der Reise (Ziel, Daten, Personen); erst nach dem Wechsel der Reise,
    // der offene Suchen zuklappt
    setTimeout(() => {
      if (open[0] === "flight") openFlightSearch();
      else if (open[0] === "stay") openStaySearch();
      else if (open[0] === "fun") openExplore("tours");
    });
  }
  /** Anreise ohne Flug: Ortsdaten laden, dann als Posten (nur, wenn die Reise noch offen ist) */
  async function addArrival(trip: Trip, c: Choices, h: Home | null) {
    if (h) trip.households = withHome(trip.households, trip.travelers.filter(isActive).map(hhKey), h);
    try { await ensureGeo(trip); } catch { return; }
    if (app.trip.id !== trip.id) return;
    const city = trip.place ? findCity(geo, trip.place, ccOf(geo, trip.country)) || findCity(geo, trip.place) : null;
    const dest: Spot | null = city ? { name: trip.place, lat: city.lat, lon: city.lon, cc: city.cc } : null;
    applyArrival(app.trip, c, homeOf(app.trip), dest);
  }
  $effect(() => () => ctrl?.abort());
</script>

<div class="imp" role="group" aria-label={t("newtrip.mode.import")} {onpaste}>
  {#if !cloud.user}
    <p class="muted">{t("imp.login")}</p>
    <div class="ed-foot"><span></span><button type="button" class="btn primary" onclick={() => (cloud.showLogin = true)}>{t("acct.login")}</button></div>
  {:else if draft && stage === "report"}
    <RealityReport trip={draft} preview ontake={create} />
  {:else if found && stage === "parts"}
    <ImportParts offer={found} bind:choices bind:home {askHome} oncreate={create} onback={() => (stage = "review")} />
  {:else if found && stage === "more"}
    <div class="imp-more">
      <p class="imp-lead">{inScope.length ? t("imp.more.lead") : t("imp.more.none", { what: t(`imp.scope.${scope}` as Key) })}</p>
      <ul class="imp-more-list">
        {#each inScope as x (x)}<li><label><input type="checkbox" checked disabled /> <span aria-hidden="true">{PART_ICO[x]}</span> {t(PART_KEY[x])}</label></li>{/each}
        {#each more as x (x)}<li data-part={x}><label><input type="checkbox" checked={picked.includes(x)} onchange={() => togglePart(x)} /> <span aria-hidden="true">{PART_ICO[x]}</span> {t(PART_KEY[x])} <span class="muted small">{t("imp.more.also")}</span></label></li>{/each}
      </ul>
      {#if packagePrice}<p class="small imp-note">{t("imp.more.pkg")}</p>{/if}
      <div class="ed-foot"><button type="button" class="btn" onclick={() => (found = null)}>{t("imp.rev.back")}</button><button type="button" class="btn primary imp-more-go" disabled={!inScope.length && !picked.length} onclick={takeMore}>{t("imp.more.go")}</button></div>
    </div>
  {:else if found}
    <ImportReview bind:offer={found} {cachedUntil} peopleKnown={peopleKnown || into} {into} oncreate={next} onback={() => (found = null)} />
  {:else}
    <p class="imp-lead">{check ? t("real.lead") : into && scope !== "all" ? t("imp.leadScope", { what: t(`imp.scope.${scope}` as Key) }) : into ? t("imp.leadInto") : t("imp.lead")}</p>
    <div class="chips imp-src">
      {#each SRCS as s (s)}<button type="button" class="chip" class:on={src === s} aria-pressed={src === s} onclick={() => (s === "paste" ? void paste() : (src = s))}><span aria-hidden="true">{SRC_ICON[s]}</span> {t(`imp.src.${s}` as Key)}</button>{/each}
    </div>
    {#if src === "file" || src === "paste"}
      <label class="imp-drop" title={t("imp.pickHint")} class:over ondragover={e => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)} ondrop={e => { e.preventDefault(); over = false; if (e.dataTransfer?.files.length) void add(e.dataTransfer.files); }}>
        <span class="imp-ics" aria-hidden="true">📸 📄 🔗</span>
        <b>{t("imp.pick")}</b>
        <input type="file" multiple accept={ACCEPT} aria-label={`${t("imp.pick")}: ${t("imp.pickHint")}`} onchange={e => { const f = e.currentTarget.files; if (f) void add(f); e.currentTarget.value = ""; }} />
      </label>
    {:else if src === "text"}
      <label class="f">{t("imp.textLabel")}<textarea rows="7" bind:value={text} placeholder={t("imp.textPh")}></textarea></label>
    {:else}
      <label class="f">{t("imp.linkLabel")}<input type="url" inputmode="url" bind:value={url} placeholder="https://…" /></label>
      <span class="muted small">{t("imp.linkHint")}</span>
    {/if}
    {#if prepared.length}
      <ul class="imp-files">
        {#each prepared as p, i (p.name + i)}<li><span>{p.name}</span><button type="button" class="x" aria-label={t("imp.remove", { name: p.name })} onclick={() => (prepared = prepared.filter((_, k) => k !== i))}>×</button></li>{/each}
      </ul>
    {/if}
    {#each notes as n (n)}<p class="small imp-note" role="status">{n}</p>{/each}
    <details class="small imp-priv"><summary><span aria-hidden="true">🔒</span> {t("imp.privacyT")}</summary><p>{t("imp.privacy")}</p></details>
    {#if busy}<SearchLoading kind="import" cards={0} sub={slow ? `${t("imp.wait")} ${t("imp.waitLong")}` : t("imp.wait")} />{/if}
    {#if err}<p class="err small" role="alert">{err}{#if retryable} <button type="button" class="btn small imp-retry" disabled={busy} onclick={go}>{t("imp.retry")}</button>{/if}</p>{/if}
    <div class="ed-foot"><span class="muted small" aria-live="polite">{busy ? t("imp.busy") : ""}</span><button type="button" class="btn primary imp-go" class:busy disabled={!ready || busy} onclick={go}>{busy ? t("imp.busy") : t(check ? "real.go" : into ? "imp.goInto" : "imp.go")}</button></div>
  {/if}
</div>

<style>
  .imp { display: flex; flex-direction: column; gap: 12px; }
  .imp-lead { margin: 0; color: var(--ink-2); }
  .imp-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 150px; padding: 18px; text-align: center; border: 2px dashed color-mix(in srgb, var(--a) 40%, var(--line)); border-radius: 16px; background: var(--paper); cursor: pointer; }
  .imp-drop.over, .imp-drop:focus-within { border-color: var(--a); background: var(--a-soft); }
  .imp-drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .imp textarea { width: 100%; resize: vertical; }
  .imp-files { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .imp-files li { display: flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border: 1px solid var(--line); border-radius: 99px; background: var(--paper-2); font-size: 13px; max-width: 100%; }
  .imp-files span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .imp-files .x { width: 32px; height: 32px; border: 0; background: transparent; font-size: 18px; color: var(--ink-2); }
  .imp-note { margin: 0; color: var(--warn); }
  .imp-ics { font-size: 26px; letter-spacing: 4px; }
  .imp-priv { margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--paper-2); color: var(--ink-2); }
  .imp-priv summary { cursor: pointer; font-weight: 600; min-height: 28px; display: flex; align-items: center; gap: 6px; }
  .imp-priv p { margin: 6px 0 0; }
  .imp-more { display: flex; flex-direction: column; gap: 12px; }
  .imp-more-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .imp-more-list label { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); cursor: pointer; }
</style>
