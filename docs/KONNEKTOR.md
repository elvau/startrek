# KI-Konnektor (MCP, Beta)

Eigener KI-Assistent (Claude, ChatGPT, Cursor, VS Code, Gemini CLI … – jedes Programm mit MCP über HTTP und eigenem
Header) sucht über Split&Fly und plant Reisen im Konto. Der Such-Dienst bietet dafür unter `/mcp` einen
MCP-Server (HTTP, JSON-RPC, eine Nachricht pro Anfrage, Antwort als JSON).

## Ablauf

1. **Schlüssel:** Kontomenü → „KI-Assistent verbinden“ → `POST /mcp/key` (Firebase-Anmeldung, höchstens 3 pro Tag).
   Der Schlüssel `sf_…` ist signiert (HMAC mit `MCP_KEY_SECRET`) und enthält Kontokennung, Schlüsselkennung (`kid`),
   Anzeigename und Datum. Gespeichert wird er nirgends; die App zeigt ihn einmal an, dazu die Adresse, einen Hinweis für andere Programme und als Beispiel den Befehl für Claude Code:
   `claude mcp add --transport http splitandfly https://…/mcp --header "Authorization: Bearer sf_…"`
2. **Werkzeuge** (`worker/src/mcp.ts`): `search_flights`, `search_stays`, `search_events` (keine Touren: Viator-Inhalte dürfen nicht an fremde Anwendungen);
   mit Dienstkonto zusätzlich `get_my_travelers`, `list_trips`, `get_trip`, `create_trip`, `add_flight`, `add_stay`, `add_cost`, `remove_item`.
   Angebote aus den Suchen merkt sich der Such-Dienst 6 Stunden je Schlüssel (Zwischenspeicher), `add_*` nimmt die Kennung.
3. **Reisen im Konto** (`worker/src/firestore.ts`): Firestore-REST mit Dienstkonto. Das umgeht die Sicherheitsregeln,
   darum prüft der Such-Dienst selbst: lesen nur Mitglieder, ändern nur Besitzer/Bearbeiter, Mitglieder und Einladung
   bleiben unangetastet, gebuchte und bezahlte Posten auch. Speichern nur, wenn die Reise seit dem Lesen unverändert ist
   (sonst einmal neu lesen). Die App bekommt Änderungen live über ihre Beobachtung der Reise.
4. **Posten** (`app/src/lib/connector/trips.ts`, ohne Svelte): wie in der App, markiert `ai: suggested` (Angebot) bzw.
   `created` (eigene Kosten). Neue Reisen mit Platzhaltern („Fuchs Erw. 1“). An den Assistenten gehen keine Namen der Reisenden.
5. **Grenzen:** Suchen pro Schlüssel und Tag (`MCP_DAILY`, Standard 50) plus die Mengenbegrenzung pro IP.
   Zählung in „Nutzung & Kontingente“ (KI-Konnektor, Konnektor-Schlüssel erzeugt).

## Nachfragen statt raten (#595)

- `get_my_travelers`: Familien aus den gespeicherten Personen (`profiles/{uid}`, Nachname = Familie) als F1, F2 … (eigene zuerst,
  `you`), mit Erwachsenen, Kinderaltern zum Stichtag (`date`, sonst heute) und Wohnort ohne PLZ; gespeicherte Gruppen mit Name,
  Familien und eigenen Vorlieben; eigene Vorlieben ohne PLZ (`app/src/lib/connector/people.ts`). Keine Namen von Personen.
- `create_trip` mit `families` oder `group`: echte Reisende wie „Aus Gruppe hinzufügen“ (Alter zum Reisebeginn, Wohnort der
  Familie, Herkunft der Gruppe). Ohne beides nur mit `travelersFrom: "user"` und `adults`/`childAges`, sonst Fehler „Do not guess“.
- Hinweise: erst `get_my_travelers`, Unklares mit 2–4 Optionen und „something else“ nachfragen, Annahmen nennen. Den Weg zum
  Abflughafen samt Parken und die Verpflegung rechnet die App selbst (nicht als Kosten anlegen).
- Später: MCP-Elicitation (echte Auswahlknöpfe), sobald die Chat-Apps sie anzeigen und der Server streamen kann.

## Chat-Apps per OAuth (#590)

Claude.ai, ChatGPT und andere Chat-Apps verbinden sich ohne Schlüssel: Adresse `…/mcp` als eigenen Konnektor eintragen,
„Verbinden“, bei Split&Fly zustimmen. Umsetzung in `worker/src/oauth.ts` nach der MCP-Spezifikation (OAuth 2.1, PKCE S256,
dynamische Anmeldung), ohne Bibliothek:

