# KI-Planer (Beta, Claude von Anthropic, ersatzweise Google Gemini)

Man beschreibt die Wunschreise in eigenen Worten („4 Freunde, Anfang Mai, 3 Nächte am Meer, max. 500 € p. P.“).
Die KI sucht über unsere Flug- und Unterkunftssuche und schlägt 2–3 Reisen vor, die man mit „Übernehmen“ in die Reise holt.

## Ablauf

1. App (`app/src/lib/agent/app.ts`): Wunsch, Reisende, nächste Abflughäfen, Sprache, bekanntes Ziel/Daten → `POST /agent` am Such-Dienst,
   mit dem Firebase-Anmeldenachweis (`Authorization: Bearer …`).
2. Such-Dienst (`worker/src/index.ts`): prüft Anmeldung (`agent/auth.ts`) und Tageslimit, ruft `runAgent` auf.
3. `app/src/lib/agent/agent.ts`: Gemini mit Funktionsaufrufen `search_flights`, `search_stays`, `propose_trips`.
   Gemini nennt nur Kennungen von Angeboten; die echten Angebote hängt der Such-Dienst an. Erfundene Kennungen fallen weg.
4. Grenzen je Anfrage: 8 Runden, 4 Flugsuchen, 3 Unterkunftssuchen, 3 Vorschläge. Personen kommen aus der App, nicht von der KI.

## Kontexte

Ein Chat für alles; die KI erkennt aus der Nachricht, worum es geht (`contextLines` in `agent.ts`):
- **Neue Reise** (Startseite): suchen und 2–3 Vorschläge (`propose_trips`), oder nur antworten (`answer`).
- **Eventsuche**: `search_events` (Ticketmaster, football-data.org, Sportkalender über den Such-Dienst, höchstens 2 je
  Anfrage); Vorschläge um den Termin herum mit `eventIds`, in einer offenen Reise `events` in `update_trip`. Übernommen
  werden nur echte Events, als Posten unter „Erlebnisse“ (`eventItem`).
- **Diese Reise** (offene Reise): wie bisher `update_trip`.
- **Vorlieben**: `suggest_prefs` mit nur den genannten Feldern (geprüft wie bei der Kontoeinrichtung, `prefsFromAi`);
  der Chat zeigt eine Karte „Vorlieben ändern“, gespeichert wird erst mit *Übernehmen* (`withSuggestion`: gesperrte
  Länder kommen dazu, sonst ersetzt).

Die Antwort nennt den Kontext (`context`), der Chip oben im Chat zeigt ihn. Über den Chip lässt er sich festlegen
(`focus` in der Anfrage, „The user chose the context …“).

## Konto einrichten (#160)

