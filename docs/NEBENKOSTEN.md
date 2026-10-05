# Nebenkosten: gepflegte Richtwerte (#170)

Kurtaxen bzw. City Tax, Vignetten, Maut, Durchfahrten, Trinkgeld und Einreisegebühren. Daten in
[`app/src/lib/fees.ts`](../app/src/lib/fees.ts) (Einreisegebühren in [`app/src/lib/hints.ts`](../app/src/lib/hints.ts), Feld `fee`).
**Stand: 2026, ohne Gewähr.** Die App zeigt die Werte als „ca.“ mit Quelle; maßgeblich sind die Angaben von Stadt, Land bzw. Anbieter.

## So wirkt es in der App
- **Kurtaxe:** An jeder Unterkunft, deren Ort erkannt wird (Suchort, Name, Lage, Ziel der Reise), als geschätzte Nebenkosten
  „vor Ort“ automatisch eingerechnet, nach Sternen gestaffelt, Kinder frei bis zur Altersgrenze, höchstens so viele Nächte wie angegeben.
  Wegklicken merkt sich die App am Angebot (`autoOff`). Gibt der Anbieter eine Kurtaxe an (z. B. liteAPI), wird keine geschätzt.
- **Vignetten und Maut:** Bei Anreise mit dem Auto ins Ausland (Reise ohne Flug) im Kapitel „Vor Ort“ als Vorschlag; Vignetten mit
  „+ als Posten“ (je Auto). Mietwagen aus Österreich bzw. der Schweiz haben die Vignette meist schon, daher keine Automatik am Mietwagen.
- **Einreisegebühren:** In „Wichtiges“ am Einreise-Punkt „+ Gebühr als Posten“, nur für die Personen, die sie brauchen.
- **Trinkgeld:** Nur als Hinweis bei der Verpflegung, nicht in den Kosten.

Neuer Ort: eine Zeile in `CITY_TAXES` (Wörter zum Erkennen, Währung, Abrechnung, Betrag, ggf. Sterne, Kinder frei, Höchstnächte, Quelle).

## Kurtaxen (34 Orte)
| Ort | Betrag | Regeln | Quelle |
|---|---|---|---|
| Amsterdam | 12.5 % | – | Gemeente Amsterdam |
| Paris | 5.2 EUR pro Person und Nacht (nach Sternen: 1: 2.28, 2: 3.25, 3: 5.2, 4: 8.13, 5: 11.38) | Kinder bis 17 frei | Ville de Paris |
| Rom | 6 EUR pro Person und Nacht (nach Sternen: 1: 3, 2: 4, 3: 6, 4: 7.5, 5: 10) | Kinder bis 9 frei, höchstens 10 Nächte | Roma Capitale |
| Mailand | 5 EUR pro Person und Nacht (nach Sternen: 1: 3, 2: 4, 3: 5, 4: 7, 5: 10) | Kinder bis 17 frei, höchstens 14 Nächte | Comune di Milano |
| Venedig | 3.5 EUR pro Person und Nacht (nach Sternen: 1: 1, 2: 2, 3: 3, 4: 4, 5: 5) | Kinder bis 9 frei, höchstens 5 Nächte | Comune di Venezia |
| Florenz | 6 EUR pro Person und Nacht (nach Sternen: 1: 4.5, 2: 5, 3: 6, 4: 7, 5: 8) | Kinder bis 11 frei, höchstens 7 Nächte | Comune di Firenze |
| Neapel | 3 EUR pro Person und Nacht (nach Sternen: 1: 1.5, 2: 2, 3: 3, 4: 4, 5: 5) | Kinder bis 17 frei, höchstens 14 Nächte | Comune di Napoli |
| Barcelona | 5.5 EUR pro Person und Nacht (nach Sternen: 1: 4, 2: 4, 3: 5.5, 4: 6.5, 5: 8) | Kinder bis 16 frei, höchstens 7 Nächte | Generalitat de Catalunya, Ajuntament de Barcelona |
| Mallorca, Ibiza, Menorca | 3 EUR pro Person und Nacht (nach Sternen: 1: 1, 2: 1, 3: 2, 4: 3, 5: 4) | Kinder bis 15 frei | Govern de les Illes Balears (Ecotasa) |
| Lissabon | 4 EUR pro Person und Nacht | Kinder bis 12 frei, höchstens 7 Nächte | Câmara Municipal de Lisboa |
| Porto | 3 EUR pro Person und Nacht | Kinder bis 12 frei, höchstens 7 Nächte | Câmara Municipal do Porto |
| Wien | 5 % | – | Stadt Wien (Ortstaxe) |
| Salzburg | 2.7 EUR pro Person und Nacht | Kinder bis 14 frei | Stadt Salzburg |
| Berlin | 7.5 % | – | Senatsverwaltung für Finanzen Berlin (City Tax) |
| Hamburg | 2 EUR pro Person und Nacht | – | Freie und Hansestadt Hamburg (Kultur- und Tourismustaxe) |
| Köln | 5 % | – | Stadt Köln (Kulturförderabgabe) |
| Frankfurt | 2 EUR pro Person und Nacht | Kinder bis 17 frei | Stadt Frankfurt (Tourismusbeitrag) |
| Dresden | 6 % | – | Landeshauptstadt Dresden (Beherbergungssteuer) |
| Prag | 50 CZK pro Person und Nacht | Kinder bis 17 frei, höchstens 60 Nächte | Hlavní město Praha |
| Budapest | 4 % | Kinder bis 17 frei | Budapest Főváros (IFA) |
| Krakau | 2.5 PLN pro Person und Nacht | – | Miasto Kraków (opłata miejscowa) |
| Brüssel | 5 EUR pro Unterkunft und Nacht (nach Sternen: 1: 3, 2: 4, 3: 5, 4: 7.5, 5: 9) | – | Région de Bruxelles-Capitale |
| Edinburgh | 5 % | höchstens 5 Nächte | City of Edinburgh Council (Visitor Levy) |
| Athen | 5 EUR pro Unterkunft und Nacht (nach Sternen: 1: 2, 2: 2, 3: 5, 4: 10, 5: 15) | – | Hellenic Republic (Klimaresilienzgebühr) |
| Santorini, Mykonos | 5 EUR pro Unterkunft und Nacht (nach Sternen: 1: 2, 2: 2, 3: 5, 4: 10, 5: 15) | – | Hellenic Republic (Klimaresilienzgebühr) |
| Kroatien (Split, Dubrovnik, Istrien …) | 2 EUR pro Person und Nacht | Kinder bis 11 frei | Republika Hrvatska (boravišna pristojba) |
| Zürich | 2.5 CHF pro Person und Nacht | Kinder bis 15 frei | Stadt Zürich (City Tax) |
| Genf | 3.75 CHF pro Person und Nacht | Kinder bis 15 frei | Canton de Genève (taxe de séjour) |
| Malta | 0.5 EUR pro Person und Nacht | Kinder bis 17 frei, höchstens 10 Nächte | Malta Tourism Authority (Eco Contribution) |
| Island | 800 ISK pro Unterkunft und Nacht | – | Skatturinn (gistináttaskattur) |
| New York | 14.75 % | – | NYC Department of Finance (Hotel Room Occupancy Tax) |
| Dubai | 15 AED pro Unterkunft und Nacht (nach Sternen: 1: 7, 2: 7, 3: 10, 4: 15, 5: 20) | – | Dubai DET (Tourism Dirham) |
| Tokio | 200 JPY pro Person und Nacht | – | Tokyo Metropolitan Government (Accommodation Tax) |
| Kyoto | 400 JPY pro Person und Nacht (nach Sternen: 1: 200, 2: 200, 3: 400, 4: 1000, 5: 4000) | – | City of Kyoto (Accommodation Tax) |

