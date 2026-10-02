# Flug- und Unterkunftssuche: Such-Dienst einrichten

Die App fragt Flug- und Unterkunfts-Anbieter nicht selbst ab. Das übernimmt ein kleiner Such-Dienst
(`worker/`, ein Cloudflare Worker). Er fragt alle eingerichteten Anbieter gleichzeitig,
führt die Ergebnisse zusammen und hält die Schlüssel der Anbieter geheim.

```
App (GitHub Pages)  ──►  Such-Dienst (Cloudflare Worker)  ──►  Flüge: Kiwi.com, später Duffel, Travelpayouts …
                                                          ──►  Unterkünfte: Trivago, Booking.com
```

- Kosten: Cloudflare Workers kostenlos (bis 100.000 Aufrufe pro Tag), keine Kreditkarte nötig.
- Kiwi.com und Trivago brauchen keinen Schlüssel und laufen sofort.
- Der Dienst nimmt nur Anfragen von `https://elvau.github.io` (und lokal) an.
- Gleiche Suchen kommen 10 Minuten aus dem Zwischenspeicher.

## Einrichten (Cloudflare baut direkt aus GitHub)

Der Worker **„startrek“** ist in Cloudflare mit dem GitHub-Repo verbunden („Workers Builds“).
Cloudflare baut und veröffentlicht bei jedem Push auf `main` selbst, eine GitHub Action ist dafür nicht nötig.

Einmalig im Cloudflare-Dashboard: **Workers & Pages → startrek → Settings → Build** (Reiter „Production“):

| Einstellung | Wert |
|---|---|
| Git repository | `elvau/startrek` |
| Branch control | `main` |
| Root directory | `/` |
| Build command | leer lassen |
| Deploy command | `npx wrangler deploy` |

Die Konfiguration `wrangler.toml` liegt im Hauptordner des Repos und zeigt auf `worker/src/index.ts`.
Ohne sie würde Wrangler den Ordner `app/` als statische Seite erkennen und dessen Quelldateien hochladen.
Vorschau-Builds für Branches brauchen wir nicht: unter „Previews Base“ ausschalten oder dort ebenfalls `/` als Root directory.

Danach: **Deployments → Retry build** (oder auf den nächsten Merge warten).
Die Adresse steht unter **Settings → Domains & Routes** bei `workers.dev`,
z. B. `https://startrek.DEIN-NAME.workers.dev`. Diese Adresse in `app/.env.production`
bei `VITE_FLIGHTS_URL=` eintragen (oder Claude schicken).

Test im Browser: `https://startrek.DEIN-NAME.workers.dev/health` zeigt
`{"ok":true,"dienst":"Reisekasse Flugsuche"}`.

## Weitere Anbieter (später)

Schlüssel nie in den Code, sondern als Secret im Worker:
Cloudflare-Dashboard → **Workers & Pages → startrek → Settings → Variables and Secrets → Add** (Typ „Secret“).

| Secret | Anbieter | Anmeldung |
|---|---|---|
| `DUFFEL_TOKEN` | Duffel: Live-Preise der Airlines, später direkt buchbar | <https://app.duffel.com> (Test-Token reicht zum Ausprobieren) |
| `TRAVELPAYOUTS_TOKEN` | Travelpayouts/Aviasales: Tiefpreise, Provisions-Links | <https://www.travelpayouts.com> |
| `LITEAPI_KEY` | liteAPI: Hotelpreise vieler Anbieter, Provision je Buchung | <https://www.liteapi.travel> (Test-Schlüssel sofort) |

Sobald ein Secret da ist, taucht der Anbieter in der Suche als „eingerichtet“ auf.

### Duffel (angebunden)

1. Auf <https://app.duffel.com> anmelden. Unter **Developers → Access tokens** einen Token anlegen
   (Test-Token beginnt mit `duffel_test_`, liefert die Testairline „Duffel Airways“; Live-Token erst nach der
   Freischaltung des Kontos mit Firmenangaben und Karte).
