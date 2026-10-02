<script lang="ts">
  /* QR-Code als SVG (für den GiroCode); die Bibliothek wird erst hier geladen */
  import { utf8Binary } from "../campaign";

  let { text, label, size = 200 }: { text: string; label: string; size?: number } = $props();
  let cells = $state<{ n: number; d: string } | null>(null);

  $effect(() => {
    const s = text;
    void import("qrcode-generator").then(({ default: qrcode }) => {
      const q = qrcode(0, "M");
      q.addData(utf8Binary(s), "Byte");
      q.make();
      const n = q.getModuleCount();
      let d = "";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      cells = { n, d };
    });
  });
</script>

{#if cells}
  <svg class="qr" width={size} height={size} viewBox="-4 -4 {cells.n + 8} {cells.n + 8}" role="img" aria-label={label} shape-rendering="crispEdges">
    <rect x="-4" y="-4" width={cells.n + 8} height={cells.n + 8} fill="#fff" />
    <path d={cells.d} fill="#000" />
  </svg>
{:else}
  <div class="qr" style:width="{size}px" style:height="{size}px"></div>
{/if}
