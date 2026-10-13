# Besondere Ziele und Reisehinweise

Liste für die Karte „Einreise & Tipps“ (`app/src/lib/hints.ts`, Texte `hint.<id>.t/.x` in `app/src/lib/i18n/*.ts`).
Einreise je reisender Person mit ihrem Pass (bei zwei Pässen der günstigere, mit Hinweis) aus `public/visa.json`
(Passport Index Data). Die Einreise-Texte gelten nur für die Pässe in `pass` (Spalte „gilt für“); für andere Pässe
erscheinen nur der Überblick und der offizielle Link. Warnstufen kommen live vom Auswärtigen Amt (`/advice` im
Such-Dienst), für britische, US- und kanadische Pässe von der eigenen Regierung (siehe unten).
Kurze Hinweise, keine Rechtsberatung: maßgeblich ist immer der verlinkte offizielle Link. Stand der Recherche: Oktober 2026.

## Eingebaut

### Einreise (vorab online)
| ID | Land | Was | Link | gilt für |
|---|---|---|---|---|
| us | USA | ESTA | esta.cbp.dhs.gov | Reisegenehmigung (laut visa.json) |
| ca | Kanada | eTA | canada.ca | Reisegenehmigung |
| gb | Großbritannien | ETA | gov.uk/eta | Reisegenehmigung |
| au | Australien | eVisitor | immi.homeaffairs.gov.au | EU/EWR/CH, GB |
| nz | Neuseeland | NZeTA (+ IVL) | immigration.govt.nz | Reisegenehmigung |
| th | Thailand | TDAC-Ankunftskarte | tdac.immigration.go.th | alle |
| ke | Kenia | eTA | etakenya.go.ke | alle |
| in | Indien | e-Visa | indianvisaonline.gov.in | e-Visum |
| lk | Sri Lanka | ETA | eta.gov.lk | DE |
| eg | Ägypten | e-Visa / Visum bei Ankunft | visa2egypt.gov.eg | e-Visum, bei Ankunft |
| il | Israel | ETA-IL (25 ILS) | israel-entry.piba.gov.il | Reisegenehmigung |
| cu | Kuba | eVisa (seit Juli 2025) + D'Viajeros | evisacuba.cu, dviajeros.mitrans.gob.cu | e-Visum |
| sc | Seychellen | Travel Authorisation | seychelles.govtas.com | alle |
| idn | Indonesien | All Indonesia (Ankunft) + e-VOA | allindonesia.imigrasi.go.id | bei Ankunft |
| ph | Philippinen | eTravel (72 h vorher) | etravel.gov.ph | alle |
| bt | Bhutan | e-Visum + SDF 100 USD/Nacht (bis Aug. 2027) | bhutan.travel | e-Visum |
| tz | Tansania | e-Visum | eservices.immigration.go.tz | e-Visum, bei Ankunft |
| cn | China | visumfrei 30 Tage (bis 31.12.2026) | en.nia.gov.cn | DE |

### Warnung (für alle)
| ID | Land | Was |
|---|---|---|
| kp | Nordkorea | AA rät von Reisen ab; nur mit Veranstaltern (Koryo Tours, Young Pioneer Tours) |

