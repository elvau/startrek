<script lang="ts">
  /* Umschalter Einfach / Detailliert */
  let { value, onchange, label = "Eingabe" }: { value: "simple" | "detail" | "mixed"; onchange: (detail: boolean) => void; label?: string } = $props();
</script>

<div class="mode" role="radiogroup" aria-label={label}>
  <button role="radio" aria-checked={value === "simple"} class:on={value === "simple"} onclick={() => onchange(false)}>Einfach</button>
  <button role="radio" aria-checked={value === "detail"} class:on={value === "detail"} onclick={() => onchange(true)}>Detailliert</button>
</div>
