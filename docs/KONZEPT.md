# Reisekasse – Grundriss für die Neuentwicklung

Stand: Entwurf 1 (September 2026). Dieses Dokument ist die gemeinsame Grundlage für den
Neuaufbau. Was hier steht, gilt als Anforderung. Offene Punkte stehen am Ende.

## 1. Ziel

Die Reisekasse beantwortet eine Frage: **Was kostet diese Reise wirklich, für wen, und
geht es günstiger oder besser?**

Sie kann drei Dinge:

1. **Planen:** eine Reise komplett von Hand eintragen, so wie heute.
2. **Festhalten:** unterscheiden, was noch verglichen wird und was schon gebucht oder
   bezahlt ist.
3. **Schnell schätzen:** aus einem groben Reisewunsch in wenigen Minuten realistische
   Gesamtkosten bekommen, in drei Stufen (günstig, solide, Premium) und für mehrere Ziele.

Flug- und Hotelsuchen sind **Hilfsmittel für realistische Preise**, kein Buchungsportal.
Die App muss auch ohne sie vollständig nutzbar sein.

Das heutige Rechenverhalten (Personen, Haushalte, Gruppenrabatte, Kinderpreise,
Anreise zum Flughafen, Währungen) ist fachlich richtig und wird übernommen, nicht neu
erfunden.

## 2. Begriffe

| Begriff | Bedeutung |
| --- | --- |
| **Reise** | Ein Vorhaben mit Reisenden, Zeitraum und Posten. Kann mehrere Varianten haben. |
| **Reisende** | Person mit Alter zum Reisezeitpunkt. Daraus folgt die Preisklasse (Erwachsener, Kind, Kleinkind). |
| **Haushalt** | Gruppe von Reisenden, die gemeinsam zahlt, zum Beispiel eine Familie. Hat einen Wohnort für die Anreise. |
| **Posten** | Eine Kostenstelle: Flug, Unterkunft, Transport, Attraktion, Sonstiges. |
| **Option** | Ein konkretes Angebot für einen Posten. Ein Posten kann mehrere Optionen zum Vergleichen haben. |
| **Status** | Wo ein Posten steht: *Idee → Gewählt → Gebucht → Bezahlt* (siehe 4). |
| **Variante** | Eine vollständige Ausprägung der Reise, zum Beispiel „Kroatien, solide“. Varianten werden nebeneinander verglichen. |
| **Reisewunsch** | Grobe Vorgabe, aus der die App Varianten erzeugt: wer, wann, wie lange, welche Ziele, welche Art Urlaub. |
| **Profil** | Qualitätsstufe einer Variante: *Günstig*, *Solide*, *Premium* (siehe 5). |
| **Richtwert** | Hinterlegter Durchschnittspreis (zum Beispiel Hotelnacht in Kroatien, 3 Sterne, Juli). Grundlage für Schätzungen ohne Suche. |

## 3. Anwendungsfälle

Kennzeichnung: **[heute]** gibt es schon, **[neu]** kommt dazu. Priorität: **P1** muss in
die erste Version, **P2** bald danach, **P3** später.

### A. Reise anlegen und Reisende

- **A1 [heute, P1]** Ich lege eine Reise an, gebe ihr einen Namen und wähle das Zielland.
- **A2 [heute, P1]** Ich trage Reisende mit Alter ein. Die App ordnet sie als Erwachsener,
  Kind oder Kleinkind ein, mit einstellbaren Altersgrenzen.
- **A3 [heute, P1]** Ich teile Reisende in Haushalte auf, damit jede Familie ihre eigene Summe sieht.
- **A4 [heute, P1]** Ich gebe pro Haushalt den Wohnort (PLZ) an. Die App schätzt die Anreise
  zu jedem Abflughafen (Auto mit Parken oder Bahn) und rechnet sie mit ein.
- **A5 [neu, P2]** Ich lege Reisende einmal an (zum Beispiel „Familie Klein“) und verwende sie
  in weiteren Reisen wieder. Das Alter wird zum Reisedatum automatisch angepasst.
- **A6 [heute, P1]** Ich habe mehrere Reisen und wechsle zwischen ihnen.

