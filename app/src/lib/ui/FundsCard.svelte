<script lang="ts">
  /*
   * Zuschüsse & Kasse: Mannschafts- oder Kegelkasse, Sponsor, Oma und Opa … senken den Eigenanteil.
   * Je Zuschuss: von wem, wie viel, für wen (alle oder ausgewählte), für welche Kosten, gleich je Person oder nach Anteil,
   * zugesagt oder eingegangen. Beträge in der eigenen Währung, gespeichert in Euro.
   */
  import { locale, t } from "../i18n/index.svelte";
  import { access, app, calc } from "../store.svelte";
  import { eur, parseNum } from "../calc";
  import { CAT_CHAPTERS } from "../chapters";
  import { hhKey, isActive, uid, type CatKey, type Fund } from "../model";
  import { fromShown, symbol, toShown } from "../currency.svelte";
  import { reveal } from "./reveal";
  import CampaignCard from "./CampaignCard.svelte";

  const funds = $derived(app.trip.funds || []);
  const T = $derived(calc.T);
  const act = $derived(app.trip.travelers.filter(isActive));
  const hhs = $derived([...new Set(act.map(hhKey))]);
  let open = $state<string | null>(null);
  // noch nichts eingetragen: nur eine Zeile, damit die Abrechnung darunter gleich sichtbar ist
  const compact = $derived(!funds.length && !app.trip.campaign);
  let showCmp = $state(false);
  let amountText = $state("");

  function add() {
    const f: Fund = { id: uid(), name: "", amount: 0 };
    app.trip.funds = [...funds, f];
    open = f.id;
    amountText = "";
  }
  function edit(f: Fund) { open = open === f.id ? null : f.id; amountText = f.amount ? String(toShown(f.amount)).replace(".", ",") : ""; }
  function remove(id: string) {
    app.trip.funds = funds.filter(f => f.id !== id);
    if (!app.trip.funds.length) delete app.trip.funds;
    open = null;
  }
  function setAmount(f: Fund, text: string) {
    amountText = text;
    const x = parseNum(text);
    f.amount = text.trim() === "" ? 0 : isNaN(x) ? f.amount : Math.max(0, fromShown(x));
  }
  /** für wen: „Alle“ hebt die Auswahl auf; Familie oder Person an- und abwählen */
  const isOn = (f: Fund, id: string) => !f.for?.length || f.for.includes(id);
  function togglePerson(f: Fund, id: string) {
    const cur = f.for?.length ? f.for : act.map(x => x.id);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    f.for = next.length && next.length < act.length ? next : undefined;
  }
  function toggleHh(f: Fund, h: string) {
    const ids = act.filter(x => hhKey(x) === h).map(x => x.id);
    const all = ids.every(id => isOn(f, id));
    const cur = f.for?.length ? f.for : act.map(x => x.id);
    const next = all ? cur.filter(x => !ids.includes(x)) : [...new Set([...cur, ...ids])];
    f.for = next.length && next.length < act.length ? next : undefined;
  }
  function whoText(f: Fund): string {
    if (!f.for?.length) return t("fund.forAll");
    const full = hhs.filter(h => act.filter(x => hhKey(x) === h).every(x => f.for!.includes(x.id)));
    const rest = act.filter(x => f.for!.includes(x.id) && !full.includes(hhKey(x))).map(x => x.name || t("trav.noName"));
    return [...full, ...rest].join(", ");
  }
  const catLabel = (k?: CatKey) => (k ? CAT_CHAPTERS.find(c => c.k === k)?.label || k : t("fund.allCosts"));
  const pct = $derived(T.total ? Math.min(100, (T.funds / T.total) * 100) : 0);
  const pctIn = $derived(T.total ? Math.min(100, (T.fundsReceived / T.total) * 100) : 0);
</script>

