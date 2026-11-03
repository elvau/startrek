/*
 * Schwebende Knöpfe (KI, Fehler melden, Gruppenchat) am Handy (#663): beim Herunterscrollen weg, damit sie keine
 * Bedienelemente verdecken; beim Hochscrollen, oben auf der Seite und beim Wechsel der Seite wieder da.
 * Ein Lauscher für alle scrollenden Bereiche (Seite und Wischseiten des Pagers).
 */
export const FAB_HIDE_AFTER = 60;

/** neue Lage: true = ausblenden, false = zeigen, null = unverändert (kleine Bewegungen) */
export function fabState(prevY: number, y: number, prevX = 0, x = 0): boolean | null {
  // Seitenwechsel im Pager (nicht der kleine Anstupser am Rand)
  if (Math.abs(x - prevX) > 120) return false;
  if (x !== prevX) return null;
  if (y <= FAB_HIDE_AFTER) return false;
  if (Math.abs(y - prevY) < 6) return null;
  return y > prevY;
}

export function hideFabsOnScroll(): () => void {
  const last = new WeakMap<Element, [number, number]>();
  const on = (e: Event) => {
    const el = e.target instanceof Element ? e.target : document.scrollingElement;
    if (!el || !document.body.classList.contains("mob")) return;
    const [py, px] = last.get(el) ?? [el.scrollTop, el.scrollLeft];
    const s = fabState(py, el.scrollTop, px, el.scrollLeft);
    last.set(el, [el.scrollTop, el.scrollLeft]);
    if (s != null) document.body.classList.toggle("fab-hide", s);
  };
  addEventListener("scroll", on, { capture: true, passive: true });
  return () => { removeEventListener("scroll", on, { capture: true }); document.body.classList.remove("fab-hide"); };
}
