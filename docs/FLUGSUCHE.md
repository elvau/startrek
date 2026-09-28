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

## Einmalig einrichten (ca. 10 Minuten)

1. **Cloudflare-Konto anlegen:** <https://dash.cloudflare.com/sign-up> (kostenlos).
2. **workers.dev-Adresse wählen:** im Cloudflare-Dashboard links **Compute (Workers) → Workers & Pages** öffnen.
   Beim ersten Mal fragt Cloudflare nach einer Subdomain, z. B. `elvau`.
   Der Such-Dienst heißt dann `https://reisekasse-suche.elvau.workers.dev`.
3. **Account-ID kopieren:** auf derselben Seite rechts unter „Account details“ → **Account ID**.
4. **API-Token erstellen:** rechts oben Profil → **My Profile → API Tokens → Create Token** →
   Vorlage **„Edit Cloudflare Workers“** → bei „Account Resources“ dein Konto wählen →
   **Continue to summary → Create Token** → Token kopieren (wird nur einmal angezeigt).
5. **In GitHub hinterlegen:** Repository **elvau/startrek → Settings → Secrets and variables → Actions →
   New repository secret**, zwei Einträge:
   - `CLOUDFLARE_API_TOKEN` = der Token aus Schritt 4
   - `CLOUDFLARE_ACCOUNT_ID` = die ID aus Schritt 3
6. **Veröffentlichen:** GitHub → **Actions → „Such-Dienst veröffentlichen“ → Run workflow**.
   Danach läuft das bei jeder Änderung an `worker/` von selbst.
   Im Protokoll steht am Ende die Adresse, z. B. `https://reisekasse-suche.elvau.workers.dev`.
7. **Adresse in die App:** in `app/.env.production` bei `VITE_FLIGHTS_URL=` eintragen
   (oder Claude die Adresse schicken). Nach dem nächsten Merge ist die Flugsuche aktiv.

Test im Browser: `https://reisekasse-suche.DEIN-NAME.workers.dev/health` zeigt
`{"ok":true,"dienst":"Reisekasse Flugsuche"}`.

## Weitere Anbieter (später)

Schlüssel nie in den Code, sondern als Secret im Worker:
Cloudflare-Dashboard → **Workers & Pages → reisekasse-suche → Settings → Variables and Secrets → Add** (Typ „Secret“).

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
