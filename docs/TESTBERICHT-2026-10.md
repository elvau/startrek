# Testbericht: 20 Anwendungsfälle (Oktober 2026)

Stand: 24.10.2026, Testumgebung https://elvau.github.io/startrek/ (v0.52.2), Desktop (1280 px) und Handy (390 px),
Gast-Modus ohne Konto, Browser auf Deutsch. Echte Suchen über den Such-Dienst (Kiwi, Trivago, liteAPI-Test, Events).
Funktionen, für die man ein Konto braucht (KI-Planer, Realitätscheck/Import, Teilen), habe ich nur im Code und an den
Texten geprüft. Nichts wurde behoben, das hier ist nur die Liste.

Einstufung: **🔴 Fehler** (falsches Ergebnis oder Daten), **🟠 Ärgernis** (verwirrt, kostet Zeit), **🟡 Kleinigkeit**,
**💡 fehlt / Vorschlag**.

---

## 1. Die 20 Anwendungsfälle

Ausgedacht nach dem, wie Leute eine Reise oder Gruppenreise üblicherweise angehen: erst grob schätzen („was kostet das
ungefähr?“), dann Termin und Mitreisende klären, Angebote vergleichen, buchen, unterwegs Geld auslegen und am Ende abrechnen.

| # | Anwendungsfall | Getestet | Ergebnis |
|---|---|---|---|
| 1 | Familie (2 Erw., Kinder 8 und 11) aus Köln, 14 Nächte Strandurlaub Makarska in den Sommerferien | live | geht gut, mehrere Befunde (F1, F3, F5, F6, F12) |
| 2 | JGA mit 6 Freunden, langes Wochenende in Barcelona | live | geht, Namensfehler (F2), kein „Bräutigam ist eingeladen“ (V1) |
| 3 | Gruppe sucht einen Termin, an dem alle können | live | geht gut, kleine Wünsche (V10) |
| 4 | Gruppe stimmt über zwei Zeiträume ab | live | geht |
| 5 | Unterwegs Geld auslegen und am Ende ausgleichen (Splitwise-Fall) | live | rechnet richtig, Cent-Beträge fehlen (F14) |
| 6 | Fußballfans fahren zum Auswärtsspiel in der Nähe (Dortmund → Mönchengladbach) | live | bricht ab, nur Flüge (F4), leere Reise bleibt (F8) |
| 7 | Pauschalangebot aus dem Reisebüro prüfen (Realitätscheck) | Code | nur mit Konto, Hinweis fehlt vorher (F17) |
| 8 | Wunschreise der KI beschreiben | Code | nur mit Konto, Hinweis fehlt vorher (F17) |
| 9 | Reiseidee „Gardasee mit 3 Familien“ übernehmen und anpassen | live | Werte unfair verteilt, doppelte Anreise möglich (F9, F10) |
| 10 | Mehrere Familien teilen ein Ferienhaus, Kinder zahlen die Hälfte | live + Code | nicht möglich (V2) |
| 11 | Solo-Backpacker, Rundreise Thailand mit mehreren Unterkünften, Preise in Baht | live | falscher Preis bei kleingeschriebener Währung (F7), Trinkgeld auf leerer Unterkunft (F1), Lücken nicht erkannt (F11) |
| 12 | Zwei Ziele vergleichen (Kroatien gegen Mallorca) per Variante | live | Variante behält alte Flüge/Hotels ohne Warnung (F6) |
| 13 | Gesamtkosten und pro Familie an Oma bzw. die Gruppe als PDF schicken | live | Reiseplan gut, keine Aufteilung je Familie (V6) |
| 14 | Mit dem Handy die Reise ansehen | live | Reisename oben nicht lesbar (F13) |
| 15 | Internationale Gäste: Oberfläche auf Englisch, Beträge in US-Dollar | live | geht, Platzhalter-Tiere bleiben deutsch (F16) |
| 16 | Budget festlegen („max. 3.000 € für uns vier“) und sehen, ob es reicht | Code | fehlt (V3) |
| 17 | Gebuchtes festhalten: Buchungsnummer, Storno-Frist, Anzahlung/Restzahlung mit Fälligkeit | Code | Eingabe fehlt (V4) |
| 18 | Gruppenrabatt eintragen („ab 10 Personen 10 %“) | Code | nur im Rechenkern, keine Oberfläche (V5) |
| 19 | Reise sichern oder an jemanden ohne Konto weitergeben (Datei) | live + Code | nur Konto-Auskunft als JSON, kein Export/Import je Reise (V7) |
| 20 | Reise versehentlich gelöscht, rückgängig machen | live | nicht möglich (V8) |

