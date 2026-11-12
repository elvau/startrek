import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// BASE wird beim Deploy gesetzt (Testumgebung /startrek/, splitandfly.com /), lokal reicht "/"
export default defineConfig({
  base: process.env.BASE || "/",
  plugins: [svelte()],
  // Firebase liegt in einem eigenen Paket und wird nur mit Konfiguration geladen
  // zweite Seite: Weiterleitung für Links aus dem KI-Konnektor (go/index.html, src/go.ts)
  build: { chunkSizeWarningLimit: 700, rollupOptions: { input: { main: "index.html", go: "go/index.html" } } },
  // Tests der App und des Such-Dienstes (worker/src) als zwei Gruppen; eine allein: npx vitest run --project worker
  test: {
    projects: [
      { extends: true, test: { name: "app", include: ["src/**/*.test.ts"] } },
      { extends: true, test: { name: "worker", include: ["../worker/src/**/*.test.ts"] } }
    ],
    // npm run test:coverage: welche Zeilen der Logik die Tests erreichen (Bericht in coverage/, ohne Schwelle)
    coverage: {
      provider: "v8", reporter: ["text-summary", "html"], reportsDirectory: "coverage",
      include: ["src/lib/**/*.ts", "../worker/src/**/*.ts"], exclude: ["**/*.test.ts", "src/lib/i18n/**", "src/lib/guide/pages.ts", "src/lib/seo/**"]
    }
  },
  // Version aus package.json (in der App unten sichtbar), Commit aus GitHub Actions (lokal „dev“) für Fehlermeldungen
  define: {
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version),
    __APP_COMMIT__: JSON.stringify((process.env.GITHUB_SHA || "dev").slice(0, 7))
  }
});
