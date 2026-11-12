/*
 * Vorschau der Emulator-Fassung (dist-emu) für Werkzeuge außerhalb des Test-Runners (Bildschirmfotos):
 * starten, auf die erste Antwort warten, am Ende samt Kindprozess beenden.
 */
import { spawn } from "node:child_process";

export async function preview(port) {
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore", detached: true });
  // npx startet vite als Kindprozess: die ganze Gruppe beenden, sonst bleibt die Vorschau liegen und belegt den Port
  const stop = () => { try { process.kill(-server.pid); } catch { /* schon beendet */ } };
  const end = Date.now() + 20000;
  while (!(await fetch(url).then(r => r.ok, () => false))) {
    if (Date.now() > end) { stop(); throw new Error("Vorschau antwortet nicht: " + url + " (vorher npm run build:emu?)"); }
    await new Promise(r => setTimeout(r, 150));
  }
  return { url, stop };
}
