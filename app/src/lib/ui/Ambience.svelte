<script lang="ts">
  /* Fester Hintergrund, der je Kapitel wechselt. Bewegte Teile folgen view.p (Fortschritt im Kapitel). */
  import { onMount } from "svelte";
  import { view } from "../scroll.svelte";

  let fp: SVGPathElement, fmp: SVGPathElement, plane: SVGSVGElement, rail: SVGPathElement, railDone: SVGPathElement, veh: HTMLDivElement, flights: HTMLDivElement, town: SVGSVGElement, stay: HTMLDivElement, fun: HTMLDivElement, misc: HTMLDivElement, split: HTMLDivElement;
  let windows: SVGRectElement[] = [];
  /** Unterwegs: Taxi, dann Bus, dann Bahn */
  let ride = $state<"taxi" | "bus" | "train">("taxi");
  let coins: HTMLElement[] = [];

  // gleichbleibender Zufall, damit die Stadt immer gleich aussieht
  const rng = (s: number) => () => (s = (s * 9301 + 49297) % 233280) / 233280;

  onMount(() => {
    const rnd = rng(7);
    let tw = "";
    for (let x = 0; x < 1000;) {
      const w = 50 + rnd() * 70, h = 90 + rnd() * 170;
      tw += `<rect class="b" x="${x}" y="${300 - h}" width="${w}" height="${h}"/>`;
      for (let wy = 300 - h + 14; wy < 290; wy += 26)
        for (let wx = x + 10; wx < x + w - 14; wx += 22) tw += `<rect class="w" x="${wx}" y="${wy}" width="10" height="13" data-t="${rnd().toFixed(3)}"/>`;
      x += w + 4;
    }
    town.innerHTML = tw;
    windows = [...town.querySelectorAll<SVGRectElement>(".w")];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement("i");
      s.className = "star"; s.style.left = rnd() * 100 + "%"; s.style.top = rnd() * 55 + "%"; s.style.animationDelay = rnd() * 3 + "s";
      stay.appendChild(s);
    }
    const cols = ["#F2A93B", "#E0605E", "#3FA7D6", "#7AC74F", "#B084CC"];
    for (let i = 0; i < 36; i++) {
      const c = document.createElement("i");
      c.className = "conf"; c.style.left = rnd() * 100 + "%"; c.style.top = rnd() * 100 + "%"; c.style.background = cols[i % 5];
      c.style.setProperty("--dy", 40 + rnd() * 160 + "px"); c.style.setProperty("--r", rnd() * 360 - 180 + "deg");
      fun.appendChild(c);
    }
    // Alles andere: Essen, Einkäufe, Versicherung, Parken steigen beim Scrollen auf
    const icons = ["i-food", "i-bag", "i-shield", "i-park", "i-food", "i-bag"];
    for (let i = 0; i < 16; i++) {
      const f = document.createElement("span");
      f.className = "flo";
      const size = 26 + rnd() * 30;
      Object.assign(f.style, { left: (i % 2 ? 60 : 2) + rnd() * 38 + "%", top: 25 + rnd() * 80 + "%", width: size + "px", height: size + "px" });
      f.style.setProperty("--dy", 120 + rnd() * 220 + "px");
      f.style.setProperty("--r", rnd() * 40 - 20 + "deg");
      f.innerHTML = `<svg viewBox="0 0 24 24"><use href="#${icons[i % icons.length]}"/></svg>`;
      misc.appendChild(f);
    }
    // Wer zahlt was: Münzen fallen und stapeln sich je Familie
    for (let i = 0; i < 10; i++) {
      const c = document.createElement("i");
      c.className = "coin fall";
      c.style.left = (i % 2 ? 72 : 3) + rnd() * 24 + "%"; c.style.top = -10 + rnd() * 40 + "%";
      c.style.setProperty("--dy", 160 + rnd() * 260 + "px"); c.style.setProperty("--r", 180 + rnd() * 360 + "deg");
      split.appendChild(c);
    }
    [6, 14, 84, 92].forEach((x, k) => {
      const st = document.createElement("div");
      st.className = "stack"; st.style.left = x + "%";
      const n = 5 + ((k * 3) % 5);
      for (let j = 0; j < n; j++) {
        const c = document.createElement("i");
        c.className = "coin"; c.dataset.t = String((j + 1) / (n + 1)); c.style.bottom = j * 7 + "px";
        st.appendChild(c); coins.push(c);
      }
      split.appendChild(st);
    });
  });

  $effect(() => {
    const p = view.p, a = view.active;
    if (a === "flights" && fp) {
      const len = fp.getTotalLength();
      const pt = fp.getPointAtLength(p * len), pt2 = fp.getPointAtLength(Math.min(len, p * len + 4));
      const box = fp.ownerSVGElement!.getBoundingClientRect();
      const x = box.left + (pt.x / 1000) * box.width, y = box.top + (pt.y / 400) * box.height;
      const ang = (Math.atan2(((pt2.y - pt.y) * box.height) / 400, ((pt2.x - pt.x) * box.width) / 1000) * 180) / Math.PI + 90;
      plane.style.transform = `translate(${x}px,${y}px) rotate(${ang}deg)`;
      fmp.style.strokeDasharray = String(len);
      fmp.style.strokeDashoffset = String(len * (1 - p));
    }
    // Wolken und Bahn bewegen sich nur im eigenen Kapitel; beim Verlassen bleiben sie stehen,
    // statt beim Ausblenden sichtbar an den Anfang zu springen
    if (a === "flights" && flights) flights.querySelectorAll<SVGElement>(".cloud").forEach(c => (c.style.transform = `translateX(calc(${p} * var(--dx,-120px)))`));
    if (a === "transport" && rail && veh) {
      // eigener Fortschritt über genau die Strecke, in der das Kapitel aktiv ist (Mitte des Bildschirms),
      // damit es am Anfang links steht; fährt auf der Schiene herein, wechselt Taxi → Bus → Bahn und hält rechts
      const r = document.getElementById("transport")?.getBoundingClientRect();
      const q = r && r.height ? Math.max(0, Math.min(1, (innerHeight / 2 - r.top) / r.height)) : p;
      const e = 1 - (1 - q) ** 2;
      const len = rail.getTotalLength(), at = 0.02 + e * 0.86;
      const pt = rail.getPointAtLength(at * len), pt2 = rail.getPointAtLength(Math.min(len, at * len + 6));
      const box = rail.ownerSVGElement!.getBoundingClientRect();
      const sx = box.width / 1000, sy = box.height / 120;
      const ang = (Math.atan2((pt2.y - pt.y) * sy, (pt2.x - pt.x) * sx) * 180) / Math.PI;
      veh.style.transform = `translate(${box.left + pt.x * sx}px,${box.top + pt.y * sy}px) rotate(${ang}deg)`;
      railDone.style.strokeDasharray = String(len);
      railDone.style.strokeDashoffset = String(len * (1 - at));
      ride = q < 0.34 ? "taxi" : q < 0.67 ? "bus" : "train";
    }
    if (a === "split") coins.forEach(c => c.classList.toggle("on", +c.dataset.t! < p * 1.1));
    if (a === "stay") windows.forEach(w => w.classList.toggle("on", +w.dataset.t! < p * 0.9));
  });
