/* Bildschirmfotos einfacher Modus und Gruppen (nur zur Sichtprüfung) */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const OUT = process.env.OUT || ".";
const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4174", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
try {
  for (const [n, vp] of [["d", { width: 1280, height: 860 }], ["m", { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp, locale: "de-DE" });
    await p.goto("http://127.0.0.1:4174/");
    await p.evaluate(() => {
      localStorage.setItem("rk2-dir", JSON.stringify({ people: [{ id: "d", first: "Dani", last: "Klein" }, { id: "m", first: "Monika", last: "Klein" }, { id: "u", first: "Uwe", last: "Schmitz", age: 52 }], groups: [{ id: "g1", name: "Familie Klein", memberIds: ["d", "m"] }, { id: "g2", name: "Kegeln", memberIds: ["m", "u"] }] }));
      const t = { id: "k1", name: "Kegeltour Mosel", place: "Cochem", country: "Deutschland", from: "2027-05-14", to: "2027-05-16", travelers: [{ id: "a", personId: "d", name: "Dani", household: "Klein", age: 36, color: "#D2693C" }, { id: "b", personId: "m", name: "Monika", household: "Klein", age: 35, color: "#2F6FDB" }, { id: "c", personId: "u", name: "Uwe", household: "Schmitz", age: 52, color: "#1F8A70", active: false }], items: [], tiers: {}, settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 }, simple: { flights: 0, stay: 420, transport: 90 } };
      localStorage.setItem("rk2-t:k1", JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: "k1", name: t.name, place: t.place }])); localStorage.setItem("rk2-current", "k1");
    });
    await p.reload(); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/g-${n}-hero.png` });
    for (const id of ["trav", "stay"]) {
      await p.evaluate(id => { const c = document.querySelector(`#${id} .card`); scrollTo({ top: scrollY + c.getBoundingClientRect().top - innerHeight * 0.3, behavior: "instant" }); }, id);
      await p.waitForTimeout(300); await p.evaluate(() => scrollBy(0, 1)); await p.waitForTimeout(1300);
      await p.screenshot({ path: `${OUT}/g-${n}-${id}.png` });
    }
    if (n === "d") {
      await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
      await p.locator(".hero .tm-btn").first().click(); await p.locator(".tm-act", { hasText: "+ Neue Reise" }).click();
      await p.locator(".newtrip .who-b", { hasText: "Gruppe" }).click();
      await p.locator(".newtrip .src-b", { hasText: "Aus meinen Gruppen" }).click();
      await p.locator(".newtrip .sg-h", { hasText: "Kegeln" }).click(); await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}/g-d-newtrip.png` });
      await p.locator(".newtrip .linkbtn", { hasText: "Gruppen und Personen" }).click(); await p.waitForTimeout(400);
      await p.screenshot({ path: `${OUT}/g-d-groups.png` });
    }
    await p.close();
  }
} finally { await b.close(); server.kill(); }
