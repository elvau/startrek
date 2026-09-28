<script lang="ts">
  import { onMount } from "svelte";
  import { access, app, calc } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import Account from "./Account.svelte";
  import ModeSwitch from "./ModeSwitch.svelte";
  import { renameTrip, setAllDetailed, tripMode } from "../store.svelte";
  import { eur } from "../calc";
  import { nights, range } from "../format";
  import TripMenu from "./TripMenu.svelte";
  import GroupsButton from "./GroupsButton.svelte";
  import TripEditor from "./TripEditor.svelte";

  let editing = $state(false);
  // Überschrift: eigener Name, sonst Ort (mit Land) oder der vorläufige Name
  const custom = $derived(!app.trip.autoName && !!app.trip.name && app.trip.name !== app.trip.place);
  const title = $derived(custom ? app.trip.name : app.trip.place || app.trip.name);
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
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1400);
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
  <div class="hero-bar">
    <TripMenu />
    <div class="hero-r">
      {#if !access.readonly}<button class="hero-edit" onclick={() => (editing = !editing)} aria-expanded={editing} aria-label={editing ? "Schließen" : "Reise bearbeiten"}><span class="ico" aria-hidden="true">{editing ? "×" : "✎"}</span><span class="lbl">{editing ? "Schließen" : "Reise bearbeiten"}</span></button>{/if}
      <GroupsButton />
      <Account />
    </div>
  </div>
  {#if access.loading}<div class="banner">Lade den aktuellen Stand aus dem Konto…</div>
  {:else if access.readonly}<div class="banner">Du siehst diese Reise nur an.</div>{/if}
  {#if cloud.joinError}<div class="banner err">{cloud.joinError} <button class="linkbtn" onclick={() => (cloud.joinError = "")}>OK</button></div>{/if}
  <div class="hero-in">
    {#if editing}
      <TripEditor onclose={() => (editing = false)} />
    {:else}
      {#if trip.kicker}<span class="kick">☀️ {trip.kicker}</span>{/if}
      {#key `${rev}|${title}`}
        {#if access.readonly}
          <h1>{title}</h1>
        {:else}
          <h1 class="h1-name" contenteditable="true" spellcheck="false" aria-label="Name der Reise, zum Umbenennen hineinklicken"
            title="Zum Umbenennen hineinklicken" onkeydown={nameKey} onblur={e => saveName(e.currentTarget)}>{title}</h1>
        {/if}
      {/key}
      <div class="meta">{[where, range(trip.from, trip.to), nights(trip.from, trip.to) ? `${nights(trip.from, trip.to)} Nächte` : "", n ? `${n} ${n === 1 ? "Person" : "Personen"}` : "noch niemand dabei"].filter(Boolean).join(" · ")}</div>
    {/if}
    {#if !access.readonly}
      <div class="hero-mode"><ModeSwitch value={tripMode()} onchange={setAllDetailed} label="Ganze Reise: einfach oder detailliert" />{#if tripMode() === "mixed"}<span class="muted small">gemischt</span>{/if}</div>
    {/if}
    <div class="total">
      <b class="num">{eur(value)}</b>
      <span>{n ? `${eur(calc.T.total / n)} pro Person` : "noch niemand dabei"}{calc.T.fixed ? ` · davon ${eur(calc.T.fixed)} fest` : ""}</span>
    </div>
  </div>
  <div class="hint"><i></i>Reise entdecken</div>
</section>
