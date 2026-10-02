<script lang="ts">
  /*
   * Preiskalender aus den Treffern: je Tag der günstigste Preis und darunter die wenigsten Umstiege („(0)“ = direkt).
   * Grün günstig, rot teuer. Tage ohne Flug sind ausgegraut; ein Tipp wählt den Tag, ein zweiter hebt die Wahl auf.
   */
  import { locale, t, tn } from "../i18n/index.svelte";
  import { eur } from "../calc";
  import { tier, type DayCell } from "../flights/filter";

  let { cells, selected = null, onpick, label }: { cells: DayCell[]; selected?: string | null; onpick: (day: string | null) => void; label: string } = $props();

  const utc = (d: string) => new Date(d + "T00:00:00Z");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const byDay = $derived(new Map(cells.map(c => [c.day, c])));
  // Monate mit Wochen (Montag zuerst) vom ersten bis zum letzten Tag mit Flug
  const months = $derived.by(() => {
    if (!cells.length) return [];
    const first = utc(cells[0].day), last = utc(cells[cells.length - 1].day);
    const out: { key: string; title: string; days: (string | null)[] }[] = [];
    const mf = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" });
    for (let m = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); m <= last; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
      const lead = (m.getUTCDay() + 6) % 7;
      const len = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
      const days: (string | null)[] = Array(lead).fill(null);
      for (let d = 1; d <= len; d++) days.push(iso(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), d))));
      // nur Wochen, die in den Zeitraum mit Flügen fallen
      const a = cells[0].day, b = cells[cells.length - 1].day, kept: (string | null)[] = [];
      for (let i = 0; i < days.length; i += 7) {
        const w = days.slice(i, i + 7);
        if (w.some(d => d && d >= a && d <= b)) kept.push(...w);
      }
      out.push({ key: iso(m), title: mf.format(m), days: kept });
    }
    return out;
  });
  // Wochentage in der App-Sprache, Montag zuerst (5.1.2026 ist ein Montag)
  const wd = $derived(Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(), { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + i)))));
  const price = (v: number) => eur(v).replace(/\s?€/, " €");
</script>

<div class="pcal" role="group" aria-label={label}>
  <div class="pcal-h"><span class="dlabel">{label}</span>{#if selected}<button type="button" class="btn sm pcal-clear" onclick={() => onpick(null)}>{t("fs.cal.all")}</button>{/if}</div>
  <div class="pcal-months">
    {#each months as m (m.key)}
      <div class="pcal-m">
        <b class="pcal-title">{m.title}</b>
        <div class="pcal-grid">
          {#each wd as w, i (i)}<span class="pcal-wd">{w}</span>{/each}
          {#each m.days as d, i (d ?? "x" + i)}
            {#if !d}<span></span>
            {:else}
              {@const c = byDay.get(d)}
              {#if c}
                <button type="button" class="pcal-d t{tier(c.min, cells)}" class:on={selected === d} aria-pressed={selected === d}
                  title="{d.slice(8, 10)}.{d.slice(5, 7)}. · {t('fs.cal.from', { v: eur(c.min) })} · {c.stops ? tn('fs.f.stops', c.stops) : t('fs.f.direct')}"
                  onclick={() => onpick(selected === d ? null : d)}>
                  <span class="pcal-n">{+d.slice(8, 10)}</span>
                  <span class="pcal-p num">{price(c.min)}</span>
                  <span class="pcal-s">({c.stops})</span>
                </button>
              {:else}
                <span class="pcal-d off"><span class="pcal-n">{+d.slice(8, 10)}</span></span>
              {/if}
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
