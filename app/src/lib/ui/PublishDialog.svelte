<script lang="ts">
  import { ask } from "./ask.svelte";
  /*
   * Reise im Katalog veröffentlichen (#644, Entwurf mit Dani 02.11.: Reise-Menü, zwei Schritte). Nur mit Konto und
   * Benutzernamen (sonst zuerst das Namensfeld). Schritt 1: Titel, Kurzbeschreibung, Reiseart, gute Monate (vorbelegt aus
   * der Reise) und Plausibilitätscheck (rot blockiert, gelb als Hinweis). Schritt 2: Vorschau genau wie im Katalog,
   * Zustimmung zu den Bedingungen, veröffentlichen. Danach: aktualisieren, ansehen, zurückziehen.
   */
  import { onMount, untrack } from "svelte";
  import { locale, t, type Key } from "../i18n/index.svelte";
  import { app, openCatalog } from "../store.svelte";
  import { cloud, hasAccount, publishEntry, withdrawEntry } from "../cloud/cloud.svelte";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf, findCity } from "../geo/places";
  import { resolveLoc } from "../geo/locations";
  import { tripToCatalog } from "../catalog/fromTrip";
  import { catalogDoc, draftEntry, fetchEntry, inputOf, PUB_LIMITS, tripPub, type PublishInput } from "../catalog/publish";
  import type { Finding } from "../catalog/check";
  import { CATALOG_KINDS } from "../catalog/types";
  import { uid } from "../model";
  import { legalUrl } from "../legal";
  import Modal from "./Modal.svelte";
  import UsernameField from "./UsernameField.svelte";
  import Catalog from "./Catalog.svelte";

  let { onclose }: { onclose: () => void } = $props();

  let ready = $state(false);
  const pub = $derived(app.trip.pub);
  const minePub = $derived(!!pub && pub.uid === cloud.user?.uid);
  let step = $state<"info" | "form" | "preview" | "done">(untrack(() => (app.trip.pub ? "info" : "form")));
  let doneMsg = $state<Key>("pub.done");
  let agree = $state(false);
  let busy = $state(false);
  let err = $state("");
  // neue Kennung einmal je Dialog; beim Aktualisieren die bisherige
  const newId = uid() + uid();

  onMount(() => {
    void Promise.all([ensureGeo(app.trip), ensureAirports()]).catch(() => {}).finally(() => (ready = true));
    // anderswo zurückgezogen (Katalog, Konto zurückgesetzt): Verweis in der Reise lösen
    const p = app.trip.pub;
    if (p && p.uid === cloud.user?.uid) void fetchEntry(p.id).then(e => { if (!e && app.trip.pub?.id === p.id) { delete app.trip.pub; step = "form"; } }).catch(() => {});
  });

  /** Ortsname → Lage: Orte der Länder, sonst Städte und Flughäfen */
  const resolve = (name: string) => {
    const cc = ccOf(geo, app.trip.country);
    const c = findCity(geo, name, cc) || findCity(geo, name);
    if (c) return { lat: c.lat, lon: c.lon, cc: c.cc };
    const l = resolveLoc(airportData, name, cc);
    return l && l.lat != null && l.lon != null ? { lat: l.lat, lon: l.lon, cc: l.cc } : null;
  };
  const base = $derived.by(() => {
    void ready; void geo.world.length; void airportData.cities.length;
    return tripToCatalog(app.trip, { lang: locale(), today: new Date().toISOString().slice(0, 10), resolve });
  });
  let input = $state<PublishInput>(untrack(() => (app.trip.pub?.input ? { ...app.trip.pub.input, months: [...app.trip.pub.input.months] } : inputOf(base))));
  const draft = $derived(cloud.username ? draftEntry(app.trip, base, input, { by: cloud.username, id: pub?.id || newId }) : null);
  const reds = $derived(draft?.findings.filter(f => f.level === "red") || []);
  const yellows = $derived(draft?.findings.filter(f => f.level === "yellow") || []);

  const fText = (f: Finding) => t(`pub.c.${f.code}` as Key, { ...(f.v || {}), ...(f.day ? { day: f.day } : {}) });
  const monthName = (m: number) => new Date(2026, m - 1, 1).toLocaleDateString(locale(), { month: "short" });
  const toggleMonth = (m: number) => { input.months = input.months.includes(m) ? input.months.filter(x => x !== m) : [...input.months, m].sort((a, b) => a - b); };
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

  function toPreview() { if (!draft || draft.blocked) return; agree = false; err = ""; step = "preview"; scrollUp(); }
  function scrollUp() { requestAnimationFrame(() => document.querySelector(".pub")?.closest(".modal, [role=dialog]")?.scrollTo?.({ top: 0 })); }

  async function go() {
    if (!draft || draft.blocked || !agree || busy) return;
    const doc = catalogDoc(draft.entry);
    if (!doc) { err = t("pub.tooBig"); return; }
    busy = true; err = "";
    try {
      const was = !!app.trip.pub;
      const owner = await publishEntry(draft.entry.id, doc);
      app.trip.pub = tripPub(draft.entry.id, owner, input);
      doneMsg = was ? "pub.updated" : "pub.done";
      step = "done";
    } catch { err = t("pub.err"); }
    finally { busy = false; }
  }
  async function withdraw() {
    const p = app.trip.pub;
    if (!p || !await ask(t("pub.withdrawQ"), { ok: t("pub.withdraw") })) return;
    busy = true; err = "";
    try {
      await withdrawEntry(p.id);
      delete app.trip.pub;
      doneMsg = "pub.withdrawn";
      step = "done";
    } catch { err = t("pub.err"); }
    finally { busy = false; }
  }
  function view(id: string) { onclose(); openCatalog(id); }
