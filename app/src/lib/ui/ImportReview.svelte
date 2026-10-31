<script lang="ts">
  import { t, tn, type Key } from "../i18n/index.svelte";
  /*
   * Import (#458): was die KI erkannt hat, mit Sicherheit je Angabe (hoch, mittel, niedrig; nicht nur über die Farbe),
   * kurze Rückfragen zu Unsicherem (Antworten zum Antippen, „Weiß nicht“ erlaubt) und Ziel, Zeitraum, Personen und Preis
   * zum Korrigieren. Flug und Unterkunft ändert man danach in der Reise; Unsicheres ist dort als „bitte prüfen“ markiert.
   * Kompakt (#468): Angaben mit Emoji (Bezeichnung als aria-label), Legende hinter „?“, Antworten mit Emoji.
   */
  import Help from "./Help.svelte";
  import { ANSWER_ICON, BOARD_ICON, FIELD_ICON } from "../import/icons";
  import type { Board } from "../model";
  import { money } from "../calc";
  import { dateDE, range } from "../format";
  import type { ConfKey, ImportedOffer } from "../import/ai";
  import { ANSWERS, DUNNO, answer, partyOf, reviewOf, setParty, suggestParty, type Level, type Party, type QuestionId } from "../import/review";
  import { clampCount } from "../count";

  let { offer = $bindable(), peopleKnown = false, cachedUntil = "", into = false, oncreate, onback }: { offer: ImportedOffer; peopleKnown?: boolean; cachedUntil?: string; into?: boolean; oncreate: () => void; onback: () => void } = $props();
  let answered = $state<QuestionId[]>([]);
  let editing = $state<ConfKey | null>(null);
  const r = $derived(reviewOf(offer, new Set(answered), peopleKnown));
  const LVL: Record<Level, Key> = { high: "imp.rev.lvl.high", mid: "imp.rev.lvl.mid", low: "imp.rev.lvl.low" };

  function pick(id: QuestionId, v: string) { offer = answer(offer, id, v); answered = [...answered, id]; }
  const ansLabel = (id: QuestionId, v: string) =>
    v === DUNNO ? t("imp.a.dunno") : id === "people" ? v : id === "board" ? t(`board.${v}` as Key) : t(`imp.a.${id}.${v}` as Key);
  const ansIcon = (id: QuestionId, v: string) =>
    v === DUNNO ? ANSWER_ICON.dunno : id === "people" ? "👥" : id === "board" ? BOARD_ICON[v as Board] : ANSWER_ICON[`${id}.${v}`] || "";

  const cur = $derived(offer.price?.currency || "EUR");
  function value(k: ConfKey): string {
    const o = offer;
    switch (k) {
      case "place": return [o.place, o.country].filter(Boolean).join(", ");
      case "dates": return o.from && o.to ? range(o.from, o.to) : o.from || o.to || "";
      case "people": {
        if (o.travelers?.length) return `${tn("n.persons", o.travelers.length)} · ${t("imp.rev.fromList")}`;
        const p = partyOf(o);
        return [tn("n.persons", p.adults + p.kids + p.infants), p.kids || p.infants ? [`${p.adults} ${t("age.adultShort")}`, p.kids && tn("n.kids", p.kids), p.infants && `${p.infants} ${t("age.infantShort")}`].filter(Boolean).join(", ") : ""].filter(Boolean).join(" · ");
      }
      case "price": return [o.price?.total ? t("imp.rev.total", { v: money(o.price.total, cur) }) : "", o.price?.perPerson ? t("imp.rev.pp", { v: money(o.price.perPerson, cur) }) : ""].filter(Boolean).join(" · ");
      case "flights": { const l = o.flights!.legs; return [l.map(x => `${x.from} → ${x.to}`).join(", "), l[0].carrier].filter(Boolean).join(" · "); }
      case "cruise": { const c = o.cruise!, ps = c.ports.filter(p => p.place).map(p => p.place!);
        return [[c.line, c.ship].filter(Boolean).join(" "), ps.filter((x, i) => i === 0 || x !== ps[i - 1]).join(" → "), c.cabin ? t(`cr.type.${c.cabin}` as Key) : ""].filter(Boolean).join(" · "); }
      case "stay": return [o.stay!.name, o.stay!.stars ? "★".repeat(o.stay!.stars) : ""].filter(Boolean).join(" ");
      case "board": return t(`board.${o.stay!.board}` as Key);
      case "baggage": return o.flights!.baggage!.checked ? t("imp.rev.bagChecked") : t("imp.rev.bagCabin");
      case "transfer": return o.transfer?.included ? t("imp.rev.incl") : o.transfer?.price ? money(o.transfer.price, cur) : t("imp.rev.notIncl");
    }
  }
  const editable = (k: ConfKey) => k === "place" || k === "dates" || k === "people" || k === "price";
  // Personen (#474): Erwachsene, Kinder, Kleinkinder bis 2 Jahre, je − Zahl +
  const party = $derived(partyOf(offer));
  const COUNTS: { k: keyof Party; l: Key; min: number }[] = [{ k: "adults", l: "imp.rev.adults", min: 1 }, { k: "kids", l: "imp.rev.kids", min: 0 }, { k: "infants", l: "imp.rev.infants", min: 0 }];
  const setCount = (k: keyof Party, v: number) => { offer = setParty(offer, { ...party, [k]: Math.max(k === "adults" ? 1 : 0, Math.min(k === "adults" ? 60 : 30, v)) }); };
  // Rückfrage Personen: Zähler, vorbelegt mit dem Vorschlag; „Passt“ übernimmt (#474)
  let draft = $state<Party | null>(null);
  const pd = $derived(draft ?? suggestParty(offer));
  const setDraft = (k: keyof Party, v: number) => { draft = { ...pd, [k]: Math.max(k === "adults" ? 1 : 0, Math.min(k === "adults" ? 60 : 30, v)) }; };
  function confirmParty() { offer = setParty(offer, pd); answered = [...answered, "people"]; draft = null; }
  // korrigiert gilt als sicher
  function sure(k: ConfKey) { offer.confidence = { ...(offer.confidence || {}), [k]: 1 }; }
