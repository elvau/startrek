# KI-Import und Realitätscheck (Konzept, in Arbeit)

Stand: Besprechung mit Dani, 20.10.2026; Umsetzung läuft (#457, #458, #459, #461 gebaut, Technik in `docs/KI.md`). Eingeplant als Epic #456 (Features #457–#462, Entscheidung #463); hängt mit
#188 (Pauschalreisen) und #417 (versteckte Kosten) zusammen.

Idee: Aus einem beliebigen Angebot (Screenshot, PDF, Text …) entsteht per KI eine echte Split&Fly-Reise. Darauf aufbauend
zeigt der **Realitätscheck**, was das Angebot wirklich kostet. Passt zu Deal-Communities (z. B. Mydealz): versteckte
Kosten aufdecken, „Prüfservice“ für Deals.

## Zwei Funktionen, aufeinander aufbauend

1. **Reise per KI importieren** – unter „Neue Reise“. Aus einer Quelle wird eine normale Reise (Posten, Daten, Personen).
2. **Realitätscheck** – Ansicht auf eine Reise: Spanne pro Kopf, Annahmen einzeln aufgeschlüsselt. Geht auch für von Hand
   angelegte Reisen.

Die versteckten Kosten rechnet die App ohnehin bei jeder Reise (`docs/NEBENKOSTEN.md`). Der Realitätscheck baut deshalb
intern eine Reise aus dem Angebot und zeigt nur die Bericht-Ansicht:

- **Realitätscheck** (eigener Einstieg): legt **keine** Reise an; die Reise existiert nur für die Ansicht. Danach
  „Als Reise übernehmen“ legt sie im Konto an.
- **Neue Reise → Per KI importieren**: legt **immer** eine Reise an.

## Entschieden

- Name: **Realitätscheck**, Untertitel „Was kostet das Angebot wirklich?“.
- Kein Angebot schlechtreden: ergänzen (Touren, Mietwagen, Transfer) und nicht genannte Kosten sichtbar machen, keine
  Wertungen. Ist einzeln günstiger, immer angeben, was gegenüber der Pauschalreise verloren geht (Pauschalreiserecht,
  Insolvenzschutz, ein Ansprechpartner, Transfer, Umbuchung bei Flugänderung).
- Ergebnis als **Spanne von–bis pro Kopf**, jede Annahme einzeln aufgeschlüsselt und anpassbar (Antippen verengt die Spanne).
  Hinweis: „Schätzungen basieren auf Annahmen und können niedriger oder höher ausfallen.“ Keine Begriffe wie „Prüfservice“
  oder „Echtpreis“, die nach Garantie klingen.
- Eingabe **mit Screenshot** (bequemer als Link).
- **Nur mit Anmeldung** (vorerst).
- **Zwei Ebenen der Speicherung:**
  - *Angebot* (gemeinsam, neutral): nur die ausgelesenen Angebotsdaten, nie die Datei/der Screenshot. Schlüssel aus den
    Angebotsdaten (Anbieter, Hotel, Daten, Preis), nicht aus dem Bild, damit verschiedene Screenshots desselben Deals
    denselben Eintrag treffen und die KI nur einmal läuft. Gültig bis Ablauf des Angebots; ohne Angabe bis Reisedatum,
    höchstens 14 Tage.
  - *Bericht* (pro Nutzer): entsteht aus der angelegten Reise, weil Wohnort/PLZ, Personen und Abflughafen das Ergebnis
    verändern.
- **Einstieg Realitätscheck:** eigene Karte auf dem Hauptbildschirm.
- **Teilnehmer aus Listen** (CSV/Excel) werden übernommen. Hinweis dazu: Persönliche Daten werden nicht gespeichert;
  trotzdem empfohlen, sie nicht weiterzugeben, auch nicht im Freitext an die KI.
- **Keine E-Mail-Weiterleitung** (verworfen, vorerst).
- **Link-Import so weit er kommt:** Seite über den Such-Dienst abrufen; klappt das nicht (gesperrt, Preise per
  JavaScript), sofort Rückmeldung mit Bitte um Screenshot oder Texteingabe des Angebots.
- **Verpflegung** umschaltbar (Ohne, Frühstück, Halbpension, All inclusive) und Schalter „Essen einrechnen“ an/aus.
  Sichtbar, was im Angebot enthalten ist. Umschaltbar nur auf Stufen, die der Anbieter tatsächlich anbietet (siehe unten).

## Vergleichsrahmen: keine Äpfel mit Birnen

Der Realitätscheck vergleicht nur innerhalb dessen, was das Angebot umfasst. Fehlendes wird **nicht** in den
„realistischen Preis“ gerechnet.

- Nur Flug für 99 €: nicht „realistisch 400 €“, weil die Unterkunft fehlt. Realistisch ist der Flug mit seinen eigenen
  Nebenkosten (Gepäck, Sitzplatz, Anreise zum Flughafen).
- Nur Hotel mit festen Daten: nicht mit einem Preis inklusive Flug vergleichen. Realistisch ist das Hotel mit Kurtaxe,
  Resortgebühr, Endreinigung usw.

Daher zwei Zahlen:

1. **Angebot realistisch** – Angebot plus die Nebenkosten, die direkt an seinen Bestandteilen hängen. Immer vorhanden.
2. **Ganze Reise** – nur wenn der Nutzer fehlende Bausteine ergänzt hat (Wizard, unten). Klar getrennt angezeigt.

### Bestandteile und ihre Nebenkosten (Entwurf)

| Bestandteil im Angebot | zählt zu „Angebot realistisch“ | erst bei „Ganze Reise“ |
|---|---|---|
| Flug | Gepäck, Sitzplatz zusammen, Anreise zum Flughafen bzw. Parken, Zahlungsgebühr | Transfer am Ziel, Unterkunft, Essen, Unterwegs vor Ort |
| Unterkunft | Kurtaxe, Resort-/Servicegebühr, Endreinigung, Parken am Hotel, Kaution (nur Hinweis), Aufpreis Verpflegung | Anreise, Transfer, Essen außerhalb der Verpflegung |
| Pauschalreise (Flug + Hotel) | alles aus beiden Zeilen, dazu Transfer, wenn nicht enthalten; Essen nach Verpflegungsstufe (Schalter) | Unterwegs vor Ort, Ausflüge |
| Mietwagen | Versicherung/Selbstbeteiligung, Kaution (Hinweis), Sprit, Einwegmiete | – |
| Event/Ticket | Servicegebühr, Anreise | – |

Noch zu klären: Grenzfälle (z. B. Transfer bei Pauschalreise ohne Transfer, Essen bei Hotel ohne Verpflegung) und wie die
zwei Zahlen in der Oberfläche gegeneinander stehen.

### Wizard: fehlende Bausteine ergänzen

Erkennt der Import, dass etwas fehlt, bietet er es an statt es zu schätzen:

- Flug ohne Unterkunft → „Hierfür eine Unterkunft suchen“ (Ziel, Daten, Personen vorbelegt).
- Hotel ohne Anreise → „Hierfür einen Flug suchen“ bzw. „Anreise mit Bahn/Auto“.
- Gilt für alle Kostenarten: Transfer, Mietwagen, Essen, Events.

Nutzt die bestehende Suche (Flüge, Unterkünfte, Events, Transport). Mit jedem ergänzten Baustein wächst die Zahl
„Ganze Reise“; „Angebot realistisch“ bleibt unverändert.

### Verpflegungsstufen

- Die KI liest die **wählbaren** Stufen samt Aufpreis aus dem Angebot (z. B. „Halbpension +18 € p. P./Nacht“). Nur diese
  erscheinen im Umschalter; markiert, welche im Angebot enthalten ist.
- Steht keine Auswahl im Angebot: Stufe fest, Hinweis „Andere Verpflegung? Beim Anbieter prüfen“, keine geschätzten Aufpreise.
- Weniger wählen als enthalten: ohne Abzug rechnen (Hotels erstatten selten).
- Essen vor Ort je Tag nach Stufe aus den vorhandenen Richtwerten (Preisniveau des Ziels), nicht aus festen Beträgen.

## Import je Einstieg (#615, Epic #614)

Je nach Ort ein eigener Knopf, der nur das übernimmt, was dorthin gehört (`app/src/lib/import/scope.ts`, `ImportDialog.svelte`):

| Einstieg | Knopf | übernimmt |
|---|---|---|
| Neue Reise | Importieren | ganze Reise mit allen Posten |
| Reise-Menü | 📥 Reise um Import erweitern | alle Posten in die offene Reise (Änderungsansicht: #617) |
| Kapitel Abheben, Unterkunft, Erlebnisse, Transport | 📥 Flug / Unterkunft / Tour / Transport importieren | nur Teile des Kapitels |
| Flug- bzw. Unterkunftssuche | „Woanders gefunden? 📥 Angebot übernehmen“ | aus der Suche eines Postens: als weiteres Angebot an diesen Posten |

- In eine bestehende Reise (`importToTrip(…, keep)`): Ziel, Daten und Name nur, wenn leer; Reisende nur bei einer leeren Reise
  (Platzhalter); die Reise wird nicht als von der KI angelegt markiert, „Essen einrechnen“ bleibt.
- Findet die KI mehr als das Kapitel: Rückfrage „Im Angebot steckt noch mehr“ zum Anhaken, Standard nicht angehakt. Vorab
  angehakt, wenn der Preis nur fürs ganze Paket gilt (`packagePriced`) oder im Kapitel nichts gefunden wurde.
- **Abgleich mit der Reise (#616, `app/src/lib/import/fit.ts`):** Zeitraum (ein Tag Spielraum), Land, Personenzahl (je Posten
  dessen Mitreisende). Fehlende Angaben zählen nicht. Bei Abweichung „Passt das Angebot zur Reise …?“ mit „Ja, hier
  übernehmen“, „Andere Reise wählen“ (passende zuerst, Reise wechselt, neuer Abgleich) und „Neue Reise daraus“. Übernommen
  wird trotzdem; die Posten tragen „bitte prüfen“ mit Grund (`checkWhy`), bis jemand „Geprüft“ antippt. Personen werden nie
  hochgerechnet.
- **Teilen am Handy:** geteilte Inhalte gehen in die zuletzt geöffnete Reise (mit Abgleich), mit „Stattdessen neue Reise“;
  ohne echte Reise (leer, nur ansehen) wie bisher „Neue Reise → Importieren“.

## Gesamtpaket (#618)

Hat eine Reise ein Paket (nicht aufgebrochen), steht das Kapitel **„Gesamtpaket“** (`pkg`) an der Stelle von „Abheben“ und
„Unterkunft“ (`app/src/lib/chapterVis.ts`, `PackageCard.svelte`). Je Paket eine Karte: Name, Gesamtpreis mit Nebenkosten,
pro Person, Farben der enthaltenen Kapitel gemischt, darin die Teile als normale Karten (Band mit Aufbrechen und Vergleich
wie bisher). Darunter **Ergänzungen** (Flug- und Unterkunftsposten außerhalb eines Pakets, z. B. Nachzügler), Knöpfe
„Flug hinzufügen“, „Unterkunft hinzufügen“, „Weiteres Paket“. Paket-Teile im Transport (Transfer) stehen im Paket, der
übrige Transport im Kapitel Transport. Datenmodell unverändert (Kategorie und Paket-Kennung je Posten); nur die Anzeige
ordnet zu. Ohne Paket fehlt „Abheben“, wenn die Reise nicht fliegt (Camper, Anreise ohne Flug, „Kein Flug nötig“ =
`trip.chapters.flights = false`) und nichts darin steht; „Doch fliegen? Flug hinzufügen“ im Transport setzt
`chapters.flights = true`. Navigation, Leiste und Pager am Handy folgen den sichtbaren Kapiteln (`chapterVis.svelte.ts`).

## Importierte Preise, Links und Pakete

Angebotspreise sind oft rabattiert oder nur beim Anbieter zu haben; dieselben Flüge bzw. Unterkünfte findet unsere Suche
meist nicht zum selben Preis. Daher:

- Der Import trägt Flug und Unterkunft **wie von Hand eingetragen** ein: als Angebot (`Option`) am Posten mit Preis laut
  Angebot, Quelle (Anbieter, Datum, Link falls bekannt; bei Screenshot ohne Link „Link hinzufügen“). Kennzeichen
  „importiert“, Preis „laut Angebot vom …, nicht live prüfbar“. Die Reisebeobachtung prüft solche Preise nicht nach.
- **Vergleich mit unserer Suche** über die vorhandene Mechanik: Suchergebnisse kommen als weitere Angebote an denselben
  Posten (mit Partner-Link nach `docs/PARTNER.md`); man wählt, welches zählt. Keine Bevorzugung von Partner-Links.
- Der Link am importierten Angebot zeigt auf das Original-Angebot (ohne Partnerkennung), nicht auf unsere Suche.

### Pakete (Pauschalreise)

- Ein Paket ist ein Preis für mehrere Posten (Flug + Unterkunft, ggf. Transfer). Neu im Modell: Kennung des Pakets an den
  beteiligten Angeboten, Gesamtpreis einmal (z. B. an einem Teil, die anderen „im Paket“).
- In der Reise als zusammengehörige Karte mit beiden Teilen, Gesamtpreis und p. P.; darunter „Mit unserer Suche
  vergleichen“: Paket wie im Angebot gegen einzeln aus der Suche (Summe, Differenz).
- **Paket aufbrechen:** Wer einen Teil ändert, bekommt eine Rückfrage („Der Preis gilt nur zusammen“). Danach werden
  alle Teile einzeln gerechnet; Teile ohne eigenen Preis zeigen „Preis fehlt“ mit „Einzeln suchen“ bzw. „Selbst
  eintragen“. Das Paket bleibt als verworfenes Angebot zum Vergleich und lässt sich wiederherstellen.
- Nebenkosten (Gepäck, Kurtaxe, Transfer) hängen weiter an den einzelnen Teilen, auch im Paket.

## Import: Eingaben

| Quelle | Hinweis |
|---|---|
| Text, Zwischenablage | einfachster Weg |
| Screenshot, Foto | auch mehrere auf einmal |
| PDF | Angebote, Buchungsbestätigungen |
| DOCX | |
| CSV, Excel | z. B. Vereinslisten mit Teilnehmern und Kosten |
| Link | so weit der Abruf kommt; sonst sofort Bitte um Screenshot oder Texteingabe |
| Teilen-Menü (Handy) | „An Split&Fly senden“ aus Browser, Mail, Galerie |
| später: Kalender (.ics) | aus Airline- und Bahn-Mails |

## Import: Confidence und Rückfragen

- Sicherheit **je Feld** (Daten 95 %, Gepäck 40 %), dazu ein Gesamtwert oben; unsichere Felder gelb markiert.
- Niedrig: vor dem Anlegen nachfragen, Antworten zum Antippen („Ist ein Koffer im Preis?“).
- Mittel: anlegen, unsichere Posten als „bitte prüfen“ markieren.
- Hoch: direkt anlegen.
- Jedes erkannte Feld bleibt korrigierbar („Etwas falsch erkannt?“).

## Datenschutz

- Dateien und Screenshots gehen zur Auswertung an die KI und werden **nicht gespeichert**; gespeichert werden nur die
  ausgelesenen Angebotsdaten (bis Ablauf).
- Buchungsbestätigungen und Listen enthalten oft Namen, Buchungsnummern, Geburtsdaten, teils Ausweisdaten. Ausweis- und
  Passdaten dürfen nie an die KI (`CLAUDE.md`). Vor dem Hochladen deutlicher Hinweis; die KI liest nur Reisedaten aus.
- `public/datenschutz.html` mitziehen; Firestore-Regeln für den Angebotsspeicher (Dani spielt sie ein).

## Offene Fragen

1. Wie stehen „Angebot realistisch“ und „Ganze Reise“ in der Oberfläche nebeneinander?
2. **Angebotskatalog** (Idee von Dani, Entscheidung #463): geprüfte Angebote gesammelt und auf die Realität gerechnet, öffentlich
   durchsuchbar. Rechtliches Risiko, bevor es öffentlich wird, prüfen lassen:
   - Herabsetzung bzw. Anschwärzung von Anbietern (UWG): nur nachprüfbare Fakten, keine Wertungen wie „Abzocke“.
   - Schätzungen klar als Schätzung, Annahmen und Quellen sichtbar; Korrektur- und Löschweg für Anbieter.
   - Keine Bilder oder Texte aus den Angeboten übernehmen (Urheberrecht), Markennamen nur zur Benennung.
   - Vorschlag: zuerst nur intern (Speicher, Dubletten), öffentlich ggf. ohne Anbieternamen oder erst nach Rechtsberatung.

## Entwurf

Zwei Canvas-Entwürfe liegen bei Dani:
- *Realitätscheck* (3 Bildschirme): Screenshot einwerfen, Erkannt und ergänzen, Bericht mit Verpflegungs-Umschalter.
- *Reise importieren* (5 Bildschirme, 20.10.): Neue Reise → Importieren (Datei, Text, Link, Einfügen); Erkannt mit
  Sicherheit je Angabe und Rückfragen; Was fehlt noch (Suchen, Schätzen, Brauchen wir nicht); in der Reise: Paket und
  Vergleich mit unserer Suche samt „Paket aufbrechen“; Realitätscheck ohne Reise am Beispiel „nur Flug“.

## Umfeld (aus derselben Besprechung)

- Schnäppchen-Posts: Routine sucht Gruppen-Deals und schlägt Posts vor (eigene Kanäle wie Telegram/WhatsApp/Bluesky,
  Freigabe durch Dani, Kennzeichnung „Anzeige“, Preis live prüfen). Mydealz nur von Hand und offen als Entwickler.
  Noch nicht entschieden.
- Charter für Vereine bzw. Communities: nur über Veranstalter/Broker sinnvoll (Haftung, Vorkasse); Plattform könnte
  Nachfrage bündeln. Nur Idee.
