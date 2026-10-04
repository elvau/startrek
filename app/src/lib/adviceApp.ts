/* Warnstufen des Auswärtigen Amts über den Such-Dienst (/advice), einmal je Sitzung; ohne Such-Dienst oder bei Fehlern leer */
import { FLIGHTS_URL } from "./flights/app";
import type { AdviceMap } from "./advice";

let adv: Promise<AdviceMap> | undefined;
export function loadAdvice(): Promise<AdviceMap> {
  return (adv ??= FLIGHTS_URL ? fetch(`${FLIGHTS_URL}/advice`).then(r => (r.ok ? r.json() : null)).then(d => (d?.countries as AdviceMap) || {}).catch(() => ({})) : Promise.resolve({}));
}
