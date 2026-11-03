/*
 * Diagnose für Darstellungsfehler auf fremden Geräten (#612, leere Übersicht auf einem iPhone): mit …/?diag blendet die
 * App oben einen Kasten mit Messwerten ein (Pager, Übersicht, was an drei Punkten zuoberst liegt, Fehler, Geräte-
 * Einstellungen) und einen Knopf zum Kopieren. Nur Technik: keine Reisedaten, Namen oder Kontodaten.
 * Werkzeug für die Entwicklung, daher ohne Übersetzung.
 */
import { recentErrors } from "./bugs/log";

/** ?diag oder &diag in der Adresse */
export const wantsDiag = (search: string) => new URLSearchParams(search).has("diag");

type Box = { x: number; y: number; width: number; height: number };
export const rect = (r: Box | undefined | null) => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}` : "–");

/** Kurzname eines Elements: tag.klasse1.klasse2[data-ch], ohne Text */
export function tag(el: { tagName?: string; classList?: ArrayLike<string>; getAttribute?: (k: string) => string | null } | null | undefined): string {
  if (!el?.tagName) return "–";
  const cls = el.classList ? Array.from(el.classList).slice(0, 3).map(c => "." + c).join("") : "";
  const ch = el.getAttribute?.("data-ch");
  return el.tagName.toLowerCase() + cls + (ch ? `[${ch}]` : "");
}

function chain(el: Element | null, n = 4): string {
  const out: string[] = [];
  for (let e = el; e && out.length < n; e = e.parentElement) out.push(tag(e));
  return out.join(" < ");
}

function style(el: Element | null, keys: string[]): string {
  if (!el) return "–";
  const s = getComputedStyle(el);
  return keys.map(k => `${k}=${s.getPropertyValue(k)}`).join(" ");
}

export function measure(): string {
  const w = innerWidth, h = innerHeight, q = (s: string) => document.querySelector(s);
  const mq = (m: string) => (matchMedia(m).matches ? "ja" : "nein");
  const sup = (c: string) => { try { return CSS.supports(c) ? "ja" : "nein"; } catch { return "?"; } };
  const pager = q("main.pager") as HTMLElement | null, wrap = q(".wrap"), amb = q(".amb");
  const heroIn = q(".pg-hero .hero-in"), h1 = q(".pg-hero h1");
  const lines = [
    `v${__APP_VERSION__} (${__APP_COMMIT__}) ${new Date().toISOString().slice(0, 19)}`,
    navigator.userAgent,
    `Fenster ${w}×${h} dpr=${devicePixelRatio} vv=${visualViewport ? `${Math.round(visualViewport.width)}×${Math.round(visualViewport.height)} s=${visualViewport.scale}` : "–"}`,
    `standalone=${mq("(display-mode: standalone)")} bewegung-reduziert=${mq("(prefers-reduced-motion: reduce)")} dunkel=${mq("(prefers-color-scheme: dark)")} kontrast=${mq("(prefers-contrast: more)")} transparenz-reduziert=${mq("(prefers-reduced-transparency: reduce)")}`,
    `body ${tag(document.body)} ch=${document.body.dataset.ch ?? "–"} scrollY=${scrollY} html-font=${getComputedStyle(document.documentElement).fontSize}`,
    `pager ${pager ? rect(pager.getBoundingClientRect()) : "fehlt"} sl=${pager?.scrollLeft ?? "–"} sw=${pager?.scrollWidth ?? "–"} cw=${pager?.clientWidth ?? "–"}`,
    `pager-stil ${style(pager, ["position", "display", "z-index", "opacity", "visibility", "transform", "top", "bottom"])}`,
    `wrap ${rect(wrap?.getBoundingClientRect())} ${style(wrap, ["position", "z-index", "transform", "filter"])}`,
    `amb ${rect(amb?.getBoundingClientRect())} ${style(amb, ["position", "z-index"])}`,
    ...Array.from(document.querySelectorAll<HTMLElement>("main.pager > .chapter")).slice(0, 4)
      .map(c => `seite ${tag(c)} ${rect(c.getBoundingClientRect())} st=${c.scrollTop} sh=${c.scrollHeight} ${style(c, ["opacity", "visibility", "transform", "filter", "animation-name"])}`),
    `hero-in ${rect(heroIn?.getBoundingClientRect())} ${style(heroIn, ["opacity", "visibility", "transform", "display"])}`,
    `h1 ${rect(h1?.getBoundingClientRect())} ${style(h1, ["color", "opacity", "font-size"])}`,
    ...[0.3, 0.5, 0.7].map(f => `oben@${f} ${chain(document.elementFromPoint(w / 2, h * f))}`),
    `css svh=${sup("height:100svh")} color-mix=${sup("color:color-mix(in srgb, red, blue)")} :has=${sup("selector(:has(a))")} translate=${sup("translate:1px")} inset-inline=${sup("inset-inline-end:0")} snap-stop=${sup("scroll-snap-stop:always")} backdrop=${sup("backdrop-filter:blur(1px)") === "ja" || sup("-webkit-backdrop-filter:blur(1px)") === "ja" ? "ja" : "nein"}`,
    `fehler ${recentErrors().join(" | ") || "keine"}`
  ];
  return lines.join("\n");
}

/** Kasten einblenden und jede Sekunde neu messen; × schließt ihn */
export function showDiag() {
  const box = document.createElement("div");
  box.setAttribute("style", "position:fixed;left:4px;right:4px;top:calc(env(safe-area-inset-top,0px) + 4px);z-index:2147483647;max-height:40vh;overflow:auto;background:rgba(0,0,0,.85);color:#fff;font:11px/1.35 ui-monospace,monospace;padding:8px;border-radius:8px;white-space:pre-wrap;word-break:break-all;pointer-events:auto");
  const bstyle = "min-height:44px;min-width:44px;padding:0 12px;font:600 15px system-ui;border-radius:8px;border:0;background:#fff;color:#000";
  const bar = document.createElement("div");
  bar.setAttribute("style", "display:flex;gap:8px;margin:0 0 6px");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "📋 Kopieren";
  btn.setAttribute("style", bstyle);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Diagnose schließen");
  close.setAttribute("style", bstyle + ";margin-inline-start:auto");
  bar.append(btn, close);
  const pre = document.createElement("div");
  box.append(bar, pre);
  btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(pre.textContent || ""); btn.textContent = "✓ Kopiert"; }
    catch { getSelection()?.selectAllChildren(pre); btn.textContent = "Text markiert"; }
  });
  // beim Messen ausblenden, sonst liegt der Kasten selbst zuoberst
  const tick = () => {
    box.style.visibility = "hidden";
    try { pre.textContent = measure(); } catch (e) { pre.textContent = "Messung fehlgeschlagen: " + (e as Error).message; }
    box.style.visibility = "";
  };
  document.body.append(box);
  tick();
  const timer = setInterval(tick, 1000);
  close.addEventListener("click", () => { clearInterval(timer); box.remove(); });
}
