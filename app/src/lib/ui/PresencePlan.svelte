<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import Help from "./Help.svelte";
  /* Wer ist wann da, und hat jede Nacht ein Bett? Pro Haushalt ein Balken über alle Nächte. */
  import { access, app } from "../store.svelte";
  import { hhKey, isActive } from "../model";
  import { presences, participantsOf } from "../calc";
  import { airNights, needs, nightsList, okDate, addDays } from "../calc/travel";
  import { activeOption } from "../calc";
  import { stationName } from "../stays/stationName";
  import { dateDE, dayShort } from "../format";
  import { arrivals, gaps, hintList } from "../stays/presence";
  import { openStaySearch } from "../stays/open.svelte";
  import { airportNights } from "../stays/airports";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { cluster, groupLabel } from "../groups";

  // Orts- und Flughafendaten für die Vorschläge am Flughafen (einmal laden)
  $effect(() => { ensureGeo(app.trip); void ensureAirports(); });

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
    // Hinweise je Familie: gleiche Hinweise mehrerer Familien in einer Zeile
    const noteBy = new Map<string, string[]>();
    const note = (h: string, text: string) => noteBy.set(text, [...(noteBy.get(text) || []), h]);
    // Nächte im Flugzeug (Rundreise mit Nachtflug): kein Bett nötig
    const air = Object.fromEntries(act.map(t => [t.id, pres[t.id]?.src === "flight" ? airNights(t, trip, it => activeOption(it, trip)) : new Set<string>()]));
    const hhRows = hhs.map(h => {
      const ms = act.filter(t => hhKey(t) === h);
      const known = ms.some(t => pres[t.id]);
      const cells = nights.map(x => {
        const here = ms.filter(t => pres[t.id] ? needs(pres[t.id], x) : false);
        if (!known) return { k: "unk" as const };
        if (!here.length) return { k: "away" as const };
        if (here.every(t => air[t.id].has(x))) return { k: "air" as const };
        const cover = stays.filter(s => s.from! <= x && x < s.to! && participantsOf(s, trip).some(t => here.includes(t)));
        if (!cover.length) return { k: "gap" as const };
        return { k: cover.length > 1 ? ("dbl" as const) : ("ok" as const), s: stays.indexOf(cover[0]) };
      });
      const dbl = nights.filter((_, i) => cells[i].k === "dbl");
      if (dbl.length) note(h, t("plan.double", { n: tn("n.nights", dbl.length), list: dbl.slice(0, 4).map(dateDE).join(", ") }));
      if (!known) note(h, t("plan.unknown"));
      return { h, cells };
    });
    const notes = [...noteBy].map(([text, hs]) => ({ crit: false, text: `${groupLabel(hs, hhs.length)}: ${text}` }));
    // Familien mit denselben Nächten in denselben Unterkünften: eine Zeile (Gruppenreise: „Alle (15)“)
    const rows = cluster(hhRows, (a, b) => JSON.stringify(a.cells) === JSON.stringify(b.cells))
      .map(g => ({ h: groupLabel(g.map(r => r.h), hhs.length), cells: g[0].cells }));
    // wie im Artefakt: Lücken zuerst (mit „Unterkunft suchen“), dann Hinweise zu An- und Abreise
    const gs = gaps(trip);
    const aps = airportNights(trip, geo);
    // Hinweis „sehr früh“ nur, wenn es dafür noch keinen Vorschlag am Flughafen gibt
    const infoBy = new Map<string, string[]>();
    for (const a of arrivals(trip)) for (const h of hintList(a).filter(h => !(h.kind === "early" && aps.some(x => x.kind === "last" && x.ids.join() === a.ids.join())))) infoBy.set(h.text, [...(infoBy.get(h.text) || []), a.who]);
    const info = [...infoBy].map(([text, ws]) => `${groupLabel(ws, ws.length === hhs.length && ws.every(w => hhs.includes(w)) ? hhs.length : -1)}: ${text}`);
    // wer ohne Unterkunft ist: alle → „Alle (15)“, sonst kurz
    const whoShort = (ids: string[], who: string) => groupLabel(who.split(", "), ids.length === act.length ? who.split(", ").length : -1);
    const open = stays.filter(s => s.options.every(o => !o.label && !o.price.unit && !o.price.adult));
    return { nights, rows, stays, notes, gs, info, open, aps, whoShort };
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
    <div class="plan-h"><h3>{t("plan.title")} <Help k="plan" /></h3><span class="muted">{tn("n.nights", plan.nights.length)} · {t("range.fromTo", { a: dateDE(plan.nights[0]), b: dateDE(addDays(plan.nights[plan.nights.length - 1], 1)) })}</span></div>
    <div class="pl-wrap">
      <div class="pl-grid" style="grid-template-columns:minmax(70px,max-content) repeat({plan.nights.length}, minmax(18px,1fr))">
        <span class="pl-corner"></span>
        {#each plan.nights as x, i}
          {@const wd = new Date(x + "T12:00:00Z").getUTCDay()}
          <span class="pl-h" class:we={wd === 6 || wd === 0} style="grid-column:{i + 2}">{+x.slice(8, 10)}</span>
        {/each}
        {#each plan.rows as r, ri (r.h)}
          <span class="pl-name" style="grid-row:{ri + 2}">{r.h}</span>
          {#each runs(r.cells) as seg}
            {#if seg.k !== "away"}
              <span class="pl-seg {seg.k}" style="grid-row:{ri + 2};grid-column:{seg.start + 2} / {seg.end + 2};--sc:{seg.s != null ? COLORS[seg.s % COLORS.length] : 'var(--line)'}"
                title={seg.k === "gap" ? t("plan.noStay") : seg.k === "air" ? t("plan.air") : seg.k === "unk" ? t("hh.presOpen") : seg.s != null ? plan.stays[seg.s].name : ""}>
                {seg.k === "gap" ? t("plan.missing") : seg.k === "air" ? "✈" : seg.k === "ok" && seg.s != null && seg.end - seg.start > 2 ? plan.stays[seg.s].name.split(",")[0] : ""}
              </span>
            {/if}
          {/each}
        {/each}
      </div>
    </div>
    {#if plan.gs.length || plan.notes.length || plan.open.length || plan.info.length || plan.aps.length}
      <ul class="pl-notes">
        {#each plan.gs as g (g.from + g.to + g.who)}
          {@const where = stationName(geo, airportData, g.ap, g.city)}
          <li class="crit"><b title={g.who}>{plan.whoShort(g.ids, g.who)}</b>{where ? ` · ${where}` : ""}: {g.nights === 1 ? t("plan.gapOne", { d: dayShort(g.from) }) : t("plan.gap", { a: dayShort(g.from), b: dayShort(g.to), n: tn("n.nights", g.nights) })}
            {#if !access.readonly}<button class="linkbtn" onclick={() => openStaySearch({ from: g.from, to: g.to, ids: g.ids, ...(where ? { place: where } : {}) })}>{t("st.open")}</button>{/if}</li>
        {/each}
        {#each plan.aps as a (a.kind + a.from + a.ids.join())}
          <li class:crit={a.crit} class:warn={!a.crit}>{a.text}
            {#if a.places.length}<span class="pl-near">{t("plan.near", { ap: a.ap.code })} {a.places.map(p => `${p.name} ${Math.round(p.km)} km`).join(" · ")}</span>{/if}
            {#if !access.readonly}<button class="linkbtn" onclick={() => openStaySearch({ from: a.from, to: a.to, ids: a.ids, place: a.suggest })}>{t("plan.searchAirport")}</button>{/if}</li>
        {/each}
        {#each plan.notes as n}<li class:crit={n.crit}>{n.text}</li>{/each}
        {#each plan.open as s (s.id)}
          <li><b>{s.name || t("stay.new")}</b> ({t("range.fromTo", { a: dateDE(s.from!), b: dateDE(s.to!) })}): {t("plan.noneChosen")}
            {#if !access.readonly}<button class="linkbtn" onclick={() => openStaySearch({ itemId: s.id })}>{t("plan.search")}</button>{/if}</li>
        {/each}
        {#each plan.info as x (x)}<li class="info">{x}</li>{/each}
      </ul>
    {/if}
    {#if !plan.gs.length && !plan.notes.length}
      <p class="pl-ok">✓ {t("plan.allOk")}</p>
    {/if}
  </div>
{:else}
  <div class="plan"><div class="plan-h"><h3>{t("plan.title")} <Help k="plan" /></h3></div>
    <p class="muted">{t("plan.emptyHint")}</p></div>
{/if}
