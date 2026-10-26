<script lang="ts">
  /*
   * Welche Tage kommen in Frage (#568): alle Tage oder Wochenenden (2 Nächte, lange Wochenenden, 4+), schulkindkonform,
   * Brückentage, Schulferien mitnehmen, meiden oder nur Ferien. Darunter die Vorschau: wie viele Termine passen, die
   * ersten mit Grund (Feiertag, Ferien, Urlaubstage). Bearbeitet das übergebene Objekt (neuer Plan oder laufender).
   */
  import { t, tn } from "../i18n/index.svelte";
  import { addDay, planDays } from "../together";
  import { fits, fittingStarts, type CalCtx, type DaysCfg, type Fit } from "../datefit";
  import { loadRegions } from "../holidaysApp.svelte";
  import { fitWhy, regionLabel } from "../calendarApp.svelte";
  import { dateDE, dayShort } from "../format";

  let { cfg, ctx, ro = false, onextend }: { cfg: DaysCfg & { from: string; to: string; nights: number }; ctx: CalCtx; ro?: boolean; onextend?: () => void } = $props();
  $effect(() => { void loadRegions(); });

  const we = $derived(cfg.days === "weekend");
  const len = $derived(cfg.nights <= 2 ? 2 : cfg.nights === 3 ? 3 : 4);
  function setLen(n: 2 | 3 | 4) { cfg.nights = n === 4 ? Math.max(4, cfg.nights) : n; }
  function setDays(v: "all" | "weekend") { cfg.days = v; if (v === "weekend" && cfg.nights > 4) cfg.nights = 4; if (v === "all") delete cfg.bridges; }
  function setSchool(v: boolean) { if (v) { cfg.school = true; delete cfg.bridges; } else delete cfg.school; }

  const regs = $derived(Object.entries(ctx.regions));
  const kids = $derived(ctx.kidRegions.map(regionLabel));
  const starts = $derived(fittingStarts(planDays(cfg), cfg.nights, cfg.to, cfg, ctx));
  // die ersten Termine ohne Überschneidung
  const first = $derived.by(() => {
    const out: { from: string; to: string; f: Fit }[] = [];
    for (const s of starts) {
      if (out.length >= 4) break;
      if (out.some(o => s < o.to)) continue;
      const to = addDay(s, cfg.nights);
      out.push({ from: s, to, f: fits(s, to, cfg, ctx) });
    }
    return out;
  });
  const filtered = $derived(we || !!cfg.school || (cfg.ferien && cfg.ferien !== "take"));
</script>

<div class="pc">
  <div class="pc-row">
    <span class="pc-l">{t("tg.daysQ")}</span>
    <div class="seg pc-days" role="group" aria-label={t("tg.daysQ")}>
      <button type="button" class:on={!we} aria-pressed={!we} disabled={ro} onclick={() => setDays("all")}>{t("tg.daysAll")}</button>
      <button type="button" class:on={we} aria-pressed={we} disabled={ro} onclick={() => setDays("weekend")}>{t("tg.daysWe")}</button>
    </div>
  </div>
  {#if we}
    <div class="pc-len" role="group" aria-label={t("tg.howLong")}>
      {#each [[2, "tg.n2", "tg.n2s"], [3, "tg.n3", "tg.n3s"], [4, "tg.n4", "tg.n4s"]] as const as [n, a, b] (n)}
        <button type="button" class="pc-opt" class:on={len === n} aria-pressed={len === n} disabled={ro} onclick={() => setLen(n)}><b>{t(a)}</b><span>{t(b)}</span></button>
      {/each}
    </div>
    {#if len === 4}<label class="f pc-n">{t("tg.nights")}<input class="n sm" type="number" min="4" max="21" bind:value={cfg.nights} disabled={ro} /></label>{/if}
  {/if}
  <label class="pc-chk"><input type="checkbox" class="pc-school" checked={!!cfg.school} disabled={ro} onchange={e => setSchool(e.currentTarget.checked)} />
    <span><b>{t("tg.school")}</b> <span class="muted">{t("tg.schoolHint")}</span>{#if kids.length}<br /><span class="muted">{t("tg.schoolKids", { list: kids.join(", ") })}</span>{/if}</span></label>
  {#if we}
    <label class="pc-chk" class:dim={cfg.school}><input type="checkbox" class="pc-bridges" checked={!!cfg.bridges} disabled={ro || cfg.school} onchange={e => { if (e.currentTarget.checked) cfg.bridges = true; else delete cfg.bridges; }} />
      <span><b>{t("tg.bridges")}</b> <span class="muted">{t("tg.bridgesHint")}</span></span></label>
  {/if}
  <div class="pc-row">
    <span class="pc-l">{t("tg.ferien")}</span>
    <div class="seg pc-ferien" role="group" aria-label={t("tg.ferien")}>
      {#each [["take", "tg.ferTake"], ["avoid", "tg.ferAvoid"], ["only", "tg.ferOnly"]] as const as [v, k] (v)}
        <button type="button" class:on={(cfg.ferien || "take") === v} aria-pressed={(cfg.ferien || "take") === v} disabled={ro} onclick={() => { if (v === "take") delete cfg.ferien; else cfg.ferien = v; }}>{t(k)}</button>
      {/each}
    </div>
  </div>
  <p class="muted small pc-regs">{regs.length ? t("tg.ferRegions", { list: regs.map(([r, hh]) => `${regionLabel(r)} (${hh.join(", ")})`).join(" · ") }) : t("tg.ferNone")}</p>

  {#if filtered}
    <div class="pc-prev" aria-live="polite">
      <b class="small pc-count">{starts.length ? tn("tg.fitN", starts.length) : t("tg.fitNone")}</b>
      {#each first as r (r.from)}
        <span class="small pc-item"><span>{dayShort(r.from)} – {dayShort(r.to)}</span> <span class="muted">{fitWhy(r.f, ctx)}</span></span>
      {/each}
      {#if cfg.school && first.some(r => Object.keys(r.f.vac).length)}<span class="muted small">{t("tg.teacher")}</span>{/if}
      {#if starts.length < 3 && onextend && !ro}<button type="button" class="linkbtn small pc-extend" onclick={onextend}>{t("tg.extend", { d: dateDE(addDay(cfg.to, 182)) })}</button>{/if}
    </div>
  {/if}
</div>

<style>
  .pc { display: flex; flex-direction: column; gap: 10px; }
  .pc p { margin: 0; }
  .pc-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .pc-l { font-size: 13px; font-weight: 700; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .seg button { font: inherit; font-size: 13px; font-weight: 600; padding: 7px 12px; background: var(--paper); color: var(--ink-2); border: 0; border-inline-end: 1px solid var(--line); cursor: pointer; }
  .seg button:last-child { border-inline-end: 0; }
  .seg button.on { background: var(--a); color: #fff; }
  .pc-len { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .pc-opt { font: inherit; text-align: start; display: flex; flex-direction: column; gap: 2px; padding: 9px 11px; border-radius: 12px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; }
  .pc-opt b { font-size: 13.5px; }
  .pc-opt span { font-size: 12px; color: var(--ink-2); }
  .pc-opt.on { border-color: var(--a); background: var(--a-soft); }
  .pc-n { max-width: 140px; }
  .pc-chk { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; }
  .pc-chk input { margin-top: 3px; }
  .pc-chk.dim { opacity: .55; }
  .pc-prev { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: var(--paper-2); }
  .pc-extend { align-self: flex-start; padding: 0; }
</style>
