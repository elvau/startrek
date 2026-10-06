# Nebenkosten: gepflegte Richtwerte (#170)

Kurtaxen bzw. City Tax, Vignetten, Maut, Durchfahrten, Trinkgeld und Einreisegebühren. Daten in
[`app/src/lib/fees.ts`](../app/src/lib/fees.ts) (Einreisegebühren in [`app/src/lib/hints.ts`](../app/src/lib/hints.ts), Feld `fee`).
**Stand: 2026, ohne Gewähr.** Die App zeigt die Werte als „ca.“ mit Quelle; maßgeblich sind die Angaben von Stadt, Land bzw. Anbieter.

## So wirkt es in der App
- **Kurtaxe:** An jeder Unterkunft, deren Ort erkannt wird (Suchort, Name, Lage, Ziel der Reise), als geschätzte Nebenkosten
  „vor Ort“ automatisch eingerechnet, nach Sternen gestaffelt, Kinder frei bis zur Altersgrenze, höchstens so viele Nächte wie angegeben.
  Wegklicken merkt sich die App am Angebot (`autoOff`). Gibt der Anbieter eine Kurtaxe an (z. B. liteAPI), wird keine geschätzt.
- **Anreise mit dem eigenen Auto:** In Reisen ohne Flug im Kapitel „Vor Ort“ der Kasten „Anreise mit dem eigenen Auto“: legt je Auto
  einen Posten an (Sprit und Verschleiß hin und zurück aus Entfernung × km-Satz), Vignetten und Maut der Strecke hängen als
  geschätzte Nebenkosten daran. Wer zahlt, bestimmt „Wer ist dabei“ am Posten (Mitfahrende teilen, oder nur der Fahrer).
  Weitere Autos als eigene Posten, vorbelegt mit denen, die noch in keinem Auto sitzen. Bahn oder Bus: kein Auto-Posten, keine Vignette.
  Mietwagen aus Österreich bzw. der Schweiz haben die Vignette meist schon, daher keine Automatik am Mietwagen.
- **Einreisegebühren:** In „Wichtiges“ am Einreise-Punkt „+ Gebühr als Posten“, nur für die Personen, die sie brauchen.
- **Trinkgeld:** Nur als Hinweis bei der Verpflegung, nicht in den Kosten.

Neuer Ort: eine Zeile in `CITY_TAXES` (Wörter zum Erkennen, Währung, Abrechnung, Betrag, ggf. Sterne, Kinder frei, Höchstnächte, Quelle).

