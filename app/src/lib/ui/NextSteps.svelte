<script lang="ts">
  /*
   * Nächste Schritte mit Fortschritt (#151, Epic #671): Balken in Prozent nach Bausteinen (progress.ts), darunter eine
   * Liste mit Haken: Ziel und Zeitraum, die Bausteine (abschaltbar mit „Brauchen wir nicht“), Startorte, Mitreisende.
   * Antippen springt an die Stelle (leer: gleich die Suche). Belohnen statt drängen: Haken mit kleiner Animation, keine Zähler.
   * Zugeklappt merkt sich das Gerät je Reise; bei 100 % ist die Liste zugeklappt.
   */
  import { t, tn, type Key } from "../i18n/index.svelte";
  import { access, allTrips, app } from "../store.svelte";
  import { BLOCK_CAT, hasDestDates, homesMissing, progress, type BlockState } from "../progress";
  import { hhKey, isActive, type ProgressBlock } from "../model";
  import { mob, goPage } from "../mobile.svelte";
  import { heroEdit } from "./heroEdit.svelte";
  import { openFlightSearch } from "../flights/open.svelte";
  import { openStaySearch } from "../stays/open.svelte";
  import { openExplore } from "../activities/open.svelte";
  import { FLIGHTS_URL } from "../flights/app";

  const KEY = "sf-next";
  const p = $derived(progress(app.trip));
  const hhs = $derived(new Set(app.trip.travelers.filter(isActive).map(hhKey)).size);
  const people = $derived(app.trip.travelers.filter(isActive).length);
  const homes = $derived(homesMissing(app.trip));
  const shared = $derived(!!allTrips().find(m => m.id === app.trip.id)?.shared);
  const level = $derived(p.pct >= 100 ? 3 : p.pct >= 60 ? 2 : p.pct >= 30 ? 1 : 0);

  function readOpen(id: string): boolean | null { try { const v = JSON.parse(localStorage.getItem(KEY) || "{}")[id]; return typeof v === "boolean" ? v : null; } catch { return null; } }
  function saveOpen(id: string, v: boolean) { try { const m = JSON.parse(localStorage.getItem(KEY) || "{}"); m[id] = v; localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* egal */ } }
  let manual = $state<boolean | null>(null);
  $effect(() => { manual = readOpen(app.trip.id); });
  const open = $derived(manual ?? p.pct < 100);
  function toggle() { manual = !open; saveOpen(app.trip.id, manual); }

  /** zu einem Kapitel bzw. einer Stelle springen */
  function show(id: string, page?: string) {
    if (mob.on && page) goPage(page as never);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), mob.on ? 350 : 0);
  }
  function goBlock(b: BlockState) {
    const cat = BLOCK_CAT[b.k];
    const empty = !app.trip.items.some(it => it.cat === cat && it.status !== "dropped");
    if (empty && !access.readonly && FLIGHTS_URL) {
      if (b.k === "travel") return openFlightSearch();
      if (b.k === "stay") return openStaySearch();
      if (b.k === "attractions") return openExplore("tours");
    }
    show(cat, cat);
  }
  function editDest() { if (mob.on) goPage("hero"); heroEdit.open = true; scrollTo({ top: 0, behavior: "smooth" }); }
  function setOff(k: ProgressBlock, off: boolean) {
    const s = new Set(app.trip.progressOff || []);
    if (off) s.add(k); else s.delete(k);
    if (s.size) app.trip.progressOff = [...s]; else delete app.trip.progressOff;
  }

  function sub(b: BlockState): string {
    if (b.off === "auto") return t("np.offAuto");
    if (b.off) return t("np.off");
    const m = b.missing;
    if (!m) return t("np.done");
    if (m.kind === "persons") return m.total > 1 ? t("np.m.persons", { n: m.open, m: m.total }) : t("np.m.empty");
    if (m.kind === "nights") return tn("np.m.nights", m.nights, { p: tn("n.persons", m.persons) });
    return t(`np.m.${m.kind}` as Key);
  }
  const searchable = (k: ProgressBlock) => (k === "travel" || k === "stay" || k === "attractions") && !app.trip.items.some(it => it.cat === BLOCK_CAT[k] && it.status !== "dropped");
</script>