### B. Manuell planen

- **B1 [heute, P1]** Ich trage Flüge ein: Strecke, Zeiten, Preis pro Erwachsenem und pro Kind,
  Gepäck. Die App rechnet auf alle Mitfliegenden hoch.
- **B2 [heute, P1]** Ich trage Unterkünfte mit Zeitraum ein, als Preis pro Nacht, pro Person
  und Nacht oder als Gesamtpreis. Die Belegung berücksichtigt maximale Gästezahl und Zimmer.
- **B3 [heute, P1]** Ich trage Transport vor Ort ein: Bahn, Bus, Mietwagen, Tageskarten.
  Pauschale Posten werden gleichmäßig auf die Beteiligten verteilt.
- **B4 [heute, P1]** Ich trage Attraktionen mit Erwachsenen-, Kinder- und Kleinkindpreis ein.
  Für bekannte Orte schlägt die App Klassiker mit Preisen vor.
- **B5 [heute, P1]** Ich trage Sonstiges ein: Verpflegung, Versicherung, Visum, Trinkgeld.
  Die Verpflegung lässt sich über Tagessätze nach Stil schätzen (selbst kochen bis gehoben).
- **B6 [heute, P1]** Ich lege Gruppenrabatte als Stufen fest (zum Beispiel ab 6 Personen 10 %).
  Sie greifen automatisch.
- **B7 [heute, P1]** Ich gebe Preise in Landeswährung ein. Die App rechnet mit einstellbarem Kurs in Euro um.
- **B8 [heute, P1]** Ich plane eine Rundreise mit Stationen. Die App zeigt einen Zeitstrahl, wer
  wann wo ist, und warnt bei Lücken oder doppelten Nächten.
- **B9 [heute, P2]** Ich sehe die Reise auf einer Karte mit Unterkünften, Flughäfen und Route.
- **B10 [heute, P1]** Ich schalte einzelne Posten oder Personen aus einem Posten aus (zum
  Beispiel Oma fährt nicht mit in den Freizeitpark).

### C. Planung und Fest: Status und Zahlungen

- **C1 [neu, P1]** Jeder Posten hat einen Status: *Idee*, *Gewählt*, *Gebucht*, *Bezahlt*.
- **C2 [neu, P1]** Ein Posten im Status *Idee* kann mehrere Optionen haben. Ich vergleiche sie
  nebeneinander (Preis, Zeiten, Bewertung, Entfernung) und wähle eine aus. Die gewählte fließt
  in die Summe ein.
- **C3 [neu, P1]** Die Übersicht trennt **fest** (gebucht und bezahlt) von **offen** (noch in
  Planung). Ich sehe sofort, wie viel schon sicher ist und wie viel sich noch ändern kann.
- **C4 [neu, P2]** Bei *Gebucht* halte ich Buchungsnummer, Anbieter, Link und Stornobedingungen fest.
- **C5 [neu, P2]** Ich erfasse Zahlungen: Anzahlung, Restzahlung, Fälligkeit, wer bezahlt hat.
  Die App zeigt, was wann fällig ist.
- **C6 [neu, P2]** Die App zeigt, wer wem noch Geld schuldet, wenn ein Haushalt für andere
  vorgestreckt hat.
- **C7 [neu, P3]** Ich bekomme eine Erinnerung vor Fälligkeiten und vor Ende der kostenlosen Stornierung.
- **C8 [neu, P2]** Ich lege ein Budget fest und sehe, wie weit fest und offen davon entfernt sind.

### D. Schnell schätzen: Reisewunsch zu Varianten

Beispiel: *Familie Klein (2 Erwachsene, Kinder 8 und 11) möchte in den Sommerferien NRW
Strandurlaub machen, mindestens 9 und höchstens 12 Tage. Ziele: Spanien, Griechenland,
Kroatien. Abflug ab Düsseldorf oder Köln.*

- **D1 [neu, P1]** Ich erfasse einen Reisewunsch: Reisende (oder eine gespeicherte Gruppe),
  Zeitfenster (Sommerferien NRW), Dauer von bis, Zielländer oder Regionen, Art des Urlaubs
  (Strand, Stadt, Rundreise), Abflughäfen und optional ein Budget.
