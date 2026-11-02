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
- `app/src/lib/catalog/check.ts`: Plausibilitätscheck (#643). Rot blockiert (kein Ziel, keine Nächte, Rückflug vor Hinflug,
  Unterkunft außerhalb des Zeitraums, zwei Unterkünfte am selben Abend für dieselben Leute, 0 €, Kontaktdaten/Links im Text),
  gelb kennzeichnet (Nacht ohne Unterkunft, lange/sehr lange Fahrtage ab 6/10 Std., bei Roadtrip/Camper/ohne Flug 9/13 Std.,
  weite Wege ohne Verkehrsmittel, ungewöhnlicher Unterkunftspreis, Namen im Text). Öffentliche Hinweise in `CatalogEntry.warn`.
