import { defineConfig } from "@playwright/test";
import { FIRESTORE, PORT, PROJECT, URL } from "./e2e/lib/env.mjs";

/*
 * Ende-zu-Ende-Tests (npm run test:cloud, einzelner Bereich: npm run test:cloud -- stays).
 * Playwright startet die Vorschau der Emulator-Fassung (dist-emu, vorher npm run build:emu) und die Firebase-Emulatoren
 * selbst; läuft schon eine Vorschau oder ein Emulator, wird er mitbenutzt (nicht auf GitHub).
 * e2e/lokal: ohne Konto und Datenbank, Dateien laufen nebeneinander.
 * e2e/konto: mit Anmeldung oder Daten im Emulator, nacheinander und je Test mit leerem Emulator (e2e/lib/test.mjs).
 */
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.mjs",
  outputDir: "test-results",
  // wartet, bis auch der Anmelde-Emulator antwortet (startet neben Firestore)
  globalSetup: "./e2e/lib/ready.mjs",
  timeout: 120_000,
  forbidOnly: ci,
  // bewusst kein zweiter Versuch: wacklige Tests sollen sichtbar bleiben und repariert werden
  retries: 0,
  reporter: ci ? [["list"], ["github"]] : "list",
  use: {
    baseURL: URL,
    locale: "de-DE",
    viewport: { width: 1280, height: 900 },
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // CHROMIUM: vorhandener Browser statt des von Playwright geladenen (Cloud-Container)
    launchOptions: { executablePath: process.env.CHROMIUM || undefined }
  },
  // drei Viertel der Kerne: daneben laufen Vorschau und Emulatoren
  workers: "75%",
  // konto zuerst: die Kette läuft dann von Anfang an neben den Tests ohne Konto, statt hinterher allein
  projects: [
    { name: "konto", testDir: "e2e/konto", workers: 1 },
    { name: "lokal", testDir: "e2e/lokal" }
  ],
  webServer: [
    {
      command: `npx vite preview --outDir dist-emu --port ${PORT} --strictPort --host 127.0.0.1`,
      url: URL, reuseExistingServer: !ci
    },
    {
      command: `npx firebase emulators:start --only auth,firestore --project ${PROJECT}`,
      url: FIRESTORE, reuseExistingServer: !ci, timeout: 120_000,
      // die Emulatoren laufen als Java-Prozesse darunter: geordnet beenden lassen
      gracefulShutdown: { signal: "SIGINT", timeout: 15_000 }
    }
  ]
});
