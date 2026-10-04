# Split&Fly – Hinweise für Claude

Reisekostenrechner für Gruppenreisen. App in `app/` (Svelte 5 mit Runes, TypeScript, Vite), Such-Dienst als
Cloudflare Worker in `worker/` (Flüge, Unterkünfte, Events, KI-Planer mit Gemini, Fehlermeldungen), Daten und
Rechtliches in `public/`. Mehr: `README.md`, `docs/` (KONZEPT, RELEASE, FIREBASE, KI, KONNEKTOR, SPRACHEN, BUGS, NUTZUNG, ZIELE = besondere Ziele, OFFEN = Merkliste,
`claude2claude.md` = Einrichtung der Routinen, ABLAUF = Planung in Epics/Features).

## Umgebungen und Ablauf
- Branches: Arbeits-Branch je Sitzung oder Routine (`claude/…`) → **`pre-release`** (Sammelstand) → `main` (Produktion).
- Testumgebung https://elvau.github.io/startrek/: jeder Push auf `pre-release`, nur gebaut, ohne Prüfung. Zum Ausprobieren
  den Arbeits-Branch nach den schnellen Prüfungen in `pre-release` mergen (merge commit) und pushen. Andere Branches
  landen nicht auf der Testumgebung.
- Produktion https://splitandfly.com: jeder Push auf `main` (Firebase Hosting, `release.yml` legt Tag und Release an).
- Worker: deployt nur von `main` (Cloudflare Workers Builds). Secrets nur in Cloudflare, nie im Code oder Chat.
- Firestore-Regeln (`app/firestore.rules`) spielt Dani von Hand in der Firebase-Konsole ein: nach Änderungen Bescheid sagen.
- **Nie ohne ausdrückliches „Release“ von Dani nach `main` mergen.** Release: Version auf `pre-release` anheben,
  `test:cloud`, PR `pre-release` → `main`, „Prüfen (vor dem Release)“ grün, Merge (merge commit); danach `pre-release`
  auf `main` vorspulen (`git push origin origin/main:pre-release`) und den Arbeits-Branch auf `origin/main` zurücksetzen.
  Issues mit Label `auf-test`, die mitgegangen sind, schließen. Zuletzt Spiegel `starwars` aktualisieren: `main` und alle
  Tags nach `elvau/starwars` pushen (nach jedem Merge nach `main`, auch Hotfix; `docs/RELEASE.md`, Schritt 7).
- Version in `app/package.json` (`npm version X --no-git-tag-version`) im Release-PR: größere Funktionen mittlere Stelle,
  sonst Patch. Lieber langsam hochzählen.

## Planung
Weiterentwicklung gebündelt in Epics (`epic`, mittlere Version), Features (`feature`) und Pflege (`maintenance`, Patch);
Ablauf und „fertig ist, wenn …“ in `docs/ABLAUF.md`. In Sitzungen mit Dani ein Epic Feature für Feature abarbeiten,
offene Entscheidungen zur Oberfläche vorher mit Entwurf klären.
Jedes offene Ticket hat genau ein Zuständigkeits-Label: `zuständig: Entwicklung` (diese Sitzungen), `zuständig: QA-Routinen`
(Bugs und kleine Änderungswünsche), `zuständig: Dani` (Entscheidungen `entscheidung`, Einrichtungen `einrichtung`; Dani
schließt sie). Braucht es eine Entscheidung von Dani, ein eigenes Ticket dafür anlegen statt nur im Chat zu fragen.

## Arbeitsteilung (Routinen)
Fehler und QA laufen über Routinen auf einem eigenen Konto (Einrichtung und Prompts: `docs/claude2claude.md`): **SAF 1 – Triage** macht aus Fehlerberichten Issues
hier im Repo (Labels `bug`, `change_request`, `question`, dazu `from-triage`), **SAF 2 – Umsetzung** bearbeitet diese
Issues, **SAF 2 – Review** prüft deren Pull Requests und nimmt sie an oder lehnt sie ab.
- Sitzungen mit Dani zur Weiterentwicklung (neue Funktionen): Fällt dabei ein Fehler auf, der nicht zur laufenden Aufgabe
  gehört, als Issue melden (gleiches Format: Kategorie, Beschreibung, Akzeptanzkriterien, Begründung; ohne `from-triage`)
  statt ihn selbst zu fixen. Fehler in gerade gebautem Code gehören zur Aufgabe und werden gleich behoben.
