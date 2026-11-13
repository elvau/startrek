# Tests

Drei Ebenen, alle unter `app/` gestartet. Schnell vor jedem Push, alles bei Pull Requests (`.github/workflows/pruefen.yml`).

| Ebene | Wo | Start | Dauer |
| --- | --- | --- | --- |
| Logik (vitest) | `app/src/**/*.test.ts`, `worker/src/**/*.test.ts` | `npx vitest run` | ca. 20 s |
| Sicherheitsregeln (vitest + Firestore-Emulator) | `app/rules-test/` | `npm run test:rules` | ca. 15 s |
| Ende-zu-Ende (Playwright + Emulatoren) | `app/e2e/` | `npm run test:cloud` | ca. 6 min |

## Logik

- Gruppen `app` und `worker`: eine allein mit `npx vitest run --project worker` (oder `npm test` in `worker/`).
- Eine Datei: `npx vitest run src/lib/store.usecases.test.ts`. Namen: `x.test.ts` neben `x.ts`; `x.usecases.test.ts` für
  Abläufe aus Sicht der Nutzer.
- `npm run test:coverage`: welche Zeilen der Logik die Tests erreichen (Bericht in `app/coverage/`, ohne Schwelle).
  Stand November 2026: 82 % der Zeilen; offen sind vor allem Module, die nur mit Konto oder Browser arbeiten
  (`cloud/`, `polls.svelte.ts`, `scroll.svelte.ts`), die decken die Ende-zu-Ende-Tests ab.

## Sicherheitsregeln

- `rules.test.ts`: Regeln über die Firebase-Bibliothek, je Test eine leere Datenbank.
- `rest.test.mjs`: von außen über die REST-Schnittstelle wie ein Angreifer ohne App. Die Abschnitte bauen aufeinander
  auf (eine Reise, die sich Schritt für Schritt ändert): Reihenfolge nicht ändern.

## Ende-zu-Ende

`npm run test:cloud` baut die Emulator-Fassung (`dist-emu`) und startet Playwright (`app/playwright.config.mjs`).
Playwright startet die Vorschau und die Firebase-Emulatoren selbst und beendet sie wieder; läuft schon eine Vorschau oder
ein Emulator, wird er mitbenutzt.

```bash
npm run test:cloud                   # alles
npm run test:cloud -- stays          # ein Bereich (Teil des Dateinamens)
npm run test:cloud -- -g "Roadtrip"  # Tests, deren Titel passt
npx playwright test stays --ui       # zum Zusehen und Schritt für Schritt (nach npm run build:emu)
E2E_ZEIT=1 npm run test:cloud -- stays   # Sekunden je Zwischenstand: zeigt, welcher Schritt lange dauert
```

In Cloud-Containern mit vorhandenem Browser: `CHROMIUM=/opt/pw-browsers/chromium` davor.

### Aufbau

- `e2e/lokal/`: ohne Konto und ohne Datenbank (Reisen liegen im Browser, der Such-Dienst ist nachgestellt). Die Dateien
  laufen nebeneinander.
- `e2e/konto/`: mit Anmeldung oder Daten im Emulator. Laufen nacheinander, und jeder Test beginnt mit leerem Emulator
  (keine Konten, keine Dokumente). Kein Test hängt von einem anderen oder von der Reihenfolge ab.
- `e2e/lib/`: gemeinsame Grundlage. `test.mjs` (alle Tests), `konto.mjs` (dazu Anmeldung und Emulator-Zugriff),
  `nav.mjs` (Wege durch die App), `env.mjs` (Adressen).
- `e2e/tools/`, `e2e/anleitung-shots.mjs`: Bildschirmfotos, keine Tests.

### Einen Test schreiben

```js
import { test, fail, log, until, seedTrips, URL, myTrips } from "../lib/test.mjs";

test("Kurtaxe steht an der Unterkunft", async ({ open }) => {
  const p = await open({ init: seedTrips([TRIP]), data: true });
  await p.goto(URL);
  await (await myTrips(p)).locator(".home-trip", { hasText: "Split" }).click();
  await until(async () => (await p.locator(".xc").innerText()).includes("Kurtaxe"), "Kurtaxe angezeigt");
  log("Kurtaxe an der Unterkunft");
});
```

- `open({ … })` öffnet eine Seite in eigenem Browser-Kontext: ohne Angabe Desktop, `...PHONE` oder `...TOUCH` fürs Handy,
  `init: seedTrips([…])` für Reisen als Startzustand, `data: true` für die Ortsdaten aus `public/`, `name` bei mehreren
  Personen. Fehler auf der Seite lassen den Test scheitern (`ignore: /…/` für Fehler, die zum Test gehören).
- `until(fn, was)` wartet auf eine Bedingung; `soon(fn)` ebenso, ohne Fehler (die Prüfung danach meldet den Stand).
  Feste Wartezeiten (`waitForTimeout`) nur, wo geprüft wird, dass etwas ausbleibt, oder es kein Zeichen zum Warten gibt;
  dann mit Kommentar, warum.
- `log(text)` steht in der Ausgabe und als Schritt im Bericht: zeigt, wie weit ein gescheiterter Test kam.
- Such-Dienst nachstellen: `p.route("https://flights.test/…", r => reply(r, { … }))`.
- Mit Konto: `test`, `login`, `adminPut`, `adminGet`, `FS` aus `../lib/konto.mjs`.
- Ein Test je unabhängigem Ablauf. Lange Geschichten mit mehreren Personen (z. B. `konto/cloud.spec.mjs`) bleiben ein Test.

### Wenn ein Test scheitert

Unter `app/test-results/<Test>/` liegen Bildschirmfoto, Seitenzustand und die Spur:
`npx playwright show-trace test-results/<Test>/trace.zip` zeigt jeden Schritt mit Bild, Netz und Konsole. Auf GitHub hängen
dieselben Dateien als Artefakt `e2e-spuren-N` am Lauf. Es gibt bewusst keinen zweiten Versuch: wacklige Tests sollen
sichtbar bleiben und repariert werden.

### GitHub

Ändert ein Pull Request nur Doku (`docs/`, `*.md`), entfallen die Prüfungen (Job „Umfang“); die Checks gelten dann als
bestanden. Der Job „Tests und Typen“ schreibt die Größen der gebauten App in die Zusammenfassung des Laufs
(`scripts/groessen.mjs`, Richtwert für den Start-Chunk 450 kB gzip, darüber nur eine Warnung).

Alle Jobs beginnen mit demselben Aufbau (`.github/actions/aufbau`: Node aus `.nvmrc`, `npm ci`, wahlweise Such-Dienst,
Emulatoren, Browser).

`pruefen.yml` teilt die Ende-zu-Ende-Tests auf vier Läufe nebeneinander (mit und ohne Konto, je zweigeteilt über
`--shard`), jeder mit eigenem Emulator. Der Check „Konto und Teilen (Firebase-Emulator)“ fasst Regeln und alle vier
Teile zusammen.
