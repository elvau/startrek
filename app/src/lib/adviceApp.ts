/* Warnstufen des Auswärtigen Amts über den Such-Dienst (/advice), einmal je Sitzung; ohne Such-Dienst oder bei Fehlern leer */
import { FLIGHTS_URL } from "./flights/app";
import type { AdviceMap } from "./advice";
import type { GovMap } from "./govadvice";

let adv: Promise<AdviceMap> | undefined;
export function loadAdvice(): Promise<AdviceMap> {
  return (adv ??= FLIGHTS_URL ? fetch(`${FLIGHTS_URL}/advice`).then(r => (r.ok ? r.json() : null)).then(d => (d?.countries as AdviceMap) || {}).catch(() => ({})) : Promise.resolve({}));
}

/** Reisehinweise der eigenen Regierungen für ein Reiseland (#164): an den Such-Dienst geht nur das Reiseland */
const govCache = new Map<string, Promise<GovMap>>();
export function loadGovAdvice(cc: string): Promise<GovMap> {
  if (!FLIGHTS_URL || !/^[A-Z]{2}$/.test(cc)) return Promise.resolve({});
  let p = govCache.get(cc);
  if (!p) {
    p = fetch(`${FLIGHTS_URL}/advice/gov?cc=${cc}`).then(r => (r.ok ? r.json() : null)).then(d => (d?.sources as GovMap) || {}).catch(() => ({}));
    govCache.set(cc, p);
  }
  return p;
}
