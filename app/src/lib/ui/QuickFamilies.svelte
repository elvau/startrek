<script lang="ts">
  import { t } from "../i18n/index.svelte";
  /* Schnell: Familien als Platzhalter, z. B. Familie Reh mit 2 Erwachsenen und 3 Kindern */
  import { ANIMALS, animalName, nextAnimal, type FamilyRow } from "../placeholders";

  let { rows = $bindable(), used = [] }: { rows: FamilyRow[]; used?: string[] } = $props();

  const taken = $derived([...used, ...rows.map(r => r.animal)]);
  type K = "adults" | "kids" | "infants";
  const add = () => rows.push({ animal: nextAnimal(taken), adults: 2, kids: 0, infants: 0 });
  const step = (r: FamilyRow, k: K, d: number) => (r[k] = Math.max(0, Math.min(20, (r[k] || 0) + d)));
</script>

<div class="qf">
  {#each rows as r, i (i)}
    <div class="qf-row">
      <div class="qf-top">
      <select bind:value={r.animal} aria-label={t("family")}>
        {#each ANIMALS as [n, e] (n)}
          <option value={n} disabled={n !== r.animal && taken.includes(n)}>{e} {t("family.named", { name: animalName(n) })}</option>
        {/each}
      </select>
      <button type="button" class="x" onclick={() => rows.splice(i, 1)} aria-label={t("family.remove", { name: animalName(r.animal) })}>×</button>
      </div>
      <div class="qf-counts">
      {#each [["adults", t("age.adultShort"), t("age.adults")], ["kids", t("age.kids"), t("age.kidsRange")], ["infants", t("age.infantShort"), t("age.infantsRange")]] as [k, l, full] (k)}
        <span class="qf-step" role="group" aria-label={full} title={full}>
          <button type="button" onclick={() => step(r, k as K, -1)} aria-label={t("step.less", { what: l })}>−</button>
          <b>{r[k as K] || 0}</b><small>{l}</small>
          <button type="button" onclick={() => step(r, k as K, 1)} aria-label={t("step.more", { what: l })}>+</button>
        </span>
      {/each}
      </div>
    </div>
  {/each}
  <button type="button" class="linkbtn" onclick={add}>+ {rows.length ? t("family.another") : t("family")}</button>
</div>
