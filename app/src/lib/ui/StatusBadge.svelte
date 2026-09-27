<script lang="ts">
  import type { Status } from "../model";
  let { status, estimate = false, extra = "" }: { status: Status; estimate?: boolean; extra?: string } = $props();
  const L: Record<Status, string> = { idea: "Idee", chosen: "Gewählt", booked: "Gebucht", paid: "Bezahlt", dropped: "Verworfen" };
  const C: Record<Status, string> = { idea: "s-idea", chosen: "s-chosen", booked: "s-booked", paid: "s-paid", dropped: "s-dropped" };
</script>

<span class="status {C[status]}">{estimate && status === "chosen" ? "Geschätzt" : L[status]}{extra}</span>
