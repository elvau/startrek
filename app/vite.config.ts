import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// BASE wird beim Deploy gesetzt (Testumgebung /startrek/, splitandfly.com /), lokal reicht "/"
export default defineConfig({
  base: process.env.BASE || "/",
  plugins: [svelte()],
  // Firebase liegt in einem eigenen Paket und wird nur mit Konfiguration geladen
  build: { chunkSizeWarningLimit: 700 },
  test: { include: ["src/**/*.test.ts"] }
});
