/*
 * Illustrationen der Inhaltsseiten (#314): eine Szene je Seite als SVG (1200×480), eingebettet in die Seite.
 * Eigene Zeichnungen statt Fotos: keine Lizenzfragen, keine zusätzlichen Ladezeiten, einheitlicher Stil.
 * Ohne Importe, damit Node die Datei direkt laden kann.
 */

const W = 1200, H = 480;
const C = {
  ink: "#0F1B2D", blue: "#2F6FDB", sea: "#3E83E0", seaDeep: "#2A62B8", lake: "#6FA8E8", sky: "#CFE3FA", skyLight: "#EEF5FE",
  sand: "#F3D9A4", green: "#6FAF7B", greenDark: "#3F7D52", orange: "#F08A4B", red: "#D9534F", roof: "#C8643B",
  white: "#FFFFFF", cream: "#FBF4E6", gold: "#F2C14E", pink: "#E86A92", purple: "#4B2E83", night: "#1B1846", grey: "#A9B4C4", snow: "#F4F8FD"
};

let gid = 0;
/** Verlauf für den Himmel; ids je Szene eindeutig, weil mehrere Szenen auf einer Seite stehen (Übersicht) */
function sky(top: string, bottom: string, h = H): string {
  const id = `g${++gid}`;
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="${W}" height="${h}" fill="url(#${id})"/>`;
}
const sun = (x: number, y: number, r: number, c = C.gold, glow = true) =>
  `${glow ? `<circle cx="${x}" cy="${y}" r="${r * 1.7}" fill="${c}" opacity=".18"/>` : ""}<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const cloud = (x: number, y: number, s = 1, c = C.white, o = 0.9) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}" opacity="${o}"><ellipse cx="0" cy="0" rx="60" ry="22"/><ellipse cx="-30" cy="-14" rx="32" ry="24"/><ellipse cx="22" cy="-20" rx="36" ry="28"/></g>`;
const water = (y: number, c: string, lines = C.white, h = H - y) =>
  `<rect x="0" y="${y}" width="${W}" height="${h}" fill="${c}"/>` +
  [0, 1, 2, 3].map(i => `<path d="M${80 + i * 290} ${y + 26 + (i % 2) * 34} q20 -8 40 0 t40 0" stroke="${lines}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55"/>`).join("");
