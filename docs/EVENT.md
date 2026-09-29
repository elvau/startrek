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

## Event-Suche

Oben im Dialog: Mannschaft, Künstler oder Festival suchen, Termin antippen → Name, Stadt, Stadion, Datum und Uhrzeit sind ausgefüllt.
Ist der Veranstaltungsort mit Koordinaten bekannt, bevorzugt der Planer Unterkünfte im Umkreis von 5 km und zeigt die Entfernung.

| Quelle | Inhalt | Schlüssel (Cloudflare-Secret) |
|---|---|---|
| Ticketmaster Discovery API | Konzerte, Sport, Shows weltweit, mit Stadt und Koordinaten | `TICKETMASTER_KEY` |
| football-data.org | Spielpläne Premier League, Bundesliga, La Liga, Serie A, Ligue 1, Champions League; Stadion der Heimmannschaft, Ortszeit | `FOOTBALL_DATA_KEY` |

Einrichten:
1. **Ticketmaster:** developer.ticketmaster.com → Konto anlegen → *My Apps* → der „Consumer Key“ ist der Schlüssel.
2. **football-data.org:** football-data.org → *Register* → der Schlüssel kommt per E-Mail (kostenloser Tarif, 10 Anfragen pro Minute).
3. Cloudflare → Workers & Pages → **startrek** → Settings → Variables and Secrets → Add (Typ **Secret**).

Ohne Schlüssel bleibt die Quelle aus; ohne beide zeigt der Dialog „noch nicht eingerichtet“ und man trägt das Event selbst ein.
Code: `app/src/lib/events/` (Quellen, Zusammenführen, Tests), Such-Dienst `POST /events/search` (1 Stunde zwischengespeichert,
Mannschaftslisten 7 Tage).

## Später

- weitere Quellen (z. B. Eventim, TheSportsDB), Veranstaltungsort per Karte bestimmen, wenn keine Koordinaten kommen
- Der KI-Agent (Premium) kann dieselben Vorschläge nutzen
