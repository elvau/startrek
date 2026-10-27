# Partner (Affiliate-Links)

Alle Anbieter, zu denen die App verlinkt, stehen im **Partner-Verzeichnis** `app/src/lib/partners/index.ts`.
Die Oberfläche zeigt sie über `app/src/lib/ui/PartnerLinks.svelte`; Links von Hand in Komponenten zu bauen ist nicht vorgesehen.
Übersicht in der App: Admin-Ansicht im Kontomenü, Abschnitt „Partner (Verzeichnis)“ mit Kategorie, Netzwerk, Status
der Kennung (aktiv, hinterlegt bei ausgeschaltetem Schalter, neutral, ausgeblendet) und Klicks der letzten 7 Tage.

## Grundsatz: bester Preis vor Provision

Split&Fly soll jedem die beste Reise zeigen, nicht die mit der höchsten Provision.
- Reihenfolge, Bewertung und Vorschläge (Flüge, Unterkünfte, KI-Planer) richten sich nur nach Preis, Zeit und Passung,
  nie danach, ob ein Angebot einen Partner-Link hat. Partner-Links bekommen keinen Bonus in Sortierung oder Auswahl.
- Ist ein Angebot ohne Partnerprogramm besser (günstiger oder passender), wird es genauso gezeigt und verlinkt
  (neutral, ohne Kennung). Anbieter ohne Programm fliegen nicht raus.
- Partner-Links sind immer gekennzeichnet (siehe unten); der Preis für Nutzer ist derselbe wie ohne Link.
- Neue Funktionen und Reviews prüfen das mit: keine Filter oder Gewichte nach `sponsored` bzw. `tag`.

## Schalter

- **`PARTNER_LINKS=on`** (Variable im Such-Dienst, Cloudflare): Nur dann gehen Partnerkennungen in Links. Die App fragt den
  Schalter einmal je Sitzung bei `/health` ab (`partnerState.svelte.ts`). Ohne Schalter sind alle Links neutral.
- **Kennung je Partner** (`tag` im Verzeichnis): nur eintragen, wenn das Programm freigeschaltet ist. Ohne `tag` bleibt der
  Link neutral, auch wenn der Schalter an ist.
- **`off: true`** blendet einen Partner vorübergehend aus (z. B. wenn ein Programm pausiert).

## Kennzeichnung (Werbehinweis)

Ein Link mit Kennung bekommt automatisch `rel="sponsored"` und den Zusatz „Partner-Link*“ (`fs.partner`). Darunter steht der
Hinweis zum Sternchen (`fs.partnerNote`), sobald einer der gezeigten Links ein Partner-Link ist (`sponsoredAny`).
Treffer aus Schnittstellen (Flüge über Travelpayouts, Touren über Viator) setzen `sponsored` selbst; ihre Links laufen über
`app/src/lib/ui/ExtLink.svelte` und werden genauso gekennzeichnet (auch in übernommenen Posten).

## Klicks zählen

Jeder Klick auf einen Anbieter-Link (`ExtLink` mit `track`) meldet nebenher Partner und Kategorie an den Such-Dienst
(`POST /click`, `app/src/lib/partners/click.ts`), der sie je Tag in Analytics Engine zählt (`noteClick` in
`worker/src/usage.ts`), ohne IP, Konto oder Reise. Auswertung: Admin-Ansicht im Kontomenü, Abschnitt „Klicks auf
Anbieter-Links“ (letzte 7 Tage). Der Link öffnet sofort, das Zählen läuft nebenher.

## Travelpayouts-Links

Partner über Travelpayouts bekommen als Kennung `tag: tp(p, campaign)`: Der Ziel-Link (mit Ort, Datum usw.) wird über
`https://tp.media/r?campaign_id=…&marker=…&p=…&trs=…&u=<Ziel>` geleitet. `marker` (Konto) und `trs` (Projekt splitandfly.com)
stehen in `TP_PARTNER`; `p` (Programm) und `campaign_id` liest man aus einem langen Link aus „Generate links“ (Kurzlink aus).

## Awin-Links

