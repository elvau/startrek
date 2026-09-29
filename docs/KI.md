# KI-Planer (Beta, Google Gemini)

Man beschreibt die Wunschreise in eigenen Worten („4 Freunde, Anfang Mai, 3 Nächte am Meer, max. 500 € p. P.“).
Gemini sucht über unsere Flug- und Unterkunftssuche und schlägt 2–3 Reisen vor, die man mit „Übernehmen“ in die Reise holt.

## Ablauf

1. App (`app/src/lib/agent/app.ts`): Wunsch, Reisende, nächste Abflughäfen, Sprache, bekanntes Ziel/Daten → `POST /agent` am Such-Dienst,
   mit dem Firebase-Anmeldenachweis (`Authorization: Bearer …`).
2. Such-Dienst (`worker/src/index.ts`): prüft Anmeldung (`agent/auth.ts`) und Tageslimit, ruft `runAgent` auf.
3. `app/src/lib/agent/agent.ts`: Gemini mit Funktionsaufrufen `search_flights`, `search_stays`, `propose_trips`.
   Gemini nennt nur Kennungen von Angeboten; die echten Angebote hängt der Such-Dienst an. Erfundene Kennungen fallen weg.
4. Grenzen je Anfrage: 8 Runden, 4 Flugsuchen, 3 Unterkunftssuchen, 3 Vorschläge. Personen kommen aus der App, nicht von der KI.

## Einrichten

1. **Schlüssel:** [aistudio.google.com](https://aistudio.google.com) → *Get API key* → *Create API key* (Projekt wählen).
2. **Cloudflare:** Workers & Pages → **startrek** → Settings → Variables and Secrets → Add → Typ **Secret**,
   Name `GEMINI_API_KEY`, Wert = Schlüssel. Ohne Schlüssel meldet der Planer „noch nicht eingerichtet“.
3. Optional als Variablen (Typ Text):
   - `GEMINI_MODEL` – Modell, Standard `gemini-3.8-flash` (bei Google nachsehen, welche Modelle aktuell sind; ältere wie `gemini-2.5-flash` gibt es für neue Konten nicht mehr)
   - `GEMINI_FALLBACK_MODEL` – optional: Ausweichmodell, falls das erste überlastet ist (Google meldet 503). Vorher wird nach 1 und 3 Sekunden wiederholt.
   - `AGENT_DAILY` – Anfragen pro Nutzer und Tag, Standard 5
4. Optional **KV-Speicher** für ein genaues Tageslimit: ohne ihn zählt der Such-Dienst je Cloudflare-Rechenzentrum
   (reicht für die Beta). Mit KV: Namespace anlegen, als Binding `AGENT_KV` in `wrangler.toml` und `worker/wrangler.toml` eintragen.

## Datenschutz und Kosten

- Der kostenlose Tarif der Gemini-API hat Mengengrenzen, und Google darf die Eingaben dort zur Verbesserung nutzen.
  Für den echten Betrieb den kostenpflichtigen Tarif nehmen und `public/datenschutz.html` (Abschnitt 7) anpassen.
- Nur angemeldete Nutzer, Tageslimit pro Nutzer. Bezahlung (Premium) folgt später.

## Tests

- `app/src/lib/agent/*.test.ts`: Ablauf mit nachgestelltem Gemini, Grenzen, Anmeldeprüfung mit eigenen Schlüsseln
- `app/e2e/agent.mjs`: Anmeldung, Anfrage, Vorschlag übernehmen (Such-Dienst nachgestellt)
