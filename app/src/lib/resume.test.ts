import { describe, expect, it } from "vitest";
import { readView, saveView } from "./resume";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("resume", () => {
  it("merkt Reise und Scrollstand", () => {
    const s = mem();
    saveView({ id: "t1", y: 1234.6 }, s);
    expect(readView(s)).toEqual({ id: "t1", y: 1235 });
  });
  it("Startseite löscht den Stand", () => {
    const s = mem();
    saveView({ id: "t1", y: 5 }, s);
    saveView(null, s);
    expect(readView(s)).toBeNull();
  });
  it("kaputte Werte ergeben nichts", () => {
    const s = mem();
    s.setItem("rk-view", "{x");
    expect(readView(s)).toBeNull();
    s.setItem("rk-view", JSON.stringify({ id: 3, y: "a" }));
    expect(readView(s)).toBeNull();
  });
});