Partner über Awin bekommen `tag: awin(mid)`: Der Ziel-Link wird über
`https://www.awin1.com/cread.php?awinmid=<Programm>&awinaffid=<Publisher>&ued=<Ziel>` geleitet. Die Publisher-ID des
Kontos steht in `AWIN_PUBLISHER`, `awinmid` (Advertiser-ID) im Link aus den Programm-Unterlagen. Parken und Fliegen:
keine Suchmaschinen-Werbung (SEA) mit ihren Keywords, SEO-Inhalte erlaubt; Branding wie parken-und-fliegen.de.

## Einen Partner hinzufügen

1. Eintrag in `PARTNERS` (`app/src/lib/partners/index.ts`) in der passenden Kategorie:
   - `name`, `cat` (flight, stay, activity, food, car, transfer, insurance, ferry, camper, camping, parking, cruise, esim), `net` (direct, travelpayouts, awin, cj, amazon),
   - `link`: Link mit vorausgefüllten Angaben (Ort, Datum, Personen); `null`, wenn die Angaben nicht reichen,
   - `tag`: Partnerkennung anhängen (erst nach Freischaltung).
   Neue Kategorie: in `PartnerCat` ergänzen und an der Stelle in der Oberfläche `<PartnerLinks ids={partnersOf("…")} q={…} />` einsetzen.
2. Unit-Test in `app/src/lib/partners/partners.test.ts` (Beispielangaben für neue Kategorien, Link mit und ohne Kennung).
3. Mit Kennung: `public/datenschutz.html` und Impressum prüfen (Netzwerk nennen), Partnerbedingungen hier unten festhalten.
4. Tabelle unten nachtragen.

## Übersicht

