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
- [x] **Domains** splitandfly.de, split-and-fly.com, splitfly.de gekauft (Squarespace, 30.09.2026) und per 301 auf
      splitandfly.com weitergeleitet. Offen: E-Mail-Bestätigung für split-and-fly.com (sonst Sperre nach 15 Tagen),
      splitfly.de stand noch auf „ausstehend“ – kurz prüfen.
- [ ] **Social-Media-Namen** @splitandfly anlegen (Instagram, TikTok, Facebook, X, YouTube, LinkedIn) mit der splitandfly-Adresse.
- [ ] **Marke „Split&Fly“ anmelden** (nach der Gewerbeanmeldung, spätestens bevor die App beworben wird / Geld verdient):
      Wortmarke beim DPMA (DPMAdirektWeb, ca. 290 € für bis zu 3 Klassen, 10 Jahre), Klassen 9 (App), 39 (Reisevermittlung),
      42 (Online-Dienst), evtl. 35. Anmelder: Dani persönlich. Schreibweise genau „Split&Fly“.
      Recherche 09/2026 (DPMAregister, TMview): kein Konflikt gefunden; einziger Treffer „split fly stop“ (Türkei, 1995,
      Mückenschutz, erloschen) ist unkritisch. Vor der Anmeldung noch ähnliche Namen prüfen (Splitfly, Split Fly, Fly&Split,
      Splyt) und Handelsregister. Später evtl. EU-Marke (EUIPO) und Bildmarke fürs Logo.

## Für Claude

- [ ] Nach Teil 2 oben: `VITE_FIREBASE_AUTH_DOMAIN=splitandfly.com` nur im Release-Build (release.yml), Testumgebung bleibt.
- [x] Mengenbegrenzung pro IP für die Suchen (60 pro Minute, 600 pro Stunde; v0.9.1).
