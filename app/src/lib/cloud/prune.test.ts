import { describe, expect, it } from "vitest";
import { pruneIndex } from "./prune";

describe("Verzeichnis mit dem Konto abgleichen", () => {
  const ix = [{ id: "lokal" }, { id: "konto" }, { id: "weg" }];
  it("Konto-Reisen raus, woanders gelöschte Konto-Reisen weg, eigene Reisen bleiben", () => {
    expect(pruneIndex(ix, ["konto"], ["konto", "weg"])).toEqual({ index: [{ id: "lokal" }], gone: ["weg"] });
  });
  it("nie im Konto gewesen: bleibt, auch wenn sie nicht in der Liste ist", () => {
    expect(pruneIndex(ix, [], [])).toEqual({ index: ix, gone: [] });
  });
  it("die offene Reise wird nicht weggeräumt (dafür sorgt die Beobachtung der Reise)", () => {
    expect(pruneIndex(ix, [], ["weg"], "weg").gone).toEqual([]);
  });
});
