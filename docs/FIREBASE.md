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
> Wichtig: **Firestore**, nicht die „Realtime Database“. Das sind zwei verschiedene Produkte;
> die Realtime Database versteht die Regeln nicht („Line 1: Parse error“) und wird nicht gebraucht.

1. Links **Build → Firestore Database → Datenbank erstellen**.
2. Standort **`europe-west3` (Frankfurt)**, damit die Daten in Deutschland liegen. Lässt sich später nicht ändern.
3. **Produktionsmodus** wählen.
4. In **Firestore** den Reiter **Regeln** öffnen, den Inhalt von [`app/firestore.rules`](../app/firestore.rules)
   komplett einfügen (die erste Zeile ist `rules_version = '2';`) und **Veröffentlichen**.
   Die Regeln sorgen dafür, dass nur Mitglieder eine Reise sehen und nur mit Einladung beitreten können,
   und dass gespeicherte Gruppen und Personen nur für einen selbst sichtbar sind.

   **Wenn sich `app/firestore.rules` ändert, die Regeln hier erneut einfügen und veröffentlichen.**

## 4. Web-App registrieren
1. **Projektübersicht** (Zahnrad) **→ Projekteinstellungen → Meine Apps → Web-App hinzufügen** (Symbol `</>`).
2. Name, z. B. `Reisekasse`. Firebase Hosting wird nicht gebraucht.
3. Aus der angezeigten `firebaseConfig` diese vier Werte kopieren: `apiKey`, `authDomain`, `projectId`, `appId`.

Die Werte sind nicht geheim, sie stehen später ohnehin im Quelltext der Webseite. Geschützt werden
die Daten durch die Regeln aus Schritt 3.

## 5. Werte in die App eintragen
Die vier Werte stehen in [`app/.env.production`](../app/.env.production) (`VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`). Bei jedem Push auf
`main` wird die App damit gebaut; oben rechts erscheint **Anmelden**.

Ohne diese Datei (oder mit leeren Werten) läuft die App nur lokal ohne Konto.

**Empfohlen:** In der [Google Cloud Console → APIs & Dienste → Anmeldedaten](https://console.cloud.google.com/apis/credentials)
den „Browser key“ des Projekts auf **HTTP-Verweis-URLs** `https://elvau.github.io/*` und `http://localhost/*`
beschränken. Dann kann niemand den Schlüssel auf einer anderen Seite verwenden.

## Testprojekt (Testumgebung getrennt von splitandfly.com)
Die Testumgebung (elvau.github.io/startrek/, Push auf `pre-release`) nutzt **nie** das echte Projekt: sie wird mit
`npm run build:test` gebaut und liest [`app/.env.staging`](../app/.env.staging). Sind dort keine Werte eingetragen,
läuft die Testumgebung ohne Anmeldung (nur lokal). So kann dort nichts echte Konten oder Reisen ändern, auch nicht
„Mein Konto zurücksetzen“ in der Admin-Ansicht.

Einmalig einrichten (Dani):
1. Zweites Firebase-Projekt anlegen, z. B. `splitandfly-test` (Schritte 1–4 oben: Google-Anmeldung, Firestore,
   Regeln aus `app/firestore.rules`, Web-App).
2. **Authentication → Einstellungen → Autorisierte Domains:** `elvau.github.io` hinzufügen.
3. Die vier Werte (`apiKey`, `authDomain`, `projectId`, `appId`) in `app/.env.staging`; `authDomain` ist
   `test.splitandfly.com` (Hosting des Testprojekts, OAuth-Client mit `https://test.splitandfly.com/__/auth/handler`)
   eintragen (oder Claude geben).
4. Such-Dienst: Variable `FIREBASE_TEST_PROJECT_ID = "<projekt>"` in `worker/wrangler.toml` unter `[vars]` (Claude
   trägt sie ein; wirkt nach dem nächsten Release). Dann nimmt der Such-Dienst Anmeldungen aus dem Testprojekt an
   (KI-Planer, Fehler melden, Admin-Ansicht). Konten von dort heißen im Such-Dienst `test:<uid>`; für die
   Admin-Ansicht auf der Testumgebung `test:<uid>` in `ADMIN_UIDS` ergänzen. Den KI-Konnektor gibt es nur für echte Konten.

Regeländerungen (`app/firestore.rules`) dann in **beiden** Projekten einspielen.

## Lokal entwickeln
- Gegen die Emulatoren (kein echtes Projekt nötig): `npm run build:emu`, dann
  `npx firebase emulators:exec --only auth,firestore --project demo-reisekasse "npx vite preview --outDir dist-emu"`.
  Im Anmeldedialog gibt es dann eine Test-Anmeldung ohne Google.
- Gegen das echte Projekt: `npm run build && npm run preview` (nutzt `app/.env.production`).
  `localhost` ist in Firebase standardmäßig als Domain erlaubt.

## Tests
- `npm run test:rules`: Sicherheitsregeln (wer darf lesen, bearbeiten, einladen, beitreten).
- `npm run test:cloud`: zwei Personen im Browser: anmelden, Reise ins Konto, einladen, beitreten,
  live mitbearbeiten, Rolle ändern, Einladung zurückziehen.

Beide laufen bei jedem Pull Request automatisch.

## Wie es funktioniert
- Gespeicherte Personen und Gruppen liegen je Konto in `profiles/{uid}`, nur für einen selbst lesbar.
- Buchungsdaten der Personen (Ausweis, Reisepass) liegen getrennt in `travelDocs/{uid}`, nur für einen selbst.
  Die App liest und schreibt sie über die REST-Schnittstelle, damit keine Kopie im Browser-Speicher bleibt.
- Jede Reise ist ein Dokument `trips/{id}` mit dem Inhalt als Text, dem Besitzer, den Mitgliedern
  mit Rolle (`owner`, `editor`, `viewer`) und optional einer Einladung (zufälliger Schlüssel und Rolle).
- Die App arbeitet immer mit einer lokalen Kopie und gleicht live ab; offline Geänderte wird später übertragen.
- Ändern zwei Personen gleichzeitig, gilt die zuletzt gespeicherte Fassung der ganzen Reise.
  Änderungen anderer werden nicht mitten im Bearbeiten übernommen, sondern danach.