const hills = (pts: string, c: string, o = 1) => `<path d="${pts}" fill="${c}" opacity="${o}"/>`;
const palm = (x: number, y: number, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 q8 -90 -10 -170" stroke="#8A6A45" stroke-width="12" fill="none" stroke-linecap="round"/>` +
  `<g fill="${C.greenDark}"><path d="M-10 -170 q-60 -20 -100 20 q50 -20 100 -20z"/><path d="M-10 -170 q60 -30 100 10 q-50 -20 -100 -10z"/><path d="M-10 -170 q-30 -50 -80 -50 q40 10 80 50z"/><path d="M-10 -170 q30 -55 85 -45 q-45 5 -85 45z"/></g></g>`;
const pine = (x: number, y: number, s = 1, c = C.greenDark) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-4" y="-10" width="8" height="14" fill="#6B4E32"/><path d="M0 -90 L28 -10 L-28 -10z" fill="${c}"/><path d="M0 -110 L22 -50 L-22 -50z" fill="${c}"/></g>`;
const cypress = (x: number, y: number, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="-60" rx="13" ry="62" fill="${C.greenDark}"/></g>`;
const boat = (x: number, y: number, s = 1, sail = C.white) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-40 0 h80 l-14 16 h-52z" fill="${C.white}"/><path d="M0 -4 v-70" stroke="${C.ink}" stroke-width="3"/><path d="M3 -72 L36 -8 H3z" fill="${sail}"/><path d="M-3 -60 L-28 -8 H-3z" fill="${sail}" opacity=".85"/></g>`;
const house = (x: number, y: number, w: number, h: number, wall: string, roof: string, win = C.ink) =>
  `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${wall}"/><path d="M${x - 8} ${y - h} L${x + w / 2} ${y - h - w * 0.45} L${x + w + 8} ${y - h}z" fill="${roof}"/>` +
  `<rect x="${x + w * 0.2}" y="${y - h * 0.7}" width="${w * 0.22}" height="${h * 0.28}" rx="3" fill="${win}" opacity=".75"/><rect x="${x + w * 0.58}" y="${y - h * 0.7}" width="${w * 0.22}" height="${h * 0.28}" rx="3" fill="${win}" opacity=".75"/>`;
const star = (x: number, y: number, r = 3, c = C.white) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const confetti = (n: number, seed: number) => {
  const cols = [C.gold, C.pink, C.lake, C.orange, C.white];
  let s = seed, out = "";
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < n; i++) out += `<rect x="${Math.round(rnd() * W)}" y="${Math.round(rnd() * 260)}" width="10" height="5" rx="2" fill="${cols[i % cols.length]}" transform="rotate(${Math.round(rnd() * 180)} ${Math.round(rnd() * W)} ${Math.round(rnd() * 260)})" opacity=".9"/>`;
  return out;
};

/* ---------- Szenen ---------- */

const mallorca = () => sky("#9CC8F5", C.skyLight) + sun(980, 110, 54) + cloud(260, 110, 1.1) + cloud(640, 80, .8) +
  water(300, C.sea) + hills("M0 330 Q300 300 600 340 T1200 320 V480 H0z", C.sand) +
  // Finca mit Pool
  `<rect x="620" y="250" width="300" height="120" fill="${C.cream}"/><path d="M600 250 L770 205 L940 250z" fill="${C.roof}"/>` +
  `<path d="M660 370 v-50 a20 20 0 0 1 40 0 v50z M740 370 v-50 a20 20 0 0 1 40 0 v50z M820 370 v-50 a20 20 0 0 1 40 0 v50z" fill="${C.blue}" opacity=".55"/>` +
  `<rect x="560" y="390" width="380" height="50" rx="12" fill="#7FD3F0"/><path d="M590 412 q20 -6 40 0 t40 0 M760 418 q20 -6 40 0 t40 0" stroke="${C.white}" stroke-width="4" fill="none"/>` +
  `<g fill="${C.white}"><rect x="980" y="400" width="90" height="10" rx="4"/><rect x="1060" y="380" width="10" height="30" rx="4" transform="rotate(-20 1065 395)"/></g>` +
  `<circle cx="1020" cy="380" r="34" fill="${C.orange}" opacity=".9"/><path d="M1020 346 v110" stroke="${C.ink}" stroke-width="4"/>` +
  palm(470, 420, 1.1) + palm(1140, 440, .9) + boat(200, 340, .8);

const prag = () => sky("#F7B98A", "#FBE3CC") + sun(600, 190, 70, "#F7D38A") +
  // Burg mit Domtürmen
  `<g fill="#4D3B5E"><rect x="120" y="190" width="520" height="80"/><path d="M300 190 V80 l20 -50 l20 50 V190z M360 190 V110 l14 -36 l14 36 V190z M220 190 V140 l12 -28 l12 28 V190z"/>` +
  `<rect x="440" y="160" width="90" height="30"/><path d="M470 160 q15 -40 30 0z"/></g>` +
  `<g fill="#6A557A"><rect x="660" y="210" width="460" height="60"/><path d="M760 210 V130 l16 -40 l16 40 V210z M900 210 V150 a24 24 0 0 1 48 0 V210z M1040 210 V160 l12 -30 l12 30 V210z"/></g>` +
  hills("M0 260 Q600 230 1200 260 V300 H0z", "#806A8C") +
  water(300, "#5C7FB8", "#F7D38A") +
  // Karlsbrücke
  `<g fill="#3A2E48"><rect x="0" y="292" width="${W}" height="18"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<path d="M${i * 180} 310 h180 v40 a70 46 0 0 0 -140 0 h-40z"/>`).join("")}` +
  `<path d="M60 292 V240 l10 -24 l10 24 V292z M1110 292 V240 l10 -24 l10 24 V292z"/></g>`;

const amsterdam = () => sky("#A8CDF7", C.skyLight) + cloud(200, 90) + cloud(900, 70, .9) +
  [["#C8643B", 70], ["#2F6FDB", 190], ["#F2C14E", 310], ["#3F7D52", 430], ["#E86A92", 550], ["#8A6A45", 670], ["#D9534F", 790], ["#4B2E83", 910], ["#F08A4B", 1030]]
    .map(([c, x], i) => { const h = 190 + (i % 3) * 30, xx = x as number; return `<rect x="${xx}" y="${330 - h}" width="110" height="${h}" fill="${c}"/>` +
      `<path d="M${xx} ${330 - h} h20 v-20 h20 v-20 h30 v20 h20 v20 h20 z" fill="${c}"/>` +
      [0, 1, 2].map(r => `<rect x="${xx + 18}" y="${350 - h + r * 55}" width="24" height="34" fill="${C.white}" opacity=".85"/><rect x="${xx + 68}" y="${350 - h + r * 55}" width="24" height="34" fill="${C.white}" opacity=".85"/>`).join(""); }).join("") +
  `<rect x="0" y="330" width="${W}" height="20" fill="#7B6A5A"/>` + water(350, "#4C7FC4") + boat(300, 400, .7, C.orange) +
  // Fahrrad und Tulpen
  `<g stroke="${C.ink}" stroke-width="5" fill="none"><circle cx="880" cy="312" r="18"/><circle cx="950" cy="312" r="18"/><path d="M880 312 l25 -30 h30 l15 30 M905 282 l-6 -10 h-10 M935 282 l4 -12 h12"/></g>` +
  [1000, 1030, 1060, 1090].map((x, i) => `<path d="M${x} 330 v-30" stroke="${C.green}" stroke-width="4"/><path d="M${x - 10} 300 q10 -26 20 0 q-10 8 -20 0z" fill="${[C.red, C.gold, C.pink, C.orange][i]}"/>`).join("");

const barcelona = () => sky("#8EC0F2", C.skyLight) + sun(1020, 100, 50) + cloud(400, 90, .9) +
  // Kirchtürme in Kegelform
  `<g fill="#B88A5A">${[[430, 120], [480, 70], [530, 50], [580, 70], [630, 120]].map(([x, top]) => `<path d="M${x - 22} 300 V${top + 70} q22 -${(300 - top) * 0.55} 44 0 V300z"/><circle cx="${x}" cy="${top + 4}" r="9" fill="${C.gold}"/>`).join("")}</g>` +
  `<rect x="380" y="250" width="300" height="60" fill="#A57A4D"/>` +
  `<g fill="#E4D6C2">${[60, 160, 760, 880, 1000, 1110].map((x, i) => `<rect x="${x}" y="${230 - (i % 3) * 25}" width="90" height="${80 + (i % 3) * 25}"/>`).join("")}</g>` +
  hills("M0 300 H1200 V340 H0z", C.sand) + water(340, C.sea) + boat(900, 400, .9) + palm(260, 340, .9) + palm(1150, 345, .8);

const gardasee = () => sky("#F6C9A0", "#FCEBDD") + sun(600, 210, 46, "#F9D9A0") +
  hills("M0 250 L160 110 L300 230 L420 140 L560 260 H0z", "#8E9DB8") +
  hills("M640 260 L780 130 L900 210 L1040 100 L1200 220 V260z", "#8E9DB8") +
  hills("M0 270 L120 180 L260 260 H0z", "#6F7F9C") + hills("M900 265 L1060 170 L1200 250 V265z", "#6F7F9C") +
  // stiller See mit Spiegelung
  `<rect x="0" y="260" width="${W}" height="220" fill="#8FB6E6"/><ellipse cx="600" cy="300" rx="70" ry="10" fill="#F9D9A0" opacity=".55"/><ellipse cx="600" cy="330" rx="40" ry="6" fill="#F9D9A0" opacity=".4"/>` +
  `<path d="M0 260 L160 400 L300 290 L420 380 L560 260z" fill="#A9C4EA" opacity=".5"/><path d="M640 260 L780 390 L900 310 L1040 420 L1200 300 V260z" fill="#A9C4EA" opacity=".5"/>` +
  // Dorf mit Campanile am Ufer
  `<g><rect x="90" y="236" width="60" height="34" fill="${C.cream}"/><rect x="160" y="226" width="50" height="44" fill="#F3D2B0"/><rect x="220" y="200" width="24" height="70" fill="${C.cream}"/><path d="M216 200 l16 -24 l16 24z" fill="${C.roof}"/>` +
  `<path d="M84 236 l36 -16 l36 16z M154 226 l31 -14 l31 14z" fill="${C.roof}"/></g>` + cypress(280, 272, .8) + cypress(305, 272, .6) +
  boat(820, 330, .9) + `<path d="M360 360 q20 -6 40 0 M700 400 q20 -6 40 0 M480 430 q20 -6 40 0" stroke="${C.white}" stroke-width="3" fill="none" opacity=".6"/>`;

const kroatien = () => sky("#86C2F2", C.skyLight) + sun(1040, 100, 48) + cloud(300, 100, .9) +
  water(260, "#26A6C4", C.white) +
  // Altstadt auf der Halbinsel
  hills("M300 300 Q600 230 900 300 V330 H300z", "#D8C3A0") +
  [[380, 290, 70, 60], [460, 285, 60, 80], [530, 280, 70, 70], [610, 285, 60, 60], [680, 290, 70, 55], [760, 295, 60, 45]]
    .map(([x, y, w, h]) => house(x, y, w, h, C.cream, C.roof)).join("") +
  `<rect x="580" y="120" width="40" height="160" fill="${C.cream}"/><path d="M574 120 l26 -50 l26 50z" fill="${C.roof}"/><rect x="592" y="150" width="16" height="24" fill="${C.ink}" opacity=".7"/>` +
  boat(220, 380, 1) + boat(980, 400, .8, C.orange) + pine(130, 300, 1.1) + pine(1120, 320, 1);

const lissabon = () => sky("#9CCBF4", C.skyLight) + sun(1060, 90, 44) +
  water(250, "#4F8FD8") +
  // Brücke im Hintergrund
  `<g stroke="${C.red}" stroke-width="6" fill="none"><path d="M700 250 V130 M1000 250 V130"/><path d="M560 200 Q700 130 700 130 Q850 230 1000 130 Q1100 190 1200 200" stroke-width="3"/><path d="M520 210 H1200" stroke-width="8"/></g>` +
  hills("M0 330 Q250 190 520 300 T1200 340 V480 H0z", "#E7D3B3") +
  [[60, 300], [130, 270], [200, 250], [270, 250], [340, 265], [410, 285]].map(([x, y], i) =>
    `<rect x="${x}" y="${y - 70}" width="64" height="${400 - y + 70}" fill="${[C.gold, C.pink, "#F2E6D0", C.lake, C.orange, "#F2E6D0"][i]}"/><path d="M${x - 4} ${y - 70} h72 l-8 -16 h-56z" fill="${C.roof}"/>` +
    `<rect x="${x + 12}" y="${y - 50}" width="14" height="20" fill="${C.white}"/><rect x="${x + 38}" y="${y - 50}" width="14" height="20" fill="${C.white}"/>`).join("") +
  // Straßenbahn
  `<g transform="translate(560 330) rotate(6)"><rect x="0" y="0" width="230" height="90" rx="14" fill="${C.gold}"/><rect x="0" y="62" width="230" height="10" fill="${C.white}"/>` +
  [16, 70, 124, 178].map(x => `<rect x="${x}" y="14" width="40" height="34" rx="4" fill="${C.ink}" opacity=".7"/>`).join("") +
  `<path d="M115 0 V-60 M95 -60 H135" stroke="${C.ink}" stroke-width="4"/><circle cx="50" cy="96" r="12" fill="${C.ink}"/><circle cx="180" cy="96" r="12" fill="${C.ink}"/></g>`;

