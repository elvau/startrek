# Sprachen

Die App ist mehrsprachig. Alle Texte stehen in `app/src/lib/i18n/`:

- `de.ts`: Deutsch, die Quelle aller Texte (Schlüssel → Text)
- `en.ts` usw.: Übersetzungen; fehlt ein Text, gilt Englisch, dann Deutsch
- `index.svelte.ts`: `t("schlüssel", { platzhalter })`, `tn("n.nights", 3)` für Mehrzahl, Sprachwahl

Die Sprache kommt aus der Browsersprache und lässt sich oben umschalten (gemerkt pro Gerät).
Datum und Beträge folgen der Sprache (Intl), Arabisch schaltet die Seite auf rechts nach links.

## Neuer Text

1. In `de.ts` einen Schlüssel anlegen, im Code `t("schlüssel")` verwenden.
2. Denselben Schlüssel in allen Sprachen anlegen (en, es, fr, pl, ru, ar); ein Test prüft Vollständigkeit und Platzhalter.

## Rechts nach links

- CSS mit logischen Angaben schreiben (`margin-inline-start`, `inset-inline-end`, `text-align:start`) statt left/right.
- Pfeile in Leserichtung mit `arrow()`; zwischen lateinischen Codes (FRA → SPU) bleibt →.
- Der Zeit-Schieberegler bleibt links nach rechts.

## Mehrzahl

Schlüssel mit Endungen nach [Intl.PluralRules](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules):
`.one`, `.other`, in Russisch und Polnisch zusätzlich `.few` und `.many`, in Arabisch `.zero`, `.two`, `.few`, `.many`.

## Hinweise

- Die Übersetzungen sind maschinell erstellt. Muttersprachler sollten sie prüfen.
- Die Reiseideen (Inhaltsseiten /reise/ und die Posten, die sie in der App anlegen) und Fehlermeldungen des Such-Dienstes bleiben vorerst deutsch.
- Die Browser-Tests laufen auf Deutsch (`locale: "de-DE"`).

## Länder (#162)
- **Wohnort je Land (#163):** ein gemeinsames Feld „Land + PLZ oder Ort“ (`app/src/lib/ui/HomeInput.svelte`,
  `app/src/lib/home.ts`). Postleitzahlen: Deutschland aus `app/public/plz.txt`, europäische Länder aus GeoNames
  (CC BY 4.0, Quellenhinweis am Feld) in `app/public/plz/<LAND>.txt`, je Land nachgeladen. Erzeugt mit `scripts/plz.mjs`
  über den Workflow „Postleitzahlen erzeugen“ (legt das Ergebnis auf den Hilfs-Branch `daten/plz`, von dort übernehmen).
  Portugal nur mit den ersten vier Ziffern. Länder ohne Postleitzahlen: Ort aus der Ortsliste (`world.json`).
  Gespeichert wie bisher (PLZ, Ort, Koordinaten), dazu `cc` (fehlt: DE).
- **Schulferien und Feiertage (#163):** OpenHolidays API (ODbL, etwa 36 Länder). Termine über den Such-Dienst
  (`/holidays?cc=AT`, drei Tage zwischengespeichert, nur der Ländercode kommt an), Regionen in `app/public/regions.json`
  (`scripts/regions.mjs`, Workflow „Ferien-Regionen erzeugen“, Ergebnis auf `daten/regions`). Vorlieben speichern
  `holidays` als Region („DE-NW“, „AT-WI“) bzw. ganzes Land („BE-“); alte Angaben ohne Land sind Bundesländer.
  Genutzt: echte Ferientermine für den KI-Planer, Feiertage im Reiseland im Tagesplan, Feiertage im Wohnland
  (Werktage) als Hinweis „ein Urlaubstag weniger“. Logik: `app/src/lib/holidays.ts`, `holidaysApp.svelte.ts`.
- **Markt der Unterkunftssuche (#464):** Die Suche schickt das Wohnland (`cc` am Wohnort der Person „Ich“, ohne Wohnort
  die Region des Browsers, sonst DE) und die App-Sprache mit (`app/src/lib/stays/market.ts`). Booking.com und Trivago
  bekommen das Land als Markt, liteAPI als `guestNationality` (die echte Staatsangehörigkeit ist Buchungsdaten und geht
  nie an den Such-Dienst). Texte der Anbieter nur deutsch oder englisch, weil Ausstattung, Verpflegung und Preise aus
  dem Text gelesen werden. Länder, die ein Anbieter nicht kennt: DE.
