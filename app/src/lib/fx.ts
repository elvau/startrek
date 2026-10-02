/*
 * Wechselkurse: Referenzkurse der Europäischen Zentralbank (täglich, kostenlos, ohne Schlüssel), Basis Euro.
 * Der Such-Dienst holt sie einmal am Tag und rechnet Preise in fremder Währung um (z. B. Duffel in Pfund).
 */
export const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** Einheiten der Währung pro 1 € (wie trip.settings.rates), mit Stand */
export interface Rates { date: string; rates: Record<string, number> }

/** ECB-XML: <Cube time='2026-10-01'><Cube currency='USD' rate='1.1234'/>… */
export function parseEcb(xml: string): Rates {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1] || "";
  const rates: Record<string, number> = { EUR: 1 };
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const r = +m[2];
    if (r > 0) rates[m[1]] = r;
  }
  return { date, rates };
}

/** Betrag von einer Währung in eine andere; unbekannte Währung: null */
export function convert(amount: number, from: string, to: string, r: Rates | null | undefined): number | null {
  if (from === to) return amount;
  const a = from === "EUR" ? 1 : r?.rates[from], b = to === "EUR" ? 1 : r?.rates[to];
  return a && b ? (amount / a) * b : null;
}

export async function fetchEcb(f: typeof fetch = fetch): Promise<Rates> {
  const res = await f(ECB_URL, { headers: { accept: "application/xml" } });
  if (!res.ok) throw new Error(`EZB-Kurse ${res.status}`);
  const r = parseEcb(await res.text());
  if (Object.keys(r.rates).length < 10) throw new Error("EZB-Kurse unvollständig");
  return r;
}

/**
 * Preise der Anbieter in die Währung der Suche bringen: umgerechnet mit dem Tageskurs, Originalpreis bleibt dabei;
 * ohne Kurs fällt das Angebot weg (ein Pfundpreis als Euro wäre falsch).
 */
export function inCurrency<T extends { currency: string; orig?: { amount: number; currency: string } }>(list: T[], key: "price" | "total", to: string, r: Rates | null | undefined): T[] {
  return list.flatMap(o => {
    const amount = (o as unknown as Record<string, number>)[key];
    if (o.currency === to) return [o];
    const v = convert(amount, o.currency, to, r);
    return v == null ? [] : [{ ...o, [key]: Math.round(v), currency: to, orig: { amount, currency: o.currency } }];
  });
}