</script>

<div class="rev">
  <div class="rev-top">
    <div class="rev-ring" style="--p:{r.overall}" aria-hidden="true"><span>{r.overall}%</span></div>
    <div>
      <b>{t(`imp.kind.${offer.kind}` as Key)}</b>
      <p class="muted small">{t(r.questions.length ? "imp.rev.ask" : r.fields.some(f => f.level !== "high") ? "imp.rev.mid" : "imp.rev.high")}</p>
    </div>
  </div>

  {#if cachedUntil}<p class="rev-cached small" role="status">♻ {t("imp.cached", { d: dateDE(cachedUntil) })}</p>{/if}
  {#if r.questions.length}
    <h4 class="rev-h">{t("imp.rev.asked")}</h4>
    {#each r.questions as q (q)}
      <div class="rev-q" role="group" aria-label={t(`imp.q.${q}` as Key)}>
        <b>{t(`imp.q.${q}` as Key)}</b>
        {#if q === "people"}
          <div class="rev-qp">
            {#each COUNTS as c (c.k)}
              <div class="f rev-cnt">{t(c.l)}
                <span class="qf-step" role="group" aria-label={t(c.l)}>
                  <button type="button" disabled={pd[c.k] <= c.min} onclick={() => setDraft(c.k, pd[c.k] - 1)} aria-label={t("step.less", { what: t(c.l) })}>−</button>
                  <input class="qf-n" type="number" inputmode="numeric" min={c.min} max="60" value={pd[c.k]} aria-label={t(c.l)}
                    onchange={e => { setDraft(c.k, clampCount(e.currentTarget.value, c.min, 60, pd[c.k])); e.currentTarget.value = String(pd[c.k]); }} />
                  <button type="button" onclick={() => setDraft(c.k, pd[c.k] + 1)} aria-label={t("step.more", { what: t(c.l) })}>+</button>
                </span>
              </div>
            {/each}
            <button type="button" class="btn sm primary rev-ok" onclick={confirmParty}>{t("imp.a.ok")}</button>
          </div>
        {:else}
        <div class="chips">{#each ANSWERS[q] as v (v)}<button type="button" class="chip" onclick={() => pick(q, v)}><span aria-hidden="true">{ansIcon(q, v)}</span> {ansLabel(q, v)}</button>{/each}</div>
        {/if}
      </div>
    {/each}
  {/if}

  <h4 class="rev-h">{t("imp.rev.fields")} <Help k="impLvl" /></h4>
  <ul class="rev-list">
    {#each r.fields as f (f.key)}
      <li data-k={f.key}>
        <div class="rev-row">
          <span class="rev-ic" role="img" aria-label={t(`imp.f.${f.key}` as Key)} title={t(`imp.f.${f.key}` as Key)}>{FIELD_ICON[f.key]}</span>
          <span class="rev-l">{value(f.key)}</span>
          <span class="rev-lvl {f.level}"><i aria-hidden="true"></i>{t(LVL[f.level])}</span>
          {#if editable(f.key)}<button type="button" class="linkbtn" aria-expanded={editing === f.key} onclick={() => (editing = editing === f.key ? null : f.key)}>{t("imp.rev.edit")}</button>{/if}
        </div>
        {#if editing === f.key}
          <div class="rev-edit">
            {#if f.key === "place"}<label class="f">{t("imp.f.place")}<input value={offer.place || ""} onchange={e => { offer.place = e.currentTarget.value.trim() || undefined; sure("place"); }} /></label>
            {:else if f.key === "dates"}
              <label class="f">{t("imp.rev.from")}<input type="date" value={offer.from || ""} onchange={e => { offer.from = e.currentTarget.value || undefined; sure("dates"); }} /></label>
              <label class="f">{t("imp.rev.to")}<input type="date" value={offer.to || ""} onchange={e => { offer.to = e.currentTarget.value || undefined; sure("dates"); }} /></label>
            {:else if f.key === "people"}
              {#each COUNTS as c (c.k)}
                <div class="f rev-cnt">{t(c.l)}
                  <span class="qf-step" role="group" aria-label={t(c.l)}>
                    <button type="button" disabled={!!offer.travelers?.length || party[c.k] <= c.min} onclick={() => setCount(c.k, party[c.k] - 1)} aria-label={t("step.less", { what: t(c.l) })}>−</button>
                    <input class="qf-n" type="number" inputmode="numeric" min={c.min} max="60" value={party[c.k]} disabled={!!offer.travelers?.length} aria-label={t(c.l)}
                      onchange={e => { setCount(c.k, clampCount(e.currentTarget.value, c.min, 60, party[c.k])); e.currentTarget.value = String(party[c.k]); }} />
                    <button type="button" disabled={!!offer.travelers?.length} onclick={() => setCount(c.k, party[c.k] + 1)} aria-label={t("step.more", { what: t(c.l) })}>+</button>
                  </span>
                </div>
              {/each}
            {:else if f.key === "price"}<label class="f">{t("imp.rev.totalLabel", { c: cur })}<input type="number" min="0" step="1" value={offer.price?.total ?? ""} onchange={e => { const v = Number(e.currentTarget.value); offer.price = { ...(offer.price || {}), total: v > 0 ? v : undefined }; sure("price"); }} /></label>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="muted small">{t("imp.rev.later")}</p>
  <div class="ed-foot"><button type="button" class="btn" onclick={onback}>{t("imp.rev.back")}</button><button type="button" class="btn primary imp-create" disabled={r.questions.length > 0} onclick={oncreate}>{t(into ? "imp.rev.take" : "imp.rev.create")}</button></div>
</div>

<style>
  .rev { display: flex; flex-direction: column; gap: 10px; }
  .rev-qp { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .rev-ok { align-self: flex-start; margin-top: 4px; }
  .rev-top { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); }
  .rev-top p { margin: 2px 0 0; }
  .rev-ring { --p: 0; flex: none; width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--a) calc(var(--p) * 1%), var(--line) 0); }
  .rev-ring span { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: var(--paper); font-weight: 800; font-size: 14px; }
  .rev-h { margin: 6px 0 0; font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-2); }
  .rev-cached { margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--good-soft); color: var(--good); font-weight: 600; }
  .rev-q { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 14px; background: var(--warn-soft); }
  .rev-list { list-style: none; margin: 0; padding: 0 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); }
  .rev-list li { border-top: 1px solid var(--line); padding: 8px 0; }
  .rev-list li:first-child { border-top: 0; }
  .rev-row { display: flex; align-items: center; gap: 10px; }
  .rev-ic { flex: none; width: 28px; text-align: center; font-size: 18px; }
  .rev-l { flex: 1; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
  .rev-lvl { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 99px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .rev-lvl i { width: 8px; height: 8px; border-radius: 50%; border: 2px solid currentColor; box-sizing: border-box; }
  .rev-lvl.high { background: var(--good-soft); color: var(--good); }
  .rev-lvl.high i { background: currentColor; }
  .rev-lvl.mid { background: var(--idea-soft); color: var(--idea); }
  .rev-lvl.mid i { background: linear-gradient(90deg, currentColor 50%, transparent 50%); }
  .rev-lvl.low { background: var(--warn-soft); color: var(--warn); }
  .rev-edit { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 8px; }
  .rev-cnt .qf-step { width: 104px; grid-template-rows: auto; }
</style>
