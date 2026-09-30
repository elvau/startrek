# Split&Fly – Hinweise für Claude

Reisekostenrechner für Gruppenreisen. App in `app/` (Svelte 5 mit Runes, TypeScript, Vite), Such-Dienst als
Cloudflare Worker in `worker/` (Flüge, Unterkünfte, Events, KI-Planer mit Gemini, Fehlermeldungen), Daten und
Rechtliches in `public/`. Mehr: `README.md`, `docs/` (KONZEPT, RELEASE, FIREBASE, KI, SPRACHEN, BUGS, NUTZUNG).

## Umgebungen und Ablauf
- Testumgebung https://elvau.github.io/startrek/: jeder Push auf einen Branch außer `main` (zuletzt gepushter gewinnt).
- Produktion https://splitandfly.com: jeder Push auf `main` (Firebase Hosting, `release.yml` legt Tag und Release an).
- Worker: deployt nur von `main` (Cloudflare Workers Builds). Secrets nur in Cloudflare, nie im Code oder Chat.
- Firestore-Regeln (`app/firestore.rules`) spielt Dani von Hand in der Firebase-Konsole ein: nach Änderungen Bescheid sagen.
- **Nie ohne ausdrückliches „Release“ von Dani nach `main` mergen.** Release: PR → `main`, CI grün, Merge (merge commit),
  danach den Arbeits-Branch auf `origin/main` zurücksetzen.
- Version in `app/package.json` (`npm version X --no-git-tag-version`) im Release-PR: größere Funktionen mittlere Stelle,
  sonst Patch. Lieber langsam hochzählen.

## Prüfen vor jedem Push
```bash
cd app
npx svelte-check --threshold warning
npx vitest run
npm run test:cloud   # Firebase-Emulator + Playwright (Chromium vorinstalliert), dauert einige Minuten
```
Neue Funktionen bekommen Unit-Tests und, wo sinnvoll, einen Schritt in `app/e2e/*.mjs`.

## Konventionen
- Sprache in Code-Kommentaren, Commits und Antworten an Dani: Deutsch, knapp, wie der umgebende Code.
- Oberfläche in 7 Sprachen (de, en, es, fr, pl, ru, ar; ar von rechts nach links). Neue Texte immer in
  `app/src/lib/i18n/*.ts` für alle Sprachen, Mehrzahl über `.one/.other` (pl/ru mit few/many, ar mit zero/two/few/many).
- Keine Modellnamen im Repo. Commit-Trailer wie bisher (`Co-Authored-By: Claude …`).

## Datenschutz (streng)
- Fehlerberichte liegen im privaten Repo `elvau/splitandfly-bugs`, Bilder im R2-Speicher des Workers
  (`https://startrek.danielbednorz1990.workers.dev/bug-image/…`). Nichts daraus (Texte, Bilder, E-Mail, Kontokennung)
  in dieses öffentliche Repo, in Commits oder PRs übernehmen; nur „Fehlerbericht #N“ nennen.
- Buchungsdaten (Ausweis, Reisepass) nur im Konto (`travelDocs/{uid}`, REST ohne Browser-Cache): nie in localStorage,
  Reisen, KI, Such-Dienst oder Fehlermeldungen.
- Änderungen an erhobenen Daten → `public/datenschutz.html` mitziehen.
