<script lang="ts">
  /*
   * Zeitleiste oben an der Reise (#228): je Familie ein Balken, wer ist wann da. Antippen öffnet die Daten der Familie;
   * gleiche Zeiten für alle: eine Zeile, aufklappbar.
   */
  import { tn } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { dateDE, dayShort } from "../format";
  import { addDays, dayDiff } from "../calc/travel";
  import { resetPresence, setPresence, span, timeline } from "../timeline";

  const COLORS = ["var(--c-trav)", "var(--c-flights)", "var(--c-transport)", "var(--c-misc)", "var(--c-attractions)", "var(--c-stay)"];
  const tl = $derived(timeline(app.trip));
  let open = $state(false);
  let edit = $state<string | null>(null);
  const showRows = $derived(!!tl && (!tl.same || open));

  // Achse: Wochenanfang (Montag) bzw. erster Tag, bei langen Reisen jede zweite Woche
  const ticks = $derived.by(() => {
    if (!tl) return [];
    const n = tl.nights.length, step = n > 35 ? 14 : n > 10 ? 7 : 1;
    return tl.nights.map((x, i) => ({ x, i })).filter(({ x, i }) => step === 1 || i === 0 || (new Date(x + "T12:00:00Z").getUTCDay() === 1 && (step === 7 || Math.floor(i / 7) % 2 === 0)))
      .map(({ x, i }) => ({ x, left: (i / n) * 100 }))
      // zu dicht beieinander (z. B. erster Tag kurz vor einem Montag): den früheren weglassen
      .filter((k, j, all) => !all[j + 1] || all[j + 1].left - k.left > 15);
  });
  const nightsOf = (a?: string, d?: string) => (a && d ? dayDiff(a, d) : 0);
</script>

{#if tl}
  <section class="tl" aria-label="Wer ist wann da">
    <div class="tl-h">
      <h3>Wer ist wann da</h3>
      <span class="muted small">{dateDE(tl.start)} – {dateDE(tl.end)} · {tn("n.nights", tl.nights.length)}</span>
      {#if tl.same}
        <button class="linkbtn tl-toggle" onclick={() => (open = !open)}>{open ? "zuklappen" : "Zeiten je Familie anpassen"}</button>
      {/if}
    </div>
    {#if tl.same && !open}
      <p class="small tl-all">Alle {tl.rows.length > 1 ? `${tl.rows.length} Familien` : ""} gleich lang: {dayShort(tl.start)} bis {dayShort(tl.end)}</p>
    {/if}
    {#if showRows}
      <div class="tl-axis" aria-hidden="true">
        {#each ticks as k (k.x)}<span style="inset-inline-start:{k.left}%">{dateDE(k.x)}</span>{/each}
      </div>
      <ul class="tl-rows">
        {#each tl.rows as r, i (r.hh)}
          {@const s = span(tl, r.a, r.d)}
          <li class:on={edit === r.hh}>
            <button class="tl-row" disabled={access.readonly} aria-expanded={edit === r.hh} onclick={() => (edit = edit === r.hh ? null : r.hh)}>
              <span class="tl-name"><i style="background:{COLORS[i % COLORS.length]}"></i><b>{r.hh}</b> <span class="muted">· {r.persons} P.</span></span>
              <span class="tl-dates small">{r.a && r.d ? `${dateDE(r.a)} – ${dateDE(r.d)} · ${tn("n.nights", nightsOf(r.a, r.d))}` : "offen"}
                <em class="tl-src">{r.src === "manual" ? "eigene Zeiten" : r.src === "flight" ? "aus dem Flug" : "ganze Reise"}</em></span>
              <span class="tl-track">{#if s}<span class="tl-bar" class:dash={r.src === "trip"} style="inset-inline-start:{s.left}%;width:{s.width}%;--c:{COLORS[i % COLORS.length]}"></span>{/if}</span>
            </button>
            {#if edit === r.hh && !access.readonly}
              <div class="tl-edit">
                <label class="f">Erste Nacht<input type="date" value={r.a} onchange={e => setPresence(app.trip, r.hh, e.currentTarget.value, r.d && r.d > e.currentTarget.value ? r.d : addDays(e.currentTarget.value, 1))} /></label>
                <label class="f">Abreise<input type="date" value={r.d} min={r.a} onchange={e => r.a && setPresence(app.trip, r.hh, r.a, e.currentTarget.value)} /></label>
                {#if r.src === "manual"}<button class="linkbtn" onclick={() => resetPresence(app.trip, r.hh)}>zurück: wie Flug bzw. ganze Reise</button>{/if}
              </div>
            {/if}
          </li>
        {/each}
        {#if tl.stays.length}
          <li class="tl-stays">
            <span class="tl-name muted small">Unterkünfte</span>
            <span class="tl-track thin">
              {#each tl.stays as st (st.id)}
                {@const s = span(tl, st.from, st.to)}
                {#if s}<span class="tl-stay" title={st.name} style="inset-inline-start:{s.left}%;width:{s.width}%">{s.width > 18 ? st.name.split(",")[0] : ""}</span>{/if}
              {/each}
            </span>
          </li>
        {/if}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .tl { display: grid; gap: 8px; padding: 16px 18px; }
  .tl-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
  .tl-h h3 { margin: 0; font-size: 15px; }
  .tl-toggle { margin-inline-start: auto; }
  .tl-all { margin: 0; color: var(--ink-2); }
  .tl-axis { position: relative; height: 14px; margin-inline: 8px; font-size: 11px; color: var(--ink-3); }
  .tl-axis span { position: absolute; top: 0; white-space: nowrap; }
  .tl-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .tl-row { all: unset; box-sizing: border-box; display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; width: 100%; cursor: pointer; padding: 6px 8px; border-radius: 10px; }
  .tl-row:hover:not(:disabled), li.on .tl-row { background: var(--paper-2); }
  .tl-row:focus-visible { outline: 2px solid var(--a); }
  .tl-name { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .tl-name i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .tl-dates { text-align: end; color: var(--ink-2); }
  .tl-src { font-style: normal; color: var(--ink-3); margin-inline-start: 6px; }
  .tl-track { grid-column: 1 / -1; position: relative; height: 12px; border-radius: 6px; background: var(--paper-2); box-shadow: inset 0 0 0 1px var(--line); }
  .tl-bar { position: absolute; top: 0; bottom: 0; border-radius: 6px; background: var(--c); }
  .tl-bar.dash { background: repeating-linear-gradient(90deg, var(--c) 0 6px, transparent 6px 10px); opacity: .7; }
  .tl-edit { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: end; padding: 6px 8px 10px; }
  .tl-stays { display: grid; gap: 2px; padding: 0 8px; }
  .tl-track.thin { height: 18px; background: none; box-shadow: none; }
  .tl-stay { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: var(--c-stay-s); border: 1px solid var(--c-stay); font-size: 11px; line-height: 16px; padding-inline: 4px; overflow: hidden; white-space: nowrap; color: var(--ink-2); box-sizing: border-box; }
  @media (max-width: 560px) { .tl-row { grid-template-columns: 1fr; } .tl-dates { text-align: start; } }
</style>