### Besondere Orte
| ID | Ort | Was | Gebühr als Posten |
|---|---|---|---|
| galapagos | Galápagos | TCT-Karte vorab, Nationalpark-Gebühr | 220 USD (Kind 120) |
| machu | Machu Picchu | Tickets mit Zeitfenster und Route, Zug ab Cusco/Ollantaytambo | – |
| inca | Inka-Trail | Permits nur über Veranstalter, 200 Wanderer/Tag, Februar geschlossen | – |
| corcovado | Cristo Redentor | Zahnradbahn mit Zeitfenster | – |
| rapanui | Osterinsel | Nationalpark-Ticket, Führer Pflicht, FUI 48 h vorher, max. 30 Tage | 100 USD |
| venice | Venedig | Eintrittsgebühr an Tagen mit Pflicht | – |
| alhambra | Alhambra | Tickets mit Zeitfenster, früh ausverkauft | – |
| sagrada | Sagrada Família | nur online mit Zeitfenster | – |
| acropolis | Akropolis | e-Ticket mit Zeitfenster | – |
| neuschwanstein | Neuschwanstein | Führung mit Zeitfenster | – |
| angkor | Angkor | Angkor-Pass | – |
| petra | Petra | Jordan Pass (inkl. Visum) | – |
| bali | Bali | Touristenabgabe online | 150.000 IDR |
| fuji | Fuji-Besteigung | Anmeldung und Gebühr, Saison Juli bis 10. Sept. | 4.000 JPY |
| nepal | Everest/Annapurna | TIMS, Guide Pflicht | – |
| gorilla | Gorilla-Trekking | Permits (Uganda 800 USD, Ruanda 1.500 USD), 8 pro Gruppe, ab 15 Jahren | – |
| aq | Antarktis | Genehmigung durch das Umweltbundesamt (über Veranstalter), IAATO | – |

### Grenzregeln und Reisepass (`app/src/lib/borders.ts`, angezeigt unter „Wichtiges“)
| Was | Regel | Quelle |
|---|---|---|
| EES | Pässe von außerhalb EU/EWR/Schweiz: Erfassung bei der ersten Einreise in den Schengen-Raum (seit 12.10.2025, vollständig ab 10.04.2026) | travel-europe.europa.eu/ees |
| ETIAS | Reisegenehmigung für visumfreie Pässe von außerhalb der EU, noch nicht in Kraft; „letztes Quartal 2026“ hat die EU im Juli 2026 von der Seite genommen, 2027 wahrscheinlich (Stand Oktober 2026) | travel-europe.europa.eu/etias |
| Mindestgültigkeit Reisepass (Regel des Ziellands, gilt für die meisten Pässe) | 6 Monate ab Einreise: TH, ID, VN, KH, LA, MM, LK, IN, NP, MY, SG, CN, EG, AE, JO, OM, SA, KE, TZ, UG, RW; 6 Monate über Aufenthalt: PH; 150 Tage ab Einreise: TR; 3 Monate über Ausreise: NZ; 30 Tage über Ausreise: ZA; sonst bis Reiseende | Länderseiten des Auswärtigen Amts |

Die Prüfung des eigenen Reisepasses nutzt das Ablaufdatum aus den Buchungsdaten im Konto, nur im Browser; in der Reise
steht nur „erledigt“ je Person, ohne Datum. Wird ETIAS eingeführt: Text `imp.border.x` und die Signatur `ees` in
`important.ts` anpassen, damit der Punkt bei allen wieder als offen erscheint.

### Früh buchen (`app/src/lib/bookahead.ts`, unter „Wichtiges“ je Reiseziel)
60 Orte in 33 Reisezielen. Recherche Oktober 2026; belegte Fenster (offizielle Seiten bzw. übereinstimmende Quellen):