## Vignetten (Pkw)
Österreich 10 Tage 12,80 € (ASFINAG) · Schweiz Jahresvignette 40 CHF (BAZG) · Slowenien 7 Tage 16 € (DARS) · Tschechien 10 Tage
290 CZK (edalnice.cz) · Slowakei 10 Tage 12 € (eznamka.sk) · Ungarn 10 Tage 6.400 HUF (nemzetiutdij.hu) · Rumänien 10 Tage 3 €
(erovinieta.ro) · Bulgarien Woche 15 BGN (bgtoll.bg).

## Maut nach Strecke (Richtwert je 100 km Autobahn, Pkw)
Frankreich 9 € · Italien 7,50 € · Spanien 6 € (nur ein Teil der Autobahnen) · Portugal 8 € · Kroatien 7 € · Griechenland 7 € ·
Polen 6 PLN (einzelne Strecken) · Serbien 5 € · Norwegen 10 € (Ringe und Strecken). Durchfahrten (`TRANSIT`) als übliche Route,
z. B. Deutschland → Kroatien über Österreich und Slowenien.

## Einreisegebühren (pro Person, Stand 2026)
USA ESTA 40 USD · Kanada eTA 7 CAD · Vereinigtes Königreich ETA 16 GBP · Neuseeland NZeTA + IVL 117 NZD · Kenia eTA 30 USD ·
Indien e-Visa 25 USD · Sri Lanka ETA 50 USD · Ägypten Visum 25 USD · Israel ETA-IL 25 ILS · Seychellen 10 € · Indonesien e-VOA
500.000 IDR · Tansania e-Visa 50 USD. Dazu (schon vorher) Galápagos, Bali-Abgabe, Fuji, Rapa Nui. ETIAS (Schengen) noch nicht
eingerechnet, solange der Start nicht feststeht.

## Trinkgeld
Gepflogenheiten im Restaurant je Land (`TIPS`): USA 18–22 %, Kanada 15–20 %, Japan, Korea, China nicht üblich, sonst
aufrunden bzw. 5–15 %; dazu Hinweise auf Resortgebühren (USA, Mexiko), Strandliegen (Italien, Kroatien, Griechenland) und
Bedienungsgeld bzw. Gedeck (Frankreich, Italien, Vereinigtes Königreich, Ungarn, Emirate).