2. Im Worker `DUFFEL_TOKEN` als **Secret** anlegen.
3. Duffel wird nur bei **festen Daten** gefragt (ohne ± Tage); flexible Zeiträume und Nur-Hinflug-Fenster bleiben bei
   Kiwi und Travelpayouts. Preise in anderer Währung (z. B. Pfund) rechnet der Such-Dienst mit dem Tageskurs um. Kinder schickt die App mit
   10 Jahren (Duffel braucht ein Alter). Kosten: Suchen frei bis 1500 je Buchung, darüber 0,005 $ je Suche.
   Code: `app/src/lib/flights/duffel.ts`.

### Travelpayouts (angebunden)

1. Auf <https://www.travelpayouts.com> kostenlos anmelden, dort das Programm **Aviasales** hinzufügen.
2. Unter **Profil → API-Token** den Token kopieren, die Partnerkennung (**Marker**, eine Zahl) steht daneben.
3. Im Worker `TRAVELPAYOUTS_TOKEN` anlegen, unbedingt als Typ **„Secret“**: Einträge vom Typ „Text“ können beim
   Veröffentlichen verloren gehen. Die Partnerkennung (`TRAVELPAYOUTS_MARKER`, 783080) steht bereits in `wrangler.toml`.
4. Danach sucht die Flugsuche Kiwi.com und Travelpayouts gleichzeitig. Die Links führen zu Aviasales mit
   deiner Partnerkennung (Provision bei Buchung).

Hinweise: Travelpayouts liefert Preise aus dem Zwischenspeicher von Aviasales (Suchen der letzten Tage),
pro Person; die App rechnet sie auf alle Reisenden hoch. Start und Ziel schickt die App als Code (DUS, SPU oder Stadt-Code wie TYO).

**Preiskalender vor der Suche:** `POST /flights/calendar` (`from`, `to` als Codes, `month` JJJJ-MM, `oneWay`) holt aus
derselben Schnittstelle die Richtpreise pro Person für einen ganzen Monat (je Abflughafen; hin und zurück mit Rückflug im
selben und im nächsten Monat), 6 Stunden zwischengespeichert. Ohne `TRAVELPAYOUTS_TOKEN` meldet er „nicht eingerichtet“.
Tippt man in der App zwei Tage an, läuft die echte Suche für genau diese Daten. Code: `app/src/lib/flights/calendar.ts`.
Duffel ist noch nicht angebunden.

## Flughäfen und Städte