const daenemark = () => sky("#B6D4F2", C.skyLight) + cloud(300, 90, 1.1) + cloud(820, 120, .8) +
  water(270, "#5E8FC9") + hills("M0 340 Q200 260 420 320 T860 300 T1200 330 V480 H0z", "#EBD7A8") +
  [120, 300, 520, 760, 1000].map(x => `<path d="M${x} 330 l-10 -40 M${x + 8} 330 l4 -46 M${x + 16} 330 l14 -38" stroke="${C.green}" stroke-width="4" stroke-linecap="round"/>`).join("") +
  // Ferienhaus aus Holz
  `<rect x="560" y="290" width="260" height="110" fill="#2E2F36"/><path d="M540 290 L690 220 L840 290z" fill="#1E1F25"/>` +
  `<g fill="${C.white}">${[590, 660, 730].map(x => `<rect x="${x}" y="320" width="44" height="44"/>`).join("")}</g><rect x="790" y="330" width="22" height="70" fill="${C.red}"/>` +
  // Leuchtturm
  `<path d="M990 400 L1006 200 H1034 L1050 400z" fill="${C.white}"/><path d="M996 330 H1044 L1047 360 H993z M1002 260 H1038 L1040 290 H1000z" fill="${C.red}"/><rect x="1000" y="180" width="40" height="22" fill="${C.ink}"/><path d="M996 180 h48 l-24 -20z" fill="${C.red}"/>` +
  // Drachen
  `<path d="M200 120 l26 -30 l26 30 l-26 40z" fill="${C.orange}"/><path d="M226 160 q-10 40 20 70 q-30 20 -10 60" stroke="${C.ink}" stroke-width="2" fill="none"/>`;

