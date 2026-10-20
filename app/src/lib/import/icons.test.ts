import { describe, expect, it } from "vitest";
import type { Item } from "../model";
import { BOARD_ICON, FIELD_ICON, PART_ICON, rowIcon } from "./icons";
import { CONF_KEYS } from "./ai";

const it0 = (x: Partial<Item>): Item => ({ id: "i", cat: "transport", name: "", status: "idea", options: [], ...x });

describe("Emojis im Import und Realitätscheck (#468, #469)", () => {
  it("jede Angabe, jeder Baustein und jede Verpflegung hat ein Emoji", () => {
    for (const k of CONF_KEYS) expect(FIELD_ICON[k]).toBeTruthy();
    expect(Object.keys(PART_ICON).sort()).toEqual(["access", "arrival", "flight", "fun", "rental", "stay", "transfer"]);
    expect(Object.keys(BOARD_ICON).sort()).toEqual(["all", "breakfast", "full", "half", "self"]);
  });
  it("Zeilen: Angebot, Anreise, Koffer, Kurtaxe, Essen, Transfer, Mietwagen, Souvenirs", () => {
    expect(rowIcon("i", it0({ cat: "stay" }), "offer")).toBe("💶");
    expect(rowIcon("i:access", it0({ cat: "flights" }), "real")).toBe("🚗");
    expect(rowIcon("real:bag", undefined, "real")).toBe("🧳");
    expect(rowIcon("i:x0", it0({ cat: "stay" }), "real", "citytax")).toBe("🏛");
    expect(rowIcon("f", it0({ auto: "food" }), "real")).toBe("🍽");
    expect(rowIcon("l", it0({ auto: "local", hh: "transfer" }), "real")).toBe("🚌");
    expect(rowIcon("r", it0({ hint: "rental" }), "whole")).toBe("🚙");
    expect(rowIcon("s", it0({ auto: "souvenir" }), "whole")).toBe("🎁");
    expect(rowIcon("a", it0({ arrival: true }), "whole")).toBe("🚗");
  });
});
