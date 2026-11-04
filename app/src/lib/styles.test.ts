/*
 * Stufen der Oberfläche (#666): keine festen Gefahr-Farben (Token --bad), Umbruchpunkte nur 480 (kleines Handy),
 * 760 (Handy-Ansicht, gleich MOB_MAX) und 980 (schmaler Desktop), keine Schrift unter 11 px.
 */
import { describe, expect, it } from "vitest";
import { MOB_MAX } from "./mobile.svelte";

const raw = { ...import.meta.glob("./ui/*.svelte", { query: "?raw", import: "default", eager: true }), ...import.meta.glob("../styles/*.css", { query: "?raw", import: "default", eager: true }), ...import.meta.glob("../App.svelte", { query: "?raw", import: "default", eager: true }) } as Record<string, string>;
const src = Object.entries(raw).map(([f, s]) => ({ f, s }));

describe("Stufen der Oberfläche (#666)", () => {
  it("liest die Stile", () => { expect(src.length).toBeGreaterThan(100); });
  it("Gefahr-Rot nur als Token", () => {
    expect(src.filter(x => /#c4452e\b/i.test(x.s.replace(/--bad:#C4452E/g, ""))).map(x => x.f)).toEqual([]);
  });
  it("Umbruchpunkte: 480, 760 (= MOB_MAX), 980", () => {
    expect(MOB_MAX).toBe(760);
    const bad = src.flatMap(x => [...x.s.matchAll(/@media[^{]*?\b(max|min)-width: *(\d+)px/g)].map(m => `${m[1]}-${m[2]}`).filter(v => !["max-480", "max-760", "max-980", "min-761", "min-981"].includes(v)).map(v => `${x.f}: ${v}`));
    expect(bad).toEqual([]);
  });
  it("keine Schrift unter 11 px", () => {
    const bad = src.flatMap(x => [...x.s.matchAll(/font(?:-size)?: *(?:\d{3} +)?([\d.]+)px/g)].filter(m => +m[1] < 11).map(m => `${x.f}: ${m[1]}px`));
    expect(bad).toEqual([]);
  });
});

describe("Rückfragen (#670)", () => {
  it("jedes ask(…) nennt die Aktion im Hauptknopf (ok)", () => {
    const bad = src.flatMap(x => x.s.split("\n").filter(l => /\bawait ask\(/.test(l) && !/\bok:/.test(l)).map(l => `${x.f}: ${l.trim().slice(0, 80)}`));
    expect(bad).toEqual([]);
  });
});