const jga = () => sky(C.night, C.purple) + confetti(60, 7) +
  [80, 220, 380, 520, 900, 1040, 1150].map((x, i) => star(x, 40 + (i % 3) * 30, 2.5)).join("") +
  // Diskokugel und Lichtstrahlen
  `<path d="M600 0 V60" stroke="${C.grey}" stroke-width="3"/><circle cx="600" cy="100" r="40" fill="${C.grey}"/><path d="M560 100 h80 M600 60 v80 M572 72 l56 56 M628 72 l-56 56" stroke="${C.white}" stroke-width="2" opacity=".6"/>` +
  `<g opacity=".25"><path d="M600 100 L300 480 H400z" fill="${C.pink}"/><path d="M600 100 L820 480 H920z" fill="${C.lake}"/><path d="M600 100 L560 480 H640z" fill="${C.gold}"/></g>` +
  // Skyline
  `<g fill="#2A2560">${[[0, 260], [90, 220], [170, 280], [1000, 240], [1080, 200], [1150, 270]].map(([x, y]) => `<rect x="${x}" y="${y}" width="80" height="${480 - y}"/>`).join("")}</g>` +
  [[20, 290], [110, 250], [1020, 270], [1100, 230]].map(([x, y]) => `<rect x="${x}" y="${y}" width="10" height="14" fill="${C.gold}" opacity=".8"/><rect x="${x + 30}" y="${y + 30}" width="10" height="14" fill="${C.gold}" opacity=".8"/>`).join("") +
  `<rect x="0" y="420" width="${W}" height="60" fill="#14122F"/>` +
  // Stretchlimousine
  `<g transform="translate(250 330)"><path d="M0 80 V50 q0 -14 14 -16 l90 -6 l40 -34 h330 l40 34 l70 6 q16 2 16 16 V80z" fill="${C.white}"/>` +
  `<path d="M150 0 h320 l34 28 H120z" fill="#2B3550"/><path d="M230 0 v28 M310 0 v28 M390 0 v28" stroke="${C.white}" stroke-width="5"/>` +
  `<rect x="0" y="56" width="600" height="6" fill="${C.grey}"/><circle cx="100" cy="82" r="26" fill="${C.ink}"/><circle cx="100" cy="82" r="10" fill="${C.grey}"/><circle cx="500" cy="82" r="26" fill="${C.ink}"/><circle cx="500" cy="82" r="10" fill="${C.grey}"/>` +
  `<rect x="586" y="50" width="14" height="10" rx="3" fill="${C.gold}"/></g>` +
  // Sekt mit knallendem Korken und Gläsern
  `<g transform="translate(930 300) rotate(-25)"><rect x="-18" y="0" width="36" height="110" rx="10" fill="#2E6B47"/><path d="M-18 10 q18 -30 0 -60 h36 q-18 30 0 60z" fill="#2E6B47"/><rect x="-10" y="-60" width="20" height="26" fill="${C.gold}"/>` +
  `<rect x="-10" y="30" width="36" height="34" fill="${C.cream}" transform="translate(-8 0)"/></g>` +
  `<ellipse cx="890" cy="220" rx="10" ry="14" fill="#C9A26A"/><path d="M905 240 q10 -20 30 -10 M880 245 q-20 -10 -18 -30" stroke="${C.gold}" stroke-width="4" fill="none"/>` +
  [[1040, 330], [1100, 340]].map(([x, y]) => `<path d="M${x - 18} ${y} h36 l-6 50 q-12 8 -24 0z" fill="${C.gold}" opacity=".85"/><path d="M${x} ${y + 50} v30 M${x - 14} ${y + 80} h28" stroke="${C.white}" stroke-width="4"/>`).join("") +
  [0, 1, 2, 3, 4].map(i => star(1040 + i * 14, 320 - i * 10, 3, C.gold)).join("");

