# Flugsuche: Such-Dienst einrichten

Die App fragt Flug-Anbieter nicht selbst ab. Das übernimmt ein kleiner Such-Dienst
(`worker/`, ein Cloudflare Worker). Er fragt alle eingerichteten Anbieter gleichzeitig,
führt die Ergebnisse zusammen und hält die Schlüssel der Anbieter geheim.

```
App (GitHub Pages)  ──►  Such-Dienst (Cloudflare Worker)  ──►  Kiwi.com, später Duffel, Travelpayouts …
```

- Kosten: Cloudflare Workers kostenlos (bis 100.000 Aufrufe pro Tag), keine Kreditkarte nötig.
- Kiwi.com braucht keinen Schlüssel und läuft sofort.
- Der Dienst nimmt nur Anfragen von `https://elvau.github.io` (und lokal) an.
- Gleiche Suchen kommen 10 Minuten aus dem Zwischenspeicher.

## Einrichten (Cloudflare baut direkt aus GitHub)

Der Worker **„startrek“** ist in Cloudflare mit dem GitHub-Repo verbunden („Workers Builds“).
Cloudflare baut und veröffentlicht bei jedem Push auf `main` selbst, eine GitHub Action ist dafür nicht nötig.

Einmalig im Cloudflare-Dashboard: **Workers & Pages → startrek → Settings → Build**:

| Einstellung | Wert |
|---|---|
| Git repository | `elvau/startrek` |
| Production branch | `main` |
| **Root directory** | **`worker`** |
| Build command | leer lassen |
| Deploy command | `npx wrangler deploy` |

Wichtig ist das Root directory `worker`: Dort liegt `wrangler.toml`, und der Name darin (`startrek`)
muss zum Worker in Cloudflare passen.

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

Sobald ein Secret da ist, taucht der Anbieter in der Suche als „eingerichtet“ auf. Die Anbindung
selbst (`app/src/lib/flights/`) folgt, wenn die Schlüssel vorliegen.

## Lokal ausprobieren

```
cd worker
npm install
npx wrangler dev            # Such-Dienst auf http://127.0.0.1:8787
cd ../app
VITE_FLIGHTS_URL=http://127.0.0.1:8787 npm run dev
```

## Aufbau

- `app/src/lib/flights/types.ts`: gemeinsames Format (Anfrage, Treffer, Stand je Quelle)
- `app/src/lib/flights/kiwi.ts`: Kiwi.com über den öffentlichen MCP-Server `https://mcp.kiwi.com`
- `app/src/lib/flights/search.ts`: alle Quellen gleichzeitig, Doppelte raus, nach Preis sortiert; Prüfung der Anfrage
- `app/src/lib/flights/app.ts`: in der App: Anfrage aus der Reise, Treffer als Angebot übernehmen
- `worker/src/index.ts`: der Dienst selbst (Herkunftsprüfung, Zwischenspeicher)
- `app/src/lib/ui/FlightSearch.svelte`: der Such-Dialog; „Hier buchen“ ist vorbereitet, aber noch ausgegraut
