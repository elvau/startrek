/* Reisebeobachtung in der App: Nachsuche starten, Fortschritt, Ergebnis an der Reise speichern */
import { app } from "./store.svelte";
import { checkTrip } from "./watch";
import { searchFlights } from "./flights/app";
import { searchStaysRemote } from "./stays/app";

export const watchRun = $state({ busy: false, done: 0, of: 0, err: "" });

export async function runWatch() {
  if (watchRun.busy) return;
  const trip = app.trip;
  watchRun.busy = true; watchRun.err = "";
  try {
    const w = await checkTrip(JSON.parse(JSON.stringify(trip)), { flights: q => searchFlights(q), stays: q => searchStaysRemote(q) }, (d, n) => { watchRun.done = d; watchRun.of = n; });
    // inzwischen eine andere Reise geöffnet: Ergebnis gehört zur alten
    if (app.trip.id === trip.id) app.trip.watch = w;
  } catch (e) { watchRun.err = (e as Error).message; }
  finally { watchRun.busy = false; }
}
