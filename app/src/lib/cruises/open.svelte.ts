/* Kreuzfahrt-Dialog (#519, #520) von überall öffnen: Kapitel-Knopf (neue Kreuzfahrt) oder Kreuzfahrt-Karte (weitere Fahrt als Angebot) */
export const cruiseDlg = $state<{ open: boolean; itemId?: string }>({ open: false });

export function openCruise(itemId?: string) {
  cruiseDlg.itemId = itemId;
  cruiseDlg.open = true;
}