| Partner | Kategorie | Netzwerk | Kennung aktiv |
|---|---|---|---|
| Google Flights, Skyscanner | Flüge | – | – |
| Booking.com | Unterkunft | CJ (beworben 10/2026) | – |
| Airbnb | Unterkunft | – | – |
| FeWo-direkt, Hotels.com | Unterkunft (noch nicht in der App) | CJ (zugelassen 10/2026) | – |
| GetYourGuide | Erlebnisse | CJ (beworben 10/2026; Travelpayouts abgelehnt) | – |
| Tiqets | Erlebnisse | Travelpayouts | ja (`p=2074`, `campaign_id=89`) |
| Klook | Erlebnisse | Travelpayouts | ja (`p=4110`, `campaign_id=137`) |
| Viator | Erlebnisse | direkt | ja (`pid`, `mcid`, `medium`) |
| Tripadvisor | Essen | – | – |
| KAYAK, CHECK24 | Mietwagen | – | – |
| DiscoverCars | Mietwagen | Travelpayouts | – |
| VIP Cars, Carla Car Rental | Mietwagen (noch nicht in der App) | CJ (zugelassen 10/2026) | – |
| Kiwitaxi | Transfer | Travelpayouts | ja (`p=647`, `campaign_id=1`) |
| Welcome Pickups | Transfer | Travelpayouts | ja (`p=8919`, `campaign_id=627`) |
| GetTransfer, Intui.travel | Transfer | Travelpayouts | – |
| Booking.com Taxi | Transfer | – | – |
| Suntransfers | Transfer (noch nicht in der App) | CJ (zugelassen 10/2026) | – |
| Direct Ferries, Ferryhopper | Fähren | direkt (noch nicht beantragt) | – |
| PaulCamper | Mietcamper | Travelpayouts (20 %, noch nicht beantragt) | – |
| Roadsurfer | Mietcamper | Awin (beworben 10/2026) | – |
| Indie Campers, Yescapa | Mietcamper | eigenes Programm bzw. TradeTracker | – |
| PiNCAMP, ACSI (Eurocampings), park4night | Camping- und Stellplätze | PiNCAMP über TradeTracker (3 %) | – |
| Parkos | Parken am Flughafen | – (kein Programm bei Awin) | – |
| Airparks | Parken am Flughafen | Awin (beworben 10/2026) | – |
| Parken und Fliegen | Parken am Flughafen | Awin | ja (`awinmid=14793`) |
| Holiday Extras | Parken am Flughafen (noch nicht in der App) | Awin (beworben 10/2026) | – |
| e-hoi, Kreuzfahrten-Zentrale, Dreamlines, Costa, Mein Schiff | Kreuzfahrten (#519) | Awin (beworben 10/2026, #526) | – |
| CHECK24, Allianz Travel | Versicherung (nur Tipp) | – | – |
| Yesim, Airalo | eSIM (Hinweis in „Wichtiges“ bei Reiseländern ohne EU-Roaming, #297) | Travelpayouts | ja (Yesim `p=5998`, `campaign_id=224`; Airalo `p=8310`, `campaign_id=541`) |
| ERGO, HanseMerkur | Versicherung (nur Tipp) | Awin (HanseMerkur beworben 10/2026, ERGO nicht gefunden) | – |

Flüge über die Travelpayouts-Schnittstelle bekommen den `marker` im Such-Dienst (Secret `TRAVELPAYOUTS_MARKER`), nicht hier.

## Bedingungen

- **Viator:** Suche nur auf splitandfly.com, nicht über den KI-Konnektor (siehe `docs/KONNEKTOR.md`).
- **Reiseversicherung:** nur als Tipp verlinken, keine Beratung und kein Tarifvergleich (sonst Erlaubnis nach § 34d GewO nötig).

## Awin

Publisher-Konto für splitandfly.com (Publisher-ID `3121582`, öffentlich, steht in jedem Awin-Link). Beworben 10/2026.
Stand 22.10.2026:
- **zugelassen:** Airparks DE (`awinmid` 14699), Holiday Extras DE (`awinmid` 55335) (Parken am Flughafen),
  HanseMerkur Versicherungsgruppe DE (`awinmid` 11705, Reiseversicherung; nur als Tipp, keine Beratung)
- **abgelehnt:** Sunny Cars („arbeitet nicht mit diesem Publisher-Typ“), ab-in-den-urlaub (Pauschalreisen)
- **offen:** TUI Cars, Sixt, Europcar (Mietwagen), TUI Camper, Roadsurfer (Camper), Tui.com (Pauschalreisen),
  TUI Cruises/Mein Schiff, e-hoi, Kreuzfahrten-Zentrale, Dreamlines, Costa (Kreuzfahrten, beworben 10/2026, #526)

Nach der Freischaltung je Programm die Advertiser-ID (`awinmid`) eintragen (`tag: awin(…)` in `app/src/lib/partners/index.ts`); Link-Format
`https://www.awin1.com/cread.php?awinmid=…&awinaffid=3121582&ued=<Ziel>`.

## CJ (Commission Junction)

Publisher-Konto für splitandfly.com, beworben 10/2026. Travelpayouts hatte GetYourGuide und Booking.com zum Start
abgelehnt, deshalb laufen diese über CJ.
Stand 27.10.2026:
- **zugelassen** (Willkommens-Mails, Link-IDs noch nicht eingetragen): FeWo-direkt (Expedia Group), Hotels.com EMEA,
  Suntransfers, VIP Cars, Carla Car Rental
- **offen:** Booking.com DACH, GetYourGuide INT, Kiwi.com, Vrbo (mit Länderprogrammen), Agoda EU, Hotels.com DACH,
  Expedia DACH, Trip.com, EconomyBookings, AirportRentalCars, Balearia, Omio, World Nomads (nur als Tipp)

Publisher-ID (PID) `8096976` (öffentlich, steht in jedem CJ-Link), im Verzeichnis als `CJ_PUBLISHER`. Partner über CJ
bekommen `tag: cj(aid)`: Der Ziel-Link wird über `https://www.anrdoezrs.net/click-8096976-<aid>?url=<Ziel>` geleitet; `aid` ist
die Link-ID eines Text-Links des Programms (CJ-Konto → Links, nach der Freischaltung). Mit der ersten Kennung CJ in
`public/datenschutz.html` und im Impressum nennen. Kiwi.com: Buchungslinks der Flugsuche (`bookingUrl` aus
`app/src/lib/flights/kiwi.ts`) über CJ leiten, falls Deeplinks erlaubt sind.
