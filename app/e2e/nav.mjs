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

/**
 * „Meine Reisen“ öffnen (#640): Die Startseite zeigt höchstens die zuletzt geöffnete Reise, alle Reisen liegen hinter der
 * Kachel. Auf der Startseite die Kachel antippen, sonst nichts tun; gibt die Seite zurück für p.locator(…).
 */
export async function myTrips(page) {
  // nach dem Laden (Sprache wird ggf. nachgeladen) erst Startseite oder Reise abwarten
  await page.locator(".start, header.top .tmenu").first().waitFor({ timeout: 10000 }).catch(() => {});
  if (!(await page.locator(".start").count()) || (await page.locator(".start .hm-back").count())) return page;
  // Reisen aus dem Konto kommen nach dem Laden etwas später: kurz auf die Kachel warten
  const tile = page.locator(".start .home-mine");
  if (await tile.waitFor({ timeout: 10000 }).then(() => true, () => false)) await tile.click();
  return page;
}

/** Zurück zu den Einstiegen der Startseite, falls „Meine Reisen“ offen ist (#640); gibt die Seite zurück */
export async function startPage(page) {
  const back = page.locator(".start .hm-back");
  if (await back.count()) await back.click();
  return page;
}
