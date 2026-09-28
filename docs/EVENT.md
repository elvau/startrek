# Reise zu einem Event

Für Reisen mit festem Anlass (Fußballspiel, Konzert, Messe): Man gibt ein, **was**, **in welcher Stadt**, **wann** (Datum, Beginn, Dauer) und optional **wo genau** (Stadion, Halle).
Die App schlägt daraus bis zu drei Reisen vor und sucht dafür Flüge und Unterkünfte über den Such-Dienst.

## Vorschläge

| Vorschlag | Hin | Zurück | Bedingung |
|---|---|---|---|
| Tagesausflug | am Tag | am Tag | nur wenn der Rückflug frühestens 2,5 h nach dem Ende noch vor 23 Uhr liegt |
| Mit einer Nacht | am Tag | am Folgetag | Landung spätestens 3 h vor Beginn |
| Entspannt ab Vortag | am Vortag | am Folgetag | – |

- Flug: günstigster passender Treffer inklusive Anreise zum Abflughafen, Abflug von den nächsten Flughäfen zum Wohnort, ohne Aufgabegepäck.
- Unterkunft: günstigste mit Bewertung ab 8 von 10, sonst die günstigste.
- „Übernehmen“ setzt die Reisedaten und legt Flug und Unterkunft als Posten an; weitere Angebote gibt es in der Flug- und Unterkunftssuche.

## Code

- `app/src/lib/event/plan.ts`: Vorschläge, passende Flüge, Übernehmen (mit Tests)
- `app/src/lib/ui/EventPlanner.svelte`: Dialog; Einstieg im Willkommen-Dialog und im Kopf der Reise
- Das Event steht in der Reise unter `event` (Name, Beginn, Dauer, Ort); Stadt und Land in `place`/`country`.

## Später

- Termine automatisch holen (Spielpläne, Konzerte), Unterkünfte nach Entfernung zum Veranstaltungsort sortieren
- Der KI-Agent (Premium) kann dieselben Vorschläge nutzen