## Kurtaxen (39 Orte)
| Ort | Betrag | Regeln | Quelle |
|---|---|---|---|
| Amsterdam | 12.5 % | – | Gemeente Amsterdam |
| Paris | 5.53 EUR pro Person und Nacht (nach Sternen: 1: 2.6, 2: 3.25, 3: 5.53, 4: 8.45, 5: 11.7) | Kinder bis 17 frei | Ville de Paris (Tarife ab 1.1.2026) |
| Rom | 6 EUR pro Person und Nacht (nach Sternen: 1: 4, 2: 5, 3: 6, 4: 7.5, 5: 10) | Kinder bis 9 frei, höchstens 10 Nächte | Roma Capitale |
| Mailand | 7 EUR pro Person und Nacht (nach Sternen: 1: 3, 2: 4, 3: 7, 4: 10, 5: 12) | Kinder bis 17 frei, höchstens 14 Nächte | Comune di Milano (ab 1.4.2026) |
| Venedig | 3.5 EUR pro Person und Nacht (nach Sternen: 1: 1, 2: 2, 3: 3, 4: 4, 5: 5) | Kinder bis 9 frei, höchstens 5 Nächte | Comune di Venezia |
| Florenz | 6 EUR pro Person und Nacht (nach Sternen: 1: 3.5, 2: 4.5, 3: 6, 4: 7, 5: 8) | Kinder bis 11 frei, höchstens 7 Nächte | Comune di Firenze |
| Neapel | 3 EUR pro Person und Nacht (nach Sternen: 1: 1.5, 2: 2, 3: 3, 4: 4, 5: 5) | Kinder bis 17 frei, höchstens 14 Nächte | Comune di Napoli |
| Barcelona | 9.5 EUR pro Person und Nacht (nach Sternen: 1: 7, 2: 7, 3: 7, 4: 8.4, 5: 12) | Kinder bis 16 frei, höchstens 7 Nächte | Generalitat de Catalunya, Ajuntament de Barcelona (ab 1.4.2026) |
| Mallorca, Ibiza, Menorca | 2 EUR pro Person und Nacht (nach Sternen: 1: 2, 2: 2, 3: 2, 4: 3, 5: 4) | Kinder bis 15 frei | Govern de les Illes Balears (Ecotasa) |
| Lissabon | 4 EUR pro Person und Nacht | Kinder bis 13 frei, höchstens 7 Nächte | Câmara Municipal de Lisboa |
| Porto | 3 EUR pro Person und Nacht | Kinder bis 13 frei, höchstens 7 Nächte | Câmara Municipal do Porto |
| Wien | 5 % | – | Stadt Wien (Ortstaxe) |
| Salzburg | 3.5 EUR pro Person und Nacht | Kinder bis 14 frei | Stadt Salzburg (3 € Nächtigungsabgabe + 0,50 € Mobilitätsbeitrag) |
| Berlin | 7.5 % | – | Senatsverwaltung für Finanzen Berlin (City Tax) |
| Hamburg | 2 EUR pro Person und Nacht | – | Freie und Hansestadt Hamburg (Kultur- und Tourismustaxe) |
| Köln | 5 % | – | Stadt Köln (Kulturförderabgabe) |
| Frankfurt | 2 EUR pro Person und Nacht | Kinder bis 17 frei | Stadt Frankfurt (Tourismusbeitrag) |
| Dresden | 6 % | – | Landeshauptstadt Dresden (Beherbergungssteuer) |
| Prag | 50 CZK pro Person und Nacht | Kinder bis 17 frei, höchstens 60 Nächte | Hlavní město Praha |
| Budapest | 4 % | Kinder bis 17 frei | Budapest Főváros (IFA) |
| Brüssel | 5 EUR pro Zimmer und Nacht | – | Région de Bruxelles-Capitale (je Zimmer, ab 1.1.2026) |
| Edinburgh | 5 % | höchstens 5 Nächte | City of Edinburgh Council (Visitor Levy) |
| Athen | 5 EUR pro Zimmer und Nacht (nach Sternen: 1: 2, 2: 2, 3: 5, 4: 10, 5: 15) | – | Hellenic Republic (Klimaresilienzgebühr) |
| Santorini, Mykonos | 5 EUR pro Zimmer und Nacht (nach Sternen: 1: 2, 2: 2, 3: 5, 4: 10, 5: 15) | – | Hellenic Republic (Klimaresilienzgebühr) |
| Dubrovnik | 2.65 EUR pro Person und Nacht | Kinder bis 11 frei | Grad Dubrovnik (April bis September; sonst 1,85 €) |
| Kroatien (Split, Dubrovnik, Istrien …) | 2 EUR pro Person und Nacht | Kinder bis 11 frei | Republika Hrvatska (boravišna pristojba) |
| Zürich | 2.5 CHF pro Person und Nacht | Kinder bis 15 frei | Stadt Zürich (City Tax) |
| Genf | 3.75 CHF pro Person und Nacht | Kinder bis 15 frei | Canton de Genève (taxe de séjour) |
| Malta | 1.5 EUR pro Person und Nacht | Kinder bis 17 frei, höchstens 15 Nächte | Malta Tourism Authority (Eco Contribution, ab 1.7.2026) |
| Island | 800 ISK pro Zimmer und Nacht | – | Skatturinn (gistináttaskattur) |
| New York | 14.75 % | – | NYC Department of Finance (Hotel Room Occupancy Tax) |
| Dubai | 15 AED pro Zimmer und Nacht (nach Sternen: 1: 7, 2: 7, 3: 10, 4: 15, 5: 20) | höchstens 30 Nächte | Dubai DET (Tourism Dirham) |
| Tokio | 200 JPY pro Person und Nacht | – | Tokyo Metropolitan Government (Accommodation Tax) |
| Kyoto | 400 JPY pro Person und Nacht (nach Sternen: 1: 200, 2: 200, 3: 400, 4: 1000, 5: 4000) | – | City of Kyoto (Accommodation Tax) |
| Ljubljana | 3.13 EUR pro Person und Nacht | Kinder bis 6 frei | Mestna občina Ljubljana (7–17 Jahre halber Satz) |
| Zermatt | 4 CHF pro Person und Nacht | Kinder bis 8 frei | Zermatt Tourismus (9–15 Jahre 2 CHF) |
| Funchal (Madeira) | 2 EUR pro Person und Nacht | höchstens 7 Nächte | Câmara Municipal do Funchal |
| Malediven | 12 USD pro Person und Nacht | Kinder bis 1 frei | Maldives Inland Revenue Authority (Green Tax; 6 USD in kleinen Gästehäusern) |
| Türkei | 1 % | – | Gelir İdaresi Başkanlığı (Konaklama Vergisi; bis 31.12.2026 1 %, danach 2 %) |

