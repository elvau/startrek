<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import type { Status } from "../model";
  import type { Key } from "../i18n/index.svelte";
  let { status, estimate = false, extra = "" }: { status: Status; estimate?: boolean; extra?: string } = $props();
  const L = (s: Status) => t(`status.${s}` as Key);
  const C: Record<Status, string> = { idea: "s-idea", chosen: "s-chosen", booked: "s-booked", paid: "s-paid", dropped: "s-dropped" };
</script>

<span class="status {C[status]}">{estimate && status === "chosen" ? t("status.estimate") : L(status)}{extra}</span>
