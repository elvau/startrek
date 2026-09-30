<script lang="ts">
  /* Admin: Fass, das bis zum Anteil am Kontingent gefüllt ist (Welle obenauf, Farbe nach Warnstufe) */
  import type { Level } from "../admin/usage";

  let { share, level, id }: { share: number; level: Level; id: string } = $props();
  // Füllhöhe erst nach dem Einblenden setzen, damit das Fass sichtbar vollläuft
  let shown = $state(false);
  $effect(() => { const f = requestAnimationFrame(() => (shown = true)); return () => cancelAnimationFrame(f); });

  const clip = $derived(`ub-${id.replace(/[^a-z0-9]/gi, "")}`);
  // Innenraum des Fasses: y 12 … 108 (Höhe 96)
  // etwas Nutzung zeigt immer einen dünnen Bodensatz
  const fill = $derived(share > 0 ? Math.min(1, Math.max(0.04, share)) : 0);
  const top = $derived(12 + 96 * (1 - (shown ? fill : 0)));
  // Fassform: oben und unten schmaler, in der Mitte bauchig
  const BODY = "M18 10 Q10 60 18 110 L72 110 Q80 60 72 10 Z";
</script>

<svg class="barrel lv-{level}" viewBox="0 0 90 120" aria-hidden="true">
  <defs><clipPath id={clip}><path d={BODY} /></clipPath></defs>
  <path d={BODY} class="barrel-in" />
  <g clip-path="url(#{clip})">
    <g class="barrel-liquid" style="transform: translateY({top}px)">
      <path class="barrel-wave" d="M-90 4 Q-67.5 -4 -45 4 T0 4 T45 4 T90 4 T135 4 T180 4 V130 H-90 Z" />
    </g>
    <!-- Dauben -->
    <path d="M36 10 Q33 60 36 110 M54 10 Q57 60 54 110" class="barrel-stave" />
  </g>
  <path d={BODY} class="barrel-out" />
  <!-- Reifen -->
  <path d="M15.5 30 Q45 36 74.5 30 M15.5 90 Q45 96 74.5 90" class="barrel-hoop" />
  <ellipse cx="45" cy="10" rx="27" ry="4" class="barrel-lid" />
</svg>