1. `/mcp` ohne gültigen Schlüssel antwortet 401 mit `WWW-Authenticate: Bearer resource_metadata=…`; die Chat-App liest
   `/.well-known/oauth-protected-resource` und `/.well-known/oauth-authorization-server`.
2. `POST /oauth/register`: Die Chat-App meldet Name und Rücksprung-Adressen (https, `http://localhost`/`127.0.0.1` oder
   eigenes Schema wie `cursor:`). Die Kennung `sfc_…` enthält beides signiert, gespeichert wird nichts. Wer ein
   Geheimnis will (`client_secret_post`/`_basic`), bekommt eines, abgeleitet aus der Kennung; Schutz gibt PKCE.
3. `GET /oauth/authorize` prüft Kennung, Rücksprung-Adresse und PKCE und leitet zur App: `https://splitandfly.com/?verbinden=…`
   (signierte Anfrage, 10 Minuten gültig; andere Adresse über `APP_URL`). Die App (`ConsentDialog.svelte`) zeigt Name der
   Chat-App und Ziel, verlangt ein Konto und schickt „Erlauben“/„Ablehnen“ mit der Firebase-Anmeldung an `POST /oauth/approve`.
   Die Anfrage merkt sie sich im Sitzungsspeicher, falls die Anmeldung über eine Weiterleitung läuft.
4. `/oauth/approve` legt die Verbindung an (Firestore `mcpGrants/{id}`: Konto, Name, Ziel, verbunden seit, zuletzt genutzt,
   Kennung des gültigen Erneuerungsschlüssels) und gibt die Rücksprung-Adresse mit Code `sfo_…` (5 Minuten, einmal) zurück.
5. `POST /oauth/token`: Code + `code_verifier` → Zugangsschlüssel `sfa_…` (1 Stunde) und Erneuerungsschlüssel `sfr_…`
   (90 Tage, wechselt bei jeder Erneuerung). `/mcp` nimmt `sf_…` und `sfa_…`; Tageslimit und Angebotsspeicher je Verbindung.
6. Kontomenü → „KI-Assistent verbinden“: verbundene Chat-Apps (`GET /oauth/grants`) mit „Trennen“ (`POST /oauth/grants/remove`,
   löscht den Eintrag; Zugang und Erneuerung gelten sofort nicht mehr). Der tägliche Zeitplan löscht Verbindungen, die
   90 Tage nicht genutzt oder nie eingelöst wurden. Notfall: Verbindungskennung in `MCP_REVOKED`.

Rechte wie beim Schlüssel (Dani, 29.10.2026): suchen und Reisen lesen, anlegen und ergänzen. Ausprobieren in Claude.ai erst
nach dem Release (Such-Dienst nur von `main`). Vor dem öffentlichen Anbieten: Partnerbedingungen (#591).

## Einrichten (Cloudflare, Typ Secret)

1. `MCP_KEY_SECRET`: lange Zufallszeichenkette (z. B. 40 Zeichen aus einem Passwortgenerator). Neues Secret = alle
   Schlüssel ungültig.
2. `FIREBASE_SERVICE_ACCOUNT`: Firebase-Konsole → Projekteinstellungen → Dienstkonten → „Neuen privaten Schlüssel
   generieren“ → Inhalt der JSON-Datei komplett als Wert eintragen, Datei danach löschen. Ohne dieses Secret kann der
   Konnektor nur suchen.
3. Sperren: Schlüsselkennung (steht im Dialog, der Nutzer nennt sie) in `MCP_REVOKED` eintragen (Text, kommagetrennt).

## Später

- Vor dem offenen Anbieten: Partnerbedingungen prüfen (Weitergabe der Suchergebnisse, Affiliate-Links), #591; danach Eintrag in die
  Verzeichnisse der Chat-Apps.

## Tests

- `worker/src/mcp.test.ts`: Schlüssel, Firestore-Werte, Protokoll, Werkzeuge, Rechte, gleichzeitige Änderung, Tageslimit
- `worker/src/oauth.test.ts`: Beschreibung, Anmeldung der Chat-App, Ablauf mit PKCE, Erneuerung, Trennen, Fehlerfälle
- `app/e2e/connector.mjs`: MCP-Kern gegen den Firestore-Emulator, App zeigt die Reise (markiert, live), Schlüssel-Dialog,
  verbundene Chat-Apps (Trennen), Zustimmung (`?verbinden=…`)
