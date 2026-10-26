import { describe, expect, it } from "vitest";
import { byTime, canDelete, chatRows, cleanText, fitSize, isImageFile, linkParts, MAX_IMG, MAX_TEXT, parseMsg, unreadCount, validImg, type ChatMsg } from "./chat";

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso) });
const msg = (id: string, u: string, iso?: string, t = "hi"): ChatMsg => ({ id, u, n: u, t, ...(iso ? { at: Date.parse(iso) } : {}) });

describe("Gruppenchat", () => {
  it("Text: ohne Steuerzeichen, Zeilenumbrüche bleiben, gekürzt", () => {
    expect(cleanText("  Hallo\u0007 Welt \n\nbis morgen 🎳  ")).toBe("Hallo Welt \n\nbis morgen 🎳");
    expect(cleanText("a\n\n\n\n\n\nb")).toBe("a\n\n\nb");
    expect(cleanText("x".repeat(MAX_TEXT + 50))).toHaveLength(MAX_TEXT);
  });

  it("nur Bilder: keine Videos, kein Ton, keine fremden Adressen", () => {
    expect(isImageFile({ type: "image/jpeg" })).toBe(true);
    expect(isImageFile({ type: "image/heic" })).toBe(true);
    expect(isImageFile({ type: "video/mp4" })).toBe(false);
    expect(isImageFile({ type: "audio/ogg" })).toBe(false);
    expect(isImageFile({ type: "image/svg+xml" })).toBe(false);
    expect(validImg("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(validImg("https://example.com/a.jpg")).toBe(false);
    expect(validImg("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(validImg("data:image/jpeg;base64," + "A".repeat(MAX_IMG))).toBe(false);
  });

  it("Bild verkleinern: längere Seite höchstens 1280, kleine bleiben", () => {
    expect(fitSize(4000, 3000)).toEqual({ w: 1280, h: 960 });
    expect(fitSize(1080, 1920)).toEqual({ w: 720, h: 1280 });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
  });

  it("aus Firestore: Zeit aus dem Zeitstempel, kaputte fallen weg", () => {
    expect(parseMsg("a", { u: "anna", n: "Anna", t: "Hi", at: ts("2027-05-01T10:00:00Z") })).toEqual({ id: "a", u: "anna", n: "Anna", t: "Hi", at: Date.parse("2027-05-01T10:00:00Z") });
    expect(parseMsg("b", { u: "anna", t: "Hi", at: null })).toEqual({ id: "b", u: "anna", n: "", t: "Hi" });
    expect(parseMsg("c", { u: "anna", t: "", img: "https://evil.example/x.png" })).toBeNull();
    expect(parseMsg("d", { t: "ohne Konto" })).toBeNull();
    expect(parseMsg("e", { u: "anna", t: "", img: true })?.img).toBe(true);
  });

  it("Reihenfolge: älteste zuerst, eigene noch ohne Serverzeit am Ende", () => {
    const xs = [msg("c", "ben"), msg("b", "anna", "2027-05-01T11:00:00Z"), msg("a", "anna", "2027-05-01T10:00:00Z")].sort(byTime);
    expect(xs.map(m => m.id)).toEqual(["a", "b", "c"]);
  });

  it("Anzeige: Datum beim ersten Eintrag des Tages, Name nur beim Wechsel, eigene ohne Namen", () => {
    const rows = chatRows([
      msg("1", "anna", "2027-05-01T10:00:00"), msg("2", "anna", "2027-05-01T10:01:00"), msg("3", "ben", "2027-05-01T10:02:00"),
      msg("4", "ben", "2027-05-02T09:00:00"), msg("5", "ich", "2027-05-02T09:05:00")
    ], "ich");
    expect(rows.map(r => [r.m.id, r.day ?? "", r.head, r.mine])).toEqual([
      ["1", "2027-05-01", true, false], ["2", "", false, false], ["3", "", true, false],
      ["4", "2027-05-02", true, false], ["5", "", false, true]
    ]);
  });

  it("ungelesen: nur fremde nach dem zuletzt Gelesenen; löschen: eigene oder Besitzer", () => {
    const xs = [msg("1", "anna", "2027-05-01T10:00:00Z"), msg("2", "ich", "2027-05-01T11:00:00Z"), msg("3", "ben", "2027-05-01T12:00:00Z")];
    expect(unreadCount(xs, Date.parse("2027-05-01T10:30:00Z"), "ich")).toBe(1);
    expect(unreadCount(xs, 0, "ich")).toBe(2);
    expect(canDelete(xs[0], "ich", false)).toBe(false);
    expect(canDelete(xs[0], "ich", true)).toBe(true);
    expect(canDelete(xs[1], "ich", false)).toBe(true);
  });

  it("Links: nur http(s), Satzzeichen am Ende gehören nicht dazu", () => {
    expect(linkParts("Schaut mal: https://splitandfly.com/x?a=1. Super!")).toEqual([
      { s: "Schaut mal: " }, { s: "https://splitandfly.com/x?a=1", href: "https://splitandfly.com/x?a=1" }, { s: ". Super!" }
    ]);
    expect(linkParts("javascript:alert(1) und www.x.de")).toEqual([{ s: "javascript:alert(1) und www.x.de" }]);
    expect(linkParts("")).toEqual([]);
  });
});