</script>

<Modal title={t("pub.title")} {onclose} wide>
  <div class="pub">
    {#if !hasAccount()}
      <p>{t("pub.needLogin")}</p>
      <button class="btn primary" onclick={() => { onclose(); cloud.showLogin = true; }}>{t("pub.login")}</button>
    {:else if pub && !minePub}
      <p class="muted">{t("pub.other")}</p>
    {:else if cloud.username === undefined}
      <p class="muted">{t("pub.checking")}</p>
    {:else if !cloud.username}
      <p>{t("pub.nameFirst")}</p>
      <UsernameField />
    {:else if step === "done"}
      <p class="pub-done">✓ {t(doneMsg)}</p>
      <div class="pub-acts">
        {#if app.trip.pub}<button class="btn primary pub-view" onclick={() => view(app.trip.pub!.id)}>{t("pub.view")}</button>{/if}
        <button class="btn" onclick={onclose}>{t("close")}</button>
      </div>
    {:else if step === "info" && pub}
      <p class="pub-on">🌍 <b>{t("pub.on", { d: day(pub.at) })}</b></p>
      <p class="muted small">{t("pub.onNote")}</p>
      <div class="pub-acts col">
        <button class="btn primary pub-upd" onclick={() => (step = "form")}>{t("pub.update")}</button>
        <button class="btn pub-view" onclick={() => view(pub.id)}>{t("pub.view")}</button>
        <button class="btn pub-withdraw" disabled={busy} onclick={withdraw}>{t("pub.withdraw")}</button>
      </div>
      {#if err}<p class="err small">{err}</p>{/if}
    {:else if step === "form"}
      <small class="pub-step">{t("pub.step1")}</small>
      <p class="muted small">{t("pub.lead")}</p>
      <label class="f">{t("pub.f.title")}
        <input class="pub-title" bind:value={input.title} maxlength={PUB_LIMITS.title} />
      </label>
      <label class="f">{t("pub.f.summary")}
        <textarea class="pub-summary" rows="3" bind:value={input.summary} maxlength={PUB_LIMITS.summary} placeholder={t("pub.f.summaryPh")}></textarea>
        <small class="muted pub-count">{input.summary.length}/{PUB_LIMITS.summary}</small>
      </label>
      <label class="f">{t("pub.f.kind")}
        <select class="pub-kind" bind:value={input.kind}>
          {#each CATALOG_KINDS as k (k)}<option value={k}>{t(`cat.kind.${k}` as Key)}</option>{/each}
        </select>
      </label>
      <fieldset class="pub-months"><legend>{t("pub.f.months")}</legend>
        <div class="chips">
          {#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}
            <button type="button" class="chip" class:on={input.months.includes(m)} aria-pressed={input.months.includes(m)} onclick={() => toggleMonth(m)}>{monthName(m)}</button>
          {/each}
        </div>
      </fieldset>
      <section class="pub-check" aria-live="polite">
        <h3>{t("pub.check")}</h3>
        {#if !reds.length && !yellows.length}<p class="pub-ok">✓ {t("pub.checkOk")}</p>{/if}
        {#if reds.length}
          <ul class="pub-f red">{#each reds as f, i (i)}<li><span aria-hidden="true">✕</span> {fText(f)}</li>{/each}</ul>
          <small class="muted">{t("pub.redNote")}</small>
        {/if}
        {#if yellows.length}
          <ul class="pub-f yellow">{#each yellows as f, i (i)}<li><span aria-hidden="true">⚠</span> {fText(f)}</li>{/each}</ul>
          <small class="muted">{t("pub.yellowNote")}</small>
        {/if}
      </section>
      <div class="pub-acts">
        {#if pub}<button class="btn" onclick={() => (step = "info")}>{t("pub.back")}</button>{/if}
        <button class="btn primary pub-next" disabled={!draft || draft.blocked} onclick={toPreview}>{t("pub.next")}</button>
      </div>
    {:else if draft}
      <small class="pub-step">{t("pub.step2")}</small>
      <p class="muted small">{t("pub.prevNote")}</p>
      <div class="pub-prev"><Catalog preview={draft.entry} /></div>
      <label class="check pub-agree"><input type="checkbox" bind:checked={agree} /> <span>{t("pub.terms")} <a href="{legalUrl('terms')}#katalog" target="_blank" rel="noopener">{t("pub.termsLink")} ↗</a></span></label>
      {#if err}<p class="err small">{err}</p>{/if}
      <div class="pub-acts">
        <button class="btn" onclick={() => { step = "form"; scrollUp(); }}>{t("pub.back")}</button>
        <button class="btn primary pub-go" disabled={!agree || busy} onclick={go}>{busy ? t("pub.busy") : pub ? t("pub.update") : t("pub.go")}</button>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .pub { display: grid; gap: 14px; text-align: start; min-width: 0; }
  .pub > * { min-width: 0; }
  .pub p { margin: 0; }
  .pub-step { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-2); }
  .pub textarea { resize: vertical; font: inherit; font-size: 14px; font-weight: 500; color: var(--ink); background: var(--paper-2); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
  .pub textarea:focus { outline: 2px solid var(--a); outline-offset: 0; background-color: var(--paper); }
  .pub-title, .pub-kind { min-height: 44px; }
  .pub-count { justify-self: end; font-size: 12px; }
  .pub-months { border: 0; margin: 0; padding: 0; display: grid; gap: 8px; }
  .pub-months legend { font-weight: 600; margin-bottom: 8px; padding: 0; }
  .pub-months .chip { min-height: 44px; min-width: 56px; }
  .pub-check { display: grid; gap: 6px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--paper-2); }
  .pub-check h3 { margin: 0; font-size: 15px; }
  .pub-ok { color: var(--good); font-weight: 600; }
  .pub-f { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .pub-f li { line-height: 1.4; }
  .pub-f.red li { color: var(--bad); font-weight: 600; }
  .pub-f.yellow li { color: var(--warn); }
  .pub-prev { border: 1px dashed var(--line); border-radius: 18px; padding: 12px; background: var(--paper-2); }
  .pub-agree { align-items: flex-start; line-height: 1.4; }
  .pub-agree input { margin-top: 3px; flex: none; width: 20px; height: 20px; }
  .pub-acts { display: flex; gap: 10px; flex-wrap: wrap; }
  .pub-acts .btn { min-height: 48px; flex: 1; }
  .pub-acts.col { flex-direction: column; }
  .pub-withdraw { color: var(--bad); }
  .pub-done { font-weight: 700; color: var(--good); }
</style>