const berlin = () => sky("#A6CBF4", C.skyLight) + cloud(230, 100) + cloud(1000, 80, .8) +
  // Fernsehturm
  `<rect x="964" y="120" width="12" height="260" fill="${C.grey}"/><circle cx="970" cy="170" r="30" fill="${C.grey}"/><rect x="967" y="40" width="6" height="104" fill="${C.red}"/>` +
  // Brandenburger Tor
  `<g fill="#E8D7B5"><rect x="300" y="200" width="560" height="40"/><rect x="290" y="372" width="580" height="18"/>${[320, 410, 500, 590, 680, 770].map(x => `<rect x="${x}" y="240" width="40" height="132"/>`).join("")}` +
  `<rect x="500" y="170" width="160" height="30"/></g><g fill="#3E7C6A"><path d="M540 170 l20 -30 h40 l20 30z"/><circle cx="560" cy="138" r="10"/><circle cx="600" cy="138" r="10"/></g>` +
  `<rect x="0" y="390" width="${W}" height="90" fill="#C9CED6"/>` +
  // Schulklasse mit Rucksäcken
  [130, 190, 250, 900, 960, 1020, 1080].map((x, i) => `<g transform="translate(${x} 400)"><circle cx="0" cy="-70" r="16" fill="${["#F2C9A0", "#C98E5E", "#8A5A3C"][i % 3]}"/><rect x="-18" y="-52" width="36" height="52" rx="12" fill="${[C.blue, C.orange, C.green, C.pink][i % 4]}"/>` +
    `<rect x="${i % 2 ? 10 : -26}" y="-50" width="16" height="30" rx="6" fill="${[C.gold, C.red, C.purple][i % 3]}"/></g>`).join("");

