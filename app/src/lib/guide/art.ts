/*
 * Illustrationen der Anleitung: eine Szene je Seite als SVG (1200×480), im Zeichenstil der Reiseideen (seo/art.ts):
 * flache Formen, kräftige Split&Fly-Farben, kein Foto, keine Schrift außer kurzen Beschriftungen.
 */
import { W, H, C, sky, sun, cloud, hills, house, palm, pine, star, confetti } from "../seo/art.ts";

const FONT = `font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-weight="700"`;

/** Person: Kopf und Körper, s = Größe (Kinder kleiner) */
const person = (x: number, y: number, s: number, body: string, skin = "#F2C9A0") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-22" y="-70" width="44" height="70" rx="20" fill="${body}"/>` +
  `<circle cx="0" cy="-92" r="20" fill="${skin}"/><path d="M-20 -96 q20 -26 40 0 q-20 -8 -40 0z" fill="${C.ink}" opacity=".75"/></g>`;

const plane = (x: number, y: number, s = 1, rot = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-110 0 q-8 -26 40 -28 h130 q50 2 60 28 q-10 22 -60 24 h-130 q-48 -2 -40 -24z" fill="${C.white}"/>` +
  `<path d="M-40 -6 L-90 -80 h36 l60 74z M-40 12 L-90 86 h36 l60 -74z" fill="${C.blue}"/><path d="M-100 -4 L-128 -50 h28 l30 46z" fill="${C.blue}"/>` +
  `<g fill="${C.sky}">${[-20, 10, 40, 70].map(a => `<circle cx="${a}" cy="-8" r="7"/>`).join("")}</g><path d="M106 -10 q16 4 20 10 q-6 8 -20 10z" fill="${C.skyLight}"/></g>`;

const pill = (x: number, y: number, label: string, bg: string, fg: string, solid = false) =>
  `<g transform="translate(${x} ${y})"><rect width="190" height="64" rx="32" fill="${bg}"/><text x="95" y="42" text-anchor="middle" font-size="28" ${FONT} fill="${solid ? C.white : fg}">${label}</text></g>`;

const phone = (x: number, y: number, s: number, screen: string, inner = "") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-60" y="-110" width="120" height="220" rx="22" fill="${C.ink}"/><rect x="-52" y="-98" width="104" height="196" rx="14" fill="${screen}"/>${inner}</g>`;

/* ---------- Szenen ---------- */

/** Erste Reise: Koffer mit Aufklebern, Route zum Ziel, Flugzeug */
const start = () => sky("#9CC8F5", C.skyLight) + sun(1020, 100, 48) + cloud(260, 90, 1) + cloud(760, 70, .8) +
  hills("M0 330 Q300 290 620 335 T1200 315 V480 H0z", C.sand) + hills("M0 400 Q400 370 800 410 T1200 395 V480 H0z", "#E9C98A") +
  `<path d="M330 300 C 450 120, 700 120, 840 190 S 960 250, 980 200" stroke="${C.ink}" stroke-width="5" stroke-dasharray="4 16" stroke-linecap="round" fill="none" opacity=".6"/>` +
  `<g transform="translate(980 196)"><path d="M0 0 c-34 -36 -30 -84 0 -84 s34 48 0 84z" fill="${C.red}" transform="translate(0 -4)"/><circle cx="0" cy="-70" r="11" fill="${C.white}"/></g>` +
  plane(640, 130, .55, -8) +
  // Koffer
  `<g transform="translate(250 410)"><path d="M-30 -230 v-30 a14 14 0 0 1 14 -14 h32 a14 14 0 0 1 14 14 v30" stroke="${C.ink}" stroke-width="10" fill="none"/>` +
  `<rect x="-110" y="-230" width="220" height="230" rx="24" fill="${C.orange}"/><rect x="-80" y="-230" width="16" height="230" fill="#D4733A"/><rect x="64" y="-230" width="16" height="230" fill="#D4733A"/>` +
  `<circle cx="-30" cy="-140" r="26" fill="${C.sky}"/><path d="M-44 -140 h28 M-30 -154 v28" stroke="${C.blue}" stroke-width="6" stroke-linecap="round"/>` +
  `<rect x="20" y="-170" width="56" height="40" rx="8" fill="${C.gold}" transform="rotate(8 48 -150)"/><circle cx="-70" cy="10" r="12" fill="${C.ink}"/><circle cx="70" cy="10" r="12" fill="${C.ink}"/></g>` +
  pine(1100, 360, 1.1) + pine(1150, 372, .8);

/** Reisende: Familie und Freunde vor dem Haus */
const reisende = () => sky("#A8CDF7", C.skyLight) + sun(140, 90, 44) + cloud(520, 80, .9) + cloud(980, 110, .7) +
  hills("M0 300 Q300 250 640 300 T1200 280 V480 H0z", C.green) + hills("M0 380 Q500 350 1200 390 V480 H0z", C.greenDark, .55) +
  house(840, 330, 220, 150, C.cream, C.roof) + `<rect x="920" y="270" width="52" height="60" rx="4" fill="${C.blue}" opacity=".6"/>` +
  person(160, 440, 1.25, C.blue) + person(260, 440, 1.2, C.pink, "#E9B88E") + person(330, 440, .75, C.gold) + person(395, 440, .6, C.orange, "#F5D3B0") +
  person(520, 440, 1.2, C.greenDark, "#C99A70") + person(610, 440, 1.25, C.purple) + person(690, 440, .7, C.sea, "#F2C9A0") +
  // Haushalt-Klammern
  `<path d="M120 458 h300 M490 458 h250" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" opacity=".35"/>`;

/** Flüge: großes Flugzeug über den Wolken, Bordkarte */
const fluege = () => sky("#6FA8E8", "#DCEBFB") + sun(1010, 110, 42, "#FBE7A8") + cloud(180, 120, 1.3, C.white, .95) + cloud(520, 330, 1.5, C.white, .95) +
  cloud(930, 300, 1.2, C.white, .9) + cloud(120, 380, 1.1, C.white, .9) +
  `<path d="M100 260 C 300 200, 450 230, 560 200" stroke="${C.white}" stroke-width="5" stroke-dasharray="3 16" stroke-linecap="round" fill="none" opacity=".9"/>` +
  plane(720, 190, 1.35, -7) +
  // Bordkarte
  `<g transform="translate(110 330) rotate(-6)"><rect width="300" height="120" rx="14" fill="${C.white}"/><rect width="300" height="34" rx="14" fill="${C.blue}"/><rect y="20" width="300" height="14" fill="${C.blue}"/>` +
  `<path d="M200 34 v86" stroke="${C.grey}" stroke-width="3" stroke-dasharray="6 6"/><g fill="${C.ink}" opacity=".8"><rect x="24" y="52" width="110" height="10" rx="5"/><rect x="24" y="76" width="80" height="10" rx="5"/><rect x="24" y="98" width="130" height="8" rx="4" opacity=".5"/></g>` +
  `<g fill="${C.ink}">${[214, 224, 230, 240, 246, 258, 266, 276].map((a, i) => `<rect x="${a}" y="54" width="${i % 3 ? 3 : 6}" height="46"/>`).join("")}</g></g>`;

/** Unterkunft: Abenddämmerung, Haus mit erleuchteten Fenstern */
const unterkunft = () => sky("#F6B98A", "#7B6AB5") + sun(240, 250, 54, "#FBE3B0") + star(760, 50, 3) + star(960, 80, 2.5) + star(1100, 40, 3) + star(560, 90, 2) +
  `<path d="M1010 60 a34 34 0 1 0 30 54 a28 28 0 1 1 -30 -54z" fill="#FBF1D0"/>` +
  hills("M0 330 Q350 280 700 330 T1200 310 V480 H0z", "#4B3E8A") + hills("M0 390 Q500 360 1200 400 V480 H0z", "#2F2766") +
  // Haus
  `<rect x="440" y="230" width="360" height="180" fill="${C.cream}"/><path d="M416 232 L620 150 L824 232z" fill="${C.roof}"/>` +
  `<g fill="${C.gold}">${[[480, 270], [570, 270], [660, 270], [740, 270], [480, 340], [740, 340]].map(([x, y]) => `<rect x="${x}" y="${y}" width="40" height="52" rx="5"/>`).join("")}</g>` +
  `<rect x="590" y="326" width="60" height="84" rx="30" fill="${C.blue}" opacity=".7"/><circle cx="636" cy="372" r="4" fill="${C.gold}"/>` +
  `<g opacity=".28"><path d="M480 322 h40 l16 110 h-72z M570 322 h40 l16 110 h-72z" fill="${C.gold}"/></g>` +
  palm(240, 430, 1.1) + palm(1010, 440, .9) + pine(900, 410, 1.1, "#2F5D45");

/** Kosten und Status: Straßenbahn, Preisschilder, vier Status-Pillen */
const kosten = () => sky("#A9D0F4", C.skyLight) + cloud(210, 80, .9) + cloud(900, 70, .8) +
  hills("M0 250 Q300 200 600 250 T1200 230 V300 H0z", C.green) + `<rect x="0" y="300" width="${W}" height="180" fill="#D9DEE6"/><rect x="0" y="392" width="${W}" height="10" fill="${C.grey}"/>` +
  `<g stroke="${C.ink}" stroke-width="5" opacity=".55">${Array.from({ length: 14 }, (_, i) => `<path d="M${i * 90 + 20} 396 v22"/>`).join("")}</g>` +
  // Straßenbahn
  `<g transform="translate(70 270)"><rect width="330" height="120" rx="18" fill="${C.green}"/><rect y="82" width="330" height="12" fill="${C.white}"/>` +
  [24, 100, 176, 252].map(x => `<rect x="${x}" y="20" width="56" height="46" rx="6" fill="${C.sky}"/>`).join("") +
  `<path d="M165 0 V-50 M140 -50 H190" stroke="${C.ink}" stroke-width="5"/><circle cx="70" cy="124" r="14" fill="${C.ink}"/><circle cx="260" cy="124" r="14" fill="${C.ink}"/></g>` +
  // Preisschild
  `<g transform="translate(470 190) rotate(-8)"><path d="M0 0 h130 l30 36 l-30 36 h-130z" fill="${C.gold}"/><circle cx="22" cy="36" r="8" fill="${C.white}"/><text x="84" y="46" text-anchor="middle" font-size="30" ${FONT} fill="${C.ink}">€</text></g>` +
  // Status-Kette
  pill(550, 290, "Idee", "#ECE9FB", "#6B5BD2") + pill(780, 290, "Gewählt", "#FBEFD9", "#A0660B") + pill(550, 380, "Gebucht", "#E2F2E8", "#2E7D4F") + pill(780, 380, "Bezahlt", "#2E7D4F", "#fff", true) +
  confetti(26, 21);

/** Tagesplan: Kalender mit farbigen Balken je Person, Lücke gestrichelt */
const plan = () => sky("#BBD6F3", C.skyLight) + cloud(1040, 70, .9) + cloud(120, 80, .8) +
  `<g transform="translate(150 50)"><rect width="900" height="380" rx="22" fill="${C.white}"/><rect width="900" height="64" rx="22" fill="${C.blue}"/><rect y="40" width="900" height="24" fill="${C.blue}"/>` +
  `<circle cx="150" cy="0" r="12" fill="${C.ink}"/><circle cx="750" cy="0" r="12" fill="${C.ink}"/>` +
  `<g stroke="#E3E8F0" stroke-width="3">${[1, 2, 3, 4, 5, 6].map(i => `<path d="M${i * 128.5} 64 V380"/>`).join("")}</g>` +
  `<rect x="30" y="100" width="500" height="44" rx="22" fill="${C.pink}"/><rect x="30" y="170" width="770" height="44" rx="22" fill="${C.green}"/>` +
  `<rect x="160" y="240" width="370" height="44" rx="22" fill="${C.orange}"/><rect x="560" y="240" width="240" height="44" rx="22" fill="none" stroke="${C.red}" stroke-width="4" stroke-dasharray="10 8"/>` +
  `<rect x="30" y="310" width="140" height="44" rx="22" fill="${C.purple}"/><rect x="520" y="310" width="300" height="44" rx="22" fill="${C.lake}"/>` +
  `<path d="M690 262 m-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0 M690 252 v12 M690 270 v1" stroke="${C.red}" stroke-width="4" stroke-linecap="round" fill="none"/></g>` +
  `<path d="M1070 320 a34 34 0 1 0 30 54 a28 28 0 1 1 -30 -54z" fill="${C.gold}" transform="translate(-30 20)"/>`;

/** Abrechnung: Beleg, Münzen, drei Haushalte mit ihrem Anteil */
const abrechnung = () => sky("#FBE6C2", "#FFF6E3") + sun(1080, 90, 40, "#F6C760") +
  // Beleg
  `<g transform="translate(110 70) rotate(-5)"><path d="M0 0 h210 v330 l-17.5 -16 l-17.5 16 l-17.5 -16 l-17.5 16 l-17.5 -16 l-17.5 16 l-17.5 -16 l-17.5 16 l-17.5 -16 l-17.5 16 l-17.5 -16 l-17.5 16z" fill="${C.white}"/>` +
  `<g fill="${C.ink}" opacity=".7">${[34, 70, 106, 142, 178].map(y => `<rect x="24" y="${y}" width="${y % 3 ? 120 : 90}" height="10" rx="5"/><rect x="170" y="${y}" width="20" height="10" rx="5"/>`).join("")}</g>` +
  `<rect x="24" y="226" width="162" height="4" fill="${C.ink}"/><rect x="24" y="250" width="70" height="16" rx="8" fill="${C.ink}"/><rect x="120" y="250" width="66" height="16" rx="8" fill="${C.green}"/></g>` +
  `<path d="M380 220 H470 M450 200 l22 20 l-22 20" stroke="${C.ink}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>` +
  // drei Haushalte mit Münzstapeln
  [[600, C.blue, 4], [800, C.pink, 5], [1000, C.greenDark, 3]].map(([x, c, n]) =>
    `<g transform="translate(${x} 410)"><rect x="-80" y="-120" width="160" height="120" rx="16" fill="${c}" opacity=".16"/>` +
    `<rect x="-52" y="-92" width="104" height="58" fill="${c}"/><path d="M-62 -92 L0 -134 L62 -92z" fill="${c}"/><rect x="-10" y="-70" width="20" height="36" rx="4" fill="${C.white}" opacity=".85"/>` +
    `</g>` +
    `<g transform="translate(${x} 440)">${Array.from({ length: n as number }, (_, i) => `<ellipse cx="0" cy="${-i * 14}" rx="34" ry="10" fill="${C.gold}"/><ellipse cx="0" cy="${-i * 14 - 5}" rx="34" ry="10" fill="#F7D677"/>`).join("")}</g>`).join("") +
  `<g fill="${C.gold}"><circle cx="470" cy="360" r="20"/><circle cx="520" cy="400" r="14"/></g><text x="470" y="368" text-anchor="middle" font-size="22" ${FONT} fill="${C.ink}">€</text>`;

/** Gemeinsam planen: Handys, Wolke, Abstimmungs-Sprechblasen */
const gemeinsam = () => sky("#6FA8E8", "#CFE3FA") + cloud(150, 80, .9, C.white, .9) + cloud(1050, 90, 1, C.white, .9) +
  `<g fill="${C.white}" transform="translate(600 120) scale(1.7)"><ellipse cx="0" cy="14" rx="86" ry="22"/><circle cx="-28" cy="0" r="28"/><circle cx="14" cy="-12" r="36"/><circle cx="52" cy="6" r="22"/></g>` +
  `<g stroke="${C.white}" stroke-width="5" stroke-dasharray="4 14" stroke-linecap="round" fill="none"><path d="M560 190 L280 300 M600 200 L600 290 M640 190 L920 300"/></g>` +
  phone(280, 350, 1, C.skyLight, `<rect x="-38" y="-80" width="76" height="14" rx="7" fill="${C.pink}"/><rect x="-38" y="-52" width="76" height="14" rx="7" fill="${C.blue}" opacity=".5"/><rect x="-38" y="-24" width="52" height="14" rx="7" fill="${C.blue}" opacity=".5"/>`) +
  phone(600, 380, 1.15, C.skyLight, `<circle cx="0" cy="-30" r="30" fill="${C.green}"/><path d="M-14 -30 l10 12 l20 -24" stroke="${C.white}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="-38" y="24" width="76" height="14" rx="7" fill="${C.blue}" opacity=".5"/><rect x="-38" y="50" width="52" height="14" rx="7" fill="${C.blue}" opacity=".5"/>`) +
  phone(920, 350, 1, C.skyLight, `<rect x="-38" y="-80" width="76" height="14" rx="7" fill="${C.orange}"/><rect x="-38" y="-52" width="76" height="14" rx="7" fill="${C.blue}" opacity=".5"/><rect x="-38" y="-24" width="52" height="14" rx="7" fill="${C.blue}" opacity=".5"/>`) +
  `<g transform="translate(420 150)"><rect width="110" height="56" rx="28" fill="${C.gold}"/><text x="55" y="38" text-anchor="middle" font-size="26" ${FONT} fill="${C.ink}">Dafür</text></g>` +
  `<g transform="translate(700 230)"><rect width="140" height="56" rx="28" fill="${C.white}"/><text x="70" y="38" text-anchor="middle" font-size="26" ${FONT} fill="${C.ink}">Ohne mich</text></g>`;

/** KI und Reiseideen: Nachthimmel, Glühbirne, Kompass, Ticket */
const ideen = () => sky(C.night, C.purple) + confetti(24, 11) +
  [70, 190, 330, 470, 700, 860, 1000, 1130].map((x, i) => star(x, 40 + (i % 4) * 36, i % 2 ? 2.5 : 3.5)).join("") +
  hills("M0 400 Q300 340 620 400 T1200 380 V480 H0z", "#2A2560") +
  // Glühbirne
  `<g transform="translate(600 230)"><circle cx="0" cy="0" r="150" fill="${C.gold}" opacity=".14"/><path d="M0 -100 a70 70 0 0 1 40 128 v34 h-80 v-34 a70 70 0 0 1 40 -128z" fill="${C.gold}"/><rect x="-34" y="66" width="68" height="14" rx="6" fill="${C.grey}"/><rect x="-26" y="84" width="52" height="12" rx="6" fill="${C.grey}"/>` +
  `<path d="M-18 40 q-8 -40 18 -50 q26 10 18 50" stroke="${C.white}" stroke-width="5" fill="none" opacity=".7"/>` +
  `<g stroke="${C.gold}" stroke-width="7" stroke-linecap="round"><path d="M-110 -50 l-26 -12 M110 -50 l26 -12 M-124 10 h-34 M124 10 h34 M-86 -92 l-18 -22 M86 -92 l18 -22"/></g></g>` +
  // Kompass
  `<g transform="translate(250 330)"><circle r="78" fill="${C.white}"/><circle r="64" fill="${C.skyLight}" stroke="${C.blue}" stroke-width="6"/><path d="M0 -50 L12 0 L0 50 L-12 0z" fill="${C.red}" transform="rotate(40)"/><path d="M0 50 L12 0 L-12 0z" fill="${C.ink}" transform="rotate(40)"/><circle r="6" fill="${C.ink}"/></g>` +
  // Ticket
  `<g transform="translate(870 300) rotate(-8)"><path d="M0 0 h220 v44 a22 22 0 0 0 0 44 v44 h-220 v-44 a22 22 0 0 0 0 -44z" fill="${C.pink}"/><path d="M150 8 v116" stroke="${C.white}" stroke-width="3" stroke-dasharray="6 6"/><g fill="${C.white}"><rect x="22" y="36" width="100" height="12" rx="6"/><rect x="22" y="62" width="70" height="12" rx="6" opacity=".7"/><circle cx="185" cy="66" r="14"/></g></g>`;

/** App und Konto: Handy mit App-Symbol, Wolke, Sonne und Mond */
const app = () => sky("#9CC8F5", C.skyLight) + sun(170, 110, 46) + `<path d="M1050 70 a40 40 0 1 0 36 64 a33 33 0 1 1 -36 -64z" fill="#F6E7B0"/>` + cloud(930, 330, 1.2, C.white, .95) + cloud(250, 340, 1.1, C.white, .95) +
  hills("M0 410 Q400 370 800 415 T1200 400 V480 H0z", C.green) +
  phone(600, 250, 1.75, C.white,
    `<rect x="-30" y="-60" width="60" height="60" rx="16" fill="${C.blue}"/><path d="M-12 -18 l8 -24 h8 l-4 16 l16 -2 v6 l-16 4 l4 14 h-8 l-6 -10z" fill="${C.white}"/>` +
    `<rect x="-38" y="20" width="76" height="12" rx="6" fill="${C.ink}" opacity=".75"/><rect x="-38" y="42" width="52" height="10" rx="5" fill="${C.ink}" opacity=".3"/>` +
    `<rect x="-38" y="64" width="76" height="22" rx="11" fill="${C.green}"/>`) +
  `<g transform="translate(830 170)"><circle r="44" fill="${C.green}"/><path d="M-20 0 l14 16 l28 -32" stroke="${C.white}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>` +
  `<g transform="translate(380 180)"><circle r="40" fill="${C.white}" stroke="${C.blue}" stroke-width="6"/><path d="M-8 -22 v26 h22" stroke="${C.blue}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;

/** Szene und Bildbeschreibung je Anleitungsseite (Schlüssel = slug in guide/pages.ts) */
export const GUIDE_ART: Record<string, { alt: string; draw: () => string }> = {
  "erste-reise": { alt: "Orangefarbener Koffer, gestrichelte Route und ein Flugzeug auf dem Weg zum Ziel", draw: start },
  "reisende": { alt: "Zwei Familien und Freunde, Erwachsene und Kinder, stehen vor einem Haus", draw: reisende },
  "fluege": { alt: "Flugzeug über den Wolken mit gestrichelter Flugbahn und Bordkarte", draw: fluege },
  "unterkunft": { alt: "Haus mit erleuchteten Fenstern in der Abenddämmerung, Palmen und Mond", draw: unterkunft },
  "kosten": { alt: "Straßenbahn, Preisschild und die vier Status Idee, Gewählt, Gebucht und Bezahlt", draw: kosten },
  "tagesplan": { alt: "Kalender mit farbigen Balken je Person und einer gestrichelten Lücke", draw: plan },
  "abrechnung": { alt: "Beleg mit Pfeil zu drei Haushalten, jeder mit seinem Münzstapel", draw: abrechnung },
  "gemeinsam": { alt: "Drei Handys rund um eine Wolke, dazu Abstimmungsblasen mit Dafür und Ohne mich", draw: gemeinsam },
  "ideen-und-ki": { alt: "Leuchtende Glühbirne, Kompass und Ticket unter dem Nachthimmel", draw: ideen },
  "app-und-konto": { alt: "Handy mit Split&Fly-Symbol, Wolke mit Haken und Uhr für die Synchronisation", draw: app }
};

/** SVG der Szene; ohne Szene leer */
export function guideArtSvg(slug: string, cls = "art"): string {
  const a = GUIDE_ART[slug];
  if (!a) return "";
  const alt = a.alt.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${alt}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><title>${alt}</title>${a.draw()}</svg>`;
}