Was gut funktioniert und so bleiben sollte: Flugsuche über mehrere Flughäfen mit Anfahrt und Parken, Hinweis „Abfahrt
spätestens 04:26, letzte Nacht näher am Flughafen?“, Verpflegung passt sich an Frühstück im Hotel an, „Termin finden“
mit Vorschlag „alle 6“ gegen „5 von 6 ohne Tiger“, Abstimmung daraus, Kasse mit Ausgleichsvorschlag, Einreise-Hinweise
(TDAC Thailand, Reisewarnung), Varianten-Vergleich mit „Nur Unterschiede“, Reiseplan als PDF/HTML.

---

## 2. Fehler

### 🔴 F7 Währung klein geschrieben wird als Euro gerechnet → #543
- **Wo:** Posten bearbeiten → Preis & Angebote → Feld „Währung“ (freies Textfeld, 3 Zeichen).
- **Schritte:** Unterkunft anlegen, 5 Nächte, Währung `thb`, Preis pro Nacht `600`.
- **Ist:** 3.000 € (600 „Euro“ pro Nacht). Mit `THB` stimmt es (ca. 16 € pro Nacht).
- **Ursache:** `rateOf()` in `app/src/lib/calc/index.ts` fällt bei unbekanntem Code still auf 1 : 1 zurück; `hasRate()` wird
  im Editor nicht genutzt. Gleiches passiert bei Tippfehlern (`BAT`, `EURO`).
- **Soll:** Auswahlliste wie bei der Kasse (dort gibt es schon eine), sonst Großschreibung erzwingen und bei unbekanntem Code
  warnen statt 1 : 1 zu rechnen.

### 🔴 F1 Leere Unterkunft kostet schon Geld (Trinkgeld-Schätzung) → #544
- **Schritte:** Reise Thailand, Kapitel „Ankommen“ auf „Detailliert“, „+ Unterkunft“, nichts eintragen.
- **Ist:** Karte zeigt „Preis unbekannt“, zählt aber „+ ca. 42 € vor Ort · Trinkgeld“ in Kapitel und Gesamt (zwei leere
  Unterkünfte = 84 €).
- **Ursache:** `autoExtras()` in `app/src/lib/fees.ts` schätzt Trinkgeld, ohne zu prüfen, ob das Angebot einen Preis hat.
- **Soll:** Automatische Nebenkosten erst rechnen, wenn das Angebot einen Preis hat (`noPrice`/`blankOption` aus `model.ts`).
- Dazu: Beim Umschalten „Einfach → Detailliert“ entsteht ein leerer Posten „Neue Unterkunft“ über die ganze Reise, obwohl
  kein Betrag eingetragen war. Mit leerem Betrag sollte kein Posten entstehen.

### 🔴 F6 Ziel geändert, Flug und Hotel passen nicht mehr: keine Warnung → #551
- **Schritte:** Reise Makarska mit Flug DUS→SPU und Hotel in Makarska → „Als Variante kopieren“ → in der Variante Ort
  „Alcúdia“, Land „Spanien“.
- **Ist:** Flug nach Split und Hotel in Makarska bleiben, die App rechnet „SPU → Alcúdia ca. 11:12 h“ mit dem Auto (Mallorca
  ist eine Insel) und schlägt „Erste Nacht am Flughafen?“ vor. Der Vergleich zeigt die Variante als „günstigste“. Die Variante
  heißt im Vergleich „Makarska – Variante 2“, in der Liste „Alcúdia · Juli 2027“.
- **Soll:** Nach Zieländerung fragen „Flüge und Unterkünfte zum alten Ziel entfernen?“; in Vergleich und Reise warnen, wenn
  Ziel-Flughafen oder Unterkunft weit vom Reiseziel liegen. Fahrzeit-Schätzung über Wasser nicht anbieten.

