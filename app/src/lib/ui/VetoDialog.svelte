<script lang="ts">
  /*
   * „✕ Ohne mich“ (#439): erst erklären und durchrechnen, was es bedeutet (für die anderen pro Person, ganze Reise, was
   * wegfällt und was bleibt), wahlweise mit der eigenen Familie und mit freiwilliger Begründung; wirksam erst nach Bestätigen.
   */
  import { t } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { eur } from "../calc";
  import { geo } from "../geo/geo.svelte";
  import { cast, myVoter, vetoesNow } from "../polls.svelte";
  import { applyOption, familyOf, without } from "../without";
  import type { Poll } from "../together";
  import Modal from "./Modal.svelte";

  let { p, option, onclose }: { p: Poll; option: string; onclose: () => void } = $props();
  const trip = $derived(app.trip);
  const o = $derived(p.options.find(x => x.id === option)!);
  const me = $derived(myVoter() || "");
  const fam = $derived(familyOf(trip, me));
  let withFam = $state(false), reason = $state(""), busy = $state(false);
  // wer schon nicht dabei wäre, ist vorher schon draußen; gerechnet wird, was ich (mit Familie) zusätzlich ändere
  const others = $derived((vetoesNow(p)[option] || []).filter(x => x !== me && !(withFam && fam.some(f => f.id === x))));
  const ids = $derived([me, ...(withFam ? fam.map(f => f.id) : [])]);
  const w = $derived(without(trip, ids, tr => {
    applyOption(tr, p, option);
    for (const x of tr.travelers) if (others.includes(x.id)) x.active = false;
  }, geo));
  const diff = $derived(w.after.perPerson - w.before.perPerson);
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${eur(Math.abs(v))}`;

  async function ok() {
    busy = true;
    try { await cast(p, option, "veto", { r: reason, f: withFam }); onclose(); } finally { busy = false; }
  }
</script>

<Modal title={t("veto.title", { x: o.label })} {onclose}>
  <div class="veto">
    <p>{t("veto.text")}</p>
    {#if fam.length}
      <label class="ck"><input type="checkbox" class="veto-fam" bind:checked={withFam} /> {t("veto.family", { names: fam.map(x => x.name).join(", ") })}</label>
    {/if}
    <div class="veto-eff">
      <p><b>{t("veto.people", { a: w.after.people, b: w.before.people })}</b></p>
      {#if w.after.people}<p class="veto-pp">{t("veto.pp", { after: eur(w.after.perPerson), before: eur(w.before.perPerson), diff: signed(diff) })}</p>{/if}
      <p>{t("veto.total", { after: eur(w.after.total), before: eur(w.before.total), diff: signed(w.after.total - w.before.total) })}</p>
      {#if w.dropped.length}<p>✓ {t("veto.dropped", { names: w.dropped.join(", ") })}</p>{/if}
      {#each w.fewer as f (f.name)}<p>✓ {t("veto.fewer", { name: f.name, a: f.after, b: f.before })}</p>{/each}
      {#each w.stays as s (s.name)}<p class="veto-stays">⚠ {t("veto.stays", { name: s.name, v: eur(s.net), a: w.after.people, b: w.before.people })}</p>{/each}
    </div>
    <label class="f">{t("veto.reason")}<input class="veto-why" bind:value={reason} maxlength="200" /></label>
    <p class="fu-acts">
      <button class="btn primary veto-ok" disabled={busy || !me} onclick={ok}>✕ {t("poll.veto")}</button>
      <button class="btn" onclick={onclose}>{t("cancel")}</button>
    </p>
  </div>
</Modal>

<style>
  .veto { display: flex; flex-direction: column; gap: 12px; }
  .veto p { margin: 0; }
  .veto-eff { display: grid; gap: 4px; padding: 10px 12px; border-radius: 10px; background: var(--paper-2); font-size: 14px; }
  .veto-stays { color: var(--warn); }
  .ck { display: flex; gap: 8px; align-items: center; }
  .veto-ok { background: #C4452E; border-color: #C4452E; }
</style>
