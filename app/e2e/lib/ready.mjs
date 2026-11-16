/* Vor dem ersten Test: Firestore- und Anmelde-Emulator müssen antworten (Playwright wartet selbst nur auf Firestore). */
import { AUTH, FIRESTORE } from "./env.mjs";

export default async function ready() {
  const end = Date.now() + 60_000;
  for (const url of [FIRESTORE, AUTH]) {
    for (;;) {
      if (await fetch(url).then(r => r.ok, () => false)) break;
      if (Date.now() > end) throw new Error(`Emulator antwortet nicht: ${url}`);
      await new Promise(r => setTimeout(r, 250));
    }
  }
}
