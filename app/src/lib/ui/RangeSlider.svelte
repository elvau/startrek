<script lang="ts">
  /*
   * Regler mit zwei Griffen für Hin- und Rückreise (#672): zwei übereinanderliegende Schieber, nur die Griffe greifen.
   * Bedienbar mit Daumen (Griffe 32 px, Fläche 44 px hoch), Tastatur (Pfeile je Tag) und von rechts nach links.
   */
  import { clampRange } from "../guided";

  let { max, a = $bindable(), b = $bindable(), labelA, labelB, startText, endText }: {
    max: number; a: number; b: number; labelA: string; labelB: string; startText: string; endText: string;
  } = $props();

  function set(which: "a" | "b", v: number) {
    const [x, y] = clampRange(which === "a" ? Math.min(v, b - 1) : a, which === "b" ? Math.max(v, a + 1) : b, max);
    a = x; b = y;
  }
</script>

<div class="rs">
  <div class="rs-track" aria-hidden="true"><i style="inset-inline-start:{(a / max) * 100}%;width:{((b - a) / max) * 100}%"></i></div>
  <input type="range" class="rs-in" min="0" {max} step="1" value={a} aria-label={labelA} oninput={e => set("a", +e.currentTarget.value)} />
  <input type="range" class="rs-in" min="0" {max} step="1" value={b} aria-label={labelB} oninput={e => set("b", +e.currentTarget.value)} />
</div>
<div class="rs-ends small muted" aria-hidden="true"><span>{startText}</span><span>{endText}</span></div>

<style>
  .rs { position: relative; height: 44px; }
  .rs-track { position: absolute; inset-inline: 14px; top: 19px; height: 6px; border-radius: var(--r-pill); background: var(--line); }
  .rs-track i { position: absolute; top: 0; bottom: 0; border-radius: var(--r-pill); background: var(--a); }
  .rs-in { position: absolute; inset: 0; width: 100%; height: 44px; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
  .rs-in::-webkit-slider-runnable-track { background: none; height: 44px; }
  .rs-in::-moz-range-track { background: none; }
  .rs-in::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 32px; height: 32px; margin-top: 6px; border-radius: 50%; background: var(--paper); border: 3px solid var(--a); box-shadow: var(--shadow); cursor: grab; }
  .rs-in::-moz-range-thumb { pointer-events: auto; width: 26px; height: 26px; border-radius: 50%; background: var(--paper); border: 3px solid var(--a); cursor: grab; }
  .rs-in:focus-visible { outline: none; }
  .rs-in:focus-visible::-webkit-slider-thumb { outline: 3px solid var(--a); outline-offset: 2px; }
  .rs-in:focus-visible::-moz-range-thumb { outline: 3px solid var(--a); outline-offset: 2px; }
  .rs-ends { display: flex; justify-content: space-between; margin-top: -4px; padding: 0 6px; }
</style>
