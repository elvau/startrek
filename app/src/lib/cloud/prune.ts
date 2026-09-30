/*
 * Verzeichnis auf dem Gerät mit der Liste im Konto abgleichen (nur mit frischem Stand vom Server):
 * Konto-Reisen gehören nicht ins Verzeichnis (das zeigt die Liste im Konto), und Reisen, die früher im Konto waren und
 * jetzt fehlen (auf einem anderen Gerät gelöscht oder verlassen), sind weg: Eintrag und Kopie auf dem Gerät räumen.
 * Sonst tauchen sie als „nur auf diesem Gerät“ wieder auf und „Ins Konto übernehmen“ würde sie wiederherstellen.
 */
export function pruneIndex<T extends { id: string }>(index: T[], cloudIds: string[], seen: string[], current?: string): { index: T[]; gone: string[] } {
  const now = new Set(cloudIds);
  const gone = seen.filter(id => !now.has(id) && id !== current);
  const drop = new Set([...now, ...gone]);
  return { index: index.filter(m => !drop.has(m.id)), gone };
}
