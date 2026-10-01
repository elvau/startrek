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
   mit Dienstkonto zusätzlich `list_trips`, `get_trip`, `create_trip`, `add_flight`, `add_stay`, `add_cost`, `remove_item`.
   Angebote aus den Suchen merkt sich der Such-Dienst 6 Stunden je Schlüssel (Zwischenspeicher), `add_*` nimmt die Kennung.
3. **Reisen im Konto** (`worker/src/firestore.ts`): Firestore-REST mit Dienstkonto. Das umgeht die Sicherheitsregeln,
   darum prüft der Such-Dienst selbst: lesen nur Mitglieder, ändern nur Besitzer/Bearbeiter, Mitglieder und Einladung
   bleiben unangetastet, gebuchte und bezahlte Posten auch. Speichern nur, wenn die Reise seit dem Lesen unverändert ist
   (sonst einmal neu lesen). Die App bekommt Änderungen live über ihre Beobachtung der Reise.
4. **Posten** (`app/src/lib/connector/trips.ts`, ohne Svelte): wie in der App, markiert `ai: suggested` (Angebot) bzw.
   `created` (eigene Kosten). Neue Reisen mit Platzhaltern („Fuchs Erw. 1“). An den Assistenten gehen keine Namen der Reisenden.
5. **Grenzen:** Suchen pro Schlüssel und Tag (`MCP_DAILY`, Standard 50) plus die Mengenbegrenzung pro IP.
   Zählung in „Nutzung & Kontingente“ (KI-Konnektor, Konnektor-Schlüssel erzeugt).

## Einrichten (Cloudflare, Typ Secret)

1. `MCP_KEY_SECRET`: lange Zufallszeichenkette (z. B. 40 Zeichen aus einem Passwortgenerator). Neues Secret = alle
   Schlüssel ungültig.
2. `FIREBASE_SERVICE_ACCOUNT`: Firebase-Konsole → Projekteinstellungen → Dienstkonten → „Neuen privaten Schlüssel
   generieren“ → Inhalt der JSON-Datei komplett als Wert eintragen, Datei danach löschen. Ohne dieses Secret kann der
   Konnektor nur suchen.
3. Sperren: Schlüsselkennung (steht im Dialog, der Nutzer nennt sie) in `MCP_REVOKED` eintragen (Text, kommagetrennt).

## Später

- Anmeldung per OAuth über die Firebase-Anmeldung, damit der Konnektor auch in Chat-Apps (Claude, ChatGPT) ohne Schlüssel geht.
- Vor dem offenen Anbieten: Partnerbedingungen prüfen (Weitergabe der Suchergebnisse, Affiliate-Links).

## Tests

- `worker/src/mcp.test.ts`: Schlüssel, Firestore-Werte, Protokoll, Werkzeuge, Rechte, gleichzeitige Änderung, Tageslimit
- `app/e2e/connector.mjs`: MCP-Kern gegen den Firestore-Emulator, App zeigt die Reise (markiert, live), Schlüssel-Dialog
