# Planung und Ablauf der Weiterentwicklung

Neue Arbeit läuft nicht mehr auf Zuruf, sondern gebündelt. So bleiben Releases überschaubar und gut geprüft.
Technischer Weg der Branches und Releases: `docs/RELEASE.md`. Routinen für Fehler und QA: `docs/claude2claude.md`.

## Wer ist zuständig?

Jedes offene Ticket trägt genau ein Zuständigkeits-Label, so sieht man auf den ersten Blick, an wem es hängt:

| Label | Wer | Was |
|---|---|---|
| `zuständig: Dani` | Dani | Entscheidungen (`entscheidung`) und Einrichtungen (`einrichtung`: Partnerkonten, Schlüssel, Konsolen). Dani schließt sie, wenn erledigt. |
| `zuständig: Entwicklung` | Entwicklungssitzungen mit Dani | Epics, Features, Pflege |
| `zuständig: QA-Routinen` | Routinen auf Monikas Konto | Bugs und kleine Änderungswünsche aus Fehlerberichten (`docs/claude2claude.md`) |

Braucht die Entwicklung oder eine Routine eine Entscheidung, entsteht ein eigenes Ticket `entscheidung` + `zuständig: Dani`,
das auf das betroffene Ticket verweist. Liste aller offenen Punkte bei Dani: Issues mit Label `zuständig: Dani`.

## Arten von Arbeit

| Art | Label | Inhalt | Version |
|---|---|---|---|
| Epic | `epic` | größeres Ziel, z. B. „Suchen & Posten aufräumen“; die Features hängen als Unteraufgaben (Sub-Issues) daran | mittlere Stelle (0.26.0) |
| Feature | `feature` | eine Funktion mit Akzeptanzkriterien, meist Teil eines Epics | mit dem Epic |
| Maintenance | `maintenance` | Pflege: Abhängigkeiten, Sportkalender und Hinweise nachtragen, Doku, Aufräumen | Patch (0.26.1) |
| Bug, Änderungswunsch | `bug`, `change_request` | kommen über die Triage-Routine (`from-triage`) und werden von den Routinen umgesetzt | mit dem nächsten Release |

**change_request oder feature?** `change_request` (QA-Routinen) ist eine kleine Änderung an bestehendem Verhalten, die in
einem Pull Request erledigt ist: Text, Anordnung, ein zusätzliches Feld, ein Standardwert, das Verhalten einer bestehenden
Funktion. Alles Größere ist ein `feature` (Entwicklung): neue Funktionen, neue Partner, neue Ansichten, Entscheidungen zur
Oberfläche oder Änderungen über mehrere Bereiche. Im Zweifel eine Frage an Dani (`entscheidung`).

- Roadmap: Epics mit Zielversion (0.26.0 … ) und der Ideenspeicher (#144). Ein Epic nennt im Titel seine Zielversion, z. B. „Epic: Suchen & Posten aufräumen (0.26.0)“. Wer mag, legt dazu in
  GitHub einen Meilenstein mit derselben Nummer an und hängt die Issues daran.
- Neue Ideen von Dani: als Issue mit `feature` oder `maintenance` anlegen (oder in `docs/OFFEN.md` merken) und einem Epic zuordnen.
- Reihenfolge legt Dani fest; in einer Sitzung wird ein Epic Feature für Feature abgearbeitet.

## Ein Feature umsetzen

1. Issue lesen, offene Entscheidungen zuerst mit Dani klären (bei Oberfläche: Entwurf mit Screenshots für Handy und Desktop).
2. Auf dem Arbeits-Branch umsetzen; vor jedem Push die schnellen Prüfungen (svelte-check, Unit-Tests, e2e des Bereichs).
3. Zum Ausprobieren in `pre-release` mergen und pushen (Testumgebung, nur gebaut).
4. Im Issue kurz festhalten, was umgesetzt ist und wo es auf der Testumgebung zu sehen ist; Label `auf-test`.

**Fertig ist ein Feature, wenn**
- die Akzeptanzkriterien erfüllt sind,
- Unit-Tests da sind und, wo sinnvoll, ein Schritt in `app/e2e/*.mjs`,
- neue Texte in allen 7 Sprachen stehen,
- Datenschutz (`public/datenschutz.html`) und Doku mitgezogen sind,
- es auf der Testumgebung ausprobiert ist.

## Release eines Epics

1. Alle Features des Epics haben `auf-test`; Dani hat auf der Testumgebung ausprobiert.
2. Release-Kandidat: Pull Request `pre-release` → `main` mit Label `release-review` (optional geprüft von der Routine
   „SAF 3 – Release-Review“).
3. Auf Danis „Release“: Version, `npm run test:cloud`, Merge (siehe `docs/RELEASE.md`); Epic und Features schließen.

Dringende Fehler gehen weiter als Hotfix außer der Reihe.
