import { describe, expect, it } from "vitest";
import { exactPostal, homeText, parsePostal, rowHome, shortCode, suggestPostal } from "./home";

const AT = parsePostal("1010\tWien\t48.208\t16.373\n1020\tWien\t48.217\t16.396\n4020\tLinz\t48.306\t14.287\nkaputt\n");
const NL = parsePostal("1011\tAmsterdam\t52.373\t4.900\n10110\tTest\t1\t2\n");
const GB = parsePostal("SW1A\tLondon\t51.501\t-0.141\nSW1\tLondon\t51.5\t-0.14\n");

describe("Wohnort je Land (#163)", () => {
  it("liest die Datei je Land, kaputte Zeilen fallen weg", () => {
    expect(AT).toHaveLength(3);
    expect(AT[0]).toEqual(["1010", "Wien", 48.208, 16.373]);
  });
  it("Vorschläge nach PLZ oder Ort, ohne Doppelte", () => {
    expect(suggestPostal(AT, "10").map(r => r[0])).toEqual(["1010", "1020"]);
    expect(suggestPostal(AT, "lin").map(r => r[1])).toEqual(["Linz"]);
    expect(suggestPostal(GB, "sw1a").map(r => r[0])).toEqual(["SW1A"]);
    expect(suggestPostal(AT, " ")).toEqual([]);
  });
  it("vollständige PLZ nur, wenn keine längere so anfängt", () => {
    expect(exactPostal(AT, "1010")?.[1]).toBe("Wien");
    // „1011“ ist noch nicht eindeutig, solange „10110“ existiert
    expect(exactPostal(NL, "1011")).toBeUndefined();
    expect(exactPostal(NL, "10110")?.[1]).toBe("Test");
    expect(exactPostal(GB, "SW1")).toBeUndefined();
    expect(exactPostal(GB, "sw1a")?.[0]).toBe("SW1A");
    expect(shortCode("PT", "1000-001")).toBe("1000");
    expect(shortCode("AT", "1010")).toBe("1010");
    expect(shortCode("PT", "1000")).toBe("1000");
    expect(shortCode("GB", "SW1A 1AA")).toBe("SW1A");
    expect(shortCode("GB", "sw1a1aa")).toBe("sw1a");
    expect(shortCode("GB", "SW1A")).toBe("SW1A");
    expect(shortCode("GB", "SW1A 1")).toBe("SW1A 1");
    expect(shortCode("NL", "1012 AB")).toBe("1012");
    expect(shortCode("NL", "1012AB")).toBe("1012");
    expect(shortCode("NL", "1012")).toBe("1012");
    expect(shortCode("IE", "D02 X285")).toBe("D02");
    expect(shortCode("IE", "D02")).toBe("D02");
    expect(shortCode("MT", "ATD 1234")).toBe("ATD");
    expect(shortCode("MT", "ATD")).toBe("ATD");
  });
  it("Wohnort mit Land und Text", () => {
    const h = rowHome("AT", AT[2]);
    expect(h).toEqual({ cc: "AT", plz: "4020", ort: "Linz", lat: 48.306, lon: 14.287 });
    expect(homeText(h)).toBe("4020 Linz");
    expect(homeText({ plz: "", ort: "Tokio" })).toBe("Tokio");
    expect(homeText(undefined)).toBe("");
  });
});
