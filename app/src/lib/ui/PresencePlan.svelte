<script lang="ts">
  /* Wer ist wann da, und hat jede Nacht ein Bett? Pro Haushalt ein Balken über alle Nächte. */
  import { access, app } from "../store.svelte";
  import { hhKey, isActive } from "../model";
  import { presences, participantsOf } from "../calc";
  import { needs, nightsList, okDate, addDays } from "../calc/travel";
  import { dateDE, dayShort } from "../format";
  import { arrivals, gaps, hints } from "../stays/presence";
  import { openStaySearch } from "../stays/open.svelte";

  const COLORS = ["var(--c-stay)", "var(--c-flights)", "var(--c-transport)", "var(--c-attractions)", "var(--c-misc)"];

  const plan = $derived.by(() => {
    const trip = app.trip;
    const pres = presences(trip);
    const stays = trip.items.filter(it => it.cat === "stay" && it.status !== "dropped" && okDate(it.from) && okDate(it.to) && it.to! > it.from!);
    const dates = [trip.from, trip.to, ...stays.flatMap(s => [s.from, s.to]), ...Object.values(pres).flatMap(p => (p ? [p.a, p.d] : []))].filter(okDate).sort() as string[];
    if (dates.length < 2) return null;
    const nights = nightsList(dates[0], dates[dates.length - 1]);
    if (!nights.length || nights.length > 120) return null;
    const act = trip.travelers.filter(isActive);
    const hhs = [...new Set(act.map(hhKey))];
    const notes: { crit: boolean; text: string }[] = [];
    const rows = hhs.map(h => {
      const ms = act.filter(t => hhKey(t) === h);
      const known = ms.some(t => pres[t.id]);
      const cells = nights.map(x => {
        const here = ms.filter(t => pres[t.id] ? needs(pres[t.id], x) : false);
        if (!known) return { k: "unk" as const };
        if (!here.length) return { k: "away" as const };
        const cover = stays.filter(s => s.from! <= x && x < s.to! && participantsOf(s, trip).some(t => here.includes(t)));
        if (!cover.length) return { k: "gap" as const };
        return { k: cover.length > 1 ? ("dbl" as const) : ("ok" as const), s: stays.indexOf(cover[0]) };
      });
      const dbl = nights.filter((_, i) => cells[i].k === "dbl");
      if (dbl.length) notes.push({ crit: false, text: `${h}: ${dbl.length === 1 ? "eine Nacht" : `${dbl.length} Nächte`} doppelt gebucht (${dbl.slice(0, 4).map(dateDE).join(", ")})` });
      if (!known) notes.push({ crit: false, text: `${h}: Anwesenheit offen. Flug mit Zeiten eintragen oder eigene Daten bei der Familie (Kapitel „Wer fährt mit“).` });
      return { h, cells };
    });
    // wie im Artefakt: Lücken zuerst (mit „Unterkunft suchen“), dann Hinweise zu An- und Abreise
    const gs = gaps(trip);
    const info = arrivals(trip).flatMap(a => hints(a).map(h => `${a.who}: ${h}`));
    const open = stays.filter(s => s.options.every(o => !o.label && !o.price.unit && !o.price.adult));
    return { nights, rows, stays, notes, gs, info, open };
  });

  // aufeinanderfolgende gleiche Zellen zu Balken zusammenfassen
  function runs(cells: { k: string; s?: number }[]) {
    const out: { k: string; s?: number; start: number; end: number }[] = [];
    cells.forEach((c, i) => {
      const last = out[out.length - 1];
      if (last && last.k === c.k && last.s === c.s) last.end = i + 1;
      else out.push({ ...c, start: i, end: i + 1 });
    });
    return out;
  }
</script>

{#if plan}
  <div class="plan">
    <div class="plan-h"><h3>Wer ist wann wo</h3><span class="muted">{plan.nights.length} Nächte · {dateDE(plan.nights[0])} bis {dateDE(addDays(plan.nights[plan.nights.length - 1], 1))}</span></div>
    <div class="pl-wrap">
      <div class="pl-grid" style="grid-template-columns:minmax(70px,max-content) repeat({plan.nights.length}, minmax(18px,1fr))">
        <span class="pl-corner"></span>
        {#each plan.nights as x, i}
          {@const wd = dayShort(x).slice(0, 2)}
          <span class="pl-h" class:we={wd === "Sa" || wd === "So"} style="grid-column:{i + 2}">{+x.slice(8, 10)}</span>
        {/each}
        {#each plan.rows as r, ri (r.h)}
          <span class="pl-name" style="grid-row:{ri + 2}">{r.h}</span>
          {#each runs(r.cells) as seg}
            {#if seg.k !== "away"}
              <span class="pl-seg {seg.k}" style="grid-row:{ri + 2};grid-column:{seg.start + 2} / {seg.end + 2};--sc:{seg.s != null ? COLORS[seg.s % COLORS.length] : 'var(--line)'}"
                title={seg.k === "gap" ? "keine Unterkunft" : seg.k === "unk" ? "Anwesenheit offen" : seg.s != null ? plan.stays[seg.s].name : ""}>
                {seg.k === "gap" ? "fehlt" : seg.k === "ok" && seg.s != null && seg.end - seg.start > 2 ? plan.stays[seg.s].name.split(",")[0] : ""}
              </span>
            {/if}
          {/each}
        {/each}
      </div>
    </div>
    {#if plan.gs.length || plan.notes.length || plan.open.length || plan.info.length}
      <ul class="pl-notes">
        {#each plan.gs as g (g.from + g.to + g.who)}
          <li class="crit"><b>{g.who}</b>: {g.nights === 1 ? `Nacht ${dayShort(g.from)}` : `${dayShort(g.from)} bis ${dayShort(g.to)}`} ohne Unterkunft ({g.nights} {g.nights === 1 ? "Nacht" : "Nächte"})
            {#if !access.readonly}<button class="linkbtn" onclick={() => openStaySearch({ from: g.from, to: g.to, ids: g.ids })}>Unterkunft suchen</button>{/if}</li>
        {/each}
        {#each plan.notes as n}<li class:crit={n.crit}>{n.text}</li>{/each}
        {#each plan.open as s (s.id)}
          <li><b>{s.name || "Neue Unterkunft"}</b> ({dateDE(s.from!)} bis {dateDE(s.to!)}): noch keine Unterkunft ausgewählt
            {#if !access.readonly}<button class="linkbtn" onclick={() => openStaySearch({ itemId: s.id })}>suchen</button>{/if}</li>
        {/each}
        {#each plan.info as t (t)}<li class="info">{t}</li>{/each}
      </ul>
    {/if}
    {#if !plan.gs.length && !plan.notes.length}
      <p class="pl-ok">✓ Jede Nacht hat eine Unterkunft.</p>
    {/if}
  </div>
{:else}
  <div class="plan"><div class="plan-h"><h3>Wer ist wann wo</h3></div>
    <p class="muted">Trag Reisedaten, Flugzeiten oder Unterkünfte mit Zeitraum ein, dann siehst du hier, wer wann wo schläft.</p></div>
{/if}
