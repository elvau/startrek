/*
 * Reise als PDF: eine gestaltete Zusammenfassung zum Drucken bzw. „Als PDF speichern“ (A4 hoch). Zwei Arten:
 * „plan“ (Route, Unterkünfte, Flüge, Tag für Tag, geschätzte Kosten je Familie) und „after“ (dazu geplant gegen
 * tatsächlich aus der Kasse, wer was bezahlt hat und der Ausgleich). Reines HTML ohne Abhängigkeiten; alle Texte kommen
 * fertig übersetzt herein (tripreportApp.ts sammelt sie aus der Reise). Keine Buchungsdaten (Ausweis, Pass).
 */
import { esc } from "./datareport";

export type ReportMode = "plan" | "after";

export interface ReportCat { key: string; label: string; color: string; v: number; text: string }
export interface ReportData {
  mode: ReportMode;
  lang: string;
  rtl?: boolean;
  title: string;
  kicker?: string;
  badge: string;
  /** „Makarska, Kroatien · 18. bis 29. Juli · 11 Nächte · 4 Personen“ */
  meta: string;
  /** Route als SVG (mit Kartenbild darunter), schon fertig gezeichnet */
  hero?: string;
  stops: { icon: string; name: string; sub: string }[];
  stays: { name: string; place: string; when: string; price?: string; status?: string; map?: string }[];
  flights: { route: string; when: string; detail: string; price?: string }[];
  days: { head: string; place: string; title?: string; entries: { icon: string; time?: string; text: string }[] }[];
  costs: {
    total: string; perPerson: string; fixed: string; open: string; extras?: string;
    cats: ReportCat[];
    families: { name: string; persons: string; costs: string; funds?: string; due: string }[];
  };
  actual?: {
    spent: string;
    pending?: string;
    cats: { label: string; color: string; plan: number; actual: number; planText: string; actualText: string; diffText: string; over: boolean }[];
    kassen: { name: string; paid: string; share: string; bal: string; plus: boolean }[];
    moves: string[];
    none?: string;
  };
  L: Record<"route" | "stays" | "flights" | "days" | "costs" | "costsAfter" | "total" | "perPerson" | "fixed" | "open" | "byFamily" | "famCosts" | "famFunds" | "famDue" | "planned" | "actual" | "diff" | "spent" | "kassen" | "paid" | "share" | "bal" | "moves" | "footer", string>;
}

const bars = (cats: ReportCat[]) => {
  const max = Math.max(1, ...cats.map(c => c.v));
  return cats.filter(c => c.v > 0).map(c => `<div class="bar"><span class="bl">${esc(c.label)}</span><span class="bt"><i style="width:${((c.v / max) * 100).toFixed(1)}%;background:${c.color}"></i></span><b>${esc(c.text)}</b></div>`).join("");
};

