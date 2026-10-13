<script lang="ts">
  /* Details einer gespeicherten Person: Geburtsdatum, Wohnort, Buchungsdaten (nur im Konto, erst auf Wunsch geladen) */
  import BirthInput from "./BirthInput.svelte";
  import { t } from "../i18n/index.svelte";
  import type { Person, TravelDoc } from "../model";
  import { personAge } from "../people";
  import HomeInput from "./HomeInput.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { docOf, docs, hasDoc, loadDocs, removeDoc } from "../traveldocs.svelte";

  let { p }: { p: Person } = $props();

  const age = $derived(p.birth ? personAge(p) : null);
  const today = new Date().toISOString().slice(0, 10);

  let show = $state(false);
  function toggleDocs() {
    show = !show;
    if (show) void loadDocs();
  }
  $effect(() => { if (show && docs.status === "ready" && !docs.map[p.id]) docOf(p.id); });
  const d = $derived<TravelDoc | null>(show && docs.status === "ready" ? docs.map[p.id] ?? null : null);
  const expired = (v?: string) => !!v && v < today;
</script>

<div class="pdet">
  <div class="ed-row">
    <div class="f"><span>{t("per.birth")}</span><BirthInput bind:value={p.birth} /></div>
    {#if p.birth}
      <span class="muted ed-note">{age != null ? t("trav.ageYears", { n: age }) : ""}</span>
    {:else}
      <label class="f">{t("trav.age")}<input class="n sm" type="number" min="0" max="120" bind:value={p.age} /></label>
    {/if}
  </div>
  {#if !p.birth}<p class="muted small">{t("per.birthHint")}</p>{/if}

  <div class="ed-row">
    <HomeInput cls="f plzf" label={t("hh.home")} value={p.home} onpick={h => (p.home = { plz: h.plz, ort: h.ort, lat: h.lat, lon: h.lon, ...(h.cc !== "DE" ? { cc: h.cc } : {}) })} onclear={() => (p.home = undefined)} />
  </div>
  <p class="muted small">{t("per.homeHint")}</p>

  <div class="pdocs">
    <button type="button" class="linkbtn" aria-expanded={show} onclick={toggleDocs}>🔒 {t("per.docs")} · {show ? t("per.docsHide") : t("per.docsShow")}</button>
    {#if show}
      <p class="muted small">{t("per.docsHint")}</p>
      {#if !cloud.user}
        <p class="small">{t("per.docsLogin")}</p>
      {:else if docs.status === "loading" || docs.status === "off"}
        <p class="muted small">{t("per.docsLoading")}</p>
      {:else if docs.status === "error"}
        <p class="err">{t("per.docsError")} <button type="button" class="linkbtn" onclick={() => loadDocs()}>{t("per.retry")}</button></p>
      {:else if d}
        <div class="ed-row">
          <label class="f grow">{t("per.docFirst")}<input bind:value={d.first} placeholder={p.first} autocomplete="off" /></label>
          <label class="f grow">{t("per.docLast")}<input bind:value={d.last} placeholder={p.last} autocomplete="off" /></label>
        </div>
        <p class="muted small">{t("per.docNameHint")}</p>
        <div class="ed-row">
          <label class="f">{t("per.gender")}
            <select bind:value={d.gender}>
              <option value={undefined}>–</option>
              <option value="f">{t("per.g.f")}</option>
              <option value="m">{t("per.g.m")}</option>
              <option value="x">{t("per.g.x")}</option>
            </select>
          </label>
          <label class="f grow">{t("per.nationality")}<input bind:value={d.nationality} placeholder={t("per.nationalityPh")} autocomplete="off" /></label>
        </div>
        <div class="ed-row">
          <label class="f grow">{t("per.idNo")}<input bind:value={d.idNo} autocomplete="off" spellcheck="false" /></label>
          <label class="f">{t("per.validUntil")}<input type="date" bind:value={d.idExpiry} /></label>
          {#if expired(d.idExpiry)}<span class="err ed-note">{t("per.expired")}</span>{/if}
        </div>
        <div class="ed-row">
          <label class="f grow">{t("per.passNo")}<input bind:value={d.passNo} autocomplete="off" spellcheck="false" /></label>
          <label class="f">{t("per.validUntil")}<input type="date" bind:value={d.passExpiry} /></label>
          <label class="f">{t("per.passCountry")}<input class="sm" bind:value={d.passCountry} autocomplete="off" /></label>
          {#if expired(d.passExpiry)}<span class="err ed-note">{t("per.expired")}</span>{/if}
        </div>
        <div class="ed-row">
          <span class="muted small">{docs.saving ? t("per.saving") : hasDoc(p.id) ? t("per.savedAccount") : ""}</span>
          {#if hasDoc(p.id)}<button type="button" class="linkbtn danger" onclick={() => removeDoc(p.id)}>{t("per.docsDelete")}</button>{/if}
        </div>
      {/if}
    {/if}
  </div>
</div>
