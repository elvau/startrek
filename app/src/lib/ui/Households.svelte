<script lang="ts">
  /* Haushalte: Wohnort (PLZ), Anreise zum Flughafen, Anwesenheit */
  import { access, app } from "../store.svelte";
  import { hhKey, type Household } from "../model";
  import { presences } from "../calc";
  import { dateDE } from "../format";
  import { loadPlz, suggest, type Place } from "../plz";

  const names = $derived([...new Set(app.trip.travelers.map(hhKey))]);
  const pres = $derived(presences(app.trip));
  let open = $state<string | null>(null);
  let plz = $state<Map<string, Place> | null>(null);
  let q = $state("");

  function hh(name: string): Household {
    app.trip.households ||= {};
    return (app.trip.households[name] ||= { mode: "car", cars: 1 });
  }
  function toggle(name: string) {
    if (access.readonly) return;
    open = open === name ? null : name;
    if (open) hh(name);
    q = app.trip.households?.[name]?.plz || "";
    if (open && !plz) loadPlz().then(m => (plz = m)).catch(() => {});
  }
  function pick(name: string, code: string, p: Place) {
    const h = hh(name);
    h.plz = code; h.geo = { lat: p.lat, lon: p.lon, ort: p.ort };
    q = code;
  }
  function typed(name: string, v: string) {
    q = v;
    if (/^\d{5}$/.test(v.trim()) && plz?.get(v.trim())) pick(name, v.trim(), plz.get(v.trim())!);
  }
  const sugg = $derived(plz && open && !/^\d{5}$/.test(q.trim()) ? suggest(plz, q) : []);

  function members(name: string) { return app.trip.travelers.filter(t => hhKey(t) === name); }
  function presText(name: string) {
    const h = app.trip.households?.[name];
    const p = members(name).map(t => pres[t.id]).find(Boolean);
    if (!p) return "Anwesenheit offen";
    return `${dateDE(p.a)} bis ${dateDE(p.d)}${p.src === "manual" ? " · eigene Daten" : " · aus dem Flug"}`;
  }
  function accessText(name: string) {
    const h = app.trip.households?.[name];
    if (h?.mode === "with" && h.link) return `fährt mit ${h.link}`;
    const home = h?.geo ? `${h.plz} ${h.geo.ort}` : "Wohnort fehlt";
    return `${home} · ${h?.mode === "train" ? "Bahn" : `Auto${(h?.cars || 1) > 1 ? ` × ${h?.cars}` : ""}`}`;
  }
</script>

<div class="hhs">
  <div class="hhs-h"><span class="dlabel">Haushalte und Anreise</span></div>
  {#each names as name (name)}
    {@const h = app.trip.households?.[name]}
    <div class="hh" class:open={open === name}>
      <button class="hh-sum" onclick={() => toggle(name)} aria-expanded={open === name}>
        <b>{name}</b>
        <span>{accessText(name)}</span>
        <span>{presText(name)}</span>
        <span class="hh-car" aria-hidden="true">{open === name ? "▴" : "▾"}</span>
      </button>
      {#if open === name}
        {@const H = app.trip.households![name]}
        <div class="hh-ed">
          <div class="ed-row">
            <label class="f plzf">Wohnort (PLZ oder Ort)
              <input value={q} oninput={e => typed(name, e.currentTarget.value)} placeholder="z. B. 40210" autocomplete="off" />
              {#if sugg.length}
                <div class="sugg">{#each sugg as [code, p] (code)}<button onclick={() => pick(name, code, p)}><b>{code}</b> {p.ort}</button>{/each}</div>
              {/if}
            </label>
            {#if H.geo}<span class="muted ed-note">📍 {H.geo.ort}</span>{:else if plz}<span class="muted ed-note">noch kein Ort gefunden</span>{/if}
          </div>
          <div class="ed-row">
            <label class="f">Anreise zum Flughafen
              <select bind:value={H.mode}>
                <option value="car">mit dem Auto</option>
                <option value="train">mit der Bahn</option>
                {#if names.length > 1}<option value="with">fährt mit</option>{/if}
              </select>
            </label>
            {#if H.mode === "with"}
              <label class="f">bei
                <select bind:value={H.link}>
                  {#each names.filter(x => x !== name) as o}<option value={o}>{o}</option>{/each}
                </select>
              </label>
            {:else if H.mode !== "train"}
              <label class="f">Autos<input class="n" type="number" min="1" max="5" bind:value={H.cars} /></label>
            {/if}
          </div>
          <div class="ed-row">
            <label class="f">Erste Nacht<input type="date" bind:value={H.arrive} /></label>
            <label class="f">Abreise<input type="date" bind:value={H.depart} min={H.arrive} /></label>
            {#if H.arrive || H.depart}<button class="linkbtn" onclick={() => { H.arrive = undefined; H.depart = undefined; }}>aus dem Flug übernehmen</button>
            {:else}<span class="muted ed-note">leer = aus dem Flug</span>{/if}
          </div>
        </div>
      {/if}
    </div>
  {/each}
</div>
