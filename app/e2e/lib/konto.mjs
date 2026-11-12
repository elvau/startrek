/*
 * Tests mit Konto oder Daten im Firebase-Emulator: wie ./test.mjs, dazu vor jedem Test ein leerer Emulator
 * (keine Konten, keine Dokumente), damit kein Test von einem anderen abhängt. Diese Tests laufen nacheinander.
 */
import { test as base } from "./test.mjs";
import { resetEmu } from "./emu.mjs";

export * from "./test.mjs";
export * from "./emu.mjs";
export { AUTH, FIRESTORE, FS, PROJECT } from "./env.mjs";

export const test = base.extend({
  emu: [async ({}, use) => { await resetEmu(); await use(); }, { auto: true }]
});

/** Test-Anmeldung der Emulator-Fassung (Dialog „Anmelden“ muss offen sein): Konto name@test.de */
export async function login(p, name) {
  await p.locator(".login .test input").fill(name);
  await p.locator(".login .test button").click();
  await p.locator(".acct-btn").first().waitFor({ timeout: 15000 });
}