- Die Umsetzungs-Routine ist davon ausgenommen: Sie fixt die Issues, dafür ist sie da.
- **Die Review-Routine merged nie nach `main`.** Umsetzung und Review laufen unter demselben Konto, eine GitHub-Freigabe (Approve)
  ist daher nicht möglich; die Review antwortet per Kommentar: „ÄNDERUNGEN ANGEFORDERT“ (Umsetzung antwortet nach dem
  Nachbessern mit „NACHGEBESSERT“) oder **„FREIGEGEBEN“**. Freigegeben ist ein PR, wenn der letzte Review-Kommentar mit
  „FREIGEGEBEN“ beginnt und danach kein neuer Commit kam.
- PRs der Routinen zielen auf `pre-release`, nie auf `main`. Einen freigegebenen PR mit grünen Checks merged die
  Review-Routine in `pre-release` (merge commit) und ist damit auf der Testumgebung; nach `main` kommt er mit dem nächsten Release.
- Issues sind öffentlich: keine E-Mails, Namen, Kontokennungen, Bilder oder Inhalte aus Fehlerberichten (siehe Datenschutz).

## Prüfen
Push auf die Testumgebung (`pre-release`) soll schnell gehen: GitHub baut dort nur (`pages.yml`), die volle Prüfung läuft
bei PRs nach `main` und `pre-release` (`pruefen.yml`). Vor jedem Push lokal die schnellen Prüfungen und nur die e2e-Schritte der geänderten Bereiche:
```bash
cd app
npx svelte-check --threshold warning
npx vitest run
npm run build:emu && npx firebase emulators:exec --only auth,firestore --project demo-reisekasse "node e2e/X.mjs"
```
Vor dem Release-PR alles: `npm run test:cloud` (Firebase-Emulator + Playwright, dauert einige Minuten).
Neue Funktionen bekommen Unit-Tests und, wo sinnvoll, einen Schritt in `app/e2e/*.mjs`.

## Konventionen
- Sprache in Code-Kommentaren, Commits und Antworten an Dani: Deutsch, knapp, wie der umgebende Code.
- Oberfläche in 7 Sprachen (de, en, es, fr, pl, ru, ar; ar von rechts nach links). Neue Texte immer in
  `app/src/lib/i18n/*.ts` für alle Sprachen, Mehrzahl über `.one/.other` (pl/ru mit few/many, ar mit zero/two/few/many).
- Keine Modellnamen im Repo. Commit-Trailer wie bisher (`Co-Authored-By: Claude …`).
- Autor der Commits ist das Bot-Konto `daniel-ai-coder`, je Rolle im Namen (Feature, Bugfix, Review, Sprachen):
  `git commit --author="Split&Fly KI · Feature <336432604+daniel-ai-coder@users.noreply.github.com>"`.
  Committer bleibt Claude (`noreply@anthropic.com`), sonst ist der Commit nicht signiert.

## Datenschutz (streng)
- Fehlerberichte liegen im privaten Repo `elvau/splitandfly-bugs`, Bilder im R2-Speicher des Workers
  (`https://startrek.danielbednorz1990.workers.dev/bug-image/…`). Nichts daraus (Texte, Bilder, E-Mail, Kontokennung)
  in dieses öffentliche Repo, in Commits oder PRs übernehmen; nur „Fehlerbericht #N“ nennen.
- Buchungsdaten (Ausweis, Reisepass) nur im Konto (`travelDocs/{uid}`, REST ohne Browser-Cache): nie in localStorage,
  Reisen, KI, Such-Dienst oder Fehlermeldungen.
- Änderungen an erhobenen Daten → `public/datenschutz.html` mitziehen.