- **D2 [neu, P1]** Die App erzeugt pro Ziel drei Varianten: **Günstig**, **Solide**, **Premium**
  (Kriterien siehe 5). Beim Beispiel sind das 3 Ziele × 3 Profile = 9 Varianten.
- **D3 [neu, P1]** Jede Variante zeigt Gesamtpreis, Preis pro Person, Preis pro Person und Nacht,
  Anzahl Nächte, Reisezeit (Flugdauer, Umstiege, Anreise) und Qualität (Sterne, Bewertung).
- **D4 [neu, P1]** Die App probiert innerhalb des Zeitfensters verschiedene Starttage und Dauern
  (9 bis 12 Nächte) und nimmt pro Variante die mit dem besten Preis-Leistungs-Wert
  (siehe 6). Ich sehe, warum sie diese gewählt hat.
- **D5 [neu, P1]** Ohne Suche rechnet die App mit **Richtwerten** (hinterlegte Durchschnittspreise
  nach Land, Profil und Saison) und kennzeichnet das Ergebnis als Schätzung. Mit Suche ersetzt
  sie Richtwerte durch echte Angebote und kennzeichnet sie als „Preis vom 25.09.“.
- **D6 [neu, P1]** Ich übernehme eine Variante mit einem Klick als Reise. Ihre Posten stehen
  dann im Status *Idee* mit den gefundenen Optionen und lassen sich wie in B und C weiterbearbeiten.
- **D7 [neu, P2]** Ich passe eine Variante an (anderes Hotel, anderer Flug), ohne die anderen zu verlieren.
- **D8 [neu, P2]** Ich stelle Zusatzkosten pauschal ein, die in jede Variante einfließen:
  Verpflegungsstil, Mietwagen ja oder nein, Ausflüge pro Tag.
- **D9 [neu, P3]** Ich lasse mir Ziele vorschlagen, die ich nicht angegeben habe, aber zum
  Wunsch passen (zum Beispiel Portugal, Türkei).

### E. Vergleichen und Entscheiden

- **E1 [heute, P1]** Ich speichere einen Stand und vergleiche ihn später mit dem aktuellen.
- **E2 [neu, P1]** Ich vergleiche Varianten nebeneinander: Tabelle mit Gesamt, pro Person,
  pro Nacht, Reisezeit, Qualität und Kosten nach Kategorie.
- **E3 [neu, P2]** Ich sehe eine Grafik Preis gegen Nutzen, in der die günstigsten und die
  ausgewogensten Varianten hervorgehoben sind.
- **E4 [neu, P2]** Ich markiere Favoriten und schließe Varianten aus.

### F. Gemeinsam planen

- **F1 [heute auf claude.ai, P2]** Mitreisende sehen und bearbeiten dieselbe Reise live.
- **F2 [neu, P2]** Ich lade per Link ein. Rollen: *Planer* (darf alles), *Mitreisende*
  (dürfen eigene Daten und Kommentare), *Zuschauer* (nur lesen).
- **F3 [neu, P3]** Ich kommentiere Posten oder stimme über Optionen ab.
- **F4 [neu, P2]** Jeder Haushalt sieht auf Wunsch nur seine eigenen Kosten im Detail.

### G. Ausgabe und Betrieb

- **G1 [heute, P1]** Ich exportiere eine PDF: gesamt und pro Familie.
- **G2 [neu, P2]** Ich exportiere und importiere eine Reise als Datei (Sicherung, Weitergabe).
- **G3 [heute, P1]** Die App ist installierbar und funktioniert offline, mit Abgleich beim nächsten Online-Gang.
- **G4 [heute, P1]** Dunkles und helles Design, am Handy voll bedienbar.
- **G5 [neu, P2]** Ich übernehme meine Daten aus der alten claude.ai-Version.

## 4. Status eines Postens

```
Idee ──► Gewählt ──► Gebucht ──► Bezahlt
 │  (mehrere Optionen)   (Buchungsdaten)   (Zahlungen vollständig)
 └─ Verworfen
```

