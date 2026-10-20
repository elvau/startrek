# KI-Import und Realitätscheck (Konzept, in Arbeit)

Stand: Besprechung mit Dani, 20.10.2026. Noch nicht eingeplant, kein Epic. Dieses Dokument wird erweitert, bis die
offenen Punkte geklärt sind; danach wird daraus ein Epic mit Features (`docs/ABLAUF.md`).

Idee: Aus einem beliebigen Angebot (Screenshot, PDF, Text …) entsteht per KI eine echte Split&Fly-Reise. Darauf aufbauend
zeigt der **Realitätscheck**, was das Angebot wirklich kostet. Passt zu Deal-Communities (z. B. Mydealz): versteckte
Kosten aufdecken, „Prüfservice“ für Deals.

## Zwei Funktionen, aufeinander aufbauend

1. **Reise per KI importieren** – unter „Neue Reise“. Aus einer Quelle wird eine normale Reise (Posten, Daten, Personen).
2. **Realitätscheck** – Ansicht auf eine Reise: Spanne pro Kopf, Annahmen einzeln aufgeschlüsselt. Geht auch für von Hand
   angelegte Reisen.

## Entschieden

- Name: **Realitätscheck**.
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

## Import: Eingaben

| Quelle | Hinweis |
|---|---|
| Text, Zwischenablage | einfachster Weg |
| Screenshot, Foto | auch mehrere auf einmal |
| PDF | Angebote, Buchungsbestätigungen |
| DOCX | |
| CSV, Excel | z. B. Vereinslisten mit Teilnehmern und Kosten |
| Link | viele Seiten sperren Abrufe oder laden Preise per JavaScript; dann Screenshot erbitten |
| Teilen-Menü (Handy) | „An Split&Fly senden“ aus Browser, Mail, Galerie |
| später: E-Mail weiterleiten | Import-Adresse für Buchungsbestätigungen |
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

1. Teilnehmernamen aus CSV/Excel übernehmen oder nur die Anzahl?
2. E-Mail-Weiterleitung gleich mit ins Epic oder später?
3. Link-Import: fremde Seiten über den Such-Dienst abrufen (rechtliche und technische Grauzone) oder vorerst nur
   Screenshot, Text und Dateien?
4. Einstieg in der App: „Neue Reise → Per KI importieren“; zusätzlich eigener Knopf „Realitätscheck“ auf der Startseite?
5. Wie stehen „Angebot realistisch“ und „Ganze Reise“ in der Oberfläche nebeneinander?
6. Geteilte Berichte: öffentlich per Link (für Deal-Communities), mit Ablauf?

## Entwurf

Oberflächen-Entwurf (Canvas, 3 Handy-Bildschirme: Screenshot einwerfen, Erkannt und ergänzen, Bericht mit
Verpflegungs-Umschalter) liegt bei Dani. Noch anzupassen: Import mit allen Eingaben, Confidence je Feld, Rückfragen,
Vergleichsrahmen mit zwei Zahlen und Wizard.

## Umfeld (aus derselben Besprechung)

- Schnäppchen-Posts: Routine sucht Gruppen-Deals und schlägt Posts vor (eigene Kanäle wie Telegram/WhatsApp/Bluesky,
  Freigabe durch Dani, Kennzeichnung „Anzeige“, Preis live prüfen). Mydealz nur von Hand und offen als Entwickler.
  Noch nicht entschieden.
- Charter für Vereine bzw. Communities: nur über Veranstalter/Broker sinnvoll (Haftung, Vorkasse); Plattform könnte
  Nachfrage bündeln. Nur Idee.
