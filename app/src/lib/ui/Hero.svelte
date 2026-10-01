<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import { onMount } from "svelte";
  import { access, app, calc } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import ModeSwitch from "./ModeSwitch.svelte";
  import { renameTrip, setAllDetailed, tripMode } from "../store.svelte";
  import { eur, eurPP } from "../calc";
  import { nights, range } from "../format";
  import TripEditor from "./TripEditor.svelte";
  import HeroTiles from "./HeroTiles.svelte";

  import { heroEdit } from "./heroEdit.svelte";
  // „Reise bearbeiten“ sitzt in der Leiste oben; beim Öffnen einer Reise zu
  onMount(() => { heroEdit.open = false; });
  // Überschrift: eigener Name, sonst Ort (mit Land) oder der vorläufige Name
  const custom = $derived(!app.trip.autoName && !!app.trip.name && app.trip.name !== app.trip.place);
  const named = $derived(custom ? app.trip.name : app.trip.place || app.trip.name);
  // noch ohne Ziel und Namen: „Neue Reise“ (blasser, zum Überschreiben)
  const untitled = $derived(!named);
  const title = $derived(named || t("trip.untitled"));
  // darunter: Ort und Land, wenn die Überschrift ein eigener Name ist, sonst nur das Land
  const where = $derived(custom ? [app.trip.place, app.trip.country].filter(Boolean).join(", ") : app.trip.country);
  // Überschrift direkt überschreiben: hineinklicken, tippen, Enter oder wegklicken speichert, Esc bricht ab
  let rev = $state(0);
  function saveName(el: HTMLElement) {
    const v = el.innerText.replace(/\s+/g, " ").trim();
    if (v && v !== title) renameTrip(v);
    rev++; // Überschrift neu aufbauen, damit sie wieder dem gespeicherten Namen folgt
  }
  function nameKey(e: KeyboardEvent) {
    const el = e.currentTarget as HTMLElement;
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    if (e.key === "Escape") { el.innerText = title; el.blur(); }
  }

  const trip = $derived(app.trip);
  let shown = $state(0);
  let counting = $state(true);

  // Summe beim Start hochzählen, danach direkt folgen
  onMount(() => {
    const t0 = performance.now(), target = calc.T.total;
    const step = (ts: number) => {
      const k = Math.min(1, (ts - t0) / 1400);
      shown = target * (1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(step); else counting = false;
    };
    requestAnimationFrame(step);
  });
  const value = $derived(counting ? shown : calc.T.total);
  // nur wer dabei ist
  const n = $derived(calc.T.active);
</script>

<section class="hero" id="hero" data-ch="hero">
  {#if access.loading}<div class="banner">{t("hero.loading")}</div>
  {:else if access.readonly}<div class="banner">{t("hero.readonly")}</div>{/if}
  {#if cloud.joinError}<div class="banner err">{cloud.joinError} <button class="linkbtn" onclick={() => (cloud.joinError = "")}>OK</button></div>{/if}
  <div class="hero-in">
    {#if heroEdit.open}
      <TripEditor onclose={() => (heroEdit.open = false)} />
    {:else}
      {#if trip.kicker}<span class="kick">☀️ {trip.kicker}</span>{/if}
      {#key `${rev}|${title}`}
        {#if access.readonly}
          <h1 class:untitled>{title}</h1>
        {:else}
          <h1 class="h1-name" class:untitled contenteditable="true" spellcheck="false" aria-label={t("hero.renameAria")}
            title={t("hero.rename")} onkeydown={nameKey} onblur={e => saveName(e.currentTarget)}>{title}</h1>
        {/if}
      {/key}
      <div class="meta">{[where, range(trip.from, trip.to), nights(trip.from, trip.to) ? tn("n.nights", nights(trip.from, trip.to)) : "", n ? tn("n.persons", n) : t("nobody")].filter(Boolean).join(" · ")}</div>
      <HeroTiles />
    {/if}
    {#if !access.readonly}
      <div class="hero-mode"><ModeSwitch value={tripMode()} onchange={setAllDetailed} label={t("hero.mode")} />{#if tripMode() === "mixed"}<span class="muted small">{t("hero.mixed")}</span>{/if}</div>
    {/if}
    <div class="total">
      <b class="num">{eur(value)}</b>
      <span>{n ? t("perPerson", { v: eurPP(calc.T.total / n) }) : t("nobody")}{calc.T.fixed ? ` · ${t("hero.fixedPart", { v: eur(calc.T.fixed) })}` : ""}</span>
    </div>
  </div>
  <button class="hint" onclick={() => document.getElementById("trav")?.scrollIntoView({ behavior: "smooth", block: "start" })} aria-label={t("hero.discoverAria")}>
    <i aria-hidden="true"></i><span>{t("hero.discover")}</span><svg class="hint-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
</section>