### 🔴 F3 Flug mit Rückflug an einem anderen Flughafen: Anfahrt nur für den Abflughafen → #550
- **Wo:** Flugsuche, Familie aus Köln, mehrere Abflughäfen (CGN, DUS, DTM, NRN), Ziel „Umkreis Makarska“.
- **Ist:** Treffer wie „Hin DUS → WAW → SJJ, Rück DBV → NRN (Weeze)“ mit „Anfahrt 212 €“ (Auto + 15 Tage Parken in DUS).
  Das Auto steht in Düsseldorf, die Familie landet in Weeze. Ebenso Hin nach Sarajevo (Bosnien), Rück ab Mostar: am Ziel
  zwei Länder und ca. 140 km auseinander, ohne Hinweis.
- **Soll:** Bei abweichendem Rückflughafen (zuhause oder am Ziel) deutlich markieren, Anfahrt für beide Flughäfen rechnen
  (Parken geht dann nicht, eher Bahn/Taxi), Filter „gleicher Flughafen hin und zurück“ als Standard für Familien.

### 🔴 F4 Event in der Nähe: nur Flüge, sonst Abbruch (siehe auch #535)
- **Schritte:** „Zu einem Event“ → „Borussia Dortmund“ → „M'gladbach – Dortmund“, Wohnort 44137 Dortmund, 4 Personen,
  „Reisen vorschlagen“.
- **Ist:** „Für diesen Termin gab es keinen passenden Flug …“. Kein Vorschlag mit Auto, Bahn oder Fanbus; die Strecke ist
  60 km. Auch kein Tagesausflug ohne Übernachtung (die Reise bekommt automatisch 1 Nacht).
- **Soll:** Unter ca. 500 km zuerst Auto/Bahn/Bus vorschlagen (die Bausteine aus „Unterwegs“ gibt es schon), Übernachtung
  optional („Tagesausflug“).

### 🟠 F2 „Die Reise heißt vorerst Gruppenreise 🦊 Fuchs“ stimmt nicht → #545
- **Schritte:** Neue Reise → Gruppe → „Mit Platzhalter-Tieren“ → Reise anlegen.
- **Ist:** Reise heißt „Neue Reise“, kein Fuchs unter den Personen.
- **Ursache:** `who.mascot` wird in `app/src/lib/ui/WhoPicker.svelte` angezeigt, aber nirgends verwendet (`who.ts`,
  `NewTripDialog.svelte`).
- **Soll:** Name übernehmen oder den Satz entfernen.

### 🟠 F8 Event-Dialog hinterlässt halbe Reisen → #546, #547
- **Ist:** Schon beim Starten der Event-Suche entsteht eine Reise (4 Platzhalter, ohne Namen und Datum). Findet sich kein
  Flug oder schließt man den Dialog, bleibt sie in „Geplante Reisen“ als „Neue Reise“ bzw. „M'gladbach – Dortmund“ ohne
  Reisedaten stehen.
- **Soll:** Reise erst bei „Übernehmen“ anlegen oder beim Abbrechen fragen.
- Dazu: Hero zeigt „Reisedaten offen“, gleichzeitig „Wer ist wann da: 21.11.–22.11. · 1 Nacht“. Ticketpreis bleibt leer
  (0 €), obwohl Bundesliga-Karten Geld kosten: Richtwert je Liga/Event vorschlagen.
- In der Event-Liste stand „Nottingham Forest B Team vs Borussia Dortmund U21s · Undefined“: der Ort `undefined` wird als
  Text angezeigt.

### 🟠 F9 Reiseidee verteilt Ferienhaus und Auto pro Kopf, auch auf Kinder → #552
- **Schritte:** Reiseideen → „Gardasee mit mehreren Familien“ → „Mit diesen Werten eigene Reise planen“.
- **Ist:** Ferienhaus 305 € pro Person, Kinder gleich viel; „Anreise mit dem Auto (…, geteilt)“ 70 € pro Person, also zahlt die
  Familie mit mehr Kindern mehr Sprit. Die Seite selbst rät: „Legt vorher fest, ob Kinder bei der Unterkunft voll, halb oder gar
  nicht zählen“ und „viele Familien teilen die Fahrtkosten pro Auto“, und sagt „Split&Fly rechnet das pro Person und pro
  Familie aus“ – das kann die App aber nicht (V2).
