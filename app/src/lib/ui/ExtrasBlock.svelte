<script lang="ts">
  /* Nebenkosten und Kaution am Posten: „Angebot 980 € + ca. 112 € vor Ort“, aufklappbar mit der Liste (#169) */
  import { t, tn, type Key } from "../i18n/index.svelte";
  import type { Extra, Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import { eur, moneyExact } from "../calc";
  import type { ExtraLine } from "../calc/extras";
  import { flagOf } from "../format";
  import { countryName } from "../geo/locations";
  import { AUTO_OPTIONAL } from "../fees";

  let { item }: { item: Item } = $props();
  const r = $derived(calc.T.items[item.id]);
  const ex = $derived(r?.extras);
  const opt = $derived(r?.option);
  const dep = $derived(ex?.dep && ex.dep.amount > 0 ? ex.dep : null);
  // geschätzte Kaution (Mietwagen): ohne eigene Angabe, wegklickbar
  const autoDep = $derived(!!dep && !opt?.deposit);
  const onKinds = $derived((ex?.lines || []).filter(l => !l.x.off && l.x.pay !== "included" && l.amount > 0));
  const ca = $derived(ex?.est ? `${t("xc.ca")} ` : "");
  // Flug aus der Suche: enthaltenes Gepäck (oder „nicht angegeben“) und Hinweise (#171)
  const fromSearch = $derived(!!opt?.legs?.length && !!opt.source?.name && item.cat === "flights");
  const bg = $derived(opt?.baggage);
  const hints = $derived(fromSearch ? opt?.hints || [] : []);
  const inclText = $derived(bg ? [bg.cabin ? t("xc.cabin", { n: bg.cabin }) : t("xc.personal"), bg.checked ? t("fs.bagsIncl", { n: tn("n.bags", bg.checked) }) : t("fs.bagsNoneIncl")].join(" · ") : t("fs.bagsUnknown"));

  const ICON: Record<Extra["kind"], string> = { citytax: "🏛", tax: "🧾", cleaning: "🧹", resort: "🏨", bag: "🧳", seat: "💺", toll: "🛣", vignette: "🎫", visa: "🛂", tips: "💶", insurance: "🛡", driver: "👥", young: "👤", cover: "🛡", ferry: "⛴", ferryPerson: "⛴", cabin: "🛏", other: "➕" };
  const name = (x: Extra) => x.label || `${t(`xc.kind.${x.kind}` as Key)}${x.cc ? ` ${flagOf(x.cc)} ${countryName(x.cc)}` : ""}`;
  // Rechnung in Worten: „2,80 € × 3 Pers. × 7 Nächte“ bzw. „pro Buchung“
  function how(l: ExtraLine): string {
    const x = l.x, cur = opt?.price.currency || "EUR";
    if (x.basis === "percent") return `${x.amount} % ${t("xc.ofPrice")}`;
    const a = moneyExact(x.amount, cur);
    const parts = [`${a} ${t(`xc.basis.${x.basis}` as Key)}`];
    if (l.payers != null) parts.push(tn("xc.payers", l.payers));
    if (x.freeUpTo != null) parts.push(t("xc.free", { n: x.freeUpTo }));
    if (x.max) parts.push(t("xc.max", { n: x.max }));
    return parts.join(" · ");
  }
  function toggle(x: Extra) {
    const o = item.options.find(o => o.id === opt?.id);
    if (!o) return;
    // nur auf Wunsch eingerechnet (Vollschutz, Zusatzfahrer): merken, dass eingeschaltet
    if (AUTO_OPTIONAL.has(x.id)) {
      const on = new Set(o.autoOn || []);
      if (on.has(x.id)) on.delete(x.id); else on.add(x.id);
      if (on.size) o.autoOn = [...on]; else delete o.autoOn;
      return;
    }
    // automatisch geschätzt: nur merken, dass weggeklickt
    if (x.id.startsWith("auto:")) {
      const off = new Set(o.autoOff || []);
      if (off.has(x.id)) off.delete(x.id); else off.add(x.id);
      if (off.size) o.autoOff = [...off]; else delete o.autoOff;
      return;
    }
    const y = o.extras?.find(e => e.id === x.id);
    if (!y) return;
    if (y.off) delete y.off; else y.off = true;
  }
  function hideDep() {
    const o = item.options.find(o => o.id === opt?.id);
    if (o) o.autoOff = [...new Set([...(o.autoOff || []), "auto:deposit"])];
  }
  const depHow = (h?: string) => (h ? t(`dep.how.${h}` as Key) : "");
</script>

{#if ex && (ex.lines.length || dep || fromSearch)}
  <details class="xc" data-xc={item.id}>
    <summary>
      {#if ex.added > 0}
        <span class="muted">{t("xc.offer", { v: eur(r!.base ?? r!.net) })}</span>
        {#if ex.onsite > 0}<b class="xc-plus">+ {ca}{eur(ex.onsite)} {t("xc.onsite")}</b>{/if}
        {#if ex.extra > 0}<b class="xc-plus">+ {ca}{eur(ex.extra)} {t("xc.atBooking")}</b>{/if}
        <span class="muted xc-kinds">· {[...new Set(onKinds.map(l => name(l.x)))].join(", ")}</span>
      {:else if ex.lines.length}<span class="muted">{t("xc.noneExtra")}</span>
      {:else if fromSearch}<span class="muted">🧳 {inclText}</span>{/if}
      {#if dep}<span class="xc-dep-s">🔒 {t("dep.short", { v: `${dep.est ? `${t("xc.ca")} ` : ""}${eur(ex.deposit)}` })}{dep.how === "credit" ? ` · ${t("dep.creditShort")}` : ""}</span>{/if}
    </summary>
    <ul>
      {#each ex.lines as l (l.x.id)}
        <li class:off={l.x.off}>
          <span>{ICON[l.x.kind]} {name(l.x)} <small class="muted">{how(l)}{l.x.source ? ` · ${l.x.source}` : ""}</small></span>
          <b class="num">{l.x.pay === "included" && !l.amount ? "—" : `${l.x.est ? `${t("xc.ca")} ` : ""}${eur(l.amount)}`}</b>
          <span class="xc-tags">
            <em class="xc-s {l.x.pay}" class:est={l.x.est && l.x.pay !== "included"}>{t(`xc.pay.${l.x.pay}` as Key)}{l.x.est && l.x.pay !== "included" ? ` · ${t("xc.estimated")}` : ""}</em>
            {#if !access.readonly && l.x.pay !== "included"}<button type="button" class="linkbtn xc-tg" onclick={() => toggle(l.x)}>{l.x.off ? (AUTO_OPTIONAL.has(l.x.id) || l.x.id.startsWith("road:cabin") ? t("xc.add") : t("xc.on")) : t("xc.off")}</button>{/if}
          </span>
        </li>
      {/each}
      {#if dep}
        <li class="xc-dep">
          <span>🔒 {t("dep.title")}{dep.for ? ` · ${dep.for}` : ""} <small class="muted">{[depHow(dep.how), dep.note].filter(Boolean).join(" · ")}</small></span>
          <b class="num">{dep.est ? `${t("xc.ca")} ` : ""}{eur(ex.deposit)}</b>
          <span class="xc-tags"><em class="xc-s dep">{t("dep.blocked")}</em>{#if autoDep && !access.readonly}<button type="button" class="linkbtn xc-tg" onclick={hideDep}>{t("dep.hide")}</button>{/if}</span>
        </li>
      {/if}
    </ul>
    {#if fromSearch}
      <p class="muted small xc-incl">🧳 {t("xc.incl")}: {inclText}</p>
      {#each hints as h (h)}<p class="muted small xc-hint">{h === "checkin" ? "💺" : "💳"} {t(`xc.hint.${h}` as Key)}</p>{/each}
    {/if}
    {#if !access.readonly}<button type="button" class="linkbtn xc-edit" onclick={() => { app.editing = item.id; }}>{t("xc.edit")}</button>{/if}
  </details>
{/if}

<style>
  .xc { margin: 0 22px 12px; border-top: 1px dashed var(--line); padding-top: 8px; font-size: 13px; }
  .xc summary { cursor: pointer; display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; }
  .xc-plus { color: var(--ink); }
  .xc-dep-s { color: var(--a); font-weight: 700; }
  .xc ul { list-style: none; margin: 8px 0 4px; padding: 0; display: grid; gap: 8px; }
  .xc li { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: baseline; }
  .xc li small { display: block; }
  .xc li.off > span:first-child, .xc li.off > b { text-decoration: line-through; opacity: .6; }
  .xc-tags { grid-column: 1 / -1; display: flex; gap: 10px; align-items: center; }
  .xc-s { font-style: normal; font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 99px; background: var(--paper-2); color: var(--ink-2); }
  .xc-s.est { background: var(--warn-soft); color: var(--warn); }
  .xc-s.included { background: var(--good-soft); color: var(--good); }
  .xc-s.dep { background: color-mix(in srgb, var(--a) 14%, transparent); color: var(--a); }
  .xc-tg, .xc-edit { font-size: 12px; padding: 0; }
  .xc-incl, .xc-hint { margin: 2px 0 6px; }
</style>