Der Assistent „Konto einrichten“ (`app/src/lib/ui/SetupWizard.svelte`; nach der Anmeldung einmal je Konto, sonst über „Ersteinrichtung neu starten“ im Kontomenü bzw. in den Vorlieben, #330) kann aus
freiem Text vorbefüllen: `POST /setup` mit `{ text }` (höchstens 1500 Zeichen), Anmeldung wie beim Planer, zählt als
eine Anfrage im Tageskontingent (`AGENT_DAILY`). Gemini muss genau `fill_profile` aufrufen
(`app/src/lib/setup/ai.ts`); App und Such-Dienst übernehmen nur bekannte Felder mit gültigen Werten (`parseSetupAi`).
Namen, Geschlecht, Staatsangehörigkeit und Geburtsdatum gehören nicht zum Schema, die fragt die App selbst ab.
Ohne die Route (Such-Dienst noch alt, 404) meldet die App das und es geht ohne KI weiter.

## Große Gruppen

Eine Flugbuchung fasst höchstens 9 Plätze. Die KI sucht für Gruppen ab 5 Erwachsenen mit `seats: 2` (kleine Buchungen
bekommen oft die günstigsten Tarife) und kann die Gruppe auf verschiedene Flüge verteilen (`flights` mit `travelers`
je Flug). Beim Übernehmen wird jede Buchung ein eigener Flugposten mit ihren Reisenden („Flug DUS – PMI (2/5)“),
Preis pro Platz mal Personen. Zimmer wählt die KI nach Wunsch (`rooms`). Gruppen bis 20 Erwachsene.
Der KI-Konnektor kann das ebenso (`add_flight` mit `travelers`).

## Familien mit eigenen Zeiten (#230)

Kommen und gehen Familien zu unterschiedlichen Zeiten („wir drei Wochen, die anderen ab Woche 2, Oma zehn Tage“), plant
die KI vom ersten Ankommen bis zur letzten Abreise und liefert je Vorschlag `groups`: je Familie Personen und eigene
erste Nacht und Abreise. Sie sucht eine Unterkunft für den ganzen Zeitraum (die Rechnung teilt sie pro Nacht nach
Anwesenden) und Flüge je Familie für deren Daten (`flights` mit `group`).
- Eingetragene Familien gehen als Kürzel (`F1`, `F2` …) mit Personen und eigenen Zeiten in die Anfrage, ohne Namen.
  Personen bekannter Familien nimmt der Dienst aus der Anfrage, nicht von der KI.
- Neue Familien aus dem Wunsch (`G1` …, mit kurzem Namen wie „Oma“) nur, wenn die App noch keine Reisenden kennt.
- Übernehmen und „Alle übernehmen“ legen die Familien mit ihren Zeiten (`households[…].arrive/depart`) und die Flüge
  mit den Personen der jeweiligen Familie an. Die neue Reise bekommt dieselben Reisenden wie die Vorschau, damit
  Vorschau und Übernahme gleich rechnen (#226).

## Camper-Reisen (#269)
Mit Camper oder Wohnmobil schlägt die KI keine Hotels vor, sondern Stationen auf Campingplatz oder Stellplatz
(`camper.stops` in `propose_trips`, `camperStations` in `update_trip`: Ort, Land als ISO-2, Nächte, `site`/`pitch`). Die
Richtwerte je Nacht rechnet die App (`app/src/lib/road/camper.ts`), die Posten entstehen wie im Kapitel Vor Ort
(`app/src/lib/road/stations.ts`); gemietet kommt der Mietcamper dazu. Die offene Reise meldet `camper` in `TripBrief`.

## Beratung in der offenen Reise

Ist eine Reise offen (Ziel oder eigene Posten vorhanden), berät die KI dazu statt neue Reisen zu planen:
Fragen beantworten („Was fehlt noch?“) oder Änderungen vorschlagen („günstigeres Hotel“, „wir fahren mit dem Auto“).

- App: `tripBrief` schickt eine Kurzfassung als `current` mit (Ziel, Daten, Posten mit Kennung, Bereich, Name, Status,
  Betrag für alle; keine Namen, Notizen, Buchungsangaben). Automatische Posten (Verpflegung) bleiben draußen.
- KI: abschließende Funktion `update_trip` statt `propose_trips`: Antworttext plus alle Änderungen eines Auftrags
  (Ziel/Daten, Posten entfernen, echte Flüge/Unterkünfte aus den Suchen, Schätzungen; jeweils optional `replaces`).
  Unbekannte Kennungen fallen weg, gebuchte und bezahlte Posten bleiben unangetastet.
- Chat: **eine** Rückfrage pro Auftrag („Die KI möchte 3 Sachen ändern“) mit *Übernehmen* oder *Als KI-Vergleichsreise
  anlegen* (Kopie der Reise, das Original bleibt). Nach dem Übernehmen *Rückgängig* (Stand davor).
- Markierung `Item.ai = { at, kind }`: `suggested` (echtes Angebot), `created` (Schätzung), `changed` (ersetzt einen
  Posten, an derselben Stelle). Auf der Karte als Leiste „&✈KI Von der KI …“, Reisen auf der Startseite mit &✈KI.
- Marke: `ui/AiMark.svelte`, Kurzwort je Sprache in `ai.brand` (KI, AI, IA, ИИ).

## Anbieter

Planer und Kontoeinrichtung bauen ihre Anfragen im Format von Gemini. `worker/src/ki.ts` wählt den Anbieter:
**Claude** (`worker/src/claude.ts`, Standard `claude-haiku-5-5`), wenn `ANTHROPIC_API_KEY` gesetzt ist, sonst Gemini.
Mit beiden Schlüsseln springt Gemini ein, wenn Claude beim ersten Aufruf einer Anfrage überlastet ist, nicht rechtzeitig
antwortet oder einen Serverfehler meldet; danach bleibt die Anfrage beim Anbieter, der geantwortet hat.
`claude.ts` übersetzt Anfrage und Antwort (Schema, Werkzeugaufrufe, Ergebnisse) und schickt die Denkblöcke von Claude
unverändert zurück; der Verlauf wird nur angehängt. Ohne SDK, weil Cloudflare den Dienst ohne Installationsschritt baut.
Kosten mit Haiku: grob unter 1 Cent je Planung (0,10 $ / 0,50 $ je Mio. Token Ein-/Ausgabe, Verlauf im Zwischenspeicher).

## Einrichten

**Claude (Hauptanbieter):**
1. Konto unter [platform.claude.com](https://platform.claude.com) anlegen (mit der E-Mail des Gewerbes), Organisation
   „Split&Fly“ benennen, unter *Billing* Zahlungsmittel hinterlegen und Guthaben aufladen (z. B. 10 $). Optional unter
   *Limits* ein Monatslimit setzen (z. B. 20 $) und eine E-Mail-Warnung.
2. *API keys* → *Create key*, Name „startrek-worker“, Schlüssel kopieren (er wird nur einmal angezeigt).
3. **Cloudflare:** Workers & Pages → **startrek** → Settings → Variables and Secrets → Add → Typ **Secret**,
   Name `ANTHROPIC_API_KEY`, Wert = Schlüssel. Wirkt sofort, ohne Release.
4. Optional als Variablen (Typ Text): `CLAUDE_MODEL` (Standard `claude-haiku-5-5`), `CLAUDE_EFFORT` (Denktiefe
   `low`, `medium` = Standard, `high`).

**Gemini (Ersatz):**
1. **Schlüssel:** [aistudio.google.com](https://aistudio.google.com) → *Get API key* → *Create API key* (Projekt wählen).
2. **Cloudflare:** wie oben, Name `GEMINI_API_KEY`. Ohne beide Schlüssel meldet der Planer „noch nicht eingerichtet“.
3. Optional als Variablen (Typ Text):
   - `GEMINI_MODEL` – Modell, Standard `gemini-3.8-flash` (bei Google nachsehen, welche Modelle aktuell sind; ältere wie `gemini-2.5-flash` gibt es für neue Konten nicht mehr)
   - `GEMINI_FALLBACK_MODEL` – optional: Ausweichmodell, falls das erste überlastet ist (Google meldet 503). Vorher wird nach 1 und 3 Sekunden wiederholt. Ohne diese Variable sucht sich der Such-Dienst selbst ein anderes Flash-Modell aus der Liste, die Google für den Schlüssel anbietet; weitere Runden derselben Anfrage bleiben beim Modell, das geantwortet hat.
   - `AGENT_DAILY` – Anfragen pro Nutzer und Tag, Standard 5
4. Optional **KV-Speicher** für ein genaues Tageslimit: ohne ihn zählt der Such-Dienst je Cloudflare-Rechenzentrum
   (reicht für die Beta). Mit KV: Namespace anlegen, als Binding `AGENT_KV` in `wrangler.toml` und `worker/wrangler.toml` eintragen.

## Datenschutz und Kosten

- Anthropic nutzt Eingaben über die API nicht zum Training; Abrechnung nach Verbrauch, Kosten in der Claude Console
  (Admin-Ansicht verlinkt sie).
- Der kostenlose Tarif der Gemini-API (Ersatz) hat Mengengrenzen, und Google darf die Eingaben dort zur Verbesserung
  nutzen; steht so in `public/datenschutz.html` (Abschnitt 7).
- Nur angemeldete Nutzer mit bestätigter E-Mail (Google, Anmelde-Link; `requireVerified`), Tageslimit pro Nutzer (gezählt vor dem Lauf, zurück bei Fehler oder Rückfrage), dazu je IP
  höchstens 15 pro Stunde und 40 pro Tag (`worker/src/ratelimit.ts`, `IP_LIMITS`). Nach 80 s schlägt der Planer das
  bisher Gefundene vor; KI-Aufrufe brechen nach 40 s ab und gehen an den nächsten Anbieter bzw. das nächste Modell. Bezahlung (Premium) folgt später.

## Tests

- `worker/src/claude.test.ts`: Übersetzung für Claude, Denkblöcke im Verlauf, Wiederholung, Anbieterwechsel
- `app/src/lib/agent/*.test.ts`: Ablauf mit nachgestelltem Gemini, Grenzen, Anmeldeprüfung mit eigenen Schlüsseln
- `app/e2e/agent.mjs`: Anmeldung, Anfrage, Vorschlag übernehmen, offene Reise ändern, Rückgängig, KI-Vergleichsreise (Such-Dienst nachgestellt)
