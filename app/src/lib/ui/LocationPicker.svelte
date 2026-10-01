<script lang="ts">
  import { t } from "../i18n/index.svelte";
  /*
   * Flughafen, Stadt oder Umkreis wählen (Auswahlliste mit Suche): antippen zeigt die Vorschläge
   * (z. B. Flughäfen um das Reiseziel), tippen sucht in allen Flughäfen. Eine Auswahl ist ein Name mit einer Liste von Codes.
   */
  import { airportData, ensureAirports } from "../geo/geo.svelte";
  import { countryName, locLabel, searchLocs, type Loc } from "../geo/locations";

  let { value = $bindable(null), text = $bindable(""), label = "", placeholder = "", required = false, clearOnPick = false, onpick, cls = "", near = [], areaFor, from = null }:
    {
      value?: Loc | null; text?: string; label?: string; placeholder?: string; required?: boolean; clearOnPick?: boolean; onpick?: (l: Loc) => void; cls?: string;
      /** Vorschläge ohne Eingabe (z. B. Umkreis und Flughäfen am Reiseziel) */
      near?: Loc[];
      /** zu einer Eingabe zusätzlich „alle Flughäfen im Umkreis“ anbieten */
      areaFor?: (text: string) => Loc | null;
      /** Bezugspunkt: gleich gute Treffer nach Entfernung (z. B. von den Abflughäfen aus) */
      from?: { lat: number; lon: number } | null;
    } = $props();

  let open = $state(false);
  let typing = $state(false);
  let active = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();
  const id = `lp-${Math.random().toString(36).slice(2, 8)}`;
  const hits = $derived.by(() => {
    if (!open) return [];
    if (!typing || !text.trim()) return near;
    const found = searchLocs(airportData, text, 8, from);
    const area = areaFor?.(text);
    if (!area) return found;
    // Umkreis hinter dem besten Treffer (bei einer Stadt hinter ihren Flughäfen)
    const first = found[0];
    const after = !first ? 0 : 1 + (first.kind === "city" ? found.slice(1).filter(l => first.airports.includes(l.code)).length : 0);
    return [...found.slice(0, after), area, ...found.slice(after)].slice(0, 9);
  });

  function pick(l: Loc) {
    onpick?.(l);
    if (clearOnPick) { text = ""; value = null; }
    else { value = l; text = locLabel(l); }
    open = false; typing = false;
  }
  function show() { ensureAirports(); open = true; active = 0; }
  function input() { value = null; typing = true; show(); }
  function toggle() { if (open) open = false; else { typing = false; show(); inputEl?.focus(); } }
  function key(e: KeyboardEvent) {
    if (!open || !hits.length) { if (e.key === "ArrowDown") { e.preventDefault(); typing = false; show(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % hits.length; }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + hits.length) % hits.length; }
    else if (e.key === "Enter") { e.preventDefault(); pick(hits[active]); }
    else if (e.key === "Escape") { e.stopPropagation(); open = false; }
  }
</script>

<div class="lp {cls}">
  <label class="f">{label}
    <span class="lp-box">
      <input bind:this={inputEl} bind:value={text} placeholder={placeholder || t("lp.placeholder")} {required} autocomplete="off" role="combobox" aria-expanded={open && hits.length > 0} aria-controls={id} aria-autocomplete="list"
        oninput={input} onkeydown={key} onfocus={() => { typing = false; show(); }} onblur={() => setTimeout(() => (open = false), 150)} />
      <button type="button" class="lp-btn" tabindex="-1" aria-label={t("lp.show")} onmousedown={e => { e.preventDefault(); toggle(); }}>▾</button>
    </span>
  </label>
  {#if open && hits.length}
    <ul class="lp-list" {id} role="listbox">
      {#each hits as l, i (l.kind + l.code + l.airports.join())}
        <li role="option" aria-selected={i === active} class:on={i === active} class:group={l.kind !== "airport"}
          class:sub={l.kind === "airport" && hits.some(h => h.kind !== "airport" && h.airports.includes(l.code))}
          onmousedown={e => { e.preventDefault(); pick(l); }}>
          <b class="lp-code">{l.kind === "area" ? "◎" : l.code}</b>
          {#if l.kind === "airport"}
            <span>{l.city}{l.name !== l.city ? ` · ${l.name}` : ""}</span>
            <small class="muted lp-cc">{l.km != null ? `${l.km} km` : countryName(l.cc)}</small>
          {:else}
            <span><b>{l.kind === "area" ? l.name : t("lp.cityAll", { name: l.name })}</b> <small class="muted">{l.airports.join(", ")}</small></span>
            <small class="muted lp-cc">{countryName(l.cc)}</small>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