| Status | Zählt in Summe | Gruppe in der Übersicht | Was dazu gehört |
| --- | --- | --- | --- |
| Idee | ja, mit gewählter oder günstigster Option | offen | Optionen zum Vergleichen |
| Gewählt | ja | offen | eine Option |
| Gebucht | ja | fest | Buchungsnummer, Anbieter, Storno bis |
| Bezahlt | ja | fest | Zahlungen |
| Verworfen | nein | ausgeblendet | Grund (optional) |

Teilbezahlt ist kein eigener Status, sondern *Gebucht* mit Zahlungen, die noch nicht die Summe erreichen.

## 5. Profile

| Kriterium | Günstig | Solide | Premium |
| --- | --- | --- | --- |
| Flug | billigster Preis, Umstiege egal | Direktflug bevorzugt, max. 1 Umstieg, Abflug 7 bis 21 Uhr | Direktflug, gute Zeiten (Abflug 8 bis 18 Uhr), kurze Gesamtdauer |
| Gepäck | nur was nötig ist, aber im Preis enthalten | 1 Koffer pro Person | 1 Koffer pro Person, gern mehr |
| Unterkunft | billigste passende Belegung | mind. 3 Sterne, Bewertung ≥ 80 % | 5 Sterne, Bewertung ≥ 90 % |
| Lage | egal | max. 15 min zum Strand oder Zentrum | direkt am Strand oder im Zentrum |
| Verpflegung | selbst versorgen | gemischt | überwiegend auswärts |
| Anreise zum Flughafen | günstigster Flughafen, auch weiter weg | Flughafen bis 1,5 h | nächster Flughafen oder Bahn |

Die Grenzen sind Voreinstellungen und pro Reisewunsch änderbar. Bewertungen werden auf
Prozent vereinheitlicht (Booking 8,0 von 10 = 80 %).

Wichtig: „Günstig“ muss gültig bleiben. Kinder müssen mit ins Zimmer passen, und das Gepäck
muss im Preis enthalten sein, sonst ist der Preis nicht vergleichbar.

## 6. Bewertung: Kosten, Zeit, Nutzen

Damit die App zwischen „10 Tage für 3.200 €“ und „12 Tage für 3.600 €“ entscheiden kann,
braucht sie eine nachvollziehbare Rechnung. Vorschlag:

- **Kosten** = Gesamtpreis inklusive Anreise, Parken, Gepäck, Verpflegung.
- **Zeit** = verlorene Reisezeit (Anreise zum Flughafen, Wartezeit, Flugdauer, Umstiege),
  bewertet mit einem einstellbaren Betrag pro Stunde (Voreinstellung: 15 € pro Person und Stunde).
- **Nutzen** = Urlaubsnächte × Qualitätsfaktor (Sterne, Bewertung, Lage).

**Kennzahl:** effektive Kosten pro guter Urlaubsnacht und Person =
(Kosten + Zeitkosten) ÷ (Nächte × Qualitätsfaktor × Personen).

Die App zeigt die Kennzahl immer zusammen mit den Rohwerten, damit man ihr nicht blind
glauben muss. Die Gewichte werden in der ersten Version fest vorgegeben und später einstellbar.

## 7. Architektur

### Grundsätze

1. **Rechenkern getrennt von der Oberfläche.** Alle Preislogik (Altersklassen, Rabattstufen,
   Belegung, Verteilung auf Haushalte, Währung, Anreise) wird ein eigenes Modul ohne UI, mit
   Tests. Heute steckt sie in einer 300-KB-Datei zusammen mit der Oberfläche.
2. **Verhalten sichern, bevor wir umbauen.** Wir rechnen Beispielreisen mit der heutigen App
   durch und halten die Ergebnisse als Tests fest. Der neue Rechenkern muss dieselben Zahlen liefern.
3. **Anbieter hinter Schnittstellen.** Speicherung, Flugsuche und Unterkunftssuche sind
   austauschbare Adapter. Zuerst gibt es *Richtwerte* und *manuelle Eingabe*, echte Suchen
   kommen später dazu, ohne dass sich der Rest ändert.
4. **Offline zuerst.** Die App arbeitet lokal und gleicht ab, wenn eine Verbindung da ist.

