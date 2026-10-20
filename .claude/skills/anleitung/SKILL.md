---
name: anleitung
description: Nutzer-Anleitung von Split&Fly (/anleitung/) pflegen. Nutzen, wenn eine Funktion neu, geändert oder entfernt ist, oder wenn nach Anleitung, Hilfe oder Doku für Endnutzer gefragt wird.
---
# Anleitung pflegen

Quelle: `app/src/lib/guide/pages.ts` (Texte, je Thema eine Seite), `app/src/lib/guide/art.ts` (Szenen). `scripts/anleitung.mjs` erzeugt
beim Zusammenstellen (`scripts/site.sh`) statische Seiten unter `/anleitung/`. Footer-Link: `foot.guide` in `app/src/lib/i18n/*.ts`.

## Regeln
- Nur beschreiben, was die App heute kann. Bezeichnungen wortgleich aus `app/src/lib/i18n/de.ts` (Kapitel „Abheben“, Status „Gewählt“ …). Unklar? Im Code nachsehen, nicht raten.
- Du-Form, kurze Sätze, Schritte in der Reihenfolge der App. Je Seite: `steps` (mind. 4), `tips` (mind. 3), `faq` (mind. 2), `where` (Ort in der App).
- Keine Modellnamen, keine Inhalte aus Fehlerberichten, keine Daten aus Konten.
- Neue Funktion: passende Seite ergänzen oder neue Seite in `GUIDE` und `GUIDE_ART` (Szene und Alt-Text) anlegen, `GUIDE_STAND` anheben.
- Die Anleitung ist nur Deutsch (wie `/reise/`); der Footer-Link nennt das in den anderen Sprachen.

## Bilder und Interaktives
- Echte Screenshots aus der App: `app/src/lib/guide/shots/*.jpg`, Lage der roten Markierungen in `shots/spots.json`. Neu erzeugen, wenn sich die Oberfläche ändert:
  `cd app && npm run build:emu && CHROMIUM=/opt/pw-browsers/chromium node e2e/anleitung-shots.mjs /tmp/shots`, dann `*.jpg` und `spots.json` nach `shots/` kopieren (`misc.jpg` und den Eintrag `misc` weglassen). Das Skript legt eine Demo-Reise (Kroatien, zwei Familien) an; Texte zum Suchen der Markierungen stehen in `SPOTS` darin und müssen zur Oberfläche passen.
- Je Seite `shots: [{ img, alt, caption, pins }]`; `pins` nennt Schlüssel aus `spots.json` und ihre Erklärung (Reihenfolge = Nummer). Test `guide.test.ts` prüft, dass jede Markierung existiert.
- `emoji` je Seite wie in der App verwenden. Schritte sind abhakbar (Fortschritt in `localStorage`, Schlüssel `sf-guide`), FAQ als `<details>`; `demo: "status" | "split"` blendet eine Mini-Demo ein.
- Bilder zeigen nie echte Daten, nur die Demo-Reise.

## Prüfen
```bash
cd app && npx vitest run src/lib/guide && npx svelte-check --threshold warning
node --experimental-strip-types --no-warnings ../scripts/anleitung.mjs /tmp/anleitung-out   # Seiten erzeugen, im Browser ansehen
```
Neue Szene vorher als Bild ansehen (Playwright-Screenshot), Stil siehe Skill `zeichenstil`.
