<script lang="ts">
  /* Währung, in der man selbst alle Beträge sieht (nur auf diesem Gerät; gerechnet wird in Euro) */
  import { t } from "../i18n/index.svelte";
  import { CURRENCIES, fx, setCurrency } from "../currency.svelte";
</script>

<select class="cur-sel" value={fx.currency} onchange={e => setCurrency(e.currentTarget.value)} aria-label={t("nav.currency")} title={t("nav.currency")}>
  {#each CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}
</select>
