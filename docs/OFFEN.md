# Offene Punkte

Merkliste für Dani und Claude. Erledigtes streichen, Neues unten anfügen.

## Wartet auf Dani

- [ ] **Viator-API-Schlüssel:** Partnerkonto ist freigeschaltet (10/2026), die Partnerkennung (pid/mcid) hängt schon an den
      Viator-Links (bei `PARTNER_LINKS=on`). Fehlt noch: im Partnerkonto unter API den Schlüssel (Production) holen bzw.
      den API-Zugang anfragen und in Cloudflare als Secret `VIATOR_API_KEY` eintragen. Dann zeigt „Touren & Tickets“
      echte Touren (docs/EVENT.md). Danach einmal ausprobieren; hakt es, steht der Grund im Fehlerbericht (🐞).
- [ ] **Awin (Pauschalreisen vergleichen):** Bei Awin als Publisher anmelden (Webseite splitandfly.com), bei Pauschalanbietern
      bewerben (TUI, ab-in-den-urlaub, l'tur, DERTOUR, weg.de, alltours …). Nach Freischaltung unter Toolbox → Create-a-Feed
      prüfen, wer einen Produktfeed anbietet, Anbieter mit Feed-ID an Claude geben; den Feed-Schlüssel in Cloudflare als Secret
      `AWIN_FEED_KEY` eintragen. Dann lädt der Such-Dienst die Feeds und die App vergleicht Pauschalpreise mit der selbst
      gebauten Reise (gleiches Hotel, gleiche Verpflegung). Datenschutz/Impressum: Awin als Partnernetzwerk ergänzen.
- [ ] **Google-Anmeldung aufhübschen, Teil 1:** Google Cloud Console → Google Auth Platform → Branding: Name „Split&Fly“,
      Support-E-Mail danielklein@splitandfly.com (vorher das Konto im Projekt als Inhaber eintragen), Logo
      `https://splitandfly.com/brand/logo-120.png`, Startseite, Datenschutz, autorisierte Domain splitandfly.com.
- [ ] **Google-Anmeldung aufhübschen, Teil 2:** OAuth-Client „Web client (auto created by Google Service)“:
      JavaScript-Quelle `https://splitandfly.com`, Weiterleitungs-URI `https://splitandfly.com/__/auth/handler`.
      Danach Claude Bescheid geben → Live-Seite meldet sich über splitandfly.com an statt startrek-1b6a7.firebaseapp.com.
- [ ] **Firebase-Schlüssel beschränken:** Google Cloud Console → APIs & Dienste → Anmeldedaten → Browser-Schlüssel auf
      splitandfly.com, elvau.github.io und startrek-1b6a7.web.app beschränken.
- [ ] **Gewerbe anmelden** (Affiliate-Provisionen), Kleinunternehmerregelung gilt über die PV-Anlage mit.
      Zustimmung des Arbeitgebers zur Nebentätigkeit offen; Dani lässt die Partner-Links trotzdem an (Entscheidung 10/2026).
      **Schalter:** Cloudflare-Variable `PARTNER_LINKS` (Typ Text): `on` = an, alles andere = aus. Beim Ausschalten
      Claude Bescheid geben, damit Impressum und Datenschutz (Abschnitt 10) angepasst werden.
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

- [ ] **KI-Konnektor (MCP) einschalten** (docs/KONNEKTOR.md): in Cloudflare zwei Secrets anlegen: `MCP_KEY_SECRET`
      (lange Zufallszeichenkette) und `FIREBASE_SERVICE_ACCOUNT` (Firebase-Konsole → Projekteinstellungen → Dienstkonten →
      neuen privaten Schlüssel generieren, JSON-Inhalt als Wert, Datei danach löschen). Wirkt nach dem nächsten Release.
- [ ] **Mehr Unterkunftsanbieter (#73):** Ohne Partnerfreigabe gibt es keine brauchbare Schnittstelle (Booking.com und Expedia
      bieten ihre KI-Schnittstellen nur mit Anmeldung im Browser an, Hotellook/Travelpayouts ist seit 10/2025 geschlossen,
      Airbnb hat keine öffentliche). Bewerben, je mehr desto besser:
      1. **Booking.com Affiliate Partner** (partner.booking.com, Webseite splitandfly.com) → danach Zugang zur Demand API
         anfragen. Bringt Preise je Zimmer und Verpflegung, Familienzimmer, Provision.
      2. **Expedia Group Rapid API** (partner.expediagroup.com → Rapid) bzw. deren neuer B2B-Zugang für KI-Agenten.
      3. **Hotelbeds APItude** (developer.hotelbeds.com): Testschlüssel sofort und kostenlos, Verpflegungsarten mit Preis je
         Art; für echte Preise später ein Vertrag. Den Testschlüssel als Secrets `HOTELBEDS_KEY` und `HOTELBEDS_SECRET`.
      Sobald ein Zugang da ist: Claude Bescheid geben, der Such-Dienst fragt ihn dann neben Trivago.

## Für Claude

- [ ] Nach Teil 2 oben: `VITE_FIREBASE_AUTH_DOMAIN=splitandfly.com` nur im Release-Build (release.yml), Testumgebung bleibt.
- [x] Mengenbegrenzung pro IP für die Suchen (60 pro Minute, 600 pro Stunde; v0.9.1).
- [ ] Vergleichen von Reisen und/oder Posten (nächstes großes Feature; KI-Vergleichsreise aus v0.10.0 ist der Einstieg).
- [x] KI-Konnektor (MCP) Schritt 1 und 2: Suchen und Reisen im Konto mit persönlichem Schlüssel (docs/KONNEKTOR.md).
- [ ] KI-Konnektor Schritt 3: OAuth über die Firebase-Anmeldung für Chat-Apps (Claude, ChatGPT). Vor dem offenen Anbieten
  Partnerbedingungen prüfen (Weitergabe der Suchergebnisse, Affiliate-Links).
