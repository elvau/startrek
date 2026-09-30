# Nutzung der kostenlosen Kontingente (Admin-Ansicht)

Im Kontomenü erscheint für Admins **„Nutzung & Kontingente“**. Die Ansicht zeigt für heute und die letzten 7 Tage:

- **Cloudflare:** Worker-Aufrufe des ganzen Kontos (Grenze 100.000 pro Tag), R2-Speicher (10 GB) sowie
  Schreib- und Lesevorgänge in R2 im laufenden Monat (1 Mio. bzw. 10 Mio.).
- **Anbieter:** ausgehende Anfragen des Such-Dienstes je Anbieter, bei Gemini je Modell. Feste Grenzen:
  Ticketmaster 5.000 pro Tag, football-data.org 10 pro Minute, Gemini optional über `GEMINI_RPD`.
- **Funktionen:** Aufrufe von Flug-, Unterkunfts- und Event-Suche, KI-Planer und Fehlerberichten, dazu die
  Treffer im Zwischenspeicher, die keine Anbieter-Anfrage kosten.
- **Nur in der Konsole:** Firestore (50.000 Lesen, 20.000 Schreiben pro Tag), Hosting (360 MB Übertragung pro Tag)
  und die Grenzen je Gemini-Modell. Dafür hat der Such-Dienst keinen Zugang, die Ansicht verlinkt die Konsolen.

Ab 70 % wird ein Balken gelb, ab 90 % rot. Die Grenzen stehen in `app/src/lib/admin/usage.ts`.

## Wie gezählt wird

Der Such-Dienst schreibt je Aufruf und je ausgehender Anfrage einen Datenpunkt in **Workers Analytics Engine**
(Datensatz `splitandfly_usage`). Gespeichert werden nur Route, Treffer im Zwischenspeicher, Anbieter (Host) und
das Gemini-Modell, keine Nutzerkennung und keine Suchinhalte. Die Zählung beginnt mit dem Release, das sie einführt.
Worker- und R2-Zahlen liest der Dienst aus der GraphQL-API von Cloudflare.

## Einrichten (einmalig, Cloudflare-Dashboard → Workers → startrek → Einstellungen)

1. **Analytics Engine:** Die Bindung `USAGE` steht in `wrangler.toml`. Falls das Veröffentlichen deshalb fehlschlägt,
   im Dashboard unter *Workers & Pages → Analytics Engine* einmal aktivieren.
2. **API-Token:** *Mein Profil → API-Token → Token erstellen → Benutzerdefiniert*, Berechtigung
   **Konto → Account Analytics → Lesen**, nur für dieses Konto. Als **Secret** `CF_API_TOKEN` eintragen.
3. **Variable `CF_ACCOUNT_ID`:** die Konto-ID (Dashboard, rechte Spalte der Kontoübersicht).
4. **Variable `ADMIN_UIDS`:** deine Benutzer-UID aus der Firebase-Konsole (*Authentication → Nutzer*), mehrere
   kommagetrennt. Nie ins Repo schreiben.
5. Optional **`GEMINI_RPD`:** Tagesgrenze des Modells laut Google AI Studio, dann bekommt Gemini einen Balken.

Fehlt etwas, zeigt die Ansicht „Nicht verfügbar“ mit dem Grund.
