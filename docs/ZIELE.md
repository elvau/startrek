# Besondere Ziele und Reisehinweise

Liste für die Karte „Einreise & Tipps“ (`app/src/lib/hints.ts`, Texte `hint.<id>.t/.x` in `app/src/lib/i18n/*.ts`).
Einreise-Texte gelten für deutsche Staatsangehörige; andere Staatsangehörigkeiten laufen über `public/visa.json`
(Passport Index Data). Warnstufen kommen live vom Auswärtigen Amt (`/advice` im Such-Dienst).
Kurze Hinweise, keine Rechtsberatung: maßgeblich ist immer der verlinkte offizielle Link. Stand der Recherche: Oktober 2026.

## Eingebaut

### Einreise (vorab online)
| ID | Land | Was | Link |
|---|---|---|---|
| us | USA | ESTA | esta.cbp.dhs.gov |
| ca | Kanada | eTA | canada.ca |
| gb | Großbritannien | ETA | gov.uk/eta |
| au | Australien | eVisitor | immi.homeaffairs.gov.au |
| nz | Neuseeland | NZeTA (+ IVL) | immigration.govt.nz |
| th | Thailand | TDAC-Ankunftskarte | tdac.immigration.go.th |
| ke | Kenia | eTA | etakenya.go.ke |
| in | Indien | e-Visa | indianvisaonline.gov.in |
| lk | Sri Lanka | ETA | eta.gov.lk |
| eg | Ägypten | e-Visa / Visum bei Ankunft | visa2egypt.gov.eg |
| il | Israel | ETA-IL (25 ILS) | israel-entry.piba.gov.il |
| cu | Kuba | eVisa (seit Juli 2025) + D'Viajeros | evisacuba.cu, dviajeros.mitrans.gob.cu |
| sc | Seychellen | Travel Authorisation | seychelles.govtas.com |
| idn | Indonesien | All Indonesia (Ankunft) + e-VOA | allindonesia.imigrasi.go.id |
| ph | Philippinen | eTravel (72 h vorher) | etravel.gov.ph |
| bt | Bhutan | e-Visum + SDF 100 USD/Nacht (bis Aug. 2027) | bhutan.travel |
| tz | Tansania | e-Visum | eservices.immigration.go.tz |
| cn | China | visumfrei 30 Tage (bis 31.12.2026) | en.nia.gov.cn |

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
| ETIAS | Reisegenehmigung für visumfreie Pässe von außerhalb der EU, Start angekündigt, noch nicht in Kraft (Stand Oktober 2026) | travel-europe.europa.eu/etias |
| Mindestgültigkeit Reisepass (deutsche Staatsangehörige) | 6 Monate ab Einreise: TH, ID, VN, KH, LA, MM, LK, IN, NP, MY, SG, CN, EG, AE, JO, OM, SA, KE, TZ, UG, RW; 6 Monate über Aufenthalt: PH; 150 Tage ab Einreise: TR; 3 Monate über Ausreise: NZ; 30 Tage über Ausreise: ZA; sonst bis Reiseende | Länderseiten des Auswärtigen Amts |

Die Prüfung des eigenen Reisepasses nutzt das Ablaufdatum aus den Buchungsdaten im Konto, nur im Browser; in der Reise
steht nur „erledigt“ je Person, ohne Datum. Wird ETIAS eingeführt: Text `imp.border.x` und die Signatur `ees` in
`important.ts` anpassen, damit der Punkt bei allen wieder als offen erscheint.

## Merkliste (noch nicht eingebaut, vor dem Einbau Fakten prüfen)
- Louvre, Vatikanische Museen, Kolosseum, Park Güell: Zeitfenster-Tickets
- Plitvicer Seen (Tickets mit Zeitfenster im Sommer), Cinque Terre (Wanderpass)
- Taj Mahal (Online-Tickets, freitags geschlossen), Komodo (Parkgebühren), Kilimandscharo (Guide Pflicht)
- Uluru (Parkpass), Spitzbergen (Regeln außerhalb der Siedlungen)
- US-Nationalparks mit Timed Entry (Arches, Yosemite …): wechselt jährlich
- Südkorea K-ETA (Deutsche bis Ende 2026 befreit), weitere ETA-Länder
- Länderseiten des AA: Einreisetext auszugsweise anzeigen
- Staatsangehörigkeit im Personenverzeichnis speichern