export function reportHtml(d: ReportData): string {
  const L = d.L;
  const sec = (title: string, body: string, cls = "") => (body ? `<section class="${cls}"><h2>${esc(title)}</h2>${body}</section>` : "");
  const stops = d.stops.length ? `<ol class="stops">${d.stops.map(s => `<li><span class="si">${esc(s.icon)}</span><div><b>${esc(s.name)}</b><small>${esc(s.sub)}</small></div></li>`).join("")}</ol>` : "";
  const stays = d.stays.map(s => `<article class="stay">${s.map ? `<div class="sm"><img src="${esc(s.map)}" alt=""><i class="pin"></i></div>` : ""}<div class="sb"><b>${esc(s.name)}</b><small>${esc(s.place)}</small><span>${esc(s.when)}</span>${s.price || s.status ? `<span class="sp">${s.price ? `<b>${esc(s.price)}</b>` : ""}${s.status ? `<em>${esc(s.status)}</em>` : ""}</span>` : ""}</div></article>`).join("");
  const flights = d.flights.length ? `<table class="fl">${d.flights.map(f => `<tr><td><b>${esc(f.route)}</b></td><td>${esc(f.when)}</td><td class="mut">${esc(f.detail)}</td><td class="num">${esc(f.price || "")}</td></tr>`).join("")}</table>` : "";
  const days = d.days.map(x => `<div class="day"><div class="dh"><b>${esc(x.head)}</b><span>${esc(x.place)}</span>${x.title ? `<em>${esc(x.title)}</em>` : ""}</div><ul>${x.entries.map(e => `<li><span>${esc(e.icon)}</span>${e.time ? `<time>${esc(e.time)}</time>` : ""}${esc(e.text)}</li>`).join("")}</ul></div>`).join("");
  const c = d.costs;
  const fams = c.families.length > 1 || c.families.some(f => f.funds) ? `<h3>${esc(L.byFamily)}</h3><table class="fam"><tr><th></th><th class="num">${esc(L.famCosts)}</th>${c.families.some(f => f.funds) ? `<th class="num">${esc(L.famFunds)}</th>` : ""}<th class="num">${esc(L.famDue)}</th></tr>${c.families.map(f => `<tr><td><b>${esc(f.name)}</b> <small>${esc(f.persons)}</small></td><td class="num">${esc(f.costs)}</td>${c.families.some(x => x.funds) ? `<td class="num">${esc(f.funds || "–")}</td>` : ""}<td class="num"><b>${esc(f.due)}</b></td></tr>`).join("")}</table>` : "";
  const costs = `<div class="kpis"><div><small>${esc(L.total)}</small><b>${esc(c.total)}</b>${c.extras ? `<span>${esc(c.extras)}</span>` : ""}</div><div><small>${esc(L.perPerson)}</small><b>${esc(c.perPerson)}</b></div><div><small>${esc(L.fixed)}</small><b>${esc(c.fixed)}</b></div><div><small>${esc(L.open)}</small><b>${esc(c.open)}</b></div></div><div class="bars">${bars(c.cats)}</div>${fams}`;
  const a = d.actual;
  const after = a ? (a.none ? `<p class="mut">${esc(a.none)}</p>` : `<div class="kpis two"><div><small>${esc(L.spent)}</small><b>${esc(a.spent)}</b>${a.pending ? `<span>${esc(a.pending)}</span>` : ""}</div><div><small>${esc(L.planned)}</small><b>${esc(c.total)}</b></div></div>
<table class="cmp"><tr><th></th><th class="num">${esc(L.planned)}</th><th class="num">${esc(L.actual)}</th><th class="num">${esc(L.diff)}</th></tr>${a.cats.map(x => `<tr><td><i class="dot" style="background:${x.color}"></i>${esc(x.label)}</td><td class="num">${esc(x.planText)}</td><td class="num"><b>${esc(x.actualText)}</b></td><td class="num ${x.over ? "over" : "under"}">${esc(x.diffText)}</td></tr>`).join("")}</table>
${a.kassen.length ? `<h3>${esc(L.kassen)}</h3><table class="fam"><tr><th></th><th class="num">${esc(L.paid)}</th><th class="num">${esc(L.share)}</th><th class="num">${esc(L.bal)}</th></tr>${a.kassen.map(k => `<tr><td><b>${esc(k.name)}</b></td><td class="num">${esc(k.paid)}</td><td class="num">${esc(k.share)}</td><td class="num ${k.plus ? "under" : "over"}"><b>${esc(k.bal)}</b></td></tr>`).join("")}</table>` : ""}
${a.moves.length ? `<h3>${esc(L.moves)}</h3><ul class="moves">${a.moves.map(m => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}`) : "";

  return `<!doctype html><html lang="${esc(d.lang)}"${d.rtl ? ' dir="rtl"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)}</title><style>${CSS}</style></head><body>
<header class="cover"><span class="badge">${esc(d.badge)}</span>${d.kicker ? `<p class="kick">${esc(d.kicker)}</p>` : ""}<h1>${esc(d.title)}</h1><p class="meta">${esc(d.meta)}</p>${d.hero ? `<div class="hero">${d.hero}</div>` : ""}
<div class="kpis hk"><div><small>${esc(L.total)}</small><b>${esc(c.total)}</b></div><div><small>${esc(L.perPerson)}</small><b>${esc(c.perPerson)}</b></div>${a && !a.none ? `<div><small>${esc(L.spent)}</small><b>${esc(a.spent)}</b></div>` : ""}</div></header>
${sec(L.route, stops)}
${sec(L.stays, stays ? `<div class="stays">${stays}</div>` : "")}
${sec(L.flights, flights)}
${sec(d.mode === "after" ? L.costsAfter : L.costs, d.mode === "after" ? after + `<h3>${esc(L.costs)}</h3>` + costs : costs, "costs")}
${sec(L.days, days ? `<div class="days">${days}</div>` : "", "daysec")}
<footer>${esc(L.footer)}</footer></body></html>`;
}

const CSS = `
@page{size:A4;margin:14mm 13mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0 auto;max-width:820px;padding:24px 20px 40px;font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#15202E;background:#fff}
h1{font-size:34px;line-height:1.05;margin:4px 0 6px;letter-spacing:-.02em}
h2{font-size:17px;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #D2693C;letter-spacing:-.01em}
h3{font-size:13px;margin:16px 0 6px;color:#4B5566;text-transform:uppercase;letter-spacing:.06em}
section{margin:22px 0 0;break-inside:auto}
.cover{padding:22px 22px 18px;border-radius:18px;background:linear-gradient(160deg,#FBE8DF,#F7F6F3 55%,#E4EDFB);break-after:auto}
.badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#D2693C;background:#fff;border-radius:99px;padding:4px 10px}
.kick{margin:10px 0 0;color:#4B5566;font-weight:600}
.meta{margin:0 0 14px;color:#4B5566}
.hero{border-radius:14px;overflow:hidden;box-shadow:0 8px 24px -14px rgba(21,32,46,.45);background:#E9EEF3;line-height:0}
.hero svg{width:100%;height:auto;display:block}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 0}
.kpis.hk{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.kpis.two{grid-template-columns:1fr 1fr}
.kpis div{background:#F7F6F3;border-radius:12px;padding:10px 12px;break-inside:avoid}
.cover .kpis div{background:rgba(255,255,255,.75)}
.kpis small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7D8696}
.kpis b{font-size:20px;font-variant-numeric:tabular-nums}
.kpis span{display:block;font-size:11px;color:#4B5566}
.stops{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 0}
.stops li{display:flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;break-inside:avoid}
.stops li+li::before{content:"→";color:#B5B9C2;margin-inline-end:6px}
.stops .si{width:30px;height:30px;border-radius:50%;background:#F7F6F3;display:grid;place-items:center;font-size:15px}
.stops b{display:block}.stops small{color:#7D8696}
.stays{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.stay{display:flex;flex-direction:column;border:1px solid #E3E0DA;border-radius:14px;overflow:hidden;break-inside:avoid}
.sm{position:relative;line-height:0;background:#E9EEF3}.sm img{width:100%;height:130px;object-fit:cover}
.pin{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-16px 0 0 -8px;border-radius:50% 50% 50% 0;background:#C0487A;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.sb{padding:10px 12px;display:flex;flex-direction:column;gap:2px}.sb small{color:#7D8696}
.sp{display:flex;gap:8px;align-items:baseline;margin-top:4px}.sp em{font-style:normal;font-size:11px;font-weight:700;color:#2E7D4F;background:#E2F2E8;border-radius:99px;padding:1px 8px}
table{width:100%;border-collapse:collapse}
td,th{padding:6px 6px;border-bottom:1px solid #EEECE8;text-align:start;vertical-align:top}
th{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7D8696}
tr{break-inside:avoid}
.num{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.mut{color:#7D8696}
.bars{display:flex;flex-direction:column;gap:7px;margin-top:14px}
.bar{display:grid;grid-template-columns:110px 1fr 90px;align-items:center;gap:10px}
.bl{color:#4B5566}.bar b{text-align:end;font-variant-numeric:tabular-nums}
.bt{height:12px;border-radius:99px;background:#F1EFEB;overflow:hidden}.bt i{display:block;height:100%;border-radius:99px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-inline-end:8px}
.over{color:#B4472F}.under{color:#2E7D4F}
.moves{margin:0;padding-inline-start:18px}
.days{columns:2;column-gap:18px}
.day{break-inside:avoid;margin:0 0 12px;border-inline-start:3px solid #D2693C;padding:2px 0 2px 10px}
.dh{display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline}.dh span{color:#7D8696}.dh em{width:100%;font-style:normal;font-weight:600;color:#4B5566}
.day ul{list-style:none;margin:4px 0 0;padding:0}.day li{display:flex;gap:6px;padding:1px 0}
.day time{font-variant-numeric:tabular-nums;color:#4B5566;min-width:38px}
footer{margin-top:28px;padding-top:10px;border-top:1px solid #E3E0DA;font-size:11px;color:#7D8696;text-align:center}
@media (max-width:640px){.kpis{grid-template-columns:1fr 1fr}.stays{grid-template-columns:1fr}.days{columns:1}h1{font-size:28px}.bar{grid-template-columns:80px 1fr 70px}}
@media print{body{padding:0;max-width:none}.daysec{break-before:page}}
`;
