# Testumgebung und Release

| Umgebung | Adresse | Wird aktualisiert | Hosting |
| --- | --- | --- | --- |
| Testumgebung | https://elvau.github.io/startrek/ | bei jedem Push auf `pre-release` (nur bauen, ohne Tests, ca. 1–2 Minuten) | GitHub Pages (`.github/workflows/pages.yml`) |
| Produktion | https://splitandfly.com | bei jedem Push auf `main` (Merge von `pre-release`) | Firebase Hosting (`.github/workflows/release.yml`) |

Beide Umgebungen nutzen dasselbe Firebase-Projekt (Konten, geteilte Reisen) und denselben Such-Dienst.
Die frühere Adresse `…/neu/` leitet auf die App weiter (auch Einladungslinks mit `?join=…`).

## Ablauf

Branches: **Arbeits-Branch** (je Sitzung oder Routine, z. B. `claude/…`) → **`pre-release`** (Sammelstand, Testumgebung) → **`main`** (Produktion).

1. **Entwickeln** auf dem Arbeits-Branch. Pushes dorthin landen nirgends; vor jedem Push die schnellen Prüfungen
   (svelte-check, Unit-Tests, e2e der geänderten Bereiche).
2. **Ausprobieren:** den Arbeits-Branch in `pre-release` mergen (merge commit) und pushen. Nach 1–2 Minuten steht der
   Stand auf https://elvau.github.io/startrek/, nur gebaut, ohne Tests. Es gibt genau einen Stand auf der Testumgebung.
3. **Routinen** (Fehler und QA, siehe CLAUDE.md) öffnen Pull Requests nach `pre-release`; dort läuft die volle Prüfung
   (`.github/workflows/pruefen.yml`). Freigegebene, grüne PRs werden in `pre-release` gemergt.
4. **Release** (nur auf ausdrückliches „Release“): auf `pre-release` die Version anheben, `npm run test:cloud`, Pull Request
   `pre-release` → `main`, warten bis „Prüfen (vor dem Release)“ grün ist, mergen (merge commit). Der Push auf `main` bringt
   den Stand nach 2–3 Minuten auf splitandfly.com (Actions → „Release (splitandfly.com)“). Danach `pre-release` auf `main`
   vorspulen (`git push origin origin/main:pre-release`), Arbeits-Branches auf `main` zurücksetzen und den Spiegel
   aktualisieren (Schritt 7). Wöchentlich wird `main` zusätzlich neu gebaut (Flughafendaten).
5. **Version:** Jeder Release hebt die Version in `app/package.json` an (`npm version 0.3.0 --no-git-tag-version` in `app/`):
   neue Funktionen → mittlere Stelle (0.2.0 → 0.3.0), nur Fehlerbehebungen → letzte Stelle (0.3.0 → 0.3.1).
   Nach dem Veröffentlichen legt der Workflow den Tag `v0.3.0` und eine Release-Seite mit den Änderungen an
   (https://github.com/elvau/startrek/releases). Die Version steht in der App unten neben Impressum und Datenschutz
   und in jeder Fehlermeldung (🐞). Bleibt die Version gleich, wird nur veröffentlicht, ohne neues Release.
6. **Hotfix:** Dringendes kann von einem Arbeits-Branch auf `main` direkt per Release-PR gehen; danach `main` in
   `pre-release` mergen.
7. **Spiegel `starwars` aktualisieren:** Nach jedem Merge nach `main` (Release oder Hotfix), sobald der Release-Workflow
   den Tag angelegt hat, `main` und alle Tags in das private Repo `elvau/starwars` pushen (Rückfall, falls dieses Repo
   oder ein Konto gesperrt wird):
   ```bash
   git fetch origin main --tags
   git push https://github.com/elvau/starwars origin/main:refs/heads/main --tags
   ```
   Fehlt der Sitzung das Schreibrecht auf `elvau/starwars`, Dani Bescheid sagen statt den Schritt auszulassen.

**Such-Dienst (Cloudflare):** wird nur beim Push auf `main` neu veröffentlicht. Neue Such-Funktionen (neue Endpunkte) gehen deshalb
erst mit dem Release; auf der Testumgebung antwortet bis dahin noch der alte Such-Dienst.

Zurück auf einen älteren Stand: In der Firebase Console unter **Hosting → Release-Verlauf** eine frühere Version „zurückrollen“,
oder den Merge auf `main` rückgängig machen (Revert), dann läuft der Release erneut.

## Einmalige Einrichtung

### 0. Testumgebung für pre-release freigeben
GitHub → Repo **Settings → Environments → github-pages → Deployment branches and tags**:
„No restriction“ wählen (oder eine Regel für `pre-release` hinzufügen). Sonst darf nur `main` auf die Testumgebung.

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
