<script lang="ts">
  /*
   * Preiskalender vor der Suche: Richtpreise pro Person für einen Monat (Travelpayouts, Suchen der letzten Tage).
   * Hin und zurück: erst Hinflug-Tag, dann Rückflug-Tag antippen; nur hin: ein Tag. Danach läuft die echte Suche.
   * Lädt erst, wenn man ihn aufklappt.
   */
  import { locale, t } from "../i18n/index.svelte";
  import { FLIGHTS_URL } from "../flights/app";
  import { calendarCells, nextMonth, type CalendarQuery, type CalendarResult } from "../flights/calendar";
  import PriceCalendar from "./PriceCalendar.svelte";

  let { query, start, onpick }: {
    /** ohne Monat; null: Abflug oder Ziel fehlt noch */
    query: Omit<CalendarQuery, "month"> | null;
    /** erster Monat (JJJJ-MM) */
    start: string;
    onpick: (out: string, back?: string) => void;
  } = $props();

  let open = $state(false);
  let month = $state("");
  $effect(() => { if (!month || !open) month = start; });
  let busy = $state(false);
  let res = $state<CalendarResult | null>(null);
  let err = $state("");
  let outDay = $state<string | null>(null);
  let ctrl: AbortController | undefined;
  const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
  const thisMonth = new Date().toISOString().slice(0, 7);
  const title = $derived(month ? new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T00:00:00Z")) : "");
  const key = $derived(open && query && month ? JSON.stringify({ ...query, month }) : "");

  $effect(() => {
    if (!key) return;
    const q = JSON.parse(key) as CalendarQuery;
    ctrl?.abort(); ctrl = new AbortController();
    busy = true; err = ""; res = null; outDay = null;
    fetch(`${FLIGHTS_URL}/flights/calendar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q), signal: ctrl.signal })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || t("search.status", { s: r.status })); res = d as CalendarResult; })
      .catch(e => { if ((e as Error).name !== "AbortError") err = (e as Error).message; })
      .finally(() => (busy = false));
  });

  const outCells = $derived(res ? calendarCells(res.days, "out") : []);
  const backCells = $derived(res && outDay ? calendarCells(res.days, "back", outDay) : []);
  function pickOut(d: string | null) {
    outDay = d;
    if (d && query?.oneWay) onpick(d);
  }
</script>

<details class="fs-more rc" bind:open>
  <summary><b>📅 {t("rc.title")}</b> <span class="muted small">{t("rc.sub")}</span></summary>
  {#if !query}
    <p class="muted small">{t("rc.needRoute")}</p>
  {:else}
    <div class="rc-nav">
      <button type="button" class="btn sm" disabled={month <= thisMonth} aria-label={t("rc.prev")} onclick={() => (month = prevMonth(month))}>‹</button>
      <b class="rc-month">{title}</b>
      <button type="button" class="btn sm" aria-label={t("rc.next")} onclick={() => (month = nextMonth(month))}>›</button>
    </div>
    {#if busy}<p class="muted small">{t("rc.busy")}</p>
    {:else if err || res?.error}<p class="warnline small">{err || res?.error}</p>
    {:else if res && !res.configured}<p class="muted small">{t("rc.off")}</p>
    {:else if res && !outCells.length}<p class="muted small">{t("rc.none")}</p>
    {:else if res}
      <div class="pcals">
        <PriceCalendar cells={outCells} selected={outDay} label={query.oneWay ? t("fs.cal.oneway") : t("fs.cal.out")} onpick={pickOut} />
        {#if outDay && backCells.length}
          <PriceCalendar cells={backCells} selected={null} label={t("fs.cal.back")} onpick={d => d && onpick(outDay!, d)} />
        {/if}
      </div>
      <p class="muted small">{query.oneWay ? t("rc.hintOne") : outDay ? t("rc.hintBack") : t("rc.hintOut")} {t("rc.note")}</p>
    {/if}
  {/if}
</details>
