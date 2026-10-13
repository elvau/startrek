/** Ob die Karte den Hinweis „nicht geladen“ zeigt: nur wenn der Stil vor dem ersten `load` scheitert.
 *  Einzelne Kachelfehler danach (Mobilnetz) lassen eine funktionierende Karte stehen. */
export function nextFailed(failed: boolean, ev: "error" | "load", loaded: boolean): boolean {
  if (ev === "load") return false;
  return loaded ? failed : true;
}
