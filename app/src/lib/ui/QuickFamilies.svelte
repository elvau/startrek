<script lang="ts">
  /* Schnell: Familien als Platzhalter, z. B. Familie Reh mit 2 Erwachsenen und 3 Kindern */
  import { ANIMALS, nextAnimal, type FamilyRow } from "../placeholders";

  let { rows = $bindable(), used = [] }: { rows: FamilyRow[]; used?: string[] } = $props();

  const taken = $derived([...used, ...rows.map(r => r.animal)]);
  const add = () => rows.push({ animal: nextAnimal(taken), adults: 2, kids: 0 });
  const step = (r: FamilyRow, k: "adults" | "kids", d: number) => (r[k] = Math.max(0, Math.min(20, r[k] + d)));
</script>

<div class="qf">
  {#each rows as r, i (i)}
    <div class="qf-row">
      <select bind:value={r.animal} aria-label="Familie">
        {#each ANIMALS as [n, e] (n)}
          <option value={n} disabled={n !== r.animal && taken.includes(n)}>{e} Familie {n}</option>
        {/each}
      </select>
      {#each [["adults", "Erw."], ["kids", "Kinder"]] as [k, l] (k)}
        <span class="qf-step" role="group" aria-label={l}>
          <button type="button" onclick={() => step(r, k as "adults", -1)} aria-label="{l} weniger">−</button>
          <b>{r[k as "adults"]}</b><small>{l}</small>
          <button type="button" onclick={() => step(r, k as "adults", 1)} aria-label="{l} mehr">+</button>
        </span>
      {/each}
      <button type="button" class="x" onclick={() => rows.splice(i, 1)} aria-label="Familie {r.animal} entfernen">×</button>
    </div>
  {/each}
  <button type="button" class="linkbtn" onclick={add}>+ {rows.length ? "weitere Familie" : "Familie"}</button>
</div>
