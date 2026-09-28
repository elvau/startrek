<script lang="ts">
  /* Doppel-Schieberegler: von–bis, z. B. Nächte vor Ort (wie im Artefakt) */
  let { lo = $bindable(), hi = $bindable(), min = 1, max, label, unit = "", maxNote = "" }:
    { lo: number; hi: number; min?: number; max: number; label: string; unit?: string; maxNote?: string } = $props();

  const pct = (v: number) => ((v - min) / ((max - min) || 1)) * 100;
  // Grenzen einhalten: nie außerhalb, „von“ nie über „bis“
  $effect(() => {
    const h = Math.max(min, Math.min(hi || max, max));
    const l = Math.max(min, Math.min(lo || min, h));
    if (h !== hi) hi = h;
    if (l !== lo) lo = l;
  });
</script>

<div class="dual-wrap">
  <div class="dual-head"><span class="dlabel">{label}</span><b class="num">{lo === hi ? lo : `${lo} bis ${hi}`}{unit ? ` ${unit}` : ""}</b></div>
  <div class="dual">
    <div class="dual-track"></div>
    <div class="dual-fill" style:left="{pct(lo)}%" style:right="{100 - pct(hi)}%"></div>
    <input type="range" {min} {max} step="1" value={lo} aria-label="{label}: von"
      oninput={e => (lo = Math.min(+e.currentTarget.value, hi))} />
    <input type="range" {min} {max} step="1" value={hi} aria-label="{label}: bis"
      oninput={e => (hi = Math.max(+e.currentTarget.value, lo))} />
  </div>
  <div class="dual-axis"><span>{min}</span><span>{maxNote || max}</span></div>
</div>