const familien = () => sky("#A6D0F6", C.skyLight) + sun(1040, 100, 52) + cloud(380, 90) +
  water(250, C.sea) + hills("M0 330 Q600 290 1200 330 V480 H0z", C.sand) +
  // Seebrücke mit Pavillon
  `<g><rect x="560" y="240" width="640" height="14" fill="${C.cream}"/>${[600, 700, 800, 900, 1000, 1100].map(x => `<rect x="${x}" y="254" width="8" height="60" fill="#B9A58A"/>`).join("")}` +
  `<rect x="1080" y="200" width="100" height="40" fill="${C.white}"/><path d="M1070 200 q60 -50 120 0z" fill="${C.blue}"/></g>` +
  // Strandkörbe
  [[120, C.blue], [270, C.orange]].map(([x, c]) => `<g transform="translate(${x} 340)"><path d="M0 70 V10 q50 -40 100 0 V70z" fill="${C.cream}"/><path d="M10 64 V18 q40 -30 80 0 V64z" fill="${c}"/>` +
    `<path d="M10 30 h80 M10 44 h80" stroke="${C.white}" stroke-width="6" opacity=".7"/><rect x="0" y="62" width="100" height="16" fill="#C9AE84"/></g>`).join("") +
  // Sandburg und Ball
  `<g fill="#E1C080"><rect x="520" y="390" width="90" height="40"/><rect x="530" y="366" width="24" height="24"/><rect x="576" y="366" width="24" height="24"/></g><path d="M542 366 v-20 l14 6 -14 6" stroke="${C.ink}" stroke-width="2" fill="${C.red}"/>` +
  `<circle cx="760" cy="410" r="30" fill="${C.white}"/><path d="M730 410 a30 30 0 0 1 60 0z" fill="${C.red}"/><path d="M760 380 a30 30 0 0 1 30 30 h-30z" fill="${C.gold}"/>` +
  // Familien als Figuren
  [[880, 1], [930, .7], [980, 1], [1030, .7], [1080, .6]].map(([x, s], i) => `<g transform="translate(${x} 440) scale(${s})"><circle cx="0" cy="-90" r="16" fill="#E8B88E"/><rect x="-16" y="-72" width="32" height="56" rx="12" fill="${[C.pink, C.blue, C.green, C.orange, C.gold][i]}"/><rect x="-12" y="-18" width="10" height="18" fill="${C.ink}"/><rect x="2" y="-18" width="10" height="18" fill="${C.ink}"/></g>`).join("");

const ski = () => sky("#9CC4F0", "#E4F0FD") + sun(1060, 90, 40, "#FFE6A0") +
  hills("M0 300 L200 90 L330 220 L470 60 L640 280 L800 120 L980 300 L1100 160 L1200 240 V480 H0z", "#B9C9DE") +
  hills("M200 90 L240 132 L210 128 L190 146 L170 122 z M470 60 L520 116 L490 108 L470 128 L445 110 z M800 120 L845 170 L815 162 L798 180 L772 160 z", C.white) +
  hills("M0 360 Q300 280 600 340 T1200 320 V480 H0z", C.snow) +
  // Gondel
  `<path d="M0 120 L1200 40" stroke="${C.ink}" stroke-width="3"/><g transform="translate(700 74)"><path d="M0 0 v24" stroke="${C.ink}" stroke-width="3"/><rect x="-26" y="24" width="52" height="40" rx="8" fill="${C.red}"/><rect x="-18" y="30" width="36" height="16" fill="${C.white}" opacity=".8"/></g>` +
  // Chalet mit Schnee
  `<rect x="140" y="320" width="200" height="110" fill="#8A5A3C"/><path d="M120 320 L240 250 L360 320z" fill="#5E3B24"/><path d="M118 322 L240 248 L362 322 L350 330 L240 266 L130 330z" fill="${C.white}"/>` +
  `<rect x="170" y="350" width="40" height="34" fill="${C.gold}"/><rect x="270" y="350" width="40" height="34" fill="${C.gold}"/><path d="M190 350 v34 M170 367 h40 M290 350 v34 M270 367 h40" stroke="#8A5A3C" stroke-width="3"/>` +
  pine(420, 430, 1.1, "#3F6E5A") + pine(470, 440, .8, "#3F6E5A") + pine(1100, 420, 1.2, "#3F6E5A") +
  // Skifahrer
  `<g transform="translate(760 380) rotate(-14)"><path d="M-50 40 h110" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/><path d="M-10 0 l20 30 M10 0 l-6 32" stroke="${C.blue}" stroke-width="10" stroke-linecap="round"/>` +
  `<rect x="-14" y="-40" width="30" height="42" rx="10" fill="${C.orange}"/><circle cx="2" cy="-54" r="13" fill="#E8B88E"/><path d="M-12 -60 a14 14 0 0 1 28 0z" fill="${C.red}"/><path d="M-14 -24 l-30 50 M16 -24 l34 44" stroke="${C.grey}" stroke-width="3"/></g>` +
  [100, 300, 520, 640, 880, 1000, 1150].map((x, i) => star(x, 60 + (i % 4) * 50, 4)).join("");

