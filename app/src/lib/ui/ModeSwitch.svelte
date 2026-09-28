<script lang="ts">
  import { t } from "../i18n/index.svelte";
  /* Umschalter Einfach / Detailliert */
  let { value, onchange, label = "" }: { value: "simple" | "detail" | "mixed"; onchange: (detail: boolean) => void; label?: string } = $props();
</script>

<div class="mode" role="radiogroup" aria-label={label || t("mode.input")}>
  <button role="radio" aria-checked={value === "simple"} class:on={value === "simple"} onclick={() => onchange(false)}>{t("mode.simple")}</button>
  <button role="radio" aria-checked={value === "detail"} class:on={value === "detail"} onclick={() => onchange(true)}>{t("mode.detail")}</button>
</div>
