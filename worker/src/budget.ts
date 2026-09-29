/*
 * Zähler für ausgehende Anfragen des KI-Planers. Cloudflare erlaubt im kostenlosen Tarif höchstens 50 pro Aufruf;
 * eine Flugsuche braucht bis zu 9 (Kiwi 3, Travelpayouts je Flughafenpaar 1), eine Unterkunftssuche 3.
 * Für Gemini bleibt immer `reserve` frei, sonst bricht die ganze Anfrage ab.
 */
export function agentBudget(max = 48, reserve = 8, perSearch = 9, f: typeof fetch = fetch) {
  const b = {
    /** 1 für die Schlüssel der Anmeldeprüfung */
    used: 1,
    /** eine weitere Suche nur, solange danach noch Platz für Gemini bleibt */
    canSearch: () => b.used + perSearch <= max - reserve,
    /** fetch für die Suchen: zählt mit und weigert sich über der Grenze (die Quelle fällt dann aus, Gemini nicht) */
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
      if (b.used >= max - reserve) return Promise.reject(new Error("Anfragelimit dieses Aufrufs erreicht"));
      b.used++;
      return f(input, init);
    }) as typeof fetch
  };
  return b;
}