<section class="np" aria-labelledby="np-h">
  <button type="button" class="np-head" aria-expanded={open} aria-controls="np-list" onclick={toggle}>
    <span class="np-t"><b id="np-h">{t("np.title")}</b><span class="np-pct num">{p.pct} %</span></span>
    <span class="np-bar" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("np.title")}><i style="width:{p.pct}%"></i></span>
    <span class="np-lvl small muted">{t(`np.lvl.${level}` as Key)}<span class="np-chev" aria-hidden="true">{open ? "▴" : "▾"}</span></span>
  </button>
  {#if open}
    <ul class="np-list" id="np-list">
      <li class:done={hasDestDates(app.trip)}>
        <button type="button" class="np-row" onclick={editDest}>
          <span class="np-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" /></svg></span>
          <span class="np-x"><b>{t("np.dest")}</b><small>{hasDestDates(app.trip) ? t("np.done") : !app.trip.place?.trim() ? t("np.destNone") : t("np.datesNone")}</small></span>
          <span class="np-go">{hasDestDates(app.trip) ? t("np.change") : t("np.add")} ›</span>
        </button>
      </li>
      {#each p.blocks as b (b.k)}
        {@const done = !b.off && b.done >= 1}
        <li class:done class:off={!!b.off}>
          <button type="button" class="np-row" onclick={() => (b.off ? setOff(b.k, false) : goBlock(b))} disabled={b.off === "auto" || (!!b.off && access.readonly)}>
            <span class="np-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" /></svg></span>
            <span class="np-x"><b>{t(`np.b.${b.k}` as Key)}</b><small>{sub(b)}</small></span>
            <span class="np-go">{b.off === "user" ? t("np.on") : b.off ? "" : done ? t("np.view") : searchable(b.k) ? t("np.search") : t("np.view")}{b.off === "auto" ? "" : " ›"}</span>
          </button>
          {#if !b.off && !done && !access.readonly && b.k !== "travel"}<button type="button" class="linkbtn np-skip" onclick={() => setOff(b.k, true)}>{t("np.offBtn")}</button>{/if}
        </li>
      {/each}
      {#if homes && (hhs > 1 || people > 1)}
        <li>
          <button type="button" class="np-row" onclick={() => show("trav", "trav")}>
            <span class="np-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" /></svg></span>
            <span class="np-x"><b>{t("np.homes")}</b><small>{tn("np.homesN", homes)}</small></span>
            <span class="np-go">{t("np.add")} ›</span>
          </button>
        </li>
      {/if}
      {#if people > 1}
        <li class:done={shared}>
          <button type="button" class="np-row" onclick={() => show("together", "trav")}>
            <span class="np-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" /></svg></span>
            <span class="np-x"><b>{t("np.invite")}</b><small>{shared ? t("np.inviteDone") : t("np.inviteSub")}</small></span>
            <span class="np-go">{shared ? t("np.view") : t("np.share")} ›</span>
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</section>

<style>
  .np { width: min(520px, 100%); margin: 16px auto 0; background: var(--paper); color: var(--ink); border-radius: var(--r-l); box-shadow: var(--shadow); text-align: start; overflow: hidden; }
  .np-head { width: 100%; display: flex; flex-direction: column; gap: 6px; border: 0; background: transparent; color: inherit; font: inherit; text-align: start; padding: 14px 16px 10px; min-height: var(--tap); }
  .np-t { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .np-t b { font-size: var(--fs-xl); font-family: "Bricolage Grotesque Variable", sans-serif; }
  .np-pct { font-weight: 800; font-size: var(--fs-xl); color: var(--a); font-variant-numeric: tabular-nums; }
  .np-bar { display: block; height: 10px; border-radius: var(--r-pill); background: var(--paper-2); border: 1px solid var(--line); overflow: hidden; }
  .np-bar i { display: block; height: 100%; border-radius: var(--r-pill); background: linear-gradient(90deg, var(--a), var(--good)); transition: width .6s cubic-bezier(.3, 1.3, .5, 1); }
  .np-lvl { display: flex; justify-content: space-between; }
  .np-list { list-style: none; margin: 0; padding: 0 12px 8px; }
  .np-list li { border-top: 1px solid var(--line); }
  .np-row { width: 100%; min-height: 56px; display: flex; align-items: center; gap: 12px; border: 0; background: transparent; color: inherit; font: inherit; text-align: start; padding: 6px 4px; }
  .np-row:disabled { opacity: .7; }
  .np-box { flex: none; width: 26px; height: 26px; border-radius: var(--r-s); border: 2px solid var(--line); display: grid; place-items: center; transition: background .25s, border-color .25s; }
  .np-box svg { width: 15px; height: 15px; fill: none; stroke: var(--on-a); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; opacity: 0; }
  .done .np-box { background: var(--good); border-color: var(--good); animation: np-pop .45s cubic-bezier(.3, 1.6, .5, 1); }
  .done .np-box svg { opacity: 1; }
  .off .np-box { border-style: dashed; }
  .np-x { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .np-x b { font-size: var(--fs-l); }
  .np-x small { color: var(--ink-3); font-size: var(--fs-m); }
  .done .np-x b, .off .np-x b { color: var(--ink-3); }
  .done .np-x b { text-decoration: line-through; text-decoration-thickness: 1.5px; }
  .np-go { color: var(--a); font-weight: 700; font-size: var(--fs-m); white-space: nowrap; }
  .done .np-go { color: var(--good); }
  .np-skip { display: block; margin: -6px 0 8px; margin-inline-start: 42px; font-size: var(--fs-s); }
  @keyframes np-pop { 0% { transform: scale(.6); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .done .np-box { animation: none; } .np-bar i { transition: none; } }
</style>
