# Firebase einrichten

Die neue Reisekasse speichert Reisen im Konto und teilt sie mit Mitreisenden über Firebase
(Anmeldung und Firestore-Datenbank). Ohne Firebase läuft sie weiter nur lokal im Browser.

Dauer: etwa 15 Minuten. Kosten: Der kostenlose Spark-Tarif reicht für Familie und Freunde.

## 1. Projekt anlegen
1. [console.firebase.google.com](https://console.firebase.google.com) öffnen, **Projekt hinzufügen**.
2. Name, z. B. `reisekasse`. Google Analytics wird nicht gebraucht.

## 2. Anmeldung einschalten
1. Links **Build → Authentication → Loslegen**.
2. Unter **Anmeldemethode**:
   - **Google** aktivieren, Support-E-Mail auswählen, speichern.
   - **E-Mail/Passwort** öffnen und **E-Mail-Link (Anmeldung ohne Passwort)** aktivieren, speichern.
3. Unter **Einstellungen → Autorisierte Domains** die Domain `elvau.github.io` hinzufügen.

## 3. Datenbank anlegen
1. Links **Build → Firestore Database → Datenbank erstellen**.
2. Standort **`europe-west3` (Frankfurt)**, damit die Daten in Deutschland liegen. Lässt sich später nicht ändern.
3. **Produktionsmodus** wählen.
4. Reiter **Regeln**: den Inhalt von [`app/firestore.rules`](../app/firestore.rules) komplett einfügen und **Veröffentlichen**.
   Die Regeln sorgen dafür, dass nur Mitglieder eine Reise sehen und nur mit Einladung beitreten können.

## 4. Web-App registrieren
1. **Projektübersicht** (Zahnrad) **→ Projekteinstellungen → Meine Apps → Web-App hinzufügen** (Symbol `</>`).
2. Name, z. B. `Reisekasse`. Firebase Hosting wird nicht gebraucht.
3. Aus der angezeigten `firebaseConfig` diese vier Werte kopieren: `apiKey`, `authDomain`, `projectId`, `appId`.

Die Werte sind nicht geheim, sie stehen später ohnehin im Quelltext der Webseite. Geschützt werden
die Daten durch die Regeln aus Schritt 3.

## 5. Werte bei GitHub hinterlegen
Im Repository **Settings → Secrets and variables → Actions → Reiter Variables → New repository variable**,
vier Variablen anlegen:

| Name | Wert |
| --- | --- |
| `FIREBASE_API_KEY` | `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `FIREBASE_PROJECT_ID` | `projectId` |
| `FIREBASE_APP_ID` | `appId` |

Danach unter **Actions → Deploy to GitHub Pages → Run workflow** einmal neu veröffentlichen.
In der App erscheint oben rechts **Anmelden**.

## Lokal entwickeln
- Gegen die Emulatoren (kein echtes Projekt nötig): `npm run build:emu`, dann
  `npx firebase emulators:exec --only auth,firestore --project demo-reisekasse "npx vite preview --outDir dist-emu"`.
  Im Anmeldedialog gibt es dann eine Test-Anmeldung ohne Google.
- Gegen das echte Projekt: `app/.env.local` mit `VITE_FIREBASE_API_KEY=…` usw. anlegen, dann `npm run dev`.
  `localhost` ist in Firebase standardmäßig als Domain erlaubt.

## Tests
- `npm run test:rules`: Sicherheitsregeln (wer darf lesen, bearbeiten, einladen, beitreten).
- `npm run test:cloud`: zwei Personen im Browser: anmelden, Reise ins Konto, einladen, beitreten,
  live mitbearbeiten, Rolle ändern, Einladung zurückziehen.

Beide laufen bei jedem Pull Request automatisch.

## Wie es funktioniert
- Jede Reise ist ein Dokument `trips/{id}` mit dem Inhalt als Text, dem Besitzer, den Mitgliedern
  mit Rolle (`owner`, `editor`, `viewer`) und optional einer Einladung (zufälliger Schlüssel und Rolle).
- Die App arbeitet immer mit einer lokalen Kopie und gleicht live ab; offline Geänderte wird später übertragen.
- Ändern zwei Personen gleichzeitig, gilt die zuletzt gespeicherte Fassung der ganzen Reise.
  Änderungen anderer werden nicht mitten im Bearbeiten übernommen, sondern danach.
