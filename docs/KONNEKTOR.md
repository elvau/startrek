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
   mit Dienstkonto zusätzlich `get_my_travelers`, `list_trips`, `get_trip`, `create_trip`, `update_trip`, `delete_trip`, `add_flight`, `add_stay`, `add_cost`, `remove_item`,
   `update_travelers`, `save_people`, `save_group`, `save_my_preferences`, `set_trip_preferences`.
   Aufräumen (#603): Reisen, die die KI angelegt hat, merken sich ihren Stand (`aiSeen`, Prüfsummen der Eckdaten und je Posten).
   Hat der Nutzer sie seitdem in der App geändert, oder stammt die Reise aus der App, ändern/löschen die Werkzeuge nur mit
   `confirm` nach Rückfrage (Fehler nennt die Änderungen). Geteilte Reisen: als Mitglied verlassen, als Besitzer nicht per KI (#604).
   Vorschläge als Vergleich: `create_trip` mit `compareWith`, `compareTitle` (Titel für alle Varianten) und `variantName`;
   vorhandene Reisen mit `update_trip` (`compareWith`, `compareTitle`, `variantName`, `leaveCompare`).
   Angebote aus den Suchen merkt sich der Such-Dienst 6 Stunden je Schlüssel in Firestore (`mcpOffers`, Kennung = Prüfwert aus Schlüssel und Angebot; der Cloudflare-Zwischenspeicher gilt nur je Rechenzentrum, Chat-Apps landen oft in verschiedenen), `add_*` nimmt die Kennung. `add_flight` mit `people` (Reisende-IDs) für Zubringer nur eines Teils der Gruppe. `add_flight`/`add_stay` mit `replace` (Posten-ID) tauschen ein Angebot aus (gleiche Rückfrage wie `remove_item`); ohne `replace` warnt das Ergebnis, wenn dieselben Reisenden schon einen Flug auf der Strecke bzw. eine Unterkunft im Zeitraum haben.
3. **Reisen im Konto** (`worker/src/firestore.ts`): Firestore-REST mit Dienstkonto. Das umgeht die Sicherheitsregeln,
   darum prüft der Such-Dienst selbst: lesen nur Mitglieder, ändern nur Besitzer/Bearbeiter, Mitglieder und Einladung
   bleiben unangetastet, gebuchte und bezahlte Posten auch. Speichern nur, wenn die Reise seit dem Lesen unverändert ist
   (sonst einmal neu lesen). Die App bekommt Änderungen live über ihre Beobachtung der Reise.
4. **Posten** (`app/src/lib/connector/trips.ts`, ohne Svelte): wie in der App, markiert `ai: suggested` (Angebot) bzw.
   `created` (eigene Kosten). Reisende aus dem Konto, vom Nutzer genannt oder als Platzhalter („Fuchs Erw. 1“). Der Assistent sieht
   Vorname, Familie, Alter und Wohnort mit PLZ (#608), nie Geburtsdaten oder Angaben „Nur für dich“.
5. **Grenzen:** Suchen pro Schlüssel und Tag (`MCP_DAILY`, Standard 50) plus die Mengenbegrenzung pro IP.
   Zählung in „Nutzung & Kontingente“ (KI-Konnektor, Konnektor-Schlüssel erzeugt).

## Nachfragen statt raten (#595)

- `get_my_travelers`: Familien aus den gespeicherten Personen (`profiles/{uid}`, Nachname = Familie) als F1, F2 … (eigene zuerst,
  `you`), mit Familienname, Mitgliedern (Kennung, Vorname, Alter), Erwachsenen, Kinderaltern zum Stichtag (`date`, sonst heute)
  und Wohnort mit PLZ; gespeicherte Gruppen mit Name, Mitgliedern, Familien (`partOf`: nur teilweise drin) und eigenen Vorlieben;
  eigene Vorlieben (`app/src/lib/connector/people.ts`).
- `create_trip` mit `families` oder `group`: echte Reisende wie „Aus Gruppe hinzufügen“ (Alter zum Reisebeginn, Wohnort der
  Familie, Herkunft der Gruppe). Ohne beides nur mit `travelersFrom: "user"` und `adults`/`childAges`, sonst Fehler „Do not guess“.
- Hinweise: erst `get_my_travelers`, Unklares mit 2–4 Optionen und „something else“ nachfragen, Annahmen nennen. Den Weg zum
  Abflughafen samt Parken und die Verpflegung rechnet die App selbst (nicht als Kosten anlegen).
- Später: MCP-Elicitation (echte Auswahlknöpfe), sobald die Chat-Apps sie anzeigen und der Server streamen kann.

## Gruppenchat, Namen und Bezahltes (#608)

Entscheidung Dani (30.10.2026): Der Assistent sieht Vor- und Nachnamen, Alter (nie das Geburtsdatum) und Wohnort mit PLZ, damit er
Familien aus einem Gruppenchat zuordnen und Tippfehler korrigieren kann; Personen und Gruppen im Konto legt er nach Rückfrage an.

- `save_people`: Personen anlegen (Vor- und Nachname; gleicher Name = vorhandene Person) bzw. mit Kennung ändern, `renameFamily`
  für alle mit dem Nachnamen. Alter nur ohne Geburtsdatum (sonst Hinweis, ändern in der App). Löschen nur in der App.
- `save_group`: Gruppe nach Name anlegen bzw. ändern (`members`, `add`, `remove` als Personen- oder Familienkennung, `newName`).
  Gespeichert über `profileSaver` (`worker/src/firestore.ts`, mit Versionsprüfung, Rest des Stands bleibt).
- `create_trip`: `families`, `group`, `people` (Personen) und `travelers` (genannt, nur in dieser Reise, mit `home`) kombinierbar.
- `update_travelers`: Familie umbenennen (Reisende, Haushalt, Zahlungen, Kasse, Verpflegung, Gruppenbus), Vorname/Familie/Alter
  je Reisendem (Platzhalter mit Vornamen werden echt), Wohnort je Familie, Reisende dazu (gespeicherte nicht doppelt). Rückfrage wie
  `update_trip`. Gespeicherte Personen werden in bestehenden Reisen nicht automatisch umbenannt.
- `households` (in `create_trip` und `update_travelers`): Einstellungen je Familie wie in der App, nur die genannten Felder:
  `toAirport` (car, drop = gebracht und abgeholt, taxi, train, bus, with + `carpoolWith`), `cars`, `parkingFree`/`parkingEur`,
  `rideEur`, `purse` (joint/each = Kasse), `arrive`/`depart` (eigene Anwesenheit; `null` entfernt). Die Kosten rechnet die App.
  `get_trip` zeigt sie bei den Familien.
- Wohnort (`home`, `country`): `worker/src/home.ts` sucht PLZ bzw. Ort in den PLZ-Daten der App (`plz.txt`, `plz/<LAND>.txt`
  von `APP_URL`, je Isolate gemerkt), sonst Ort aus der Ortsliste ohne PLZ; unbekannt: Fehler mit Bitte um PLZ.
- `add_cost` mit `status`, `paidBy` (Familie der Reise; Zahlung für die Kasse, setzt `paid`), `paidAt`, `bookingRef`.
- Hinweis an den Assistenten: Gruppenchat mit den gespeicherten Gruppen vergleichen, bekannte Gruppe nachfragen, sonst fragen, ob
  neu speichern oder nur für die Reise.

## Vorlieben (#602)

- Suchen nehmen fehlende Angaben aus `prefsFor` (eigene, Gruppe der Reise, Reise; `tripId` für eine Reise): Abflughäfen,
  Umstiege, Gepäck, Flugzeit, Unterkunftsart, Sterne; gesperrte Länder immer (Flüge filtern, Unterkunft im Land abgelehnt).
  Die Antwort nennt `appliedPreferences`; ausdrückliche Angaben gehen vor.
- `save_my_preferences`: geprüft wie beim KI-Planer (`prefsFromAi`), zusammengeführt mit den bisherigen (`mergePrefs`, gesperrte
  Länder kommen dazu), gespeichert in `profiles/{uid}` mit Versionsprüfung (`profilePrefsSaver`, Rest des Stands bleibt).
  Beschreibung: nur nach Bestätigung im Chat (Dani, 30.10.).
- `set_trip_preferences` bzw. `create_trip` mit `preferences`: `trip.prefs`, in der App unter Reise-Einstellungen →
  „Vorlieben für diese Reise“ bzw. Vorlieben → Reiter „Diese Reise“; gelten auch für die Suchen der App in dieser Reise.

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
- `worker/src/home.test.ts`: Wohnort aus PLZ, Ort und Land
- `worker/src/oauth.test.ts`: Beschreibung, Anmeldung der Chat-App, Ablauf mit PKCE, Erneuerung, Trennen, Fehlerfälle
- `app/e2e/connector.mjs`: MCP-Kern gegen den Firestore-Emulator, App zeigt die Reise (markiert, live), Schlüssel-Dialog,
  verbundene Chat-Apps (Trennen), Zustimmung (`?verbinden=…`)
