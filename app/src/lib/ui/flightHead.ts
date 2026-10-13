import type { FlightLeg } from "../model";

/** Kopf einer Rundreise (Angebot mit `via`-Strecken): ganze Route und alle Airlines; sonst null (einfacher Flug) */
export function tourHead(legs: FlightLeg[] | undefined): { chain: string[]; carriers: string[]; count: number } | null {
  if (!legs?.some(l => l.dir === "via")) return null;
  const order = [...legs.filter(l => l.dir === "out"), ...legs.filter(l => l.dir === "via"), ...legs.filter(l => l.dir === "back")];
  const chain = order.length ? [order[0].from, ...order.map(l => l.to)] : [];
  const carriers = [...new Set(order.map(l => l.carrier).filter((c): c is string => !!c))];
  return { chain, carriers, count: order.length };
}