- **Soll:** Auto als Posten je Familie/Auto übernehmen; Text der Seite an das anpassen, was die App kann.

### 🟠 F10 Reiseidee + eigener Wohnort: Anreise doppelt → #552
- **Ist:** Nach Eingabe des Wohnorts bietet „Unterwegs“ „+ Auto als Posten (ca. 229 €)“ an, obwohl aus der Reiseidee schon
  „Anreise mit dem Auto 770 €“ als Posten da ist. Wer beides nimmt, zahlt die Anreise doppelt.
- **Soll:** Den pauschalen Posten aus der Reiseidee ersetzen bzw. darauf hinweisen.

### 🟠 F11 Lücken in der Rundreise werden ohne Flug nicht erkannt → #549
- **Schritte:** Solo-Reise 01.–22.02., Hostel 01.–04.02., Guesthouse 05.–10.02., keine Flüge.
- **Ist:** „Wer ist wann wo“ zeigt eine leere Leiste („Anwesenheit offen“), keine Warnung für die Nacht 04.→05.02. und
  10.–22.02. Die Unterkünfte erscheinen nicht in der Leiste.
- **Soll:** Ohne Flug die Reisedaten als Anwesenheit nehmen; Unterkünfte in der Leiste zeigen, Lücken und doppelte Nächte
  melden (Konzept B8).

### 🟠 F12 Unklare Begriffe in der Übersicht
- **„Versteckt“** für geschätzte Kosten (Verpflegung, Transfer, Souvenirs) liest sich wie „ausgeblendet“. Bei einer leeren
  Reise steht „Versteckt ca. 120 €“ (nur Souvenirs). Vorschlag: „Geschätzt“ oder „Kommt noch dazu“. In Englisch „Hidden“ dito.
- Richtwerte aus Reiseideen zählen als **„Geplant“** (Gardasee: Geplant 8.140 €), obwohl es keine Angebote sind.
- Kachel **„Sonstige Kosten“** oben zeigt „Nahverkehr vor Ort“, „Flughafentransfer“ und „Anreise mit dem Auto“, die im Kapitel
  „Unterwegs“ stehen.
- In Gruppen- und Solo-Reisen heißt es „1 Familie“, „Pro Familie (6)“, „Zeiten je Familie anpassen“. Für JGA oder Verein
  besser „Kasse“/„Haushalt“ oder „Person“.
- Neue Reise startet mit Souvenirs 30 € pro Person, auch für Kinder, bevor Ort oder Datum feststehen.

### 🟡 F13 Handy: Reisename in der Kopfzeile nur ein Buchstabe
- 390 px: Die Reise-Pille zeigt „🧳 M“ (Makarska), daneben +, ✎, ❗, 🐞, Anmelden, ⋯. Man sieht nicht, welche Reise offen ist.
- Die schwebenden Knöpfe „Fehler melden“ und „KI“ liegen auf der Reiseliste über dem Papierkorb bzw. dem Titel.

### 🟡 F14 Kasse zeigt keine Cent → #548
- Ausgabe „Abendessen Tapas 240,50 €“ erscheint als „241 €“. Ausgleich ist richtig gerechnet (Panda → Frosch 60 €,
  Hase/Tiger/Löwe → Frosch je 40 €), aber bei Geld unter Freunden erwartet man Cent.

### 🟡 F15 Wohnort und Flughäfen aus der IP, nicht aus der letzten Eingabe
- Mit Verbindung über die USA schlägt die App „Columbus“ und US-Flughäfen vor, obwohl Sprache und Zeitzone deutsch sind.
- „Köln“ im Wohnort-Feld → „Nicht gefunden“, weil das Land auf „Vereinigte Staaten“ steht. Ortsuche über alle Länder oder
  Land automatisch wechseln.
- Den in der Flugsuche eingegebenen Wohnort (50667 Köln) kennt der Event-Dialog nicht, dort wieder Columbus.
- Flugsuche startet auf „Flexibler Zeitraum 11–14 Nächte“, obwohl die Reise feste Daten hat.

### 🟡 F16 Kleinigkeiten
- Gruppe mit Platzhaltern: nur „Erwachsene (ab 12)“ und „Kinder (2–11)“, keine Kleinkinder (bei Familie gibt es sie).
- Neue Gruppe anlegen: nur „Alter“ als Zahl. Gespeicherte Gruppen werden wiederverwendet, im nächsten Jahr stimmt das Alter
  nicht mehr. Geburtsjahr oder -datum anbieten (das Modell kennt `birth` schon). Eingetragenes Alter steht nicht in der Liste.