const festival = () => sky("#2B1E5C", "#E86A92") + [150, 300, 900, 1050].map((x, i) => star(x, 50 + i * 12, 2.5)).join("") +
  // Bühne mit Lichtkegeln
  `<g opacity=".3"><path d="M480 120 L300 420 H420z" fill="${C.gold}"/><path d="M720 120 L780 420 H900z" fill="${C.lake}"/><path d="M600 110 L560 420 H660z" fill="${C.white}"/></g>` +
  `<rect x="420" y="110" width="360" height="22" fill="${C.ink}"/><rect x="420" y="132" width="16" height="230" fill="${C.ink}"/><rect x="764" y="132" width="16" height="230" fill="${C.ink}"/>` +
  [470, 540, 610, 680, 740].map((x, i) => `<circle cx="${x}" cy="140" r="9" fill="${[C.gold, C.pink, C.white, C.lake, C.gold][i]}"/>`).join("") +
  // Lichterkette
  `<path d="M0 60 Q300 130 600 70 T1200 60" stroke="${C.ink}" stroke-width="2" fill="none"/>` + [80, 200, 330, 460, 740, 870, 1000, 1120].map((x, i) => `<circle cx="${x}" cy="${88 + Math.round(Math.sin(i) * 10)}" r="6" fill="${[C.gold, C.pink, C.lake][i % 3]}"/>`).join("") +
  // Zelte
  [[60, C.orange], [200, C.lake], [960, C.gold], [1090, C.green]].map(([x, c]) => `<path d="M${x} 400 l70 -90 l70 90z" fill="${c}"/><path d="M${(x as number) + 70} 310 l-14 90 h28z" fill="${C.ink}" opacity=".5"/>`).join("") +
  // Menge mit erhobenen Armen
  `<g fill="#1B1240">${Array.from({ length: 16 }, (_, i) => { const x = 280 + i * 42, y = 400 + (i % 3) * 8; return `<circle cx="${x}" cy="${y - 34}" r="14"/><rect x="${x - 14}" y="${y - 22}" width="28" height="80" rx="10"/>${i % 3 === 0 ? `<path d="M${x - 10} ${y - 18} l-16 -46 M${x + 10} ${y - 18} l16 -46" stroke="#1B1240" stroke-width="8" stroke-linecap="round"/>` : ""}`; }).join("")}</g>` +
  `<rect x="0" y="450" width="${W}" height="30" fill="#1B1240"/>`;

const verein = () => sky("#A9CBF2", C.skyLight) + cloud(250, 90) + cloud(760, 70, .7) +
  // Hafen mit Kränen und Konzerthaus
  `<g stroke="#C0392B" stroke-width="8" fill="none"><path d="M900 300 V120 L1060 120 M940 120 L900 160 M1060 120 v40"/><path d="M1050 300 V150 L1180 150 M1080 150 l-30 30"/></g>` +
  `<rect x="300" y="210" width="360" height="90" fill="#9C5B3E"/><path d="M300 210 V150 Q360 120 400 150 Q450 110 500 150 Q560 115 600 150 Q640 128 660 150 V210z" fill="#D5E4F5"/>` +
  `<path d="M300 180 h360 M300 196 h360" stroke="${C.white}" stroke-width="3" opacity=".7"/>` + water(300, "#4F7FBF") +
  boat(720, 360, .9, C.red) +
  `<rect x="0" y="390" width="${W}" height="90" fill="#9AA3B2"/><path d="M0 435 h1200" stroke="${C.white}" stroke-width="5" stroke-dasharray="40 30"/>` +
  // Reisebus
  `<g transform="translate(140 300)"><rect x="0" y="0" width="520" height="120" rx="18" fill="${C.white}"/><rect x="0" y="80" width="520" height="14" fill="${C.blue}"/>` +
  [20, 110, 200, 290, 380].map(x => `<rect x="${x}" y="18" width="78" height="46" rx="6" fill="#2B3550"/>`).join("") +
  `<rect x="470" y="18" width="44" height="80" rx="6" fill="#2B3550"/><circle cx="100" cy="122" r="24" fill="${C.ink}"/><circle cx="100" cy="122" r="9" fill="${C.grey}"/><circle cx="420" cy="122" r="24" fill="${C.ink}"/><circle cx="420" cy="122" r="9" fill="${C.grey}"/>` +
  `<rect x="508" y="100" width="12" height="10" rx="3" fill="${C.gold}"/></g>`;