## Vignetten (Pkw)
Österreich 10 Tage 12,80 € (ASFINAG) · Schweiz Jahresvignette 40 CHF (BAZG) · Slowenien 7 Tage 16 € (DARS) · Tschechien 10 Tage
300 CZK (edalnice.cz, ab 1.1.2026) · Slowakei 10 Tage 12 € (eznamka.sk; laut Presse 2026 evtl. 10,80 €, ungeprüft) · Ungarn 10 Tage
6.910 HUF (nemzetiutdij.hu, ab 1.1.2026) · Rumänien 10 Tage 30 RON für Euro 6 (erovinieta.ro, neue Tarife nach Abgasnorm ab
1.10.2026) · Bulgarien Woche 10 € (bgtoll.bg, Euro seit 1.1.2026, Preis ab 1.8.2026). Fremdwährungen ohne geladene Tageskurse
rechnet die App mit Notkursen (`safeRate`).

## Maut nach Strecke (Richtwert je 100 km Autobahn, Pkw)
Frankreich 9 € · Italien 7,50 € · Spanien 2 € (Durchschnitt; AP-7 seit 2021 mautfrei) · Portugal 8 € (ehemalige SCUT-Strecken seit
2025 frei) · Kroatien 7 € · Griechenland 7 € · Polen 6 € (nur private Abschnitte A1, A2, A4) · Serbien 4,50 € · Nordmazedonien 4 € ·
Norwegen 10 € (Ringe und Strecken, ungenau). Durchfahrten (`TRANSIT`) als übliche Route, z. B. Deutschland → Kroatien über
Österreich und Slowenien, Deutschland → Griechenland über Österreich, Ungarn, Serbien und Nordmazedonien. Feste Gebühren je
Durchfahrt (Brenner, Tauern, Karawanken, Storebælt, Øresund, Dartford) sind noch nicht drin (Merkliste in `docs/OFFEN.md`).

## Einreisegebühren (pro Person, Stand 2026)
USA ESTA 40 USD · Kanada eTA 7 CAD · Vereinigtes Königreich ETA 20 GBP (seit 8.4.2026) · Neuseeland NZeTA + IVL 117 NZD · Kenia eTA 30 USD ·
Indien e-Visa 25 USD · Sri Lanka ETA (seit 5/2026 für Deutsche kostenlos) · Ägypten Visum 25 USD · Israel ETA-IL 25 ILS · Seychellen 10 € · Indonesien e-VOA
500.000 IDR · Tansania e-Visa 50 USD (seit 10/2026 zusätzlich Pflicht-Reiseversicherung ca. 44 USD, nur als Hinweis) · Kambodscha e-Visa 30 USD · Jordanien Visum 40 JOD (mit Jordan Pass enthalten) · Nepal Visum ab 30 USD. Dazu (schon vorher) Galápagos, Bali-Abgabe, Fuji, Rapa Nui. ETIAS (Schengen) noch nicht
eingerechnet, solange der Start nicht feststeht.

## Trinkgeld
Gepflogenheiten im Restaurant je Land (`TIPS`, gut 70 Länder, Prüfung 10/2026): USA 18–22 %, Kanada 15–20 %, Japan, Korea, China nicht üblich, sonst
aufrunden bzw. 5–15 %; dazu Hinweise auf Resortgebühren (USA, Mexiko), Strandliegen (Italien, Kroatien, Griechenland) und
Bedienungsgeld bzw. Gedeck (Frankreich, Italien, Vereinigtes Königreich, Ungarn, Emirate).

