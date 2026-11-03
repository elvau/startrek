# Reisekatalog

Epic #641. Öffentlicher Katalog mit Reisen von Nutzern und automatisch gepflegten Reiseideen.

## Grundsätze (Sitzung mit Dani, 02.11.2026)
- Ein Eintrag ist nur der **Reisekern am Ziel**: Stationen mit Nächten, Unterkünfte, Mobilität und Verpflegung vor Ort,
  Tagesplan, Touren. **Ohne Anreise**; die schätzt die App je Betrachter aus dessen Wohnort (#645).
- Liste vorsortiert nach **Luftlinie** Wohnort → erster Ort; Preis als „~xy € p. P.“ inklusive Anreise-Richtwert, ohne Touren.
- **Keine persönlichen Daten** (Namen, Alter, Wohnorte, Buchungsnummern, Kasse) und **keine Anbieternamen oder Links** (#649).
  Buchungslinks gibt es erst in der übernommenen Reise; dort geprüfte Preise aktualisieren die Richtwerte (#652).
- Ersteller mit öffentlichem Benutzernamen (#650). Veröffentlichen nur nach Plausibilitätscheck (#643), der warnt statt ausschließt.
- **Kein festes Startland:** gerechnet und sortiert wird ab dem Wohnort des Betrachters; ohne Wohnort ab der Hauptstadt des
  Landes aus Vorlieben, Zeitzone oder Browsersprache (`viewerCountry`), sonst Wohnort erfragen. Texte im Katalog nennen
  kein Startland („Flug ab Deutschland“), die Routine #651 legt Ideen für alle Märkte an.
- Touren zählen nicht zum Richtpreis; übernehmbar alle samt Tagesplan oder einzeln (#647).
- Etwa 50 automatische Reiseideen, wöchentlich gepflegt von „SAF 10 – Reiseideen“ (#651).

## Code
- `app/src/lib/catalog/types.ts`: Format `CatalogEntry`, Richtwert `corePP`, Formprüfung `shapeErrors`.
- `app/src/lib/catalog/fromTrip.ts`: Reise → Eintrag (Anreise weg, Freitexte bereinigt, Kosten pro Person ohne geschätzte Nebenkosten).
- `app/src/lib/catalog/seed.ts`: Startbestand aus den Reiseideen-Seiten (`seo/pages.ts`), Anreise-Zeilen und Touren je Seite in `SEED_META`.
- `app/src/lib/catalog/arrival.ts`: Anreise als Richtwert (#645). Luftlinie Wohnort → erster Ort und letzter Ort → Wohnort;
  bis 700 km (eigene Grenze in den Vorlieben: `Prefs.flyKm`, „Flug statt Auto oder Bahn ab“) Auto/Bahn, darüber Flug inkl. Weg zum Flughafen (Tabelle `ARRIVAL_PP`, Stand `ARRIVAL_STAND`), Hauptsaison +30 %.
  Ohne Flug bzw. Roadtrip immer am Boden. Kreuzfahrt: zum Ablegehafen und vom Endhafen, mit Flug eine Nacht vor dem
  Ablegen dazu. Katalogpreis `totalPP` = Ziel + Anreise (ohne Touren); `sortByDistance` für die Liste.
- `app/src/lib/catalog/view.ts`: Karten (Preis ab Startort, Route als Flussdiagramm), Filter, Bänder, Kostenzeilen.
- `app/src/lib/ui/CatalogMap.svelte`: Karte mit dem Zielland statt Bildern (Dani, 02.11.), Kartenbild wie RouteMini (OpenFreeMap), erst wenn sichtbar.
- `app/src/lib/ui/Catalog.svelte`: Ansicht auf der Startseite (Kachel „Reisekatalog“), Handy zuerst; e2e `app/e2e/catalog.mjs`.
  Ohne Wohnort: Land über `viewerCountry` (Hauptstadt, sonst größte Stadt), Hinweis „Mit deinem Wohnort wird es genauer“.
- `app/src/lib/catalog/publish.ts` + `app/src/lib/ui/PublishDialog.svelte`: Veröffentlichen (#644, Entwurf mit Dani 02.11.):
  Reise-Menü „🌍 Im Katalog veröffentlichen“, nur mit Konto und Benutzernamen (sonst zuerst das Namensfeld). Schritt 1:
  Titel, Kurzbeschreibung (80/280 Zeichen), Reiseart, gute Monate (vorbelegt), Check auf den eingetippten Texten (rot blockiert).
  Schritt 2: Vorschau mit `Catalog preview={…}` (Karte wie in der Liste, Detail), Zustimmung zu den Bedingungen
  (`agb.html#katalog`, Fassung `CATALOG_TERMS` im Dokument). Texte werden vor dem Speichern bereinigt (`scrub`).
  Firestore `catalog/{id}`: `uid`, `by` (muss `usernames/{by}` des Kontos sein), `data` (Eintrag als JSON, ohne Links und
  E-Mail, < 100 000 Zeichen), `terms`, `at` (Serverzeit); lesen alle, schreiben nur der Ersteller (Regeln in `firestore.rules`,
  Tests in `e2e/rules.mjs`). In der Reise `trip.pub` (Kennung, Konto, Zeit, letzte Angaben; Kopien erben es nicht).
  Änderungen an der Reise kommen nur über „Eintrag aktualisieren“ hinein; „Zurückziehen“ löscht den Eintrag, übernommene
  Reisen bleiben. Der Katalog lädt die Einträge ohne Konto über REST (`fetchCatalog`), eigene mit „Deine Reise“ und
  Zurückziehen, fremde mit „Melden“ (Fehlerbericht mit der Kennung des Eintrags). Konto zurücksetzen löscht eigene Einträge,
  die Datenauskunft nennt sie. e2e `app/e2e/publish.mjs`.
- `app/src/lib/catalog/take.ts`: Übernehmen als neue Reise (#647): Reisende (wie im Eintrag, „Nur ich“, gespeicherte Gruppe),
  Reisebeginn, Touren (alle mit Tagesplan, nur Touren, einzelne, keine). Anreise je Startort (Familien ab Wohnort, sonst
  ab dem Startort des Betrachters) als Richtwert; Flug ohne den Weg zum Flughafen (`ACCESS_PP`, rechnet die App selbst).
  Verpflegung und Transport vor Ort nicht doppelt (rechnet die App). Die Kachel „Reiseideen“ entfällt, die Seiten bleiben.
- `app/src/lib/catalog/pricecheck.ts` + `app/src/lib/ui/PriceCheck.svelte`: Preise prüfen nach dem Übernehmen (#652 Teil 1,
  Entscheidung Dani 02.11.: automatisch). `trip.catalog` merkt Eintrag, Stand und die Lage der Posten relativ zum Reisebeginn
  (`TakenRel`: Nächte je Unterkunft, Tag je Tour, Startort je Flug, erster Ort); ohne Reisebeginn fragt die Karte danach
  (`applyStart`). Mit Reisebeginn startet die Prüfung von selbst, nacheinander: Unterkunft je Station, Flug je Startort (zwei
  nächste Flughäfen, feste Daten, bis 9 Personen), Tour am Ort ihres Tages (gemeinsame Wörter im Titel, Euro-Preis). Das
  günstigste echte Angebot kommt als Option dazu und wird gewählt, der Richtwert bleibt. Mietwagen und Transport vor Ort ohne
  Suche. Ergebnis je Posten in `trip.catalog.check` (Richtwert und Preis pro Person), „Erneut prüfen“ sucht nur Posten ohne
  Angebot. e2e im Übernehmen-Schritt von `app/e2e/catalog.mjs`.
- `app/src/lib/catalog/prices.ts` + `worker/src/catalog.ts`: Preispunkte (#652 Teil 2). Nach der Prüfung schickt die App
  mit Konto einmal je Reise `pointsOf` an `POST /catalog/price` (Anmeldung nötig; je Konto und Eintrag einmal am Tag, höchstens
  `CATALOG_DAILY` = 10 Einträge am Tag). Punkt: Bereich (stay nach Ort, tour nach Name, arrival nach Zeile der Flug-Tabelle,
  Flugpreis plus Weg zum Flughafen, Hauptsaison herausgerechnet), Betrag pro Person, Monat, Gruppengröße, Datum; ohne Konto,
  Anbieter, Links. Gespeichert vom Dienstkonto in `catalogStats/{eintrag}` bzw. `catalogStats/_arrival` (Feld `p`, JSON, 12 Monate,
  höchstens 80), Regeln: lesen alle, schreiben nur das Dienstkonto. Der Katalog liest alles per REST (`fetchStats`):
  `applyStats` ersetzt Unterkunft je Ort und Touren durch die Mitte der Punkte (Ausreißer außerhalb 1,5 × Quartilsabstand ab 4
  Punkten verworfen, mit Monat bevorzugt dieselbe Saison ab 3 Punkten), mit Stand und „n× beim Übernehmen geprüft“;
  `arrivalTable` ersetzt Zeilen von `FLIGHT_PP` ab 3 Punkten (`ArrivalOpts.flights`). Live erst nach dem Release (Worker
  deployt von `main`). e2e in `app/e2e/publish.mjs` (Such-Dienst gemockt, Punkte als Admin angelegt).
- `app/src/lib/catalog/check.ts`: Plausibilitätscheck (#643). Rot blockiert (kein Ziel, keine Nächte, Rückflug vor Hinflug,
  Unterkunft außerhalb des Zeitraums, zwei Unterkünfte am selben Abend für dieselben Leute, 0 €, Kontaktdaten/Links im Text),
  gelb kennzeichnet (Nacht ohne Unterkunft, lange/sehr lange Fahrtage ab 6/10 Std., bei Roadtrip/Camper/ohne Flug 9/13 Std.,
  weite Wege ohne Verkehrsmittel, ungewöhnlicher Unterkunftspreis, Namen im Text). Öffentliche Hinweise in `CatalogEntry.warn`.
