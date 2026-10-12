/*
 * Neu laden und auf der Startseite landen, ohne Wettlauf mit der App (#319).
 * Die alte Seite schreibt sonst noch nach dem Leeren: den Merkstand der Reise (sessionStorage, Scroll-Timer) und
 * ausstehende Speicherungen beim Verlassen (pagehide). Dann öffnet das Neuladen die Reise statt der Startseite,
 * oder ein eingespielter Stand wird überschrieben. Deshalb ab hier Schreibzugriffe der alten Seite verwerfen:
 * sessionStorage immer, localStorage nur, wenn ein Stand eingespielt wird (set/remove).
 */
export async function reloadHome(page, { url, set, remove } = {}) {
  const inject = !!(set || remove);
  await page.evaluate(([set, remove, inject]) => {
    sessionStorage.clear();
    for (const k of remove || []) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(set || {})) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    const write = Storage.prototype.setItem, del = Storage.prototype.removeItem;
    const blocked = s => s === sessionStorage || (inject && s === localStorage);
    Storage.prototype.setItem = function (k, v) { if (!blocked(this)) write.call(this, k, v); };
    Storage.prototype.removeItem = function (k) { if (!blocked(this)) del.call(this, k); };
  }, [set, remove, inject]).catch(() => {});
  await (url ? page.goto(url) : page.reload());
}
