<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Gesamtpaket (#618): ein Posten für ein Paket. Oben Name, Gesamtpreis und Preis pro Person, darunter die Teile
   * (Flug, Unterkunft, Transfer …) als normale Karten zum Bearbeiten. Hintergrund mischt die Farben der enthaltenen
   * Kapitel. Aufbrechen und Vergleich stehen wie bisher am Band der Teile (PkgBand).
   */
  import type { CatKey, Item } from "../model";
  import { isActive } from "../model";
  import { app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { PART_ICON, pkgInfo } from "../package";
  import ItemCard from "./ItemCard.svelte";

  let { id }: { id: string } = $props();
  const ICON: Record<CatKey, string> = { flights: "plane", stay: "bed", transport: "car", attractions: "ticket", misc: "bag" };
  const info = $derived(pkgInfo(app.trip, id));
  // Hauptteil zuerst, dann Flug, Transport, Rest
  const ORDER: CatKey[] = ["flights", "stay", "transport", "attractions", "misc"];
  const parts = $derived<Item[]>(info ? [info.main, ...info.parts].sort((a, b) => ORDER.indexOf(a.cat) - ORDER.indexOf(b.cat)) : []);
  const cats = $derived([...new Set(parts.map(p => p.cat))]);
  const po = $derived(info?.main.options.find(o => o.pkg));
  const name = $derived(po?.source?.name || po?.label || t("pkg.title"));
  const total = $derived(parts.reduce((s, p) => s + (calc.T.items[p.id]?.net || 0), 0));
  const fees = $derived(parts.reduce((s, p) => s + (calc.T.items[p.id]?.extras?.added || 0), 0));
  // pro Person: alle, die bei einem Teil dabei sind
  const people = $derived(new Set(parts.flatMap(p => (p.participants?.length ? p.participants : app.trip.travelers.filter(isActive).map(x => x.id)))).size);
  const bg = $derived(cats.length > 1 ? cats.map(c => `var(--c-${c}-s)`).join(", ") : `var(--c-${cats[0] || "stay"}-s), var(--paper)`);
</script>

{#if info}
  <article class="pkgc" data-pkg={id} style:--pkg-bg={bg}>
    <header class="pkgc-head">
      <div class="pkgc-name"><span aria-hidden="true">📦</span> <b>{name}</b>
        <span class="pkgc-incl">{t("pkg.incl", { x: cats.map(c => `${PART_ICON[c]} ${t(`pkg.part.${c}` as Key)}`).join(" · ") })}</span></div>
      <div class="pkgc-price"><b class="pkgc-total">{eur(total)}</b>{#if people > 1}<span class="pkgc-pp">{t("pp", { v: eur(total / people) })}</span>{/if}
        {#if fees > 0}<span class="pkgc-fees muted">{t("pkg.fees", { v: eur(fees) })}</span>{/if}</div>
    </header>
    <div class="pkgc-parts">
      {#each parts as it (it.id)}<ItemCard item={it} icon={ICON[it.cat]} />{/each}
    </div>
  </article>
{/if}

<style>
  .pkgc { border-radius: 22px; padding: 14px 12px 6px; margin: 0 0 16px; background: linear-gradient(135deg, var(--pkg-bg)); border: 1px solid color-mix(in srgb, var(--c-pkg) 30%, var(--line)); }
  .pkgc-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 14px; padding: 0 8px 10px; }
  .pkgc-name { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 17px; min-width: 0; }
  .pkgc-incl { font-size: 13px; color: var(--ink-2); }
  .pkgc-price { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin-inline-start: auto; }
  .pkgc-total { font-size: 22px; }
  .pkgc-pp { font-weight: 700; color: var(--ink-2); }
  .pkgc-fees { font-size: 12.5px; width: 100%; text-align: end; }
  .pkgc-parts :global(article.card) { margin-bottom: 8px; }
  /* im Gesamtpaket überflüssig: Sprung zum Paketpreis (steht oben) */
  .pkgc-parts :global(.pkgb-go) { display: none; }
</style>
