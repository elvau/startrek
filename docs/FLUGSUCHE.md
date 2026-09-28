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

Sobald ein Secret da ist, taucht der Anbieter in der Suche als „eingerichtet“ auf.

### Travelpayouts (angebunden)

1. Auf <https://www.travelpayouts.com> kostenlos anmelden, dort das Programm **Aviasales** hinzufügen.
2. Unter **Profil → API-Token** den Token kopieren, die Partnerkennung (**Marker**, eine Zahl) steht daneben.
3. Im Worker `TRAVELPAYOUTS_TOKEN` anlegen, unbedingt als Typ **„Secret“**: Einträge vom Typ „Text“ können beim
   Veröffentlichen verloren gehen. Die Partnerkennung (`TRAVELPAYOUTS_MARKER`, 783080) steht bereits in `wrangler.toml`.
4. Danach sucht die Flugsuche Kiwi.com und Travelpayouts gleichzeitig. Die Links führen zu Aviasales mit
   deiner Partnerkennung (Provision bei Buchung).

Hinweise: Travelpayouts liefert Preise aus dem Zwischenspeicher von Aviasales (Suchen der letzten Tage),
pro Person; die App rechnet sie auf alle Reisenden hoch. Start und Ziel schickt die App als Code (DUS, SPU oder Stadt-Code wie TYO).
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

## Unterkünfte

- **Trivago** vergleicht viele Portale (Airbnb, CHECK24, Booking.com, Hotelseiten …) und läuft über den
  öffentlichen MCP-Server `https://mcp.trivago.com/mcp` (andere Adresse: Variable `TRIVAGO_MCP_URL`).
- **Booking.com** wird erst gefragt, wenn die Adresse seines MCP-Servers eingetragen ist:
  Cloudflare-Dashboard → **Workers & Pages → startrek → Settings → Variables and Secrets → Add**,
  Typ „Text“, Name `BOOKING_MCP_URL`. Bis dahin zeigt die Suche „Booking.com: noch nicht eingerichtet“.

Die Suche fragt beide gleichzeitig, führt gleiche Unterkünfte zusammen (gleicher Name, gleiche Lage,
die günstigere bleibt) und liefert Gesamtpreise für den ganzen Aufenthalt.

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
