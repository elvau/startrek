/* Preise prüfen in der App: Nachsuche starten, Fortschritt, Ergebnis an der Reise speichern */
import { netMessage } from "./neterror";
import { app } from "./store.svelte";
import { applyRefresh, findCheaper, refreshTrip, type Searchers } from "./watch";
import { searchFlights } from "./flights/app";
import { searchStaysRemote } from "./stays/app";

export const watchRun = $state({ busy: false, done: 0, of: 0, err: "" });
/** Posten, für die gerade ein günstigeres Angebot gesucht wird */
export const cheaperRun = $state<Record<string, boolean>>({});

// Preisbeobachtung: keine Testpreise (Sandbox-Zugänge), sonst meldet sie ein Schnäppchen, das es nicht gibt
const searchers: Searchers = {
  flights: q => searchFlights(q).then(r => ({ ...r, offers: r.offers.filter(o => !o.test) })),
  stays: q => searchStaysRemote(q).then(r => ({ ...r, offers: r.offers.filter(o => !o.test) }))
};

export async function runWatch() {
  if (watchRun.busy) return;
  const trip = app.trip;
  watchRun.busy = true; watchRun.err = "";
  try {
    const res = await refreshTrip(JSON.parse(JSON.stringify(trip)), searchers, (d, n) => { watchRun.done = d; watchRun.of = n; });
    // inzwischen eine andere Reise geöffnet: Ergebnis gehört zur alten
    if (app.trip.id === trip.id) applyRefresh(app.trip, res);
  } catch (e) { watchRun.err = netMessage(e); }
  finally { watchRun.busy = false; }
}

export async function runCheaper(itemId: string) {
  if (cheaperRun[itemId]) return;
  const trip = app.trip;
  const it = trip.items.find(i => i.id === itemId);
  if (!it) return;
  cheaperRun[itemId] = true;
  try {
    const copy: typeof trip = JSON.parse(JSON.stringify(trip));
    const h = await findCheaper(copy, copy.items.find(i => i.id === itemId)!, searchers);
    if (h && app.trip.id === trip.id) {
      app.trip.watch ||= { at: "", items: {} };
      app.trip.watch.items[itemId] = h;
    }
  } finally { delete cheaperRun[itemId]; }
}
