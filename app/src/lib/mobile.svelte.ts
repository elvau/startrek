/*
 * Handy-Ansicht (#530): Die Reise ist ein Pager aus Seiten, die man seitlich wischt (Übersicht, je Kapitel eine Seite,
 * Tage, Abrechnung); jede Seite scrollt für sich. Unten eine feste Leiste, oben Reiter. Desktop bleibt eine lange Seite.
 * Sprünge per scrollIntoView (Posten zeigen, Suche übernehmen) funktionieren weiter: sie scrollen den Pager mit.
 */
import { CHAPTERS, type ChapterKey } from "./chapters";
import { view } from "./scroll.svelte";

/** bis zu dieser Breite gilt die Handy-Ansicht */
export const MOB_MAX = 760;
export type PageKey = "hero" | ChapterKey;
/** Seiten in der Reihenfolge des Pagers */
export const PAGES: PageKey[] = ["hero", ...CHAPTERS.map(c => c.k)];
/** Kapitel, die „Planen“ in der Leiste zusammenfasst */
export const PLAN_PAGES: PageKey[] = ["trav", "flights", "stay", "transport", "attractions", "misc"];

/** openItem: am Handy aufgeklappter Posten (#531), immer höchstens einer */
export const mob = $state<{ on: boolean; page: PageKey; lastPlan: PageKey; more: boolean; openItem: string }>({ on: false, page: "hero", lastPlan: "flights", more: false, openItem: "" });

/** Leiste unten: welcher Eintrag ist gerade aktiv */
export type BarKey = "home" | "plan" | "days" | "split";
export const barOf = (p: PageKey): BarKey => (p === "hero" ? "home" : p === "plan" ? "days" : p === "split" ? "split" : "plan");

/** nächste bzw. vorige Seite (für Tastatur und Tests); am Rand bleibt es */
export const stepPage = (p: PageKey, d: 1 | -1): PageKey => PAGES[Math.max(0, Math.min(PAGES.length - 1, PAGES.indexOf(p) + d))];

/** Seite aus der Lage des Pagers: Breite einer Seite = Breite des Pagers (rechts nach links: scrollLeft ist negativ) */
export const pageAt = (scrollLeft: number, width: number, keys: PageKey[] = PAGES): PageKey =>
  keys[Math.max(0, Math.min(keys.length - 1, Math.round(Math.abs(scrollLeft) / Math.max(1, width))))];

let pager: HTMLElement | null = null;
/** Ziel eines Sprungs: Seiten, über die der Pager dabei scrollt, zählen nicht (sonst stimmte „Planen“ nicht mehr) */
let target: PageKey | null = null, targetTimer: ReturnType<typeof setTimeout> | undefined;
/** Lage des Pagers neu auswerten (nach einem unterbrochenen Sprung) */
let recheck = () => {};

/** nach dem Neuladen wieder auf der Seite, die offen war (wie der Scrollstand am Desktop, #255); nur in diesem Tab */
const PAGE_KEY = "sf-mob-page";
let tripId = "";

function setPage(p: PageKey) {
  if (mob.page === p) return;
  mob.page = p;
  try { if (tripId) sessionStorage.setItem(PAGE_KEY, JSON.stringify({ id: tripId, page: p })); } catch { /* egal */ }
  if (PLAN_PAGES.includes(p)) mob.lastPlan = p;
  view.active = p;
  document.body.dataset.ch = p;
}

/** Seite zeigen (aus Leiste und Reitern) */
export function goPage(p: PageKey, smooth = true) {
  const el = pager?.querySelector<HTMLElement>(`:scope > [data-ch="${p}"]`);
  if (!pager || !el) return;
  // scrollIntoView statt scrollTo: stimmt auch bei Schrift von rechts nach links (scrollLeft negativ)
  target = p;
  clearTimeout(targetTimer);
  // wird der Sprung unterbrochen (Wischen, anderer Sprung), danach die tatsächliche Seite übernehmen
  targetTimer = setTimeout(() => { target = null; recheck(); }, 1200);
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", inline: "start", block: "nearest" });
  setPage(p);
}

/** Pager anbinden: beim Wischen die aktuelle Seite merken */
export function attachPager(el: HTMLElement, trip = ""): () => void {
  pager = el;
  // nur in der Reise scrollt die Seite selbst nicht (die Startseite schon)
  document.body.classList.add("mob-pager");
  tripId = trip;
  mob.page = "hero";
  let back: PageKey | null = null;
  try { const v = JSON.parse(sessionStorage.getItem(PAGE_KEY) || "null"); if (v?.id === trip && PAGES.includes(v.page)) back = v.page; } catch { /* egal */ }
  let raf = 0;
  const keys = () => [...el.children].map(c => (c as HTMLElement).dataset.ch as PageKey).filter(Boolean);
  const tick = () => {
    raf = 0;
    const at = pageAt(el.scrollLeft, el.clientWidth, keys());
    if (target) { if (at !== target) return; target = null; }
    setPage(at);
  };
  // selbst wischen beendet einen laufenden Sprung
  const touch = () => { target = null; };
  el.addEventListener("touchstart", touch, { passive: true });
  const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
  recheck = on;
  el.addEventListener("scroll", on, { passive: true });
  if (back && back !== "hero") requestAnimationFrame(() => goPage(back!, false));
  else { el.scrollTo({ left: 0 }); tick(); }
  return () => { el.removeEventListener("scroll", on); el.removeEventListener("touchstart", touch); if (pager === el) { pager = null; document.body.classList.remove("mob-pager"); } };
}

/** Breite beobachten: Handy-Ansicht an oder aus */
export function initMobile(): () => void {
  const mq = matchMedia(`(max-width: ${MOB_MAX}px)`);
  const set = () => { mob.on = mq.matches; document.body.classList.toggle("mob", mq.matches); };
  set();
  mq.addEventListener("change", set);
  return () => { mq.removeEventListener("change", set); document.body.classList.remove("mob"); };
}
