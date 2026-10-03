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

## Sportkalender

Große Sportevents außerhalb des Fußballs und Rennen, bei denen man selbst starten kann, ohne Schlüssel:
`app/src/lib/events/sports.ts` (Liste `SPORTS`, Suche `searchSports`, Tests in `sports.test.ts`).

- Im Event-Planer unter der Suche: Sportart antippen (Olympia, Selbst mitmachen, Laufen, Triathlon, Radsport, Wintersport,
  Tennis, Motorsport, Golf, Mannschaftssport); Stichwörter wie „Berlin Marathon“, „Olympia“, „Vierschanzentournee“ gehen auch.
- Treffer zeigen Zeitraum (mehrtägig), Sportart und bei Rennen die Anmeldung: offen (solange Plätze frei), Losverfahren
  oder nur mit Qualifikation; „Termin vorläufig“, wenn der Veranstalter ihn noch nicht bestätigt hat.
- Bei „Events vor Ort“ erscheinen Sportevents im Umkreis und im Reisezeitraum; mehrtägige zählen, solange sie laufen.
  Bei mehreren Spielorten (Handball-WM, Eishockey-WM, Rugby-WM) zählt der nächste zum Reiseort.
- Die App fragt den Kalender selbst ab (geht also auch ohne Such-Dienst und in der Testumgebung), der Such-Dienst hat
  ihn ebenfalls (`POST /events/search` mit `sport`, für den KI-Konnektor); doppelte Treffer fallen weg.
- Automatisch dazu: `scripts/sports.mjs` holt beim Deploy (wie Flughafen- und Einreisedaten) die Formel 1 von Jolpica
  (api.jolpi.ca, dieses und nächstes Jahr) und große Sportevents der nächsten drei Jahre von Wikidata (CC0, mindestens
  8 Wikipedia-Artikel, ohne Fußball und Teilwettbewerbe) nach `public/sports.json`; die App lädt die Datei dazu.
  Doppelte (gleiche Sportart, höchstens 3 Tage und 150 km auseinander) fallen weg, die kuratierte Fassung gewinnt.
  Logik und Tests: `app/src/lib/events/feed.ts`. Das Skript warnt im GitHub-Lauf, wenn die kuratierte Liste
  weniger als ein halbes Jahr in die Zukunft reicht.
- Pflege: Termine sind im Oktober 2026 recherchiert. Vorbei ist vorbei; neue Jahrgänge von Hand eintragen
  (Quelle prüfen, `tbc: true` solange vorläufig). Offen: Étape du Tour 2027 (Strecke kommt am 22.10.2026),
  Ironman Frankfurt 2027, UTMB 2027, Formel 1 2027.

## Später

- weitere Quellen (z. B. Eventim, TheSportsDB), Veranstaltungsort per Karte bestimmen, wenn keine Koordinaten kommen
- Der KI-Agent (Premium) kann dieselben Vorschläge nutzen

## Erlebnisse finden (in der Reise)

Im Kapitel „Erlebnisse“ öffnen **🎟 Events vor Ort** und **🎡 Touren & Tickets** denselben Dialog (`app/src/lib/ui/ExploreDialog.svelte`).

- **Events vor Ort:** sucht ohne Stichwort, was im Reisezeitraum am Reiseort läuft (optional mit Stichwort). Ticketmaster im Umkreis
  von 30 km um die Stadtmitte, football-data.org: Heimspiele der Vereine mit Stadion in der Stadt (höchstens vier Vereine).
  Such-Dienst `POST /events/search` mit `city`, `cityEn`, `cc`, `lat`, `lon`, `from`, `to` (`q` darf dann leer sein).
- **Touren & Tickets:** Viator-Partner-API (Freitext-Suche, Preis ab, Bewertung, Bild, Dauer), gut und oft bewertet zuerst.
  Such-Dienst `POST /activities/search` (`place`, `from`, `to`, `lang`), 6 Stunden zwischengespeichert. Code: `app/src/lib/activities/`.
- **Übernehmen** legt einen Posten in „Erlebnisse“ an (Preis ab pro Person, Termin und Ort als Notiz, Link zur Buchung).
  Preise in anderen Währungen als Euro werden nicht übernommen (ohne Kurs würden sie als Euro zählen), die trägt man selbst ein.

Viator einrichten:
1. viator.com/partner → als **Affiliate-Partner** anmelden (kostenlos), nach der Freischaltung unter *API* den Schlüssel (Production) holen.
2. Cloudflare → Workers & Pages → **startrek** → Einstellungen → Variablen und Geheimnisse → **Secret** `VIATOR_API_KEY`.
3. Ohne Schlüssel zeigt der Reiter „noch nicht eingerichtet“ und die Links zu GetYourGuide, Viator und Tiqets.

Nutzungsbedingungen der Viator-Affiliate-API (von Dani akzeptiert, 10/2026), daran halten wir uns:
- Viator-Inhalte und API nur, um Affiliate-Traffic zu viator.com zu leiten: jeder Treffer und jeder übernommene Posten
  verlinkt auf viator.com mit Partnerkennung; keine Nutzung für andere Zwecke.
- Nur für die eigene Domain (splitandfly.com); keine Weitergabe an Websites oder Anwendungen Dritter.
- API nur so, wie in der technischen Dokumentation von Viator beschrieben.
- Kein Bieten auf geschützte Begriffe wie „Viator“ in Suchmaschinen- oder anderer Werbung.
- Keine Viator-Inhalte indexieren lassen (keine öffentlichen, durchsuchbaren Seiten mit Touren).
- Verstöße können zur sofortigen Sperre des Partnerkontos führen.

Umsetzung: Der Such-Dienst liefert Touren nur für Aufrufe von splitandfly.com (und lokal) und nur bei `PARTNER_LINKS=on`
(`viatorBlock` in `app/src/lib/activities/search.ts`); die Testumgebung zeigt „nur auf splitandfly.com“. Der KI-Konnektor
hat keine Touren-Suche.


