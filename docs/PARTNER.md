# Partner (Affiliate-Links)

Alle Anbieter, zu denen die App verlinkt, stehen im **Partner-Verzeichnis** `app/src/lib/partners/index.ts`.
Die Oberfläche zeigt sie über `app/src/lib/ui/PartnerLinks.svelte`; Links von Hand in Komponenten zu bauen ist nicht vorgesehen.
Übersicht in der App: Admin-Ansicht im Kontomenü, Abschnitt „Partner (Verzeichnis)“ mit Kategorie, Netzwerk, Status
der Kennung (aktiv, hinterlegt bei ausgeschaltetem Schalter, neutral, ausgeblendet) und Klicks der letzten 7 Tage.

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

## Einen Partner hinzufügen

1. Eintrag in `PARTNERS` (`app/src/lib/partners/index.ts`) in der passenden Kategorie:
   - `name`, `cat` (flight, stay, activity, food, car, transfer, insurance), `net` (direct, travelpayouts, awin, amazon),
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
| Booking.com | Unterkunft | direkt | – |
| Airbnb | Unterkunft | – | – |
| GetYourGuide, Tiqets | Erlebnisse | Travelpayouts | – |
| Viator | Erlebnisse | direkt | ja (`pid`, `mcid`, `medium`) |
| Tripadvisor | Essen | – | – |
| KAYAK, CHECK24 | Mietwagen | – | – |
| DiscoverCars | Mietwagen | Travelpayouts | – |
| Kiwitaxi, GetTransfer, Intui.travel, Welcome Pickups | Transfer | Travelpayouts | – |
| Booking.com Taxi | Transfer | – | – |
| Direct Ferries, Ferryhopper | Fähren | direkt (noch nicht beantragt) | – |
| CHECK24, Allianz Travel | Versicherung (nur Tipp) | – | – |
| ERGO, HanseMerkur | Versicherung (nur Tipp) | Awin | – |

Flüge über die Travelpayouts-Schnittstelle bekommen den `marker` im Such-Dienst (Secret `TRAVELPAYOUTS_MARKER`), nicht hier.

## Bedingungen

- **Viator:** Suche nur auf splitandfly.com, nicht über den KI-Konnektor (siehe `docs/KONNEKTOR.md`).
- **Reiseversicherung:** nur als Tipp verlinken, keine Beratung und kein Tarifvergleich (sonst Erlaubnis nach § 34d GewO nötig).