const wien = () => sky("#F2C29C", "#FCE8D8") + sun(220, 140, 50, "#F9D49A") +
  // Riesenrad
  `<g transform="translate(860 230)"><circle r="170" fill="none" stroke="${C.red}" stroke-width="8"/><circle r="12" fill="${C.red}"/>` +
  Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2, x = Math.round(Math.cos(a) * 170), y = Math.round(Math.sin(a) * 170); return `<path d="M0 0 L${x} ${y}" stroke="${C.red}" stroke-width="3"/><rect x="${x - 14}" y="${y}" width="28" height="22" rx="4" fill="${C.red}"/>`; }).join("") +
  `<path d="M0 0 L-90 250 M0 0 L90 250" stroke="${C.red}" stroke-width="8"/></g>` +
  // Stephansdom
  `<g fill="#6E5A4E"><rect x="380" y="260" width="260" height="140"/><path d="M450 260 V90 l30 -80 l30 80 V260z"/></g><path d="M380 260 L510 200 L640 260z" fill="#3F7D6A"/><path d="M400 250 l20 -10 l20 10 l20 -10 l20 10 l20 -10 l20 10 l20 -10 l20 10 l20 -10 l20 10" stroke="${C.gold}" stroke-width="4" fill="none"/>` +
  `<rect x="0" y="400" width="${W}" height="80" fill="#C9B8A5"/>` +
  // Kaffeehaus-Tisch mit Melange
  `<g transform="translate(160 330)"><ellipse cx="0" cy="70" rx="90" ry="14" fill="${C.white}"/><path d="M0 70 v80" stroke="${C.ink}" stroke-width="6"/>` +
  `<path d="M-30 30 h60 l-6 40 h-48z" fill="${C.white}"/><ellipse cx="0" cy="30" rx="30" ry="8" fill="#C79A6A"/><path d="M30 40 q20 4 6 20" stroke="${C.white}" stroke-width="6" fill="none"/><path d="M-6 10 q-8 -14 4 -24 M10 12 q-8 -14 4 -24" stroke="${C.grey}" stroke-width="3" fill="none"/></g>`;

/** Szene und Bildbeschreibung je Seite (Schlüssel = slug in pages.ts) */
export const ART: Record<string, { alt: string; draw: () => string }> = {
  "gruppenreise-mallorca-kosten": { alt: "Finca mit Pool, Palmen und Meer auf Mallorca", draw: mallorca },
  "gruppenreise-prag-kosten": { alt: "Prager Burg und Karlsbrücke im Abendlicht", draw: prag },
  "gruppenreise-amsterdam-kosten": { alt: "Bunte Grachtenhäuser, Kanal, Fahrrad und Tulpen in Amsterdam", draw: amsterdam },
  "gruppenreise-barcelona-kosten": { alt: "Kirchtürme, Strand und Segelboot in Barcelona", draw: barcelona },
  "gardasee-mehrere-familien-kosten": { alt: "Ruhiger Gardasee zwischen Bergen im Abendlicht, Dorf mit Kirchturm und Segelboot", draw: gardasee },
  "gruppenreise-kroatien-ferienhaus-kosten": { alt: "Altstadt mit roten Dächern am türkisen Meer in Kroatien", draw: kroatien },
  "gruppenreise-lissabon-kosten": { alt: "Gelbe Straßenbahn, bunte Häuser und rote Brücke in Lissabon", draw: lissabon },
  "ferienhaus-daenemark-familien-kosten": { alt: "Ferienhaus aus Holz in den Dünen mit Leuchtturm an der dänischen Nordsee", draw: daenemark },
  "junggesellenabschied-kosten": { alt: "Stretchlimousine, Sekt mit knallendem Korken, Diskokugel und Konfetti in der Nacht", draw: jga },
  "klassenfahrt-berlin-kosten": { alt: "Brandenburger Tor und Fernsehturm mit einer Schulklasse", draw: berlin },
  "familienurlaub-mehrere-familien-kosten": { alt: "Strand an der Ostsee mit Seebrücke, Strandkörben, Sandburg und Familien", draw: familien },
  "skiurlaub-gruppe-oesterreich-kosten": { alt: "Verschneite Berge, Chalet, Gondel und Skifahrer in Österreich", draw: ski },
  "festival-mit-freunden-kosten": { alt: "Festivalbühne mit Lichtern, Zelten und feiernder Menge", draw: festival },
  "vereinsreise-reisebus-kosten": { alt: "Reisebus vor Hafen, Kränen und Konzerthaus in Hamburg", draw: verein },
  "kurztrip-wien-freunde-kosten": { alt: "Riesenrad, Stephansdom und Kaffeehaus-Melange in Wien", draw: wien }
};

/** SVG der Szene; ohne Szene leer */
export function artSvg(slug: string, cls = "art"): string {
  const a = ART[slug];
  if (!a) return "";
  return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${a.alt.replace(/"/g, "&quot;")}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><title>${a.alt}</title>${a.draw()}</svg>`;
}

/** Bausteine für weitere Szenen (Anleitung, app/src/lib/guide/art.ts): gleicher Zeichenstil, gleiche Farben */
export { W, H, C, sky, sun, cloud, water, hills, house, boat, palm, pine, star, confetti };
