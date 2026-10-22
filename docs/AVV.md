# Auftragsverarbeitung (AVV)

Übersicht, mit wem ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO besteht. Dient als Nachweis (Art. 5 Abs. 2)
und als Grundlage für das Verzeichnis der Verarbeitungstätigkeiten (Art. 30). Die Verträge selbst (PDF, Bestätigungen)
liegen privat bei Dani, nicht im Repo. Neuer Dienst mit personenbezogenen Daten → hier eintragen und
`public/datenschutz.html` mitziehen.

Spalte „Angenommen“ füllt Dani (Datum, wo bestätigt).

## Auftragsverarbeiter

| Anbieter | Wofür | Daten | AVV | Drittland | Angenommen |
|---|---|---|---|---|---|
| Google (Firebase) | Hosting, Anmeldung, Firestore, echtes und Testprojekt | IP, Browserkennung, E-Mail, Google-Profil, Reisen, `travelDocs` | „Data Processing and Security Terms“, in der Firebase-Konsole je Projekt annehmen (Projekteinstellungen → Datenschutz) | DPF, SCC | offen |
| Cloudflare | Such-Dienst (Worker), R2 (Bilder der Fehlermeldungen), KV, Web Analytics | IP, Suchanfragen, Wohnland, grober Ort aus IP, Fehlermeldungen mit Bildern | Cloudflare DPA, gilt über die Self-Serve-Bedingungen; PDF ablegen | DPF, SCC | offen |
| Anthropic | KI-Planer, Kontoeinrichtung, KI-Import (Hauptanbieter) | Reisewunsch, eingeworfene Dateien, Texte und Links, ohne Name, E-Mail, IP | DPA ist Teil der Commercial Terms der API, gilt automatisch | SCC | offen |
| GitHub | Testumgebung (Pages), Fehlermeldungen im privaten Repo | IP (Pages), Text der Meldung, gekürzte Nutzerkennung | GitHub DPA; prüfen, ob er für das Konto gilt (bei kostenlosen Konten nicht sicher) | DPF, SCC | prüfen |

## Kein AVV möglich (offen)

| Anbieter | Problem | Ticket |
|---|---|---|
| Google Gemini (Ersatz für den KI-Planer) | Kostenloser Tarif: Google nutzt Eingaben selbst und ist kein Auftragsverarbeiter; der AVV gilt nur für bezahlte Dienste | Entscheidung zum Ersatz-Anbieter |

## Kein AVV nötig

Eigenständig Verantwortliche oder Empfänger ohne personenbezogene Daten (Suchbegriff, Ort, Zeitraum):

- Such-Anbieter: Kiwi.com, Travelpayouts/Aviasales, Duffel, trivago, liteAPI, Ticketmaster, football-data.org, Viator,
  OpenRouteService; Reisehinweise der Regierungen.
- Partner-Links und Weiterleitungen: Travelpayouts (tp.media), Awin, Viator, Booking.com, Airbnb, GetYourGuide u. a.;
  erst beim Antippen, Cookies setzt der Anbieter selbst.
- Bildserver der Anbieter (trivago, liteAPI) und OpenFreeMap sehen technisch die IP; sie handeln auf eigene
  Verantwortung (Datenschutzerklärung nennt sie).
