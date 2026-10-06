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

## Gepäck und Sitzplätze (Flug-Nebenkosten)

Günstige Tarife enthalten oft keinen Koffer. Damit der Vergleich ehrlich bleibt, rechnet die Trefferliste das dazu, was
die Gruppe braucht (`app/src/lib/flights/addons.ts`, Richtwerte ohne Gewähr, Stand 2026):

- **Koffer:** aus dem Feld „Koffer gesamt“. Ohne eigene Wahl gilt die Vorliebe „Gepäck“, ohne Vorliebe ab 5 Reisetagen
  ein Koffer je Platz, kürzer nur Handgepäck.
- **Was enthalten ist:** Kiwi.com rechnet die gewünschten Koffer schon in den Preis ein und meldet sie; Duffel meldet das
  Gepäck des Tarifs. Travelpayouts sagt nichts dazu: bei Billigfliegern schätzen wir die Koffer, bei Linienflügen
  steht „Gepäck nicht angegeben“ (keine Schätzung). Meldet ein Linientarif ausdrücklich keinen Koffer, gilt 35 € je Koffer und Strecke.
- **Sitzplätze:** Vorliebe „Kinder im Flugzeug“ (fehlt: neben den Eltern). Verlangt eine Airline eine bezahlte Platzwahl,
  damit Kinder neben einem Erwachsenen sitzen (`famSeat`), wird ein Platz je bis zu 4 Kinder und Strecke gerechnet. Stand
  10/2026 trifft das auf keine der Airlines zu (Ryanair und Wizz setzen Kinder kostenlos dazu); ab etwa Mitte 2027 schreibt
  die überarbeitete EU-Fluggastrechte-Verordnung das für Kinder unter 14 ohnehin vor. Dazu der
  Tipp, früh einzuchecken (viele Airlines setzen Familien dann nebeneinander, ohne Garantie).
- **Sortierung:** „Günstigste“ sortiert nach dem Preis mit Koffern und Sitzplätzen. Übernommen landen beide als
  geschätzte Nebenkosten „bei der Buchung“ im Posten (wegklickbar), dazu „Enthalten: …“.
- **Kartenaufschlag:** in EU/EWR und Großbritannien für Verbraucherkarten verboten; bei Abflug anderswo ein Hinweis im Posten.

| Airline | Codes | Koffer je Strecke | Platzwahl Familie je Strecke | Quelle |
|---|---|---|---|---|
| Ryanair | FR, RK, AL, RR | 40 € | – (seit 6/2026 Kinder gratis neben Erwachsenen) | ryanair.com, Gebühren |
| Wizz Air | W6, W4, W9 | 45 € | – (ein Kind gratis neben einem Erwachsenen) | wizzair.com, Gebühren |
| easyJet | U2, EC, DS | 35 € | – | easyjet.com, Gebühren |
| Vueling | VY | 30 € | – | vueling.com, Gebühren |
| Eurowings | EW | 30 € | – | eurowings.com, Tarif Basic |
| Transavia | HV, TO | 35 € | – | transavia.com, Gebühren |
| Volotea | V7 | 30 € | – | volotea.com, Gebühren |
| Pegasus | PC | 25 € | – | flypgs.com, Tarif Basic |
| SunExpress | XQ | 25 € | – | sunexpress.com, Tarif SunEco |
| Jet2 | LS | 25 € | – | jet2.com, Gebühren |
| Norwegian | DY, D8 | 35 € | – | norwegian.com, Tarif LowFare |

Eine neue Airline ist eine Zeile in `LOW_COST`.

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
- **Unterkünfte:** ab 11 Gästen auf mehrere Unterkünfte zu je höchstens 8 (änderbar), auch bei Hotels: die Anbieter
  liefern für mehr als etwa 10 Gäste kaum etwas (live: Trivago 0 Hotels für 15, 25 für 8). Gesucht für die größte;
  der Preis gilt je Unterkunft und wird mit `multiply` so oft gezählt wie nötig. Hotels: ein Zimmer je zwei Gäste.

## Flughafentransfer

