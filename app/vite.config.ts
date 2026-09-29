import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// BASE wird beim Deploy gesetzt (Testumgebung /startrek/, splitandfly.com /), lokal reicht "/"
export default defineConfig({
  base: process.env.BASE || "/",
  plugins: [svelte()],
  // Firebase liegt in einem eigenen Paket und wird nur mit Konfiguration geladen
  build: { chunkSizeWarningLimit: 700 },
  // Tests der App und des Such-Dienstes (worker/src)
  test: { include: ["src/**/*.test.ts", "../worker/src/**/*.test.ts"] },
  // App-Stand für Fehlermeldungen: Commit aus GitHub Actions, lokal „dev“
  define: { __APP_VERSION__: JSON.stringify((process.env.GITHUB_SHA || "dev").slice(0, 7)) }
});
