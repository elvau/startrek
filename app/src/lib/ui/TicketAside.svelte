<script lang="ts">
  import { app, calc } from "../store.svelte";
  import { activeOption, eur } from "../calc";
  import { CAT_CHAPTERS } from "../chapters";
  import { nights } from "../format";
  import { view } from "../scroll.svelte";

  const T = $derived(calc.T);
  const n = $derived(app.trip.travelers.length);
  const nn = $derived(nights(app.trip.from, app.trip.to));
</script>

<aside class="aside" aria-label="Zusammenfassung">
  <div class="tk">
    <div class="tk-top">
      <small>Gesamt</small>
      <b class="num">{eur(T.total)}</b>
      <span>{eur(n ? T.total / n : 0)} pro Person · {n} Reisende</span>
    </div>
    <div class="tk-b">
      <div class="fix">
        <div class="bar">
          <i style="background:var(--good)" style:width="{T.total ? (T.fixed / T.total) * 100 : 0}%"></i>
          <i style="background:var(--idea);opacity:.55" style:width="{T.total ? (T.open / T.total) * 100 : 0}%"></i>
        </div>
        <div class="lg"><span>Fest <b class="num">{eur(T.fixed)}</b></span><span>Offen <b class="num">{eur(T.open)}</b></span></div>
      </div>
      <div class="cats">
        {#each CAT_CHAPTERS as c (c.k)}
          {@const its = app.trip.items.filter(x => x.cat === c.k && x.status !== "dropped")}
          <a class="cat" class:on={view.active === c.k} href="#{c.k}" style="--cc:var(--c-{c.k})">
            <i></i><span>{c.label}</span><b>{eur(T.byCat[c.k])}</b>
            <span class="cat-d">{its.length ? its.map(x => `${x.name || activeOption(x, app.trip)?.label || "Neuer Posten"} ${eur(T.items[x.id]?.net || 0)}`).join(" · ") : "noch nichts eingetragen"}</span>
          </a>
        {/each}
      </div>
      {#if nn && n}<div class="pp"><span>Pro Person und Nacht</span><b class="num">{eur(T.total / n / nn)}</b></div>{/if}
      <div class="pp"><span>Bereits bezahlt</span><b class="num">{eur(T.paid)}</b></div>
      {#if !app.saved}<div class="pp"><span>Speichert…</span></div>{/if}
    </div>
  </div>
</aside>
