<script lang="ts">
  /* Wer zahlt was: pro Familie Summe, fest und offen, Mitglieder und alle Posten */
  import { app, calc } from "../store.svelte";
  import { eur, householdShares } from "../calc";
  import { CAT_CHAPTERS } from "../chapters";
  import { reveal } from "./reveal";
  import Icon from "./Icon.svelte";

  const shares = $derived(householdShares(app.trip, calc.T));
  const label = (k: string) => CAT_CHAPTERS.find(c => c.k === k)!;
  const ST: Record<string, string> = { idea: "Idee", chosen: "Gewählt", booked: "Gebucht", paid: "Bezahlt" };

  function jump(id: string) {
    app.editing = id;
    requestAnimationFrame(() => document.querySelector(`[data-item="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
</script>

{#each shares as h (h.name)}
  <article class="card share" id="hh-{h.name}" use:reveal>
    <div class="sh-head">
      <div>
        <h3>{h.name}</h3>
        <span class="muted">{h.members.length} {h.members.length === 1 ? "Person" : "Personen"} · {eur(h.members.length ? h.total / h.members.length : 0)} pro Person</span>
      </div>
      <div class="sh-tot"><b class="num">{eur(h.total)}</b><span>{calc.T.total ? Math.round((h.total / calc.T.total) * 100) : 0} % der Reise</span></div>
    </div>
    <div class="fix">
      <div class="bar"><i style="background:var(--good)" style:width="{h.total ? (h.fixed / h.total) * 100 : 0}%"></i><i style="background:var(--idea);opacity:.55" style:width="{h.total ? (h.open / h.total) * 100 : 0}%"></i></div>
      <div class="lg"><span>Fest <b class="num">{eur(h.fixed)}</b></span><span>Offen <b class="num">{eur(h.open)}</b></span></div>
    </div>
    <div class="sh-members">
      {#each h.members as m (m.t.id)}<span class="sh-m"><span class="av sm" style:background={m.t.color || "var(--ink-3)"}>{(m.t.name || "?")[0]}</span>{m.t.name || "Ohne Namen"} <b class="num">{eur(m.v)}</b></span>{/each}
    </div>
    <div class="sh-cats">
      {#each h.cats as c (c.cat)}
        <details open>
          <summary style="--cc:var(--c-{c.cat})"><i></i><Icon name={label(c.cat).icon} size={16} /><span>{label(c.cat).label}</span><b class="num">{eur(c.sum)}</b></summary>
          <ul>
            {#each c.lines as l (l.item?.id || "simple")}
              <li>
                <button class="sh-l" onclick={() => (l.item ? jump(l.item.id) : document.getElementById(c.cat)?.scrollIntoView({ behavior: "smooth" }))}>
                  <span class="sh-n">{l.label}<small>{[l.detail, l.who < h.members.length ? `${l.who} von ${h.members.length} dabei` : "", l.item ? ST[l.item.status] : ""].filter(Boolean).join(" · ")}</small></span>
                  <span class="num" class:fixed={l.fixed}>{eur(l.v)}</span>
                </button>
              </li>
            {/each}
          </ul>
        </details>
      {/each}
    </div>
  </article>
{:else}
  <div class="empty-ch">Noch keine Reisenden eingetragen.</div>
{/each}