- Eingabefelder im Neue-Reise-Dialog haben keine zugeordneten Labels (Bildschirmleser lesen nur den Platzhalter „Monika“, „Eule“).
- Reiseliste und Event-Treffer ohne Jahr („13. bis 16. Mai“, „Sa 21.11.“), bei Planungen über den Jahreswechsel missverständlich.
- „Termin finden“ übernimmt die Reisedaten nicht (Dauer steht auf 7 Nächten, die Reise hat 3) und zeigt keine Wochentage
  oder Feiertage in der Tabelle. Dass das gesetzte Reisedatum Tiger ausschließt, steht nur klein dabei.
- Englisch: Platzhalter-Namen bleiben deutsch („Dachs“, „Food Dachs“), der Hinweis darunter spricht von „Badger“.
- Unterkunftssuche: „Kaštel Novi 3 km“ usw. sind Orte am Flughafen SPU, nicht bei Makarska; wirkt wie Vorschläge zum Ziel.
- Entfernungen widersprechen sich: „63 km zum Flughafen SPU“ (Luftlinie) und „SPU → Makarska ca. 83 km“ (Straße). Kurz
  dazuschreiben, was gemeint ist.
- Reiseplan (PDF/HTML) nennt keine Testpreise und trennt Schätzungen nicht von Angeboten.

### 🟠 F17 Anmeldung erst nach dem Klick
- „Mit KI planen“ und „Realitätscheck“ stehen gleichrangig auf der Startseite. Erst nach dem Klick kommt „Der KI-Planer ist in
  der Beta für angemeldete Nutzer“ bzw. „Zum Importieren bitte anmelden.“ (beim Realitätscheck heißt es „Importieren“).
- Vorschlag: auf den Kacheln „mit Konto“ markieren und erklären, warum (Kontingent).

### Testumgebung (kein App-Fehler, zur Info)
- Trivago lieferte für Makarska im Juli 2027 (9 Monate voraus) 0 Treffer; nur liteAPI-Testangebote. Für Termine weit
  voraus wäre ein Richtwert als Rückfall besser als „Keine Angebote gefunden“.

---

## 3. Was fehlt (Vorschläge und Änderungswünsche)

### 💡 V1 „Person ist eingeladen“
JGA, Geburtstag, Abschiedsreise: Der Anteil einer Person wird auf die anderen verteilt. Heute geht das nur mit einem
Zuschuss mit festem Betrag, der sich nicht anpasst, wenn sich Kosten ändern. Vorschlag: an der Person „zahlt nichts, Anteil
auf: alle / bestimmte Personen“.

### 💡 V2 Kinderanteil bei Pauschalpreisen (Ferienhaus, Auto, Bootstour)
Pauschalen werden je Nacht gleich auf alle Anwesenden verteilt (`calcStay` in `calc/index.ts`). Mehrere Familien wollen
oft „Kinder zahlen die Hälfte“ oder „Kinder frei“. Vorschlag: Gewicht je Altersklasse für Pauschalposten, einstellbar je Reise
und je Posten. Bezug: #484.

### 💡 V3 Budget je Reise und je Familie
Konzept C8, im Code gibt es nur „Budget niedrig/mittel/hoch“ in den Vorlieben. Vorschlag: Betrag eintragen, Balken
„fest / geplant / geschätzt“ gegen das Budget, Warnung beim Übernehmen eines Angebots, das es sprengt. Passt zu #310 (Sparplan).