### Bausteine

```
┌──────────────────────── Oberfläche (Web / PWA / später Capacitor) ───────────────────────┐
│  Reise planen │ Übersicht fest/offen │ Reisewunsch & Varianten │ Vergleich │ PDF         │
└───────────────┬──────────────────────────────┬────────────────────────────────────────────┘
                │                              │
        ┌───────▼────────┐            ┌────────▼─────────┐
        │  Rechenkern    │◄───────────│ Variantenplaner  │  erzeugt Varianten, bewertet (6)
        │  (rein, Tests) │            └────────┬─────────┘
        └───────┬────────┘                     │
                │                     ┌────────▼─────────┐
        ┌───────▼────────┐            │ Preisquellen     │  Richtwerte │ manuell │ später:
        │  Speicherung   │            │ (Adapter)        │  Kiwi, Booking, Trivago …
        │  lokal → Cloud │            └──────────────────┘
        └────────────────┘
```

### Technik (Vorschlag)

| Bereich | Wahl | Grund |
| --- | --- | --- |
| Sprache | TypeScript | Datenmodell mit Typen, weniger Rechenfehler |
| Build | Vite | schnell, einfach, PWA-Plugin |
| Oberfläche | Svelte oder Preact | klein und schnell, gut für Handy |
| Tests | Vitest | Rechenkern und Planer |
| Speicherung | zuerst IndexedDB lokal, dann Firebase (Firestore, Region Frankfurt) | offline, später gemeinsam |
| App-Stores | Capacitor | dieselbe Web-App für Android und iOS |
| Länderdaten | bestehende `packs.json`, `world.json`, `geo/`, `places/`, `plz.txt` | schon vorhanden und gut |

## 8. Vorgehen

Die heutige App bleibt unter der bisherigen Adresse online, bis die neue alles kann, was
man täglich braucht.

| Phase | Inhalt | Ergebnis |
| --- | --- | --- |
| **0** | Dieser Grundriss, offene Fragen klären | abgestimmte Anforderungen |
| **1** | Projekt aufsetzen (Vite, TypeScript, Tests). Datenmodell mit Status und Optionen. Rechenkern aus der heutigen App herauslösen und mit Beispielreisen absichern | Rechenkern mit Tests, noch ohne Oberfläche |
| **2** | Oberfläche für manuelles Planen (A, B), Status und fest/offen (C1 bis C3), lokale Speicherung, Import der alten Daten | neue App kann alles Tägliche, parallel zur alten |
| **3** | Reisewunsch und Varianten mit Richtwerten (D1 bis D6), Vergleich (E2) | Schnellschätzung ohne externe Dienste |
| **4** | Konten und gemeinsames Planen mit Firebase (F) | Mitreisende planen mit |
| **5** | Echte Flug- und Hotelsuche als Preisquellen | Schätzungen mit echten Preisen |
| **6** | Zahlungen, Erinnerungen, App-Stores | vollständige App |

## 9. Offene Fragen

1. **Richtwerte:** Woher sollen die Durchschnittspreise für Phase 3 kommen? Vorschlag: ich
   lege für die 18 Länderpakete eine Tabelle pro Profil und Saison an, du prüfst sie. Später
   verfeinern echte Suchergebnisse die Werte.
2. **Zeitfenster:** Reichen Schulferien für NRW, oder sollen alle Bundesländer wählbar sein?
3. **Ziele:** Reicht Land als Ziel, oder braucht es Regionen (zum Beispiel Kreta statt Griechenland)?
   Für Strandurlaub sind Regionen deutlich genauer.
4. **Pauschalreisen:** Sollen Pauschalangebote (Flug und Hotel zusammen) als eigene Option
   vergleichbar sein? Für Familien im Sommer oft günstiger.
5. **Oberfläche:** Soll das Aussehen bleiben (Farben, Ticket-Seitenleiste, Hanko-Stempel)
   oder darf es neu gestaltet werden?
6. **Wer nutzt die App?** Erst nur Familie und Freunde, oder von Anfang an öffentlich mit
   Konten? Das entscheidet, wie früh Phase 4 kommt.
