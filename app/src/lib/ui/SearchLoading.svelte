<script lang="ts" module>
  export type LoadKind = "flights" | "stay" | "events" | "tours" | "cruise" | "ai" | "import";
</script>

<script lang="ts">
  /*
   * Ladeanimation für alle Suchen: kleines Bild in Kapitelfarbe (Flugzeug auf dem Bogen, Fenster gehen an, Ticket, Schiff, KI),
   * darunter wechselnde Schritte. Desktop: Bild klein mit Text daneben und Platzhalter-Karten, wo gleich die Treffer stehen;
   * Handy: Bild groß, ohne Karten. art: nur Bild und Balken (Text kommt vom Aufrufer, z. B. KI-Chat mit Uhr).
   */
  import { t } from "../i18n/index.svelte";
  import { mob } from "../mobile.svelte";

  let { kind, steps, sub, cards = 2, art = false, from = "", to = "" }: {
    kind: LoadKind; steps?: string[]; sub?: string; cards?: number; art?: boolean; from?: string; to?: string;
  } = $props();

  const STEPS: Record<LoadKind, () => string[]> = {
    flights: () => [t("load.flights.1"), t("load.flights.2"), t("load.flights.3")],
    stay: () => [t("load.stay.1"), t("load.stay.2"), t("load.stay.3")],
    events: () => [t("load.events.1"), t("load.events.2"), t("load.events.3")],
    tours: () => [t("load.tours.1"), t("load.tours.2")],
    cruise: () => [t("load.cruise.1"), t("load.cruise.2"), t("load.cruise.3")],
    ai: () => [t("ai.busy"), t("load.ai.2"), t("load.ai.3")],
    import: () => [t("imp.busy"), t("load.import.2"), t("load.import.3")]
  };
  const list = $derived(steps?.length ? steps : STEPS[kind]());
  // KI braucht länger: „dauert länger“ erst nach einer Minute
  const longAfter = $derived(kind === "ai" || kind === "cruise" ? 60 : 20);

  let i = $state(0), secs = $state(0), fade = $state(false);
  $effect(() => {
    const t0 = Date.now();
    let swap: ReturnType<typeof setTimeout> | undefined;
    const iv = setInterval(() => {
      secs = Math.floor((Date.now() - t0) / 1000);
      if (secs % 3 === 0) { fade = true; swap = setTimeout(() => { i++; fade = false; }, 250); }
    }, 1000);
    return () => { clearInterval(iv); clearTimeout(swap); };
  });
  const msg = $derived(list[i % list.length]);
  // sub vom Aufrufer gilt immer (z. B. „Dialog offen lassen“), sonst nach einer Weile „dauert länger“
  const note = $derived(sub ?? (secs >= longAfter ? t("load.long") : t("load.sub")));
  const big = $derived(mob.on || art);
  // sobald die Suche startet ins Bild holen (am Handy liegt sie sonst unter dem Knopf)
  const show = (el: HTMLElement) => { requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" })); };
  const scene = $derived(kind === "tours" ? "events" : kind === "import" ? "ai" : kind);
</script>

<div class="sload sload-{kind}" class:big class:art role="status" aria-live="polite" use:show>
  <div class="sload-scene">
    <svg viewBox="0 0 260 80" aria-hidden="true">
      {#if scene === "flights"}
        <path class="dash" d="M20 62 Q130 -6 240 62" />
        <circle class="dot" cx="20" cy="62" r="5" /><circle class="dot" cx="240" cy="62" r="5" />
        {#if from && to}<text class="code" x="20" y="79" text-anchor="middle">{from}</text><text class="code" x="240" y="79" text-anchor="middle">{to}</text>{/if}
        <g class="plane"><path class="fa" d="M-11 0 L10 -1.6 Q13 0 10 1.6 Z M-2 -1 L3 -10 L6 -10 L4 -1 Z M-2 1 L3 10 L6 10 L4 1 Z M-10 -1 L-8 -5 L-6 -5 L-6 -1 Z M-10 1 L-8 5 L-6 5 L-6 1 Z" /></g>
      {:else if scene === "stay"}
        <path class="st" d="M40 74 V40 L70 22 L100 40 V74 M160 74 V30 H220 V74 M10 74 H250" />
        {#each [[52, 46], [76, 46], [170, 38], [198, 38], [170, 56], [198, 56]] as [x, y], k (k)}<rect class="win" style:animation-delay="{k * 0.3}s" {x} {y} width="12" height="10" rx="2" />{/each}
        <g class="lens"><circle class="glass" cx="130" cy="40" r="15" /><path class="st" d="M141 51 L152 62" stroke-width="4" /></g>
      {:else if scene === "events"}
        <g class="ticket">
          <path class="fp st" d="M95 22 H165 V36 a6 6 0 0 0 0 12 V64 H95 V48 a6 6 0 0 0 0 -12 Z" />
          <path class="dash" d="M140 26 V60" />
          <path class="fa" d="M110 36 h20 v4 h-20z M110 45 h14 v4 h-14z" />
        </g>
        <path class="fa spark" d="M70 20 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
        <path class="fa spark s2" d="M190 14 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" />
        <path class="fa spark s3" d="M196 58 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
      {:else if scene === "cruise"}
        <g class="ship">
          <path class="fa" d="M78 50 H182 L170 66 H92 Z" />
          <path class="fp st" d="M98 50 V38 H160 V50" />
          <path class="fp st" d="M112 38 V28 H146 V38" />
          <rect class="fa" x="134" y="16" width="8" height="12" rx="1.5" />
          {#each [110, 122, 134, 146] as x (x)}<circle class="fa" cx={x} cy="44" r="2" />{/each}
        </g>
        <g class="wave"><path class="st" d="M0 70 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" /></g>
        <g class="wave w2"><path class="st" d="M10 77 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" /></g>
      {:else}
        <g class="orbit">
          <path class="fa" d="M130 4 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" />
          <path class="fa" opacity=".55" d="M130 64 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2z" />
        </g>
        <rect class="fp st" x="96" y="22" width="68" height="34" rx="17" />
        {#each [116, 130, 144] as x, k (x)}<circle class="fa hop" style:animation-delay="{k * 0.15}s" cx={x} cy="39" r="5" />{/each}
      {/if}
    </svg>
    {#if !art}
      <b class="sload-msg" class:fade>{msg}</b>
      <small class="sload-sub">{note}</small>
    {/if}
    <span class="sload-bar"></span>
  </div>
  {#if !big && cards > 0}
    <div class="sload-cards" aria-hidden="true">
      {#each Array(cards) as _, k (k)}
        <div class="sload-card"><span class="ph ico"></span><span class="ph l1"></span><span class="ph pr"></span><span class="ph l2"></span></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sload { --sl: var(--c-flights); --sl-s: var(--c-flights-s); display: grid; gap: 10px; margin: 12px 0; }
  .sload-stay { --sl: var(--c-stay); --sl-s: var(--c-stay-s); }
  .sload-events, .sload-tours { --sl: var(--c-attractions); --sl-s: var(--c-attractions-s); }
  .sload-cruise { --sl: var(--c-transport); --sl-s: var(--c-transport-s); }
  .sload-ai, .sload-import { --sl: var(--c-misc); --sl-s: var(--c-misc-s); }

  /* Desktop: Bild klein links, Text rechts */
  .sload-scene { border-radius: 16px; background: var(--sl-s); padding: 10px 14px; display: grid; grid-template-columns: 140px 1fr; gap: 2px 14px; align-items: center; }
  .sload-scene svg { grid-row: 1 / 3; width: 100%; height: auto; overflow: visible; }
  .sload-msg { font-size: 14px; color: var(--ink); transition: opacity .25s; }
  .sload-msg.fade { opacity: 0; }
  .sload-sub { font-size: 12.5px; color: var(--ink-2); }
  .sload-bar { grid-column: 1 / -1; height: 4px; border-radius: 99px; margin-top: 6px; background: color-mix(in srgb, var(--sl) 18%, transparent); overflow: hidden; }
  .sload-bar::after { content: ""; display: block; height: 100%; width: 35%; border-radius: inherit; background: var(--sl); animation: slide 1.6s ease-in-out infinite; }
  /* Handy und art: Bild groß, Text darunter */
  .big .sload-scene { grid-template-columns: 1fr; justify-items: center; text-align: center; padding: 14px 12px 12px; gap: 6px; }
  .big .sload-scene svg { grid-row: auto; max-width: 260px; }
  .art .sload-scene { padding: 10px 12px; }
  .art .sload-scene svg { max-width: 180px; }

  .dash { fill: none; stroke: var(--sl); stroke-width: 2; stroke-dasharray: 3 6; stroke-linecap: round; opacity: .55; }
  .dot { fill: var(--paper); stroke: var(--sl); stroke-width: 2.5; }
  .code { font: 800 11px inherit; font-family: inherit; fill: var(--ink-2); }
  .fa { fill: var(--sl); }
  .fp { fill: var(--paper); }
  .st { fill: none; stroke: var(--sl); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  .fp.st { fill: var(--paper); }
  .glass { fill: color-mix(in srgb, var(--paper) 55%, transparent); stroke: var(--sl); stroke-width: 3; }
  .plane { offset-path: path("M20 62 Q130 -6 240 62"); offset-rotate: auto; animation: fly 2.4s cubic-bezier(.45, .05, .55, .95) infinite; }
  .win { fill: color-mix(in srgb, var(--sl) 22%, var(--paper)); animation: lit 2.4s infinite; }
  .lens { animation: sweep 2.4s ease-in-out infinite alternate; }
  .ticket { transform-box: fill-box; transform-origin: 50% 100%; animation: rock 1.6s ease-in-out infinite alternate; }
  .spark { transform-box: fill-box; transform-origin: center; animation: tw 1.4s ease-in-out infinite; }
  .spark.s2 { animation-delay: .45s; }
  .spark.s3 { animation-delay: .9s; }
  .ship { transform-box: fill-box; transform-origin: 50% 90%; animation: bob 2s ease-in-out infinite; }
  .wave { animation: wv 1.8s linear infinite; }
  .wave.w2 { animation-duration: 2.6s; opacity: .5; }
  .orbit { transform-origin: 130px 38px; animation: turn 3.2s linear infinite; }
  .hop { transform-box: fill-box; transform-origin: center; animation: hop 1.1s ease-in-out infinite; }

  /* Platzhalter-Karten: wo gleich die Treffer stehen */
  .sload-cards { display: grid; gap: 10px; }
  .sload-card { border: 1px solid var(--line); border-radius: 14px; padding: 12px; display: grid; grid-template-columns: 44px 1fr auto; gap: 6px 10px; align-items: center; background: var(--paper); }
  .ph { position: relative; overflow: hidden; border-radius: 8px; background: color-mix(in srgb, var(--ink) 8%, var(--paper)); }
  .ph::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--paper) 70%, transparent), transparent); transform: translateX(-100%); animation: shim 1.4s ease-in-out infinite; }
  .sload-card:nth-child(2) .ph::after { animation-delay: .15s; }
  .sload-card:nth-child(3) .ph::after { animation-delay: .3s; }
  .ico { width: 44px; height: 44px; border-radius: 12px; grid-column: 1; grid-row: 1 / 3; }
  .l1 { height: 12px; width: 80%; grid-column: 2; grid-row: 1; }
  .l2 { height: 10px; width: 55%; grid-column: 2; grid-row: 2; }
  .pr { height: 18px; width: 58px; grid-column: 3; grid-row: 1 / 3; }
  .sload-card:nth-child(2) .l1 { width: 66%; }

  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(290%); } }
  @keyframes fly { 0% { offset-distance: 0%; opacity: 0; } 8% { opacity: 1; } 88% { opacity: 1; } 100% { offset-distance: 100%; opacity: 0; } }
  @keyframes lit { 0%, 20% { fill: color-mix(in srgb, var(--sl) 22%, var(--paper)); } 35%, 70% { fill: var(--sl); } 100% { fill: color-mix(in srgb, var(--sl) 22%, var(--paper)); } }
  @keyframes sweep { from { transform: translateX(-70px); } to { transform: translateX(70px); } }
  @keyframes rock { from { transform: rotate(-6deg) translateY(2px); } to { transform: rotate(6deg) translateY(-3px); } }
  @keyframes tw { 0%, 100% { transform: scale(.3); opacity: .2; } 50% { transform: scale(1); opacity: 1; } }
  @keyframes bob { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-4px) rotate(2deg); } }
  @keyframes wv { from { transform: translateX(0); } to { transform: translateX(-40px); } }
  @keyframes turn { to { transform: rotate(360deg); } }
  @keyframes hop { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-9px); opacity: 1; } }
  @keyframes shim { to { transform: translateX(100%); } }

  /* „Bewegung reduzieren“: stehendes Bild */
  @media (prefers-reduced-motion: reduce) {
    .sload *, .sload *::after { animation: none !important; }
    .plane { offset-distance: 50%; }
  }
</style>