Die Auswahl in der App („Nach“, „+ Stadt oder Code“) nutzt `public/airports.json`: rund 4000 Flughäfen mit
Linienverkehr aus [OurAirports](https://ourairports.com/data/) (gemeinfrei) und rund 40 Städte mit mehreren
Flughäfen (Liste in `scripts/airports.mjs`). Die Datei wird bei jedem Deploy und jeden Montag neu erzeugt
(`node scripts/airports.mjs`); klappt der Abruf nicht, bleibt die Datei aus dem Projekt. Nichts davon liegt in Firebase:
die Daten sind öffentlich, der Browser lädt sie einmal und hält sie im Cache.

Eine Auswahl ist ein Name mit einer Liste von Codes:

| Auswahl | Codes | Kiwi.com | Travelpayouts |
|---|---|---|---|
| Flughafen, z. B. SPU | SPU | eine Anfrage „SPU“ | eine Anfrage je Monat |
| Stadt, z. B. Tokio | HND, NRT (Stadt-Code TYO) | eine Anfrage „HND,NRT“ | eine Anfrage „TYO“ je Monat |
| Umkreis, z. B. von Split (bis 150 km) | SPU, BWK, ZAD, OMO | eine Anfrage „SPU,BWK,ZAD,OMO“ | eine Anfrage je Flughafen und Monat, höchstens 12 (nächste Flughäfen zuerst) |

Treffer an anderen Flughäfen fallen raus.

## Nur Hinflug und Rundreise

- **Nur Hinflug**: fester Tag (± Tage) oder Zeitfenster („irgendwann 1.–10. März nach Rio“, höchstens 2 Monate).
  Kiwi sucht das Fenster in einer Anfrage, Travelpayouts je Monat.
- **Rundreise**: Stationen mit Nächten von–bis, am Ende optional zurück nach Hause. Die App sucht Strecke für Strecke als
  Hinflug mit Zeitfenster: erst die erste Strecke, dann je Ankunftstag der günstigsten Kombinationen (höchstens drei)
  die nächste. Gebucht wird jeder Flug einzeln (getrennte Tickets). Im Plan wird daraus ein Posten mit Hinflug,
  Zwischenflügen und Rückflug; die Anwesenheit reicht vom ersten Hinflug bis zum Rückflug, auch wenn Hin- und
  Rückflug in getrennten Posten stehen.
- **Gabelflug mit langem Umstieg**: Stationen mit höchstens einer Nacht (unter 48 Stunden) sucht die Rundreise zusätzlich
  als ein Ticket über diese Station (Kiwi: `stopover_airports`, Aufenthalt 4–48 h je nach Nächten). Beide Varianten
  stehen gemischt in der Liste; „2 Tickets“ statt „3 Tickets“ zeigt den Gabelflug. Travelpayouts kennt keine
  Umstiegsorte und bleibt bei diesen Anfragen still.

## Währungen

Preise der Anbieter in anderer Währung als die Suche (meist Euro) rechnet der Such-Dienst mit den Referenzkursen der
EZB um (`app/src/lib/fx.ts`, einmal am Tag geholt, 12 Stunden zwischengespeichert); die App zeigt dann „umgerechnet aus
512 £“. Ohne Kurs fällt so ein Angebot weg. `GET /rates` liefert die Kurse auch der App.

## Unterkünfte

- **Trivago** vergleicht viele Portale (Airbnb, CHECK24, Booking.com, Hotelseiten …) und läuft über den
  öffentlichen MCP-Server `https://mcp.trivago.com/mcp` (andere Adresse: Variable `TRIVAGO_MCP_URL`).
- **Booking.com** wird erst gefragt, wenn die Adresse seines MCP-Servers eingetragen ist:
  Cloudflare-Dashboard → **Workers & Pages → startrek → Settings → Variables and Secrets → Add**,
  Typ „Text“, Name `BOOKING_MCP_URL`. Bis dahin zeigt die Suche „Booking.com: noch nicht eingerichtet“.

- **liteAPI** (Nuitée) wird gefragt, sobald `LITEAPI_KEY` als **Secret** eingetragen ist: auf <https://www.liteapi.travel>
  anmelden, im Dashboard unter **Developer → API Keys** den Schlüssel kopieren (Test-Schlüssel sofort, echte Preise
  nach Hinterlegen einer Karte; Provision je Buchung). Zwei Schritte: Hotels am Ort (`/data/hotels`, Name, Lage, Sterne,
  Foto), dann Preise (`/hotels/rates`). Nur Hotels; bei „Ganze Unterkunft“ oder Pool/Küche/Klima/Parkplatz als Pflicht
  bleibt liteAPI still. Braucht das Land als Code (die App schickt `cc`). Optional `LITEAPI_LINK` (Text): Adresse der
  eigenen liteAPI-Buchungsseite (White Label) für „Beim Anbieter“. Code: `app/src/lib/stays/liteapi.ts`.

Die Suche fragt alle gleichzeitig, führt gleiche Unterkünfte zusammen (gleicher Name, gleiche Lage,
die günstigere bleibt) und liefert Gesamtpreise für den ganzen Aufenthalt.

Filter (Pool, Frühstück inklusive, Küche, Klimaanlage, Parkplatz, kostenlos stornierbar, Sterne ab, Bewertung ab)
gehen an beide Anbieter (Trivago `filters`/`hotel_rating`/`review_rating`, Booking.com `facilities`/`meal_plan`/
`star_rating`/`minimum_review_score`); Sterne und Bewertung prüfen Such-Dienst und App zusätzlich selbst.
Sortieren: Preis, Bewertung, Nähe Zentrum (aus „x km bis Zentrum“) und, mit Kindern, „Für Familien“
(Pool, Familienzimmer, Küche, Strand, Bewertung). Trivago nennt keine Verpflegung je Zimmer, nur einzelne Merkmale.

## Lokal ausprobieren

```
cd worker
npm install
npx wrangler dev            # Such-Dienst auf http://127.0.0.1:8787
cd ../app
VITE_FLIGHTS_URL=http://127.0.0.1:8787 npm run dev
```

## Aufbau

- `app/src/lib/mcp.ts`: kleiner MCP-Client für Kiwi, Trivago und Booking.com
- `app/src/lib/stays/`: Unterkünfte (Anbieter, Zusammenführen, Anfrage aus der Reise), Dialog `app/src/lib/ui/StaySearch.svelte`
- `app/src/lib/flights/types.ts`: gemeinsames Format (Anfrage, Treffer, Stand je Quelle)
- `app/src/lib/flights/kiwi.ts`: Kiwi.com über den öffentlichen MCP-Server `https://mcp.kiwi.com`
- `app/src/lib/flights/search.ts`: alle Quellen gleichzeitig, Doppelte raus, nach Preis sortiert; Prüfung der Anfrage
- `app/src/lib/flights/app.ts`: in der App: Anfrage aus der Reise, Treffer als Angebot übernehmen
- `worker/src/index.ts`: der Dienst selbst (`/flights/search`, `/stays/search`, Herkunftsprüfung, Zwischenspeicher); Konfiguration in `wrangler.toml` im Hauptordner
- `app/src/lib/ui/FlightSearch.svelte`: der Such-Dialog; „Hier buchen“ ist vorbereitet, aber noch ausgegraut

## Bahn, Fernbus, Auto, Reisebus

Bei Zielen zwischen 30 und 700 km Luftlinie vom Wohnort der Gruppe (Haushalt mit den meisten Mitreisenden, PLZ im Haushalt)
zeigt das Kapitel „Unterwegs“ Richtwerte pro Person für Hin- und Rückfahrt (`app/src/lib/ground.ts`, Anzeige
`app/src/lib/ui/GroundOptions.svelte`). Keine Schnittstelle, nur Schätzung:

- Bahn: Spanne vom Sparpreis bis zum Flexpreis nach Schienen-km (Luftlinie × 1,2)
- Fernbus: Spanne nach Straßen-km (Luftlinie × 1,3)
- Auto: Kilometerkosten der Reise, ein Auto je 5 Personen
- Reisebus ab 8 Personen: Klein-, Midi- oder Reisebus mit Fahrer, Tagessatz plus km; bleibt vor Ort oder fährt zweimal
  als Transfer, das Günstigere zählt. Mit einem Klick als Posten „Reisebus“ (Richtwert).

Reisezeit von Tür zu Tür (eine Richtung) für jede Art, die schnellste ist markiert:

- Flug: Auto zum Abflughafen, 2 Stunden vorher da, Flug, 30 min Gepäck, mit Bus oder Bahn in die Stadt. Mit Flug-Posten
  dessen Flughäfen, Flugdauer und Preis pro Person (mit Anfahrt), sonst geschätzt vom nächsten eigenen Abflughafen
  (Einstellungen) zum nächsten großen Flughafen am Ziel (`airports.json`).
- Bahn und Fernbus: je 30 min zum und vom Bahnhof bzw. Halt dazu
- Auto: 15 min Pause alle 2 Stunden; Reisebus: 45 min nach 4,5 Stunden Lenkzeit

Links: bahn.de und Google Maps mit Start, Ziel und Tag vorbefüllt; Omio, Trainline, FlixBus (später mit Partnerlinks);
für den Reisebus FlixBus Mieten und 11880 (Anfrage bei Busunternehmen).

## Große Gruppen

- **Flüge:** ab 10 Sitzen schlägt die Suche Buchungen zu höchstens 5 Personen vor (wählbar 2–9; die Anbieter suchen
  höchstens 9 auf einmal). Gesucht wird für die größte Buchung (Erwachsene und Kinder anteilig, Babys bei Erwachsenen),
  die Preise werden nach Köpfen auf alle hochgerechnet (`splitPax`, `scaleResult` in `app/src/lib/flights/app.ts`).
  Das Angebot merkt sich die Buchungsgröße (`Option.split`), die Preisprüfung sucht wieder für eine Buchung.
- **Unterkünfte:** Ferienwohnungen und „Alle“ ab 11 Gästen auf mehrere Unterkünfte zu je höchstens 8 (änderbar),
  gesucht für die größte; der Preis gilt je Unterkunft und wird mit `multiply` so oft gezählt wie nötig. Hotels:
  ein Zimmer je zwei Gäste (höchstens 30).
