/*
 * Emojis für Import und Realitätscheck (#468, #469), wie in den Kapiteln: immer mit Text daneben oder als aria-label.
 */
import type { Board, Item } from "../model";
import type { ConfKey } from "./ai";
import type { PartId } from "./parts";

export const FIELD_ICON: Record<ConfKey, string> = {
  place: "📍", dates: "📅", people: "👥", price: "💶", flights: "✈", stay: "🛏", cruise: "🚢", board: "🍳", baggage: "🧳", transfer: "🚌"
};
export const PART_ICON: Record<PartId, string> = { flight: "✈", arrival: "🛣", stay: "🛏", access: "🚗", transfer: "🚌", rental: "🚙", fun: "🎟" };
export const BOARD_ICON: Record<Board, string> = { self: "🚫", breakfast: "🍳", half: "🍽", full: "🍲", all: "🍹" };
export const SRC_ICON = { file: "📸", text: "✏", link: "🔗", paste: "📋" } as const;
/** Antworten auf Rückfragen (Verpflegung über BOARD_ICON, Personen mit 👥) */
export const ANSWER_ICON: Record<string, string> = { "baggage.checked": "🧳", "baggage.cabin": "🎒", "transfer.yes": "🚌", "transfer.no": "🚶", dunno: "🤷" };

/** Zeile im Realitätscheck: Emoji nach Posten bzw. Nebenkosten */
export function rowIcon(key: string, it: Item | undefined, part: "offer" | "real" | "whole", extra?: string): string {
  if (key === "real:bag" || extra === "bag") return "🧳";
  if (extra === "citytax" || extra === "tax" || extra === "resort") return "🏛";
  if (extra === "toll" || extra === "vignette") return "🛣";
  if (extra === "ferry" || extra === "ferryPerson" || extra === "cabin") return "⛴";
  if (extra === "cleaning") return "🧹";
  if (extra) return "➕";
  if (key.endsWith(":access")) return "🚗";
  if (key.endsWith(":park") || key.endsWith(":parkB")) return "🅿";
  if (part === "offer") return "💶";
  if (!it) return "💶";
  if (it.auto === "food") return "🍽";
  if (it.auto === "souvenir") return "🎁";
  if (it.auto === "local") return it.hh === "transfer" ? "🚌" : "🚇";
  if (it.hint === "transfer") return "🚌";
  if (it.hint === "rental" || it.rental) return "🚙";
  if (it.arrival || it.hint === "road:car") return "🚗";
  return ({ flights: "✈", stay: "🛏", transport: "🚌", attractions: "🎟" } as Record<string, string>)[it.cat] || "💶";
}