### 💡 V4 Buchungsdaten und Zahlungen mit Fälligkeit
Das Modell hat `booking` (Buchungsnummer, Anbieter, Storno bis) und der Kalender-Export „Fristen“ liest `cancelUntil`, aber
keine Oberfläche schreibt diese Felder. Zahlungen haben kein Fälligkeitsdatum. Vorschlag: beim Status „Gebucht“ diese Felder
abfragen, Anzahlung/Restzahlung mit Datum, Liste „Was ist wann fällig“, Erinnerung (Konzept C4, C5, C7; Bezug #440).

### 💡 V5 Gruppenrabatt in der Oberfläche
Rechenkern kennt Stufen (`trip.tiers`, `item.tier`), die Oberfläche nicht (Konzept B6). Für Vereine und Klassenfahrten wichtig
(Freiplatz ab 20 Personen, Gruppentarif Bahn).

### 💡 V6 Abrechnung je Familie als PDF
Der Reiseplan zeigt Gesamt und pro Person. Für „Oma und Opa zahlen ihren Teil“ oder die Elterngruppe fehlt je Familie eine
Seite mit ihrem Anteil, was schon bezahlt ist und was sie wem überweisen (Konzept G1).

### 💡 V7 Reise als Datei sichern und weitergeben
Ohne Konto liegt alles nur im Browser („Auf diesem Gerät gespeichert“). Browserdaten löschen = Reise weg. Vorschlag: „Reise
exportieren / importieren“ (Konzept G2) und einmal deutlich auf das Risiko hinweisen, z. B. ab der zweiten Reise.

### 💡 V8 Löschen rückgängig machen
Löschen fragt per Browser-Dialog „lässt sich nicht rückgängig machen“. Vorschlag: 10 Sekunden „Rückgängig“ oder ein Papierkorb
für 30 Tage; bei geteilten Reisen umso wichtiger.

### 💡 V9 Ankunft und Abreise an verschiedenen Flughäfen bewusst planen
Gabelflüge können sinnvoll sein (Rundreise), sollen aber gewählt sein und nicht nebenbei passieren (siehe F3). Vorschlag:
Schalter „gleicher Flughafen“ / „Gabelflug erlaubt“, und ein Hinweis, wenn Mietwagen dann als Einwegmiete gerechnet werden muss.

### 💡 V10 „Termin finden“ ausbauen
Wochentage und Feiertage/Brückentage im Raster, Schulferien je Bundesland einblenden (die App kennt Ferien schon im
Ferien-Picker), Vorschlag direkt nach Preis sortieren (Preiskalender der Flüge daneben).

### 💡 V11 Wichtiges vor der Reise vollständiger
Für Kroatien mit Kindern stand „alles bedacht“. Typische Punkte, die Familien vergessen: Kinderreisepass/Personalausweis
für Kinder, Einverständnis bei nur einem Elternteil, Krankenversicherungskarte (EHIC), Impfungen/Malaria bei Fernreisen,
Mietwagen-Kindersitz. Als „Gut zu wissen“-Liste je Land und Reisendem.

### 💡 V12 Tagesausflug und kurze Reisen
Event-Reise, Freizeitpark, Stadionbesuch: ohne Übernachtung, Anreise mit Auto/Bahn. Heute setzt die App immer mindestens
eine Nacht an (siehe F4).

### 💡 V13 Hinweise auf Testpreise auch im Export
„Enthält einen Testpreis“ steht in der App, nicht im Reiseplan. Gleiches gilt für Schätzungen: im PDF kennzeichnen, was
Richtwert ist.

---

## 4. Vorschlag für die Reihenfolge

1. **Schnell und wichtig (Bugs):** F7 Währung, F1 Trinkgeld auf leeren Posten, F2 Name der Gruppenreise, F8 halbe Reisen aus
   dem Event-Dialog, `undefined` in Event-Treffern, F14 Cent in der Kasse. Kandidaten für die QA-Routinen.
2. **Falsche Ergebnisse vermeiden:** F3 Rückflug an anderem Flughafen, F6 Warnung nach Zieländerung, F11 Lücken ohne Flug,
   F9/F10 Reiseideen.
3. **Größere Funktionen (Epics/Features):** V2 Kinderanteil, V4 Buchung & Fälligkeiten, V3 Budget, V1 eingeladene Person,
   F4/V12 Event-Reise ohne Flug (#535), V7 Export, V5 Gruppenrabatt.
4. **Wortwahl und Oberfläche (Label `bedienung`):** F12 Begriffe („Versteckt“, „Familie“), F13 Handy-Kopfzeile, F17
   Anmeldehinweis, F15 Wohnort merken.

Bezug zu offenen Issues: #535 (Event ohne Flug), #484 (Kinder und Preisstufen), #310 (Sparplan), #440 (Erinnerungen),
#227/#231 (unterschiedliche Zeiten).