Kapitel „Vor Ort“, bei Reisen mit Flug (oder fernem Ziel): vom Ankunftsflughafen (sonst dem nächsten großen Flughafen
am Ziel) zur Unterkunft mit Lage, sonst zum Anlass oder in die Ortsmitte (`app/src/lib/transfer.ts`,
`app/src/lib/ui/TransferOptions.svelte`). Fahrzeug nach Gruppengröße mit Gepäck (Taxi bis 3, Van bis 7, Kleinbus bis 16,
darüber Reisebusse), Richtwert je Fahrt aus Grundpreis und Straßen-km, angepasst ans Preisniveau des Landes;
Posten „Flughafentransfer“ mit zwei Fahrten. Links: Kiwitaxi, GetTransfer, Intui.travel (Partnerprogramme über
Travelpayouts), Welcome Pickups, Booking.com Taxi, Route in Google Maps.

## Abflughäfen und Wohnort

`app/src/lib/airports.ts`: die NRW-Flughäfen mit festen Bahnpreisen (Vorschlag ohne Wohnort) und 20 weitere in
Deutschland und grenznah (HAM, BER, STR, NUE, LEJ, DRS, BRE, FMO, FKB, FMM, HHN, SCN, FDH, BSL, ZRH, VIE, SZG, LUX, BRU, CRL);
für diese kommen Bahnpreis und Fahrzeit aus der Entfernung (`trainPP` in `calc/travel.ts`). Zur Auswahl stehen die 8
nächsten zum Wohnort der Mitfliegenden. Fehlt der Wohnort, fragen Flugsuche und Event-Planer direkt nach der PLZ.
Kurze Reisen (bis 3 Nächte) sucht die flexible Suche mit der ganzen Dauer, damit alle Gruppen dieselben Tage fliegen.
Für Abflüge in mehr als etwa 11 Monaten erklärt die Suche, dass die Airlines meist noch nicht verkaufen.
Testangebote (Sandbox) stehen in allen Sortierungen hinter den echten.

## Strecken mit dem Auto (Roadtrip, #201)

Ohne Flug und mit mehreren Stationen (bzw. einem Auto-Posten) gilt eine Reise als Roadtrip. Die Etappen laufen Wohnort →
Stationen (aus den Unterkünften im Tagesplan) → Wohnort.

- **Routen-Dienst:** `POST /road/route` mit `{ points: [[lat, lon], …] }` (2 bis 25 Punkte, auf etwa 100 m gerundet).
  Der Worker fragt OpenRouteService (`driving-car`) und gibt je Etappe km, Minuten und einen ausgedünnten Verlauf zurück.
  Gleiche Strecken kommen 30 Tage aus dem Zwischenspeicher. Höchstens 4 echte Anfragen pro Minute für alle zusammen
  (`ORS_PER_MIN`, je Rechenzentrum; ORS erlaubt 40); darüber schätzt die App und fragt nach der Wartezeit erneut. In der
  Admin-Ansicht steht OpenRouteService mit der Tagesgrenze 2.000. Code: `app/src/lib/road/ors.ts`.
- **Schlüssel:** `ORS_KEY` als **Secret** im Worker (kostenlos bis 2.000 Strecken pro Tag, Konto auf openrouteservice.org).
  Ohne Schlüssel antwortet der Worker `configured: false`, und die App schätzt (Luftlinie × 1,3 bei 85 km/h).
- **Länder auf der Strecke:** Stichproben etwa alle 10 km entlang des Verlaufs, jede zählt zum Land der nächstgelegenen
  Stadt aus `world.json`. Daraus kommen die Kilometer je Land: Maut nach den km im Land, jede Vignette nur so oft wie nötig
  (Fahrtage im Land innerhalb ihrer Gültigkeit). Code: `app/src/lib/road/trip.ts`.
- **Fahrzeit:** mit 15 Minuten Pause je angefangene 2 Stunden (die erste nicht). Über 8 Stunden: Hinweis „lange Etappe“,
  dazu „Zwischenstopp suchen“ bzw. „in 2/3 Etappen teilen“ (`road/split.ts`): Zwischenstopps als Unterkunfts-Posten
  (Richtwert 45 € pro Person und Nacht) bei einer Stadt nahe der Bruchstelle; die Ankunft an der nächsten Station bzw.
  zu Hause verschiebt sich entsprechend.
- **Tagesplan:** an jedem Fahrtag ein Eintrag mit Strecke, km und Fahrzeit.
- **Vergleich Bahn/Bus/Auto/Flug:** bei Roadtrips auch über 700 km Luftlinie.
- Quellenangabe in der App: „© openrouteservice.org by HeiGIT, Kartendaten © OpenStreetMap-Mitwirkende“.
