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
- Die Beispielreise und Fehlermeldungen des Such-Dienstes bleiben vorerst deutsch.
- Die Browser-Tests laufen auf Deutsch (`locale: "de-DE"`).
