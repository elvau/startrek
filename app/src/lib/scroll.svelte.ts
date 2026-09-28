/* Welches Kapitel ist gerade in der Bildschirmmitte, und wie weit ist man darin gescrollt */
export const view = $state({ active: "hero", p: 0, hp: 0, scrolled: false });

/** Lage im Seitenlayout, unabhängig von Transformationen (getBoundingClientRect rechnet die mit ein) */
function box(el: HTMLElement): { top: number; height: number } {
  let top = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) top += e.offsetTop;
  return { top: top - scrollY, height: el.offsetHeight };
}

export function initScroll(): () => void {
  let raf = 0;
  const tick = () => {
    raf = 0;
    const vh = innerHeight, y = scrollY;
    view.scrolled = y > vh * 0.6;
    view.hp = Math.min(1, y / vh);
    const chapters = [...document.querySelectorAll<HTMLElement>(".chapter")];
    let cur: string | null = y < vh * 0.55 ? "hero" : null;
    if (!cur) for (const s of chapters) {
      const r = box(s);
      if (r.top <= vh * 0.5 && r.top + r.height > vh * 0.5) { cur = s.dataset.ch!; break; }
    }
    if (cur) view.active = cur;
    const sec = chapters.find(s => s.dataset.ch === view.active);
    let p = 0;
    if (sec) { const r = box(sec); p = Math.max(0, Math.min(1, (vh * 0.8 - r.top) / (r.height + vh * 0.3))); }
    view.p = p;
    document.body.dataset.ch = view.active;
    document.body.classList.toggle("scrolled", view.scrolled);
    document.body.style.setProperty("--p", p.toFixed(3));
    document.documentElement.style.setProperty("--hp", view.hp.toFixed(3));
  };
  const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
  addEventListener("scroll", on, { passive: true });
  addEventListener("resize", on);
  // Inhalte ändern ihre Höhe (Fokusmodus, neue Posten)
  const ro = new ResizeObserver(on);
  ro.observe(document.body);
  tick();
  return () => { removeEventListener("scroll", on); removeEventListener("resize", on); ro.disconnect(); };
}
