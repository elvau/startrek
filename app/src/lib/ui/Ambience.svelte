<script lang="ts">
  /* Fester Hintergrund, der je Kapitel wechselt. Bewegte Teile folgen view.p (Fortschritt im Kapitel). */
  import { onMount } from "svelte";
  import { view } from "../scroll.svelte";

  let fp: SVGPathElement, fmp: SVGPathElement, plane: SVGSVGElement, tram: SVGSVGElement, flights: HTMLDivElement, town: SVGSVGElement, stay: HTMLDivElement, fun: HTMLDivElement;
  let windows: SVGRectElement[] = [];

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
    if (a === "transport" && tram) {
      // eigener Fortschritt über genau die Strecke, in der das Kapitel aktiv ist (Mitte des Bildschirms),
      // damit er am Anfang links steht; fährt herein und hält rechts, ohne aus dem Bild zu fahren
      const r = document.getElementById("transport")?.getBoundingClientRect();
      const q = r && r.height ? Math.max(0, Math.min(1, (innerHeight / 2 - r.top) / r.height)) : p;
      const e = 1 - (1 - q) ** 2;
      tram.style.transform = `translateX(${-130 + e * (innerWidth - 40)}px)`;
    }
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
      <path d="M0 60 C 300 20, 700 100, 1000 60" />
      <path class="tie" d="M0 60 C 300 20, 700 100, 1000 60" stroke-width="18" />
    </svg>
    <svg class="tram" bind:this={tram} viewBox="0 0 120 44">
      <rect x="2" y="4" width="116" height="30" rx="10" fill="currentColor" />
      <rect x="12" y="10" width="20" height="12" rx="3" fill="#fff" opacity=".8" />
      <rect x="40" y="10" width="20" height="12" rx="3" fill="#fff" opacity=".8" />
      <rect x="68" y="10" width="20" height="12" rx="3" fill="#fff" opacity=".8" />
      <circle cx="26" cy="38" r="5" fill="currentColor" /><circle cx="94" cy="38" r="5" fill="currentColor" />
    </svg>
  </div>
  <div class="amb-attractions" bind:this={fun}></div>
  <div class="amb-misc"></div>
</div>
