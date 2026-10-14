<script lang="ts">
  /*
   * „Neues & Ausblick“: Neu (letzte Versionen), Bald (geplant, in Arbeit, im nächsten Update), bekannte Fehler und FAQ.
   * Inhalt aus der täglich gepflegten Datei der Routine SAF 8 (siehe info/ausblick.ts); die Fragen sind auch ohne sie da.
   */
  import { i18n, t } from "../i18n/index.svelte";
  import { dayShort } from "../format";
  import { pick, parseAusblick, type Ausblick, type Entry, type L } from "../info/ausblick";
  import { infoDialog, loadAusblick, type InfoTab } from "../info/app.svelte";
  import { bugDialog } from "../bugs/app.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { FLIGHTS_URL } from "../flights/app";
  import seed from "../info/ausblick.seed.json";
  import Modal from "./Modal.svelte";

  const base = parseAusblick(seed)!;
  let data = $state<Ausblick | null>(null);
  let phase = $state<"load" | "ok" | "off">("load");
  loadAusblick().then(d => { data = d; phase = d ? "ok" : "off"; });

  const tx = (l: L) => pick(l, i18n.lang);
  const faq = $derived(data?.faq.length ? data.faq : base.faq);
  const TABS: { k: InfoTab; ic: string }[] = [{ k: "neu", ic: "✨" }, { k: "bald", ic: "🚀" }, { k: "fehler", ic: "🐞" }, { k: "faq", ic: "❓" }];
  const count = (k: InfoTab) => (k === "bald" ? data?.bald.length : k === "fehler" ? data?.fehler.length : undefined);
  const ST_IC = { geplant: "", "in-arbeit": "🛠", "auf-test": "🧪" } as const;
  const close = () => (infoDialog.open = false);
  const report = () => { close(); bugDialog.open = true; };
</script>

<!-- „geplant“ ist der Normalfall und braucht kein Schild -->
{#snippet st(e: Entry)}{#if e.status !== "geplant"}<span class="inf-st" data-s={e.status}>{ST_IC[e.status]} {t(`info.st.${e.status}`)}</span>{/if}{/snippet}

{#snippet entries(list: Entry[], empty: string)}
  {#if !list.length}<p class="inf-empty">{empty}</p>{/if}
  <ul class="inf-list">
    {#each list as e, i (e.nr ?? "i" + i)}
      <li class="inf-e" data-status={e.status}>
        {#if e.text}
          <details><summary><b>{tx(e.titel)}</b>{@render st(e)}</summary><p>{tx(e.text)}</p></details>
        {:else}
          <div class="inf-row"><b>{tx(e.titel)}</b>{@render st(e)}</div>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<Modal title={`✨ ${t("info.title")}`} onclose={close} wide>
  <div class="seg inf-tabs" role="tablist" aria-label={t("info.title")}>
    {#each TABS as tb (tb.k)}
      <button type="button" role="tab" aria-selected={infoDialog.tab === tb.k} class:on={infoDialog.tab === tb.k} data-tab={tb.k} onclick={() => (infoDialog.tab = tb.k)}>
        <span aria-hidden="true">{tb.ic}</span> {t(`info.tab.${tb.k}`)}{#if count(tb.k)}<small class="inf-n">{count(tb.k)}</small>{/if}
      </button>
    {/each}
  </div>

  <div class="inf-body" role="tabpanel">
    {#if infoDialog.tab === "faq"}
      <div class="inf-faq">
        {#each faq as q, i (i)}
          <details><summary>{tx(q.f)}</summary><p>{tx(q.a)}</p></details>
        {/each}
      </div>
    {:else if phase === "load"}
      <p class="inf-empty">{t("info.loading")}</p>
    {:else if !data}
      <p class="inf-empty">{t("info.offline")}</p>
    {:else if infoDialog.tab === "neu"}
      {#if !data.neu.length}<p class="inf-empty">{t("info.empty.neu")}</p>{/if}
      {#each data.neu as r (r.version)}
        <section class="inf-rel">
          <h4>{t("info.version", { v: r.version })} <small>{dayShort(r.datum)}</small></h4>
          <ul>{#each r.punkte as p, i (i)}<li>{tx(p)}</li>{/each}</ul>
        </section>
      {/each}
    {:else if infoDialog.tab === "bald"}
      {@render entries(data.bald, t("info.empty.bald"))}
    {:else}
      {@render entries(data.fehler, t("info.empty.fehler"))}
      {#if cloud.configured && FLIGHTS_URL}<button type="button" class="btn sm inf-report" onclick={report}>🐞 {t("bug.title")}</button>{/if}
    {/if}
  </div>

  <p class="muted small inf-foot">
    {#if data && infoDialog.tab !== "faq"}{t("info.stand", { d: dayShort(data.stand.slice(0, 10)) })} · {/if}
    <a href="https://github.com/elvau/startrek/issues?q=is%3Aissue+is%3Aopen+label%3A%C3%B6ffentlich" target="_blank" rel="noopener noreferrer">{t("info.github")} ↗</a>
  </p>
</Modal>

<style>
  .inf-tabs { margin-bottom: 12px; }
  .inf-tabs button.on { background: var(--paper); color: var(--ink); box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
  .inf-n { margin-inline-start: 5px; padding: 1px 6px; border-radius: 99px; background: var(--a-soft); color: var(--a); font-size: 11px; }
  .inf-body { min-height: 180px; }
  .inf-empty { color: var(--ink-2); padding: 18px 2px; }
  .inf-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .inf-e { border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  .inf-row, .inf-e summary { display: flex; align-items: baseline; gap: 10px; padding: 10px 12px; }
  .inf-e summary { cursor: pointer; list-style: none; }
  .inf-e summary::-webkit-details-marker { display: none; }
  .inf-e summary b::after { content: " ›"; color: var(--ink-2); font-weight: 400; }
  .inf-e details[open] summary b::after { content: " ⌄"; }
  .inf-row b, .inf-e summary b { flex: 1; min-width: 0; font-weight: 600; }
  .inf-e p { margin: 0; padding: 0 12px 12px; color: var(--ink-2); font-size: 14px; }
  .inf-st { flex: none; font-size: 12px; padding: 2px 8px; border-radius: 99px; background: var(--paper-2); color: var(--ink-2); white-space: nowrap; }
  .inf-st[data-s="in-arbeit"] { background: var(--warn-soft); color: var(--warn); }
  .inf-st[data-s="auf-test"] { background: var(--good-soft); color: var(--good); }
  .inf-rel + .inf-rel { margin-top: 14px; }
  .inf-rel h4 { margin: 0 0 4px; font-size: 15px; }
  .inf-rel h4 small { color: var(--ink-2); font-weight: 400; margin-inline-start: 6px; }
  .inf-rel ul { margin: 0; padding-inline-start: 20px; display: grid; gap: 3px; }
  .inf-faq { display: grid; gap: 6px; }
  .inf-faq details { border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  .inf-faq summary { cursor: pointer; padding: 10px 12px; font-weight: 600; }
  .inf-faq p { margin: 0; padding: 0 12px 12px; color: var(--ink-2); font-size: 14px; }
  .inf-report { margin-top: 12px; }
  .inf-foot { margin: 14px 0 0; }
  @media (max-width: 520px) {
    .inf-tabs { display: grid; grid-template-columns: repeat(4, 1fr); align-self: stretch; }
    .inf-tabs button { padding: 6px 4px; font-size: 12px; display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .inf-tabs button span { font-size: 17px; }
    .inf-n { display: none; }
    .inf-row, .inf-e summary { flex-wrap: wrap; row-gap: 4px; }
  }
</style>
