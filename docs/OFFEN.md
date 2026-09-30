# Offene Punkte

Merkliste für Dani und Claude. Erledigtes streichen, Neues unten anfügen.

## Wartet auf Dani

- [ ] **Viator freischalten:** Identität im Viator-Partnerkonto bestätigen (neuer Perso), danach den API-Schlüssel holen
      und in Cloudflare als Secret `VIATOR_API_KEY` eintragen. Dann zeigt „Touren & Tickets“ echte Touren (docs/EVENT.md).
      Danach einmal ausprobieren; hakt es, steht der Grund im Fehlerbericht (🐞).
- [ ] **Google-Anmeldung aufhübschen, Teil 1:** Google Cloud Console → Google Auth Platform → Branding: Name „Split&Fly“,
      Support-E-Mail danielklein@splitandfly.com (vorher das Konto im Projekt als Inhaber eintragen), Logo
      `https://splitandfly.com/brand/logo-120.png`, Startseite, Datenschutz, autorisierte Domain splitandfly.com.
- [ ] **Google-Anmeldung aufhübschen, Teil 2:** OAuth-Client „Web client (auto created by Google Service)“:
      JavaScript-Quelle `https://splitandfly.com`, Weiterleitungs-URI `https://splitandfly.com/__/auth/handler`.
      Danach Claude Bescheid geben → Live-Seite meldet sich über splitandfly.com an statt startrek-1b6a7.firebaseapp.com.
- [ ] **Firebase-Schlüssel beschränken:** Google Cloud Console → APIs & Dienste → Anmeldedaten → Browser-Schlüssel auf
      splitandfly.com, elvau.github.io und startrek-1b6a7.web.app beschränken.
- [ ] **Gewerbe anmelden** (Affiliate-Provisionen), Kleinunternehmerregelung gilt über die PV-Anlage mit.

## Für Claude

- [ ] Nach Teil 2 oben: `VITE_FIREBASE_AUTH_DOMAIN=splitandfly.com` nur im Release-Build (release.yml), Testumgebung bleibt.
- [ ] Mengenbegrenzung pro IP für die Suchen im Such-Dienst (z. B. 30 Suchen pro Minute), gegen Missbrauch des Kontingents.
