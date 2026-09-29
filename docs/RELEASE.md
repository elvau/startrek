# Testumgebung und Release

| Umgebung | Adresse | Wird aktualisiert | Hosting |
| --- | --- | --- | --- |
| Testumgebung | https://elvau.github.io/startrek/ | bei jedem Merge in `main` | GitHub Pages (`.github/workflows/pages.yml`) |
| Produktion | https://splitandfly.com | bei jedem veröffentlichten Release | Firebase Hosting (`.github/workflows/release.yml`) |

Beide Umgebungen nutzen dasselbe Firebase-Projekt (Konten, geteilte Reisen) und denselben Such-Dienst.
Die frühere Adresse `…/neu/` leitet auf die App weiter (auch Einladungslinks mit `?join=…`).

## Einen Release veröffentlichen

1. Auf der Testumgebung prüfen, ob alles passt.
2. GitHub → **Releases → Draft a new release**
3. **Choose a tag** → neuen Tag eintippen, z. B. `v1.0.0` (Ziel: `main`) → Titel und kurze Notizen
4. **Publish release**
5. Unter **Actions → Release (splitandfly.com)** läuft der Build; nach 2–3 Minuten ist der Stand live.

Zurück auf einen älteren Stand: In der Firebase Console unter **Hosting → Release-Verlauf** eine frühere Version „zurückrollen“,
oder beim alten Release in GitHub unter Actions den Lauf erneut starten.

## Einmalige Einrichtung

### 1. Firebase Hosting einschalten
Firebase Console → Projekt **startrek-1b6a7** → **Hosting** → **Get started** (die Schritte zur Befehlszeile kann man überspringen, das macht der Workflow).

### 2. Zugang für GitHub (Secret)
1. Google Cloud Console (console.cloud.google.com), Projekt **startrek-1b6a7** → **IAM & Admin → Service Accounts → Create service account**
   - Name: `github-release`
   - Rollen: **Firebase Hosting Admin** und **API Keys Viewer**
     (meldet der Workflow später eine fehlende Berechtigung, die genannte Rolle zusätzlich vergeben)
2. Beim neuen Konto: **Keys → Add key → Create new key → JSON**. Die Datei wird heruntergeladen.
3. GitHub → Repo **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Wert: den ganzen Inhalt der JSON-Datei einfügen
4. Die JSON-Datei danach vom Rechner löschen. Sie gehört nie ins Repo oder in einen Chat.

### 3. Domain verbinden
1. Firebase Console → **Hosting → Add custom domain** → `splitandfly.com`
   (danach noch einmal `www.splitandfly.com` mit „Weiterleiten zu splitandfly.com“)
2. Firebase zeigt die nötigen DNS-Einträge (ein TXT-Eintrag zur Bestätigung, dazu A-Einträge).
3. Bei **Squarespace Domains** (dort liegt die bei Google gekaufte Domain) → `splitandfly.com` → **DNS**:
   - die angezeigten Einträge anlegen
   - vorhandene Standard-Einträge für `@` und `www` (Squarespace-Parkseite) entfernen
   - **MX-Einträge nicht ändern**, sonst kommen keine E-Mails mehr an
4. Warten, bis Firebase „Connected“ zeigt (Minuten bis einige Stunden); das HTTPS-Zertifikat kommt automatisch.

### 4. Anmeldung auf der neuen Domain erlauben
Firebase Console → **Authentication → Settings → Authorized domains → Add domain**: `splitandfly.com` und `www.splitandfly.com`.

### 5. Such-Dienst
Nichts zu tun: `splitandfly.com` steht schon in `ALLOWED_ORIGINS` (`wrangler.toml`), der Worker wird bei jedem Merge neu veröffentlicht.

### 6. Partner
Bei Travelpayouts im Projekt die Website auf `https://splitandfly.com` ändern.

## Hinweis zu gespeicherten Reisen
Reisen „nur auf diesem Gerät“ gehören zur jeweiligen Adresse: was in der Testumgebung liegt, erscheint nicht auf splitandfly.com.
Reisen im Konto sind überall gleich.
