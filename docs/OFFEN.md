# Offene Punkte

Merkliste für Dani und Claude. Erledigtes streichen, Neues unten anfügen.

**Seit 10/2026 laufen offene Aufgaben als GitHub-Issues** mit Zuständigkeit (`zuständig: Dani`, `zuständig: Entwicklung`,
`zuständig: QA-Routinen`, siehe `docs/ABLAUF.md`). Die Punkte unten verweisen auf ihr Ticket; Hintergrund bleibt hier.

## Wartet auf Dani

- [x] **Viator-API-Schlüssel** (eingetragen 10/2026, Suche liefert Touren): Partnerkonto ist freigeschaltet (10/2026), die Partnerkennung (pid/mcid) hängt schon an den
      Viator-Links (bei `PARTNER_LINKS=on`). Fehlt noch: im Partnerkonto unter API den Schlüssel (Production) holen bzw.
      den API-Zugang anfragen und in Cloudflare als Secret `VIATOR_API_KEY` eintragen. Dann zeigt „Touren & Tickets“
      echte Touren (docs/EVENT.md). Danach einmal ausprobieren; hakt es, steht der Grund im Fehlerbericht (🐞).
- [ ] **Awin (Pauschalreisen vergleichen):** → #147. Bei Awin als Publisher anmelden (Webseite splitandfly.com), bei Pauschalanbietern
      bewerben (TUI, ab-in-den-urlaub, l'tur, DERTOUR, weg.de, alltours …). Nach Freischaltung unter Toolbox → Create-a-Feed
      prüfen, wer einen Produktfeed anbietet, Anbieter mit Feed-ID an Claude geben; den Feed-Schlüssel in Cloudflare als Secret
      `AWIN_FEED_KEY` eintragen. Dann lädt der Such-Dienst die Feeds und die App vergleicht Pauschalpreise mit der selbst
      gebauten Reise (gleiches Hotel, gleiche Verpflegung). Datenschutz/Impressum: Awin als Partnernetzwerk ergänzen.
- [x] **Google-Anmeldung aufhübschen, Teil 1** (erledigt 10/2026): Google Cloud Console → Google Auth Platform → Branding: Name „Split&Fly“,
      Support-E-Mail danielklein@splitandfly.com (vorher das Konto im Projekt als Inhaber eintragen), Logo
      `https://splitandfly.com/brand/logo-120.png`, Startseite, Datenschutz, autorisierte Domain splitandfly.com.
- [x] **Google-Anmeldung aufhübschen, Teil 2** (erledigt 10/2026): OAuth-Client „Web client (auto created by Google Service)“:
      JavaScript-Quelle `https://splitandfly.com`, Weiterleitungs-URI `https://splitandfly.com/__/auth/handler`.
      Danach Claude Bescheid geben → Live-Seite meldet sich über splitandfly.com an statt startrek-1b6a7.firebaseapp.com.
- [ ] **Firebase-Schlüssel beschränken:** → #147. Google Cloud Console → APIs & Dienste → Anmeldedaten → Browser-Schlüssel auf
      splitandfly.com, elvau.github.io und startrek-1b6a7.web.app beschränken.
- [ ] **Gewerbe anmelden** → #147. (Affiliate-Provisionen), Kleinunternehmerregelung gilt über die PV-Anlage mit.
      Zustimmung des Arbeitgebers zur Nebentätigkeit offen; Dani lässt die Partner-Links trotzdem an (Entscheidung 10/2026).
      **Schalter:** Cloudflare-Variable `PARTNER_LINKS` (Typ Text): `on` = an, alles andere = aus. Beim Ausschalten
      Claude Bescheid geben, damit Impressum und Datenschutz (Abschnitt 10) angepasst werden.
- [x] **Domains** splitandfly.de, split-and-fly.com, splitfly.de gekauft (Squarespace, 30.09.2026) und per 301 auf
      splitandfly.com weitergeleitet. Offen: E-Mail-Bestätigung für split-and-fly.com (sonst Sperre nach 15 Tagen),
      splitfly.de stand noch auf „ausstehend“ – kurz prüfen.
- [ ] **Social-Media-Namen** → #147. @splitandfly anlegen (Instagram, TikTok, Facebook, X, YouTube, LinkedIn) mit der splitandfly-Adresse.
- [ ] **Marke „Split&Fly“ anmelden** → #147. (nach der Gewerbeanmeldung, spätestens bevor die App beworben wird / Geld verdient):
      Wortmarke beim DPMA (DPMAdirektWeb, ca. 290 € für bis zu 3 Klassen, 10 Jahre), Klassen 9 (App), 39 (Reisevermittlung),
      42 (Online-Dienst), evtl. 35. Anmelder: Dani persönlich. Schreibweise genau „Split&Fly“.
      Recherche 09/2026 (DPMAregister, TMview): kein Konflikt gefunden; einziger Treffer „split fly stop“ (Türkei, 1995,
      Mückenschutz, erloschen) ist unkritisch. Vor der Anmeldung noch ähnliche Namen prüfen (Splitfly, Split Fly, Fly&Split,
      Splyt) und Handelsregister. Später evtl. EU-Marke (EUIPO) und Bildmarke fürs Logo.

- [ ] **KI-Konnektor (MCP) einschalten** → #147. (docs/KONNEKTOR.md): in Cloudflare zwei Secrets anlegen: `MCP_KEY_SECRET`
      (lange Zufallszeichenkette) und `FIREBASE_SERVICE_ACCOUNT` (Firebase-Konsole → Projekteinstellungen → Dienstkonten →
      neuen privaten Schlüssel generieren, JSON-Inhalt als Wert, Datei danach löschen). Wirkt nach dem nächsten Release.
- [ ] **Duffel und liteAPI einschalten** → #147. (docs/FLUGSUCHE.md): auf app.duffel.com und liteapi.travel anmelden, in Cloudflare
      die Secrets `DUFFEL_TOKEN` und `LITEAPI_KEY` anlegen (erst die Test-Schlüssel, nach dem Ausprobieren die echten).
      Code ist fertig (Release nötig, der Such-Dienst kommt nur von main).
- [ ] **Mehr Unterkunftsanbieter (#144):** → #147. Ohne Partnerfreigabe gibt es keine brauchbare Schnittstelle (Booking.com und Expedia
      bieten ihre KI-Schnittstellen nur mit Anmeldung im Browser an, Hotellook/Travelpayouts ist seit 10/2025 geschlossen,
      Airbnb hat keine öffentliche). Bewerben, je mehr desto besser:
      1. **Booking.com Affiliate Partner** (partner.booking.com, Webseite splitandfly.com) → danach Zugang zur Demand API
         anfragen. Bringt Preise je Zimmer und Verpflegung, Familienzimmer, Provision.
      2. **Expedia Group Rapid API** (partner.expediagroup.com → Rapid) bzw. deren neuer B2B-Zugang für KI-Agenten.
      3. **Hotelbeds APItude** (developer.hotelbeds.com): Testschlüssel sofort und kostenlos, Verpflegungsarten mit Preis je
         Art; für echte Preise später ein Vertrag. Den Testschlüssel als Secrets `HOTELBEDS_KEY` und `HOTELBEDS_SECRET`.
      Sobald ein Zugang da ist: Claude Bescheid geben, der Such-Dienst fragt ihn dann neben Trivago.
- [ ] **Mietwagen-Partnerlinks:** → #147. in Travelpayouts das Programm DiscoverCars (oder EconomyBookings/Localrent) hinzufügen,
      unter Tools → Links einen Link erzeugen und Claude schicken (daraus kommen Programm- und Kampagnen-ID). Bis dahin
      verlinkt die App neutral (KAYAK vorbefüllt, CHECK24, DiscoverCars).
- [ ] **OpenRouteService-Schlüssel** → #207. Für Roadtrips (Etappen, Fahrzeiten); bis dahin schätzt die App.
- [ ] **Branch `pre-release` schützen:** GitHub → Settings → Rules → Rulesets → neue Regel für `pre-release` mit
      „Restrict deletions“. Sonst löscht „Automatically delete head branches“ ihn bei jedem Release (passiert bei 0.29.0).
- [ ] **Reiseversicherung-Partner (optional):** → #147. über Awin z. B. ERGO Reiseversicherung oder HanseMerkur. Nur als Tippgeber
      verlinken (keine Beratung, kein Tarifvergleich), sonst ist eine Erlaubnis nach § 34d GewO nötig.

## Für Claude

- [x] **Viator-Bedingungen absichern:** Suche nur für splitandfly.com und bei `PARTNER_LINKS=on`, keine Touren im
      KI-Konnektor (10/2026). Offen: übernommene Viator-Posten (Name, Preis, Link) stehen weiter in der Reise und damit auch
      in dem, was der Konnektor und der KI-Planer von einer Reise sehen – mit Dani klären, ob das reicht (→ #146).

- [x] Nach Teil 2 oben: `VITE_FIREBASE_AUTH_DOMAIN=splitandfly.com` in `app/.env.production`, für Live-Seite und Testumgebung.
- [x] Mengenbegrenzung pro IP für die Suchen (60 pro Minute, 600 pro Stunde; v0.9.1).
- [x] Preiskalender mit Richtpreisen vor der Suche (`flights/calendar.ts`, Such-Dienst `/flights/calendar`; wirkt erst nach dem Release, Worker nur von main).
- [x] Karte weiter: Entfernung zu Zentrum, Flughafen und Events an jeder Unterkunft; „Karte der Reise“ (`geo/spots.ts`, `TripMap.svelte`).
- [x] Zuschüsse Stufe 2 (10/2026, `campaign.ts`, `CampaignCard.svelte`, `CampaignPage.svelte`, Firestore `campaigns/{id}`): öffentliche Aktionsseite der Reise (Ziel, Fortschritt, GiroCode/EPC-QR mit IBAN des Organisators,
      PayPal.me-Link), Geld fließt nie über Split&Fly (ZAG); Einwilligung für IBAN, Datenschutz, Firestore-Regeln.
      Stufe 1 (Zuschüsse in der Reise) ist fertig: `Trip.funds`, `applyFunds` in `calc/index.ts`, `FundsCard.svelte`.
- [ ] → #144. Vergleichen von Reisen und/oder Posten (nächstes großes Feature; KI-Vergleichsreise aus v0.10.0 ist der Einstieg).
- [x] KI-Konnektor (MCP) Schritt 1 und 2: Suchen und Reisen im Konto mit persönlichem Schlüssel (docs/KONNEKTOR.md).
- [ ] → #144. KI-Konnektor Schritt 3: OAuth über die Firebase-Anmeldung für Chat-Apps (Claude, ChatGPT). Vor dem offenen Anbieten
  Partnerbedingungen prüfen (Weitergabe der Suchergebnisse, Affiliate-Links).

- → #147, #144. Flughafentransfer: Partnerprogramme Kiwitaxi, GetTransfer, Intui.travel bei Travelpayouts beantragen (Dani), dann Links mit Partnerkennung; später Preise über deren Schnittstelle statt Richtwert.
- [ ] Gepflegte Richtwerte (Prüfung 10/2026, `fees.ts`, `flights/addons.ts`), offen bzw. unsicher:
  - Slowakei 10-Tages-Vignette: 12 € oder 10,80 € (2026)? Auf eznamka.sk prüfen.
  - Feste Maut je Durchfahrt als eigene Liste (Brenner A13 ~12,50 €, Tauern A10 ~15 €, Karawanken ~9 €, Arlberg ~13 €,
    Felbertauern ~13,50 €, Storebælt 235 DKK, Øresund ~745 SEK, Dartford 3,50 £, M50 3,20 €), sobald der Roadtrip die
    Strecke kennt (Routen-Dienst) und erkennen kann, ob sie darüber führt.
  - Türkei (Autobahnmaut, Lira schwankt), Bosnien, Montenegro, Moldawien (Vignette) noch ohne Werte.
  - SunExpress SunEco enthält ab Deutschland teils 20 kg Koffer: dann nicht schätzen. Weitere Billigflieger ohne Werte:
    AJet, Smartwings, Corendon, airBaltic, Iberia Express, Air Arabia, flydubai.
  - Mietwagen: Kaution 800 €, Vollschutz 20 €/Tag, Zusatzfahrer 8 €/Tag nicht belegt (nur plausibel); Europcar zählt seit
    3/2026 Fahrer unter 26 als jung.
  - Ab etwa Mitte 2027 (überarbeitete EU-Fluggastrechte): Kinder unter 14 kostenlos neben einem Erwachsenen; Hinweis anpassen.
  - Malediven Mindestgültigkeit Pass (vorübergehend 1 Monat statt 6), Eiffelturm-Verkaufsstart (Uhrzeit uneinheitlich).