| Ort | Fenster |
|---|---|
| Shibuya Sky | 14 Tage vorher, 00:00 JST |
| Ghibli Museum | am 10. um 10:00 JST für den Folgemonat (Lawson Ticket) |
| Ghibli Park | am 10. um 14:00 JST für den übernächsten Monat |
| Pokémon Café Tokyo/Osaka | 31 Tage vorher, 18:00 JST |
| Tokyo Disney Resort | gleicher Tag zwei Monate vorher, 14:00 JST |
| Nintendo Museum, Katsura/Shugakuin (Kaiserliche Villen) | Verlosung bzw. Anmeldung ab dem 1. des Monats, drei Monate vorher |
| Forbidden City | 7 Tage vorher, 20:00 Peking |
| Musei Vaticani | 60 Tage vorher, 00:00 Rom |
| Colosseo | 30 Tage vorher |
| Cenacolo Vinciano | Blöcke für drei Monate (März, Juni, September, Dezember) |
| Alhambra | drei Monate vorher |
| Sagrada Família | ca. zwei Monate vorher |
| Tour Eiffel | 60 Tage vorher, 00:00 Paris |
| Anne Frank Huis | dienstags 10:00 für die Woche in sechs Wochen |
| Alcatraz | 90 Tage vorher |
| Statue of Liberty (Krone) | bis ca. sechs Monate vorher |
| Antelope Canyon | ca. drei Monate vorher |
| Arches (Fiery Furnace) | Timed Entry 2026 abgeschafft (NPS, 18.02.2026); nur noch Permit für Fiery Furnace, so früh wie möglich |
| Inka-Trail | Permits ab Ende Oktober des Vorjahres (2026: ab 27.10.2025, gestaffelt bis 04.11.) |
| Milford Track | Buchung meist im Mai für die Saison Juli bis Juni |
| Half Dome | Vorab-Verlosung im März |
| Sky Garden | ca. drei Wochen vorher |

Alle übrigen Orte ohne festen Verkaufsstart: Empfehlung „spätestens N Wochen vorher“ (`asap`). Fenster ändern sich;
vor großen Releases stichprobenartig prüfen. Neuer Ort = ein Eintrag in `BOOK_AHEAD`, neues Reiseziel in `CITIES`.

## Merkliste (noch nicht eingebaut, vor dem Einbau Fakten prüfen)
- Cinque Terre (Wanderpass)
- Taj Mahal (Online-Tickets, freitags geschlossen), Komodo (Parkgebühren), Kilimandscharo (Guide Pflicht)
- Uluru (Parkpass), Spitzbergen (Regeln außerhalb der Siedlungen)
- US-Nationalparks: Arches, Yosemite und Glacier verzichten 2026 auf Reservierungen; jährlich neu prüfen
- Südkorea K-ETA (Deutsche bis 31.12.2026 befreit; vor Jahresende prüfen, ob verlängert), weitere ETA-Länder
- Länderseiten des AA: Einreisetext auszugsweise anzeigen
- Staatsangehörigkeit im Personenverzeichnis speichern

### Reisehinweise anderer Regierungen (`app/src/lib/govadvice.ts`, Such-Dienst `/advice/gov?cc=XX`)
Der Such-Dienst bekommt nur das Reiseland und liefert alle Quellen dafür; welche gilt, wählt der Browser aus dem Pass
(deutscher Pass: Auswärtiges Amt; sonst die eigene Regierung mit Schnittstelle; sonst Auswärtiges Amt mit Hinweis und
Link zur eigenen Regierung). Stufen werden auf die des Auswärtigen Amts abgebildet.
| Pass | Quelle | Schnittstelle | Zwischenspeicher | Abbildung |
|---|---|---|---|---|
| GB | FCDO | GOV.UK Content API: `www.gov.uk/api/content/foreign-travel-advice` (Liste) und `…/{slug}` (`details.alert_status`) | Liste 1 Tag, Land 6 h | ganzes Land meiden = Reisewarnung, sonst Teilreisewarnung; Botschaft: `gov.uk/world/{slug}` |
| US | U.S. Department of State | `cadataapi.state.gov/api/TravelAdvisories` (Level im Titel) | 6 h | Level 4 Reisewarnung, 3 Teilreisewarnung, 2 Sicherheitshinweis |
| CA | Government of Canada | `data.international.gc.ca/travel-voyage/index-updated.json` (`advisory-state`) | 6 h | 3 Reisewarnung, 2 oder regional Teilreisewarnung, 1 Sicherheitshinweis |
| AT, CH, FR, NL, IE, AU, NZ, PL, ES, IT | eigene Regierung ohne offene Schnittstelle | – | – | Auswärtiges Amt mit Hinweis und Link |
