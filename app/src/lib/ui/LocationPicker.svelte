<script lang="ts">
  /*
   * Flughafen oder Stadt wählen: tippen, Vorschlag anklicken (oder Pfeiltasten + Enter).
   * Eine Stadt mit mehreren Flughäfen sucht über alle; ein Kürzel nur dort.
   */
  import { airportData, ensureAirports } from "../geo/geo.svelte";
  import { countryName, locLabel, searchLocs, type Loc } from "../geo/locations";

  let { value = $bindable(null), text = $bindable(""), label = "", placeholder = "Stadt, Flughafen oder Code", required = false, clearOnPick = false, onpick, cls = "" }:
    { value?: Loc | null; text?: string; label?: string; placeholder?: string; required?: boolean; clearOnPick?: boolean; onpick?: (l: Loc) => void; cls?: string } = $props();

  let open = $state(false);
  let active = $state(0);
  const id = `lp-${Math.random().toString(36).slice(2, 8)}`;
  const hits = $derived(open ? searchLocs(airportData, text, 8) : []);

  function pick(l: Loc) {
    onpick?.(l);
    if (clearOnPick) { text = ""; value = null; }
    else { value = l; text = locLabel(l); }
    open = false;
  }
  function input() {
    value = null; open = true; active = 0;
    ensureAirports();
  }
  function key(e: KeyboardEvent) {
    if (!open || !hits.length) { if (e.key === "ArrowDown") { open = true; ensureAirports(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % hits.length; }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + hits.length) % hits.length; }
    else if (e.key === "Enter") { e.preventDefault(); pick(hits[active]); }
    else if (e.key === "Escape") { e.stopPropagation(); open = false; }
  }
</script>

<div class="lp {cls}">
  <label class="f">{label}
    <input bind:value={text} {placeholder} {required} autocomplete="off" role="combobox" aria-expanded={open && hits.length > 0} aria-controls={id} aria-autocomplete="list"
      oninput={input} onkeydown={key} onfocus={() => ensureAirports()} onblur={() => setTimeout(() => (open = false), 150)} />
  </label>
  {#if open && hits.length}
    <ul class="lp-list" {id} role="listbox">
      {#each hits as l, i (l.kind + l.code)}
        <li role="option" aria-selected={i === active} class:on={i === active} class:sub={l.kind === "airport" && hits.some(h => h.kind === "city" && h.airports.includes(l.code))}
          onmousedown={e => { e.preventDefault(); pick(l); }}>
          <b class="lp-code">{l.code}</b>
          {#if l.kind === "city"}
            <span><b>{l.name}</b> <small class="muted">alle Flughäfen: {l.airports.join(", ")}</small></span>
          {:else}
            <span>{l.city}{l.name !== l.city ? ` · ${l.name}` : ""}</span>
          {/if}
          <small class="muted lp-cc">{countryName(l.cc)}</small>
        </li>
      {/each}
    </ul>
  {/if}
</div>