</script>

<div class="amb" aria-hidden="true">
  <div class="amb-hero">
    <svg class="cloud" style="left:8%;top:14%;width:180px" viewBox="0 0 180 60"><use href="#cl" /></svg>
    <svg class="cloud" style="right:10%;top:24%;width:130px;opacity:.7" viewBox="0 0 180 60"><use href="#cl" /></svg>
    <div class="sun"></div>
    <div class="sea"></div>
  </div>
  <div class="amb-trav"></div>
  <div class="amb-flights" bind:this={flights}>
    <svg class="cloud" style="left:5%;top:20%;width:220px;--dx:-160px" viewBox="0 0 180 60"><use href="#cl" /></svg>
    <svg class="cloud" style="left:60%;top:8%;width:160px;opacity:.6;--dx:-90px" viewBox="0 0 180 60"><use href="#cl" /></svg>
    <svg class="cloud" style="left:30%;top:62%;width:260px;opacity:.9;--dx:-240px" viewBox="0 0 180 60"><use href="#cl" /></svg>
    <svg class="cloud" style="left:78%;top:48%;width:190px;opacity:.75;--dx:-180px" viewBox="0 0 180 60"><use href="#cl" /></svg>
    <svg class="fpath" viewBox="0 0 1000 400" preserveAspectRatio="none">
      <defs>
        <mask id="fm" maskUnits="userSpaceOnUse" x="-50" y="0" width="1100" height="400">
          <path bind:this={fmp} d="M-20 360 C 250 330, 420 60, 1020 40" fill="none" stroke="#fff" stroke-width="10" />
        </mask>
      </defs>
      <path bind:this={fp} class="trail" mask="url(#fm)" d="M-20 360 C 250 330, 420 60, 1020 40" />
    </svg>
    <svg class="plane" bind:this={plane} viewBox="0 0 24 24"><use href="#i-plane" /></svg>
  </div>
  <div class="amb-stay" bind:this={stay}>
    <div class="moon"></div>
    <svg class="town" bind:this={town} viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice"></svg>
  </div>
  <div class="amb-transport">
    <svg class="rails" viewBox="0 0 1000 120" preserveAspectRatio="none">
      <path bind:this={rail} d="M0 60 C 300 20, 700 100, 1000 60" />
      <path class="tie" d="M0 60 C 300 20, 700 100, 1000 60" stroke-width="18" />
      <path bind:this={railDone} class="done" d="M0 60 C 300 20, 700 100, 1000 60" />
    </svg>
    <!-- Fahrzeug steht mit den Rädern auf der Schiene; je nach Fortschritt Taxi, Bus oder Bahn -->
    <div class="veh" bind:this={veh}>
      <svg class="v v-taxi" class:on={ride === "taxi"} viewBox="0 0 84 44">
        <rect x="30" y="0" width="22" height="8" rx="2" fill="#F2C94C" />
        <path d="M18 18 L28 8 H56 L68 18 Z" fill="currentColor" />
        <rect x="4" y="17" width="76" height="17" rx="7" fill="currentColor" />
        <path d="M30 11 H40 V18 H24 Z M44 11 H54 L62 18 H44 Z" fill="#fff" opacity=".8" />
        <rect x="6" y="22" width="6" height="4" rx="2" fill="#F2C94C" />
        <circle cx="20" cy="37" r="6" fill="currentColor" /><circle cx="64" cy="37" r="6" fill="currentColor" />
      </svg>
      <svg class="v v-bus" class:on={ride === "bus"} viewBox="0 0 120 44">
        <rect x="2" y="4" width="116" height="30" rx="10" fill="currentColor" />
        <rect x="12" y="10" width="20" height="12" rx="3" fill="#fff" opacity=".8" />
        <rect x="40" y="10" width="20" height="12" rx="3" fill="#fff" opacity=".8" />
        <rect x="68" y="10" width="20" height="12" rx="3" fill="#fff" opacity=".8" />
        <rect x="96" y="10" width="14" height="20" rx="3" fill="#fff" opacity=".6" />
        <circle cx="26" cy="38" r="5" fill="currentColor" /><circle cx="94" cy="38" r="5" fill="currentColor" />
      </svg>
      <svg class="v v-train" class:on={ride === "train"} viewBox="0 0 180 44">
        <path d="M100 4 L108 -2 M108 -2 L116 4" stroke="currentColor" stroke-width="2" fill="none" />
        <rect x="2" y="6" width="80" height="28" rx="6" fill="currentColor" />
        <path d="M88 6 H158 C 170 6, 178 18, 178 28 V34 H88 Z" fill="currentColor" />
        <rect x="82" y="16" width="6" height="12" fill="currentColor" opacity=".7" />
        <rect x="10" y="12" width="16" height="10" rx="2" fill="#fff" opacity=".8" />
        <rect x="32" y="12" width="16" height="10" rx="2" fill="#fff" opacity=".8" />
        <rect x="54" y="12" width="16" height="10" rx="2" fill="#fff" opacity=".8" />
        <rect x="96" y="12" width="16" height="10" rx="2" fill="#fff" opacity=".8" />
        <rect x="118" y="12" width="16" height="10" rx="2" fill="#fff" opacity=".8" />
        <path d="M150 12 H160 C 166 12, 170 17, 171 22 H150 Z" fill="#fff" opacity=".8" />
        <circle cx="16" cy="38" r="4.5" fill="currentColor" /><circle cx="68" cy="38" r="4.5" fill="currentColor" />
        <circle cx="104" cy="38" r="4.5" fill="currentColor" /><circle cx="160" cy="38" r="4.5" fill="currentColor" />
      </svg>
    </div>
  </div>
  <div class="amb-attractions" bind:this={fun}></div>
  <div class="amb-misc" bind:this={misc}></div>
  <div class="amb-split" bind:this={split}></div>
</div>
