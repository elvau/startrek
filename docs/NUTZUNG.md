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
- **Besucherzahlen:** Cloudflare Web Analytics (cookielos, ohne IP-Speicherung), Link in der Ansicht unter „Nur in der
  Konsole“. Das Skript lädt `app/src/lib/visits.ts` nur auf splitandfly.com (nicht Testumgebung, Emulator, lokal).
  Nachweis für Partnerprogramme, die „drei Monate stabilen Traffic“ verlangen (#311).
- **Google:** Search Console für die Domain splitandfly.com; Sitemap `public/sitemap.xml`, `public/robots.txt`,
  Meta-Angaben und Vorschaubild (`app/public/og-image.png`) in `app/index.html` (#313). Die Testumgebung ist gesperrt
  (`scripts/site.sh … test`: noindex, ohne Sitemap).
- **Inhaltsseiten** (`/reise/…`, #314): Texte und Kosten in `app/src/lib/seo/pages.ts`, beim Zusammenstellen erzeugt
  `scripts/seiten.mjs` die statischen Seiten und trägt sie in die Sitemap ein. Der Knopf „Mit diesen Werten planen“ öffnet
  die App mit `?ziel=…&land=…&gruppe=…` bzw. `&fam=2-2,2-1` (`app/src/lib/plan.ts`). Bild je Seite: Szene in `app/src/lib/seo/art.ts`. Neue Seite: Eintrag in `PAGES` und `ART`,
  Kosten als Spannen pro Person, Stand (`STAND`) aktuell halten. In der Search Console unter „Leistung“ sehen, welche
  Seiten Klicks bringen, und danach ausbauen.

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