<article class="card funds" use:reveal>
  <div class="fu-head">
    <div>
      <h3>💰 {t("fund.title")}</h3>
      <p class="muted small">{t("fund.hint")}</p>
    </div>
    {#if !access.readonly}<button class="btn sm fu-add" onclick={add}>+ {t("fund.add")}</button>{/if}
  </div>

  {#if funds.length}
    <div class="fu-sum">
      <div class="bar fu-bar" title={t("fund.covered", { v: eur(T.funds), p: Math.round(pct) })}>
        <i style="background:var(--good)" style:width="{pctIn}%"></i><i style="background:var(--good);opacity:.4" style:width="{pct - pctIn}%"></i>
      </div>
      <p class="small">{t("fund.covered", { v: eur(T.funds), p: Math.round(pct) })}{T.fundsReceived < T.funds ? ` · ${t("fund.receivedPart", { v: eur(T.fundsReceived) })}` : ""}</p>
      <p class="fu-calc num">{eur(T.total)} − {eur(T.funds)} = <b>{eur(T.due)}</b> {#if T.active}<span class="muted small">· {t("perPerson", { v: eur(T.due / T.active) })}</span>{/if}</p>
    </div>
    <ul class="fu-list">
      {#each funds as f (f.id)}
        {@const u = T.fundUse[f.id]}
        <li class="fu-row" class:open={open === f.id}>
          <button class="fu-line" onclick={() => !access.readonly && edit(f)} disabled={access.readonly}>
            <span class="fu-n"><b>{f.name || t("fund.unnamed")}</b><small>{whoText(f)} · {catLabel(f.cat)} · {f.split === "share" ? t("fund.byShare") : t("fund.equal")}</small></span>
            <span class="fu-v"><b class="num">{eur(f.amount)}</b><span class="pill-h" class:fu-in={f.received}>{f.received ? t("fund.received") : t("fund.pledged")}</span></span>
          </button>
          {#if u && u.surplus > 0.5}<p class="small fu-surplus">{t("fund.surplus", { v: eur(u.surplus) })}</p>{/if}
          {#if open === f.id && !access.readonly}
            <div class="fu-edit">
              <div class="ed-row">
                <label class="f grow">{t("fund.from")}<input bind:value={f.name} placeholder={t("fund.fromPh")} /></label>
                <label class="f">{t("fund.amount")}<span class="fu-amt"><input inputmode="decimal" value={amountText} oninput={e => setAmount(f, e.currentTarget.value)} placeholder="0" /> <span>{symbol(locale())}</span></span></label>
              </div>
              <div class="f"><span class="dlabel">{t("fund.for")}</span>
                <div class="chips">
                  <button type="button" class="chip sm" class:on={!f.for?.length} onclick={() => (f.for = undefined)}>{t("fund.forAll")}</button>
                  {#each hhs as h (h)}
                    {@const ids = act.filter(x => hhKey(x) === h)}
                    {#if ids.length > 1}<button type="button" class="chip sm" class:on={!!f.for?.length && ids.every(x => isOn(f, x.id))} onclick={() => toggleHh(f, h)}>{h}</button>{/if}
                  {/each}
                </div>
                <div class="chips fu-people">
                  {#each act as p (p.id)}<button type="button" class="chip sm" class:on={isOn(f, p.id)} aria-pressed={isOn(f, p.id)} onclick={() => togglePerson(f, p.id)}>{p.name || t("trav.noName")}</button>{/each}
                </div>
              </div>
              <div class="ed-row">
                <label class="f">{t("fund.forCosts")}
                  <select value={f.cat || ""} onchange={e => (f.cat = (e.currentTarget.value || undefined) as CatKey | undefined)}>
                    <option value="">{t("fund.allCosts")}</option>
                    {#each CAT_CHAPTERS as c (c.k)}<option value={c.k}>{c.label}</option>{/each}
                  </select>
                </label>
                <div class="f"><span class="dlabel">{t("fund.split")}</span>
                  <div class="chips" role="radiogroup" aria-label={t("fund.split")}>
                    <button type="button" role="radio" aria-checked={f.split !== "share"} class="chip sm" class:on={f.split !== "share"} onclick={() => (f.split = undefined)} title={t("fund.equalTitle")}>{t("fund.equal")}</button>
                    <button type="button" role="radio" aria-checked={f.split === "share"} class="chip sm" class:on={f.split === "share"} onclick={() => (f.split = "share")} title={t("fund.byShareTitle")}>{t("fund.byShare")}</button>
                  </div>
                </div>
              </div>
              <label class="in-row"><input type="checkbox" checked={!!f.received} onchange={e => (f.received = e.currentTarget.checked || undefined)} /> {t("fund.isReceived")}</label>
              <div class="fu-acts">
                <button class="btn sm primary" onclick={() => (open = null)}>{t("done")}</button>
                <button class="btn sm fu-del" onclick={() => remove(f.id)}>{t("fund.remove")}</button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if !compact || showCmp}
    <p class="muted small">{t("fund.empty")}</p>
  {/if}
  {#if !compact || showCmp}<CampaignCard />{:else if !access.readonly}<button class="linkbtn small fu-cmp" onclick={() => (showCmp = true)}>📣 {t("cmp.create")}</button>{/if}
</article>