## Mietwagen (#172)
Richtwerte großer Vermieter (`RENTAL` in `app/src/lib/fees.ts`, Kompaktklasse, Stand 2026). Gilt für Posten aus „Mietwagen
dazu“ (`hint: "rental"`) und ältere Posten mit Auto-Symbol und Namen wie „Mietwagen“, nicht für Transfer und eigenes Auto.

| Was | Richtwert | In der App |
|---|---|---|
| Kaution | 800 € je Auto (üblich 300–1.500 €), nur Kreditkarte | geschätzt, nie in den Kosten, in „Wichtiges“ als dringend; eigene Angabe geht vor, ausblendbar |
| Junge Fahrer | 12 € pro Tag unter 25 Jahren, unter 21 oft keine Vermietung | eingerechnet, wenn eine erwachsene Person unter 25 dabei ist; wegklickbar |
| Vollschutz ohne Selbstbeteiligung | 20 € pro Tag | nur auf Wunsch eingerechnet |
| Zusatzfahrer | 8 € pro Tag | nur auf Wunsch eingerechnet |

Dazu die Checkliste am Posten (Kaution, Selbstbeteiligung, Tank voll/voll, junge Fahrer, Zusatzfahrer und Auslandsfahrten,
Schäden fotografieren) mit dem Hinweis, dass die Bedingungen des Vermieters maßgeblich sind. Allgemeine Hinweise, keine
Versicherungsberatung. Führerscheindauer und „Kreditkarte vorhanden“ kommen mit dem Konto-Assistenten (#160) dazu,
Angaben echter Mietwagen-Angebote mit [114] (#144).

## Fähren (43 Verbindungen, #202)
Richtwerte je einfache Fahrt, Hauptsaison, grob und ohne Gewähr (Prüfung 10/2026; meist Durchschnitte je Buchung bei Direct
Ferries, wenige offizielle Tarife). Liste: `FERRIES` in `app/src/lib/road/ferries.ts`. Liegt bei einem Roadtrip eine Station
auf einer Insel bzw. in Großbritannien oder Irland, kommt die Fähre automatisch dazwischen (wählbar). Am Auto-Posten:
Fahrzeug je Überfahrt, Personen je Mitfahrer (Kinder bis 3 frei), Kabine nur auf Wunsch; „Paket“ heißt Pflichtkabine, Preis
mit Personen und Kabine.

| Verbindung | Dauer | Pkw | Person | Kabine | Reedereien | Quelle |
|---|---|---|---|---|---|---|
| Livorno → Olbia | 9 h (Nacht) | 219 € | 70 € | 140 € | Moby, Grimaldi | Direct Ferries |
| Genua → Olbia | 11 h (Nacht) | 258 € | – | 150 € | Moby, GNV | Direct Ferries |
| Genua → Porto Torres | 11 h (Nacht) | – | – | 70 € | GNV, Tirrenia | Direct Ferries |
| Civitavecchia → Olbia | 7 h (Nacht) | 271 € | 134 € | – | GNV, Grimaldi, Tirrenia | Direct Ferries |
| Livorno → Golfo Aranci | 10 h (Nacht) | 327 € | – | – | Corsica Ferries | Direct Ferries |
| Civitavecchia → Cagliari | 14.5 h (Nacht) | 355 € | – | – | Grimaldi | Direct Ferries |
| Piombino → Olbia | 5.5 h | – | 37 € | – | Moby | Direct Ferries |
| Livorno → Bastia | 5 h | 267 € | 72 € | – | Corsica Ferries, Moby | Direct Ferries |
| Savona (Vado) → Bastia | 7 h | 365 € | 98 € | – | Corsica Ferries | Direct Ferries |
| Nizza → Bastia | 7 h | 214 € | 59 € | – | Corsica Ferries | Direct Ferries |
| Toulon → Ajaccio | 10 h (Nacht) | 429 € | 122 € | 90 € | Corsica Ferries | Direct Ferries |
| Marseille → Ajaccio | 12.5 h (Nacht) | 555 € | 180 € | – | Corsica Linea, La Méridionale | Direct Ferries |
| Bonifacio → Santa Teresa Gallura | 1 h | 97 € | – | – | Moby, Ichnusa Lines | Direct Ferries |
| Barcelona → Palma | 7 h (Nacht) | 205 € | 74 € | 170 € | Baleària, Trasmed, GNV | Direct Ferries |
| Valencia → Palma | 7.5 h (Nacht) | 218 € | 132 € | – | Baleària, GNV | Direct Ferries |
| Dénia → Ibiza | 2.5 h | 227 € | – | – | Baleària | Direct Ferries |
| Dénia → Palma | 5.5 h | 350 € | – | – | Baleària | Direct Ferries |
| Barcelona → Ibiza | 8.5 h (Nacht) | 131 € | 65 € | 166 € | Baleària, Trasmed, GNV | Direct Ferries |
| Barcelona → Maó | 8 h (Nacht) | 335 € | – | – | Trasmed, Baleària | Direct Ferries |
| Genua → Palermo | 20 h (Nacht) | 380 € | 170 € | 145 € | GNV | Direct Ferries |
| Neapel → Palermo | 10.5 h (Nacht) | 217 € | 103 € | – | GNV, Tirrenia | Direct Ferries |
| Civitavecchia → Palermo | 14 h (Nacht) | 352 € | 132 € | – | GNV | Direct Ferries |
| Salerno → Palermo | 10 h (Nacht) | 254 € | – | – | Grimaldi | Direct Ferries |
| Villa San Giovanni → Messina | 0.33 h | 75 € | 2.5 € | – | Caronte & Tourist | Ferryhopper |
| Piräus → Heraklion | 9.5 h (Nacht) | 327 € | 33 € | 250 € | Minoan, SeaJets | Direct Ferries |
| Piräus → Chania (Souda) | 9 h (Nacht) | – | 45 € | 112 € | Blue Star | ferriesingreece.com |
| Piräus → Santorini (Athinios) | 7.75 h | 107 € | 58 € | – | Blue Star, SeaJets | Ferryhopper |
| Piräus → Mykonos | 5 h | 85 € | 43 € | – | Blue Star, SeaJets | Ferryhopper |
| Piräus → Paros | 4 h | 130 € | 40 € | – | Blue Star, SeaJets | Ferryhopper |
| Piräus → Naxos | 5 h | 83 € | 42 € | – | Blue Star, SeaJets | Ferryhopper |
| Split → Stari Grad (Hvar) | 2 h | 47.6 € | 8.5 € | – | Jadrolinija | Jadrolinija |
| Split → Supetar (Brač) | 0.83 h | 32 € | 5.2 € | – | Jadrolinija | Jadrolinija |
| Split → Vela Luka (Korčula) | 3 h | 73.7 € | 10.8 € | – | Jadrolinija | Jadrolinija |
| Valbiska (Krk) → Merag (Cres) | 0.42 h | 19.89 € | 4.25 € | – | Jadrolinija | Jadrolinija |
| Piombino → Portoferraio | 1 h | 85 € | 18 € | – | Moby, Toremar, Blu Navy | Ferryhopper |
| Calais → Dover | 1.5 h | 205 € | – | – | P&O, DFDS, Irish Ferries | Direct Ferries |
| Dünkirchen → Dover | 2 h | 145 € | – | – | DFDS | Direct Ferries |
| Hoek van Holland → Harwich | 7 h (Nacht) | 550 € | – | 105 € | Stena Line | Direct Ferries |
| IJmuiden → Newcastle | 16 h (Nacht) | 1100 € (Paket mit Kabine) | – | – | DFDS | Direct Ferries |
| Rotterdam (Europoort) → Hull | 12 h (Nacht) | 640 € (Paket mit Kabine) | – | – | P&O | Direct Ferries |
| Cherbourg → Rosslare | 18 h (Nacht) | 529 € (Paket mit Kabine) | – | – | Stena Line, Brittany Ferries | Ferryhopper |
| Roscoff → Cork (Ringaskiddy) | 14 h (Nacht) | 625 € | – | – | Brittany Ferries | Direct Ferries |
| Holyhead → Dublin | 3.25 h | 404 € | – | – | Irish Ferries, Stena Line | Direct Ferries |

## Camper (#203)
Richtwerte Hauptsaison, grob und ohne Gewähr (Recherche 10/2026 aus Suchergebnissen, Originalseiten nicht abrufbar). Daten:
`app/src/lib/road/camper.ts`. Im Roadtrip-Bereich umschalten „Auto | Camper“; Stationen werden zu Unterkunfts-Posten
„Campingplatz“ bzw. „Stellplatz“ mit Preis je Nacht.

**Campingplatz:** ACSI-Durchschnitt Hochsaison 2026 für 2 Erwachsene + 2 Kinder mit Camper, Strom, Kurtaxe. Für 2 Personen
rechnen wir 75 % davon, je weitere Person ⅛ (Kinder kosten 5–9 €). Land ohne Wert: 52 € (PiNCAMP/ADAC 2026: Europa 49 € für
2 + 1). Nebensaison im Schnitt 29 % günstiger (Kroatien 53 %), nicht eingerechnet.

| Land | ACSI (4 P.) | 2 P. | Stellplatz |
|---|---|---|---|
| HR | 78,28 € | 59 € | 15 € |
| CH | 61,33 € | 46 € | 15 € |
| SI | 60,14 € | 45 € | 15 € |
| IT | 58,86 € | 44 € | 22 € |
| DK | 53,83 € | 40 € | 22 € |
| NO | 53,82 € | 40 € | 22 € |
| AT | 51,89 € | 39 € | 15 € |
| ES | 48,81 € | 37 € | 15 € |
| GB | 44,43 € | 33 € | 15 € |
| FR | 42,33 € | 32 € | 10 € (Aires 5–15 €) |
| DE | 40,82 € | 31 € | 15 € |
| NL | 39,15 € | 29 € | 15 € |
| IE | 37,55 € | 28 € | 15 € |
| GR | 36,20 € | 27 € | 15 € |
| BE | 34,67 € | 26 € | 15 € |
| SE | 33,78 € | 25 € | 22 € |
| PT | 32,02 € | 24 € | 10 € |
| CZ | 28,52 € | 21 € | 15 € |
| HU | 27,72 € | 21 € | 15 € |
| PL | 24,19 € | 18 € | 15 € |

Stellplätze: keine aktuelle Studie je Land, nur Spannen aus Ratgebern (promobil 8–20 €); 15 € wo nichts bekannt ist.

**Mietcamper** (Kastenwagen 4 Personen, Hochsaison): 146 € je Tag (milchplus-Preisvergleich 2026, Nebensaison 85 €),
250 km je Tag frei (McRent, Roadsurfer meist unbegrenzt, Indie Campers 75–100 km, Rent Easy 250 km), darüber 0,35 €/km,
Servicepauschale 120 € (Roadsurfer 99 €, McRent 119–165 €), Endreinigung 139 € nur auf Wunsch (fällt meist nur bei
Verschmutzung an), Kaution 1.500 € nur Kreditkarte (Roadsurfer 800 €, McRent und Indie Campers 2.000 €).

**Kilometersatz:** gemietet 0,25 €/km (Diesel, Kastenwagen 9–10 l, Teilintegrierte gut 10 l, Diesel 2,22–2,39 € im
August/September 2026), eigener Camper 0,40 €/km mit Verschleiß.

**Maut über 2 m Höhe (bis 3,5 t)**, Faktor gegenüber Pkw: FR 1,5 (Klasse 2), IT 1,05 (Klasse B, Angaben widersprüchlich),
PT 1,7 (Klasse 2), HR 1,6 (Kategorie II), GR 2 (Kategorie 3). ES wie Pkw (ohne Zwillingsbereifung), NO bis 3,5 t wie Pkw.
Vignetten unverändert.

**Über 3,5 t:** Führerschein C1 (Hinweis). Österreich GO-Maut statt Vignette, 0,30 €/km (Kategorie 2, Euro VI, 0,2486 € +
20 % USt); Schweiz PSVA statt Vignette, 3,25 CHF je Tag im Land, mindestens 25 CHF. Deutschland, Niederlande, Belgien
mautfrei. Noch nicht eingerechnet: Ungarn (Vignette D2 statt D1, 10 Tage 10.040 Ft), Slowenien (DarsGo), Tschechien
(Myto-Box), Polen (e-TOLL 0,80 PLN/km) → `docs/OFFEN.md`.

**Fähre:** Camper-Tarif = Pkw × 1,2, solange die Verbindung keinen eigenen Wert hat (bis 6 m meist Pkw-Tarif, darüber
+20–25 %, z. B. TT-Line 10 € je Meter über 6 m).
