/*
 * Inhaltsseiten für Google (#314, Entscheidung #316): Reiseziele und Anlässe mit Kosten pro Person.
 * Beim Zusammenstellen der Seite (scripts/seiten.mjs) entstehen daraus statische Seiten unter /reise/<slug>/.
 * Texte: KI-Entwurf, von Dani durchgesehen; Kosten sind Richtwerte (Spannen) und keine Angebote.
 * Englisch unter /en/trip-ideas/<slug>/ (Texte in pages.en.ts), beide Fassungen verweisen per hreflang aufeinander.
 * Nur Importe ohne weitere Abhängigkeiten (mit .ts), damit Node die Datei direkt laden kann.
 */
import { EN, STAND_EN } from "./pages.en.ts";
export { STAND_EN };

/** cat: Bereich des Postens, der daraus in der App entsteht (Reiseidee öffnen, #402) */
export interface CostRow {
  cat: "flights" | "stay" | "transport" | "attractions" | "misc"; label: string; from: number; to: number; note?: string;
  /** Preis je Auto (Spanne): die App legt dafür einen Posten je Familie an statt eines Betrags pro Kopf (#552) */
  car?: { from: number; to: number };
}
export interface Faq { q: string; a: string }
export interface Page {
  slug: string;
  kind: "ziel" | "anlass";
  /** <title>, höchstens etwa 60 Zeichen */
  title: string;
  /** meta description, 110 bis 160 Zeichen */
  description: string;
  h1: string;
  intro: string[];
  /** Beispielrechnung: Gruppe, Dauer, Anreise */
  example: string;
  costs: CostRow[];
  /** Zusatz unter der Tabelle, z. B. Preis je Familie */
  costNote?: string;
  tips: string[];
  faq: Faq[];
  /** Link in die App (siehe app/src/lib/plan.ts) */
  plan: { ziel: string; land: string; name: string; gruppe?: number; fam?: string };
  related: string[];
  /** zuletzt inhaltlich geändert (JJJJ-MM-TT), sonst UPDATED; für dateModified und lastmod in der Sitemap */
  updated?: string;
}

export const STAND = "Oktober 2026";
/** Datum zu STAND: beim Überarbeiten der Texte mit anheben */
export const UPDATED = "2026-10-24";
export const SITE = "https://splitandfly.com";

export const PAGES: Page[] = [
  {
    slug: "gruppenreise-mallorca-kosten",
    kind: "ziel",
    title: "Gruppenreise Mallorca: Kosten pro Person",
    description: "Was kostet eine Gruppenreise nach Mallorca? Beispielrechnung für 8 Personen mit Finca, Flug und Mietwagen – mit Tipps, wie ihr die Kosten fair aufteilt.",
    h1: "Gruppenreise nach Mallorca: Was kostet sie pro Person?",
    intro: [
      "Mallorca ist für Gruppen ideal: viele Direktflüge aus Deutschland, Fincas mit Pool für 8 bis 14 Personen und kurze Wege zwischen Strand, Bergen und Palma.",
      "Am meisten Geld steckt in Flug und Unterkunft. Wer früh bucht und eine Finca mit mehreren Bädern teilt, kommt pro Person oft günstiger weg als im Hotel."
    ],
    example: "8 Erwachsene, 5 Nächte im Juni, Finca mit Pool im Inselinneren, Flug ab Deutschland, zwei Mietwagen",
    costs: [
      { cat: "flights", label: "Hin- und Rückflug inkl. Gepäck", from: 120, to: 250 },
      { cat: "stay", label: "Finca mit Pool (5 Nächte, geteilt durch 8)", from: 250, to: 440 },
      { cat: "transport", label: "Mietwagen und Sprit (2 Autos, geteilt)", from: 40, to: 80 },
      { cat: "misc", label: "Essen und Getränke (Einkauf und Restaurants)", from: 175, to: 300 },
      { cat: "attractions", label: "Ausflüge, Beach Club, Bootstour", from: 40, to: 120 },
      { cat: "misc", label: "Touristensteuer vor Ort", from: 5, to: 20, note: "je Nacht und Person, je nach Unterkunft" }
    ],
    tips: [
      "Flüge nach Palma sind dienstags bis donnerstags oft günstiger als am Wochenende.",
      "Fincas haben häufig eine Kaution und eine Endreinigung – beides gleich mit in die Rechnung nehmen.",
      "Zwei Mietwagen sind flexibler als ein Kleinbus; die Kosten teilt ihr auf alle, die mitfahren.",
      "Im Mai und Ende September ist es warm, aber deutlich günstiger als im Juli und August."
    ],
    faq: [
      { q: "Wie teuer ist eine Woche Mallorca für eine Gruppe?", a: "Für eine Woche mit Finca, Flug und Mietwagen solltet ihr in der Hauptsaison mit etwa 900 bis 1.600 € pro Person rechnen, in der Nebensaison mit deutlich weniger." },
      { q: "Wie teilen wir die Finca fair auf?", a: "Am einfachsten pro Person und Nacht. Wer kürzer bleibt oder ein Zimmer mit eigenem Bad hat, zahlt anteilig weniger oder mehr – Split&Fly rechnet das pro Person und pro Haushalt aus." }
    ],
    plan: { ziel: "Mallorca", land: "ES", name: "Gruppenreise Mallorca", gruppe: 8 },
    related: ["junggesellenabschied-kosten", "gruppenreise-barcelona-kosten", "gruppenreise-lissabon-kosten"]
  },
  {
    slug: "gruppenreise-prag-kosten",
    kind: "ziel",
    title: "Gruppenreise nach Prag: Kosten pro Person",
    description: "Prag mit Freunden oder Verein: Beispielrechnung für 10 Personen, 3 Nächte, mit Anreise, Unterkunft, Essen und Programm – plus Tipps zum Sparen und Aufteilen.",
    h1: "Gruppenreise nach Prag: Was kostet sie pro Person?",
    intro: [
      "Prag ist eines der beliebtesten Ziele für Gruppen: gut mit Bahn oder Fernbus erreichbar, viel zu sehen und deutlich günstiger als Städte wie Amsterdam oder Paris.",
      "Gerade für Junggesellenabschiede, Vereinsausflüge und Geburtstagsreisen ist Prag ein Klassiker."
    ],
    example: "10 Erwachsene, 3 Nächte, Anreise mit Bahn oder Fernbus, zwei Apartments in der Altstadt",
    costs: [
      { cat: "transport", label: "Bahn oder Fernbus hin und zurück", from: 40, to: 120 },
      { cat: "stay", label: "Apartments (3 Nächte, geteilt)", from: 75, to: 150 },
      { cat: "misc", label: "Essen und Getränke", from: 90, to: 150 },
      { cat: "attractions", label: "Programm (Stadtführung, Bootsfahrt, Escape Room)", from: 30, to: 80 },
      { cat: "transport", label: "Nahverkehr (Mehrtageskarte)", from: 10, to: 20 }
    ],
    tips: [
      "Sparpreise der Bahn ab Dresden, Berlin oder München gibt es früh gebucht schon ab wenigen Euro.",
      "In Tschechien zahlt ihr mit Kronen; Karte geht fast überall, Wechselstuben in der Altstadt meiden.",
      "Für große Gruppen lieber zwei Apartments nebeneinander als ein riesiges – das ist oft günstiger.",
      "Restaurants außerhalb der Altstadt sind spürbar günstiger und weniger voll."
    ],
    faq: [
      { q: "Was kostet ein Wochenende in Prag pro Person?", a: "Mit Anreise, Unterkunft, Essen und etwas Programm landet ihr bei etwa 250 bis 520 € pro Person für drei Nächte." },
      { q: "Lohnt sich das Auto?", a: "Für eine große Gruppe selten: In der Altstadt ist Parken teuer und knapp. Bahn, Fernbus oder ein gemieteter Reisebus sind meist entspannter." }
    ],
    plan: { ziel: "Prag", land: "CZ", name: "Gruppenreise Prag", gruppe: 10 },
    related: ["junggesellenabschied-kosten", "kurztrip-wien-freunde-kosten", "vereinsreise-reisebus-kosten"]
  },
  {
    slug: "gruppenreise-amsterdam-kosten",
    kind: "ziel",
    title: "Amsterdam mit Freunden: Kosten pro Person",
    description: "Was kostet ein Städtetrip nach Amsterdam für eine Gruppe? Beispielrechnung für 6 Personen, 3 Nächte, mit Bahn, Unterkunft, Museen und Essen.",
    h1: "Amsterdam mit Freunden: Was kostet der Trip pro Person?",
    intro: [
      "Amsterdam ist nah, mit dem Zug gut erreichbar und perfekt für ein langes Wochenende. Günstig ist die Stadt aber nicht: Vor allem Unterkünfte kosten viel.",
      "Wer etwas außerhalb des Zentrums übernachtet und Museen vorab bucht, spart deutlich."
    ],
    example: "6 Erwachsene, 3 Nächte, Anreise mit der Bahn, Apartment oder Hotel außerhalb des Grachtengürtels",
    costs: [
      { cat: "transport", label: "Bahn hin und zurück", from: 60, to: 150 },
      { cat: "stay", label: "Unterkunft (3 Nächte, geteilt) inkl. Touristensteuer", from: 210, to: 360 },
      { cat: "misc", label: "Essen und Getränke", from: 135, to: 210 },
      { cat: "attractions", label: "Museen, Grachtenfahrt", from: 50, to: 100 },
      { cat: "transport", label: "Nahverkehr oder Leihräder", from: 20, to: 40 }
    ],
    tips: [
      "Rijksmuseum, Van Gogh Museum und Anne Frank Haus nur mit Zeitfenster – früh online buchen.",
      "Viertel wie Noord oder Oost sind gut angebunden und günstiger als das Zentrum.",
      "Mit dem Rad seid ihr am schnellsten; Leihräder gibt es für die ganze Gruppe.",
      "Die Touristensteuer ist in Amsterdam hoch – prüft, ob sie im Preis schon enthalten ist."
    ],
    faq: [
      { q: "Wie viel Geld braucht man für 3 Tage Amsterdam?", a: "Rechnet mit etwa 475 bis 860 € pro Person inklusive Anreise und Unterkunft; ohne Unterkunft bleiben etwa 60 bis 100 € pro Tag." },
      { q: "Bahn oder Auto?", a: "Die Bahn ist meist entspannter: Parken in Amsterdam ist sehr teuer. Mit dem Auto lohnt sich ein Park-and-Ride-Platz am Stadtrand." }
    ],
    plan: { ziel: "Amsterdam", land: "NL", name: "Amsterdam mit Freunden", gruppe: 6 },
    related: ["kurztrip-wien-freunde-kosten", "gruppenreise-prag-kosten", "junggesellenabschied-kosten"]
  },
  {
    slug: "gruppenreise-barcelona-kosten",
    kind: "ziel",
    title: "Gruppenreise Barcelona: Kosten pro Person",
    description: "Barcelona in der Gruppe: Beispielrechnung für 8 Personen, 4 Nächte, mit Flug, Apartment, Sagrada Família und Strand – und Tipps, wie ihr fair abrechnet.",
    h1: "Gruppenreise nach Barcelona: Was kostet sie pro Person?",
    intro: [
      "Barcelona verbindet Großstadt und Strand: Gaudí, Tapas, Nachtleben und Meer an einem Ort. Für Gruppen gibt es viele große Apartments.",
      "Teuer werden vor allem Flüge in den Ferien und die Touristensteuer, die in Barcelona pro Nacht und Person anfällt."
    ],
    example: "8 Erwachsene, 4 Nächte im Frühjahr, Flug ab Deutschland, großes Apartment in Eixample oder Gràcia",
    costs: [
      { cat: "flights", label: "Hin- und Rückflug inkl. Gepäck", from: 100, to: 220 },
      { cat: "stay", label: "Apartment (4 Nächte, geteilt)", from: 180, to: 320 },
      { cat: "misc", label: "Touristensteuer", from: 20, to: 35, note: "pro Nacht und Person, je nach Unterkunft" },
      { cat: "misc", label: "Essen und Getränke", from: 160, to: 240 },
      { cat: "attractions", label: "Eintritte (Sagrada Família, Park Güell)", from: 50, to: 100 },
      { cat: "transport", label: "Metro und Bus", from: 12, to: 25 }
    ],
    tips: [
      "Sagrada Família und Park Güell sind oft Tage vorher ausgebucht – Tickets gleich mit der Reise buchen.",
      "Prüft beim Apartment die offizielle Registriernummer; nicht registrierte Wohnungen werden kurzfristig storniert.",
      "Mittags gibt es in vielen Restaurants ein günstiges Tagesmenü (menú del día).",
      "Achtet in der Metro und auf den Ramblas auf Taschendiebe."
    ],
    faq: [
      { q: "Was kostet ein verlängertes Wochenende in Barcelona?", a: "Für 4 Nächte mit Flug und Apartment solltet ihr mit etwa 520 bis 940 € pro Person rechnen." },
      { q: "Wie rechnen wir Tapas-Abende ab?", a: "Einer zahlt, alle anderen tragen es als Ausgabe ein. Am Ende zeigt euch Split&Fly, wer wem wie viel überweist – mit möglichst wenigen Überweisungen." }
    ],
    plan: { ziel: "Barcelona", land: "ES", name: "Gruppenreise Barcelona", gruppe: 8 },
    related: ["gruppenreise-mallorca-kosten", "gruppenreise-lissabon-kosten", "junggesellenabschied-kosten"]
  },
  {
    slug: "gardasee-mehrere-familien-kosten",
    kind: "ziel",
    title: "Gardasee mit mehreren Familien: Kosten",
    description: "Ferienhaus am Gardasee mit drei Familien: Was kostet eine Woche pro Person und pro Familie? Beispielrechnung mit Anreise im Auto, Haus, Essen und Ausflügen.",
    h1: "Gardasee mit mehreren Familien: Was kostet eine Woche?",
    intro: [
      "Der Gardasee ist mit dem Auto in einem Tag erreichbar und bietet alles für Familien: Strände, Freizeitparks, Radwege und Bootsausflüge.",
      "Ein gemeinsames Ferienhaus ist für mehrere Familien oft günstiger als Hotelzimmer – vorausgesetzt, die Kosten werden fair geteilt, auch wenn Kinder weniger zahlen."
    ],
    example: "3 Familien mit 6 Erwachsenen und 5 Kindern, 7 Nächte im Sommer, Ferienhaus mit Pool, Anreise mit drei Autos",
    costs: [
      { cat: "transport", label: "Anreise mit dem Auto (Sprit, Vignette, Maut, geteilt)", from: 50, to: 90, car: { from: 120, to: 200 } },
      { cat: "stay", label: "Ferienhaus mit Pool (7 Nächte, geteilt durch 11)", from: 230, to: 380 },
      { cat: "misc", label: "Kurtaxe (Kinder oft frei)", from: 7, to: 17 },
      { cat: "misc", label: "Essen und Getränke", from: 210, to: 315 },
      { cat: "attractions", label: "Ausflüge (Freizeitpark, Bootsfahrt)", from: 60, to: 120 }
    ],
    costNote: "Für eine Familie mit 2 Erwachsenen und 2 Kindern sind das grob 2.200 bis 3.700 € für die Woche – je nachdem, ob Kinder bei Haus und Essen einen geringeren Anteil zahlen.",
    tips: [
      "Am Nordufer (Riva, Torbole) ist es sportlicher, am Südufer (Lazise, Bardolino) flacher und näher an den Freizeitparks.",
      "Vignette für Österreich und Maut in Italien gleich mit einplanen; viele Familien teilen die Fahrtkosten pro Auto.",
      "Legt vorher fest, ob Kinder bei der Unterkunft voll, halb oder gar nicht zählen.",
      "Freizeitpark-Tickets sind online meist günstiger als an der Kasse."
    ],
    faq: [
      { q: "Wie teilen mehrere Familien ein Ferienhaus fair auf?", a: "Üblich ist: Erwachsene zahlen voll, Kinder einen festen Anteil (zum Beispiel die Hälfte). Bleibt eine Familie kürzer, zahlt sie nur ihre Nächte. Split&Fly rechnet jede Familie mit ihren Nächten und dem Preis je Person aus; Kinderpreise tragt ihr beim Angebot ein, einen festen Kinderanteil für Pauschalen gibt es noch nicht." },
      { q: "Was kostet die Anreise an den Gardasee?", a: "Aus Süddeutschland etwa 120 bis 200 € pro Auto für Sprit, Vignette und Maut hin und zurück, aus Norddeutschland entsprechend mehr." }
    ],
    plan: { ziel: "Riva del Garda", land: "IT", name: "Gardasee mit Familien", fam: "2-2,2-2,2-1" },
    related: ["familienurlaub-mehrere-familien-kosten", "ferienhaus-daenemark-familien-kosten", "gruppenreise-kroatien-ferienhaus-kosten"]
  },
  {
    slug: "gruppenreise-kroatien-ferienhaus-kosten",
    kind: "ziel",
    title: "Kroatien mit Freunden: Ferienhaus-Kosten",
    description: "Ferienhaus in Istrien mit 10 Personen: Was kostet eine Woche Kroatien pro Person? Beispielrechnung mit Anreise, Haus, Kurtaxe, Essen und Ausflügen.",
    h1: "Kroatien mit Freunden: Was kostet eine Woche im Ferienhaus?",
    intro: [
      "Istrien und Dalmatien sind beliebt für Gruppenurlaub: Häuser mit Pool, klares Wasser und gutes Essen. Istrien ist mit dem Auto aus Süddeutschland gut erreichbar.",
      "Seit der Euro-Einführung sind die Preise in Kroatien gestiegen, ein Ferienhaus für viele bleibt aber eine günstige Art, gemeinsam zu reisen."
    ],
    example: "10 Erwachsene, 7 Nächte im Sommer, Ferienhaus mit Pool in Istrien, Anreise mit vier Autos",
    costs: [
      { cat: "transport", label: "Anreise mit dem Auto (Sprit, Vignetten, Maut, geteilt)", from: 70, to: 120 },
      { cat: "stay", label: "Ferienhaus mit Pool (7 Nächte, geteilt durch 10)", from: 300, to: 550 },
      { cat: "misc", label: "Kurtaxe", from: 10, to: 18 },
      { cat: "misc", label: "Essen und Getränke", from: 210, to: 350 },
      { cat: "attractions", label: "Ausflüge (Bootstour, Nationalpark)", from: 50, to: 120 }
    ],
    tips: [
      "Für die Fahrt durch Österreich und Slowenien braucht ihr Vignetten, in Kroatien zahlt ihr Maut.",
      "Im Juni und September ist es warm und das Haus oft 30 bis 40 % günstiger als im August.",
      "Viele Häuser verlangen eine Kaution in bar – rechtzeitig klären, wer sie vorstreckt.",
      "Nationalparks wie Plitvice oder Krka haben in der Hauptsaison Zeitfenster-Tickets."
    ],
    faq: [
      { q: "Was kostet eine Woche Kroatien in der Gruppe?", a: "Mit Anreise im Auto und Ferienhaus mit Pool liegt ihr bei etwa 640 bis 1.160 € pro Person." },
      { q: "Wer zahlt die Fahrtkosten?", a: "Am fairsten teilen die Mitfahrenden eines Autos dessen Sprit, Vignetten und Maut. In Split&Fly legt ihr dafür je Auto einen Posten an." }
    ],
    plan: { ziel: "Poreč", land: "HR", name: "Kroatien mit Freunden", gruppe: 10 },
    related: ["gardasee-mehrere-familien-kosten", "gruppenreise-mallorca-kosten", "ferienhaus-daenemark-familien-kosten"]
  },
  {
    slug: "gruppenreise-lissabon-kosten",
    kind: "ziel",
    title: "Gruppenreise Lissabon: Kosten pro Person",
    description: "Lissabon in der Gruppe: Beispielrechnung für 6 Personen, 4 Nächte, mit Flug, Apartment, Ausflug nach Sintra und Essen – plus Tipps zum fairen Aufteilen.",
    h1: "Gruppenreise nach Lissabon: Was kostet sie pro Person?",
    intro: [
      "Lissabon ist hügelig, sonnig und gemütlich: Aussichtspunkte, Straßenbahnen, Fado und Strände in der Nähe. Für Gruppen gibt es viele Altbau-Apartments.",
      "Im Vergleich zu anderen Hauptstädten in Westeuropa ist Essen günstig, Unterkünfte im Zentrum sind aber gefragt."
    ],
    example: "6 Erwachsene, 4 Nächte im Frühjahr oder Herbst, Flug ab Deutschland, Apartment in Alfama oder Graça",
    costs: [
      { cat: "flights", label: "Hin- und Rückflug inkl. Gepäck", from: 120, to: 260 },
      { cat: "stay", label: "Apartment (4 Nächte, geteilt)", from: 200, to: 340 },
      { cat: "misc", label: "Touristenabgabe", from: 8, to: 16 },
      { cat: "misc", label: "Essen und Getränke", from: 140, to: 220 },
      { cat: "attractions", label: "Ausflüge (Sintra, Belém)", from: 40, to: 90 },
      { cat: "transport", label: "Nahverkehr", from: 15, to: 30 }
    ],
    tips: [
      "Die Straßenbahn 28 ist oft überfüllt – früh morgens fahren oder zu Fuß gehen.",
      "Nach Sintra und Cascais kommt ihr günstig mit dem Vorortzug.",
      "Lissabon ist steil: Bei der Unterkunft auf Lage und Aufzug achten, wenn ihr Gepäck tragt.",
      "Im Frühling und Herbst ist das Wetter angenehm und die Flüge günstiger."
    ],
    faq: [
      { q: "Was kostet ein Städtetrip nach Lissabon?", a: "Für 4 Nächte mit Flug und Apartment rechnet ihr mit etwa 520 bis 960 € pro Person." },
      { q: "Brauchen wir ein Auto?", a: "In der Stadt nicht. Für Ausflüge an die Küste reichen Zug und Bus; ein Mietwagen lohnt sich erst für die Algarve." }
    ],
    plan: { ziel: "Lissabon", land: "PT", name: "Gruppenreise Lissabon", gruppe: 6 },
    related: ["gruppenreise-barcelona-kosten", "gruppenreise-mallorca-kosten", "kurztrip-wien-freunde-kosten"]
  },
  {
    slug: "ferienhaus-daenemark-familien-kosten",
    kind: "ziel",
    title: "Ferienhaus Dänemark mit Familien: Kosten",
    description: "Ferienhaus an der dänischen Nordsee mit drei Familien: Beispielrechnung für eine Woche mit Anreise, Haus, Strom, Essen und Ausflügen – pro Person und Familie.",
    h1: "Ferienhaus in Dänemark mit mehreren Familien: Was kostet eine Woche?",
    intro: [
      "Große Ferienhäuser mit Sauna und Pool, breite Strände und kurze Anreise: Die dänische Nordsee ist ideal für mehrere Familien.",
      "Neben der Hausmiete fallen oft Strom, Wasser und Endreinigung extra an. Und weil Essen gehen in Dänemark teuer ist, kochen die meisten Gruppen selbst."
    ],
    example: "3 Familien mit 6 Erwachsenen und 6 Kindern, 7 Nächte in den Herbstferien, Poolhaus an der Nordsee, Anreise mit drei Autos",
    costs: [
      { cat: "transport", label: "Anreise mit dem Auto (geteilt)", from: 40, to: 80 },
      { cat: "stay", label: "Ferienhaus mit Pool (7 Nächte, geteilt durch 12)", from: 150, to: 335 },
      { cat: "misc", label: "Strom, Wasser, Endreinigung", from: 25, to: 60 },
      { cat: "misc", label: "Essen und Getränke (überwiegend selbst gekocht)", from: 210, to: 315 },
      { cat: "attractions", label: "Ausflüge (Freizeitpark, Zoo, Schwimmbad)", from: 40, to: 100 }
    ],
    costNote: "Für eine Familie mit 2 Erwachsenen und 2 Kindern sind das grob 1.850 bis 3.550 € für die Woche.",
    tips: [
      "Strom wird bei vielen Häusern nach Verbrauch abgerechnet – Pool und Sauna treiben die Kosten hoch.",
      "Großeinkauf in Deutschland vor der Grenze spart spürbar.",
      "Außerhalb der Sommerferien sind große Poolhäuser oft für die Hälfte zu haben.",
      "Bettwäsche und Handtücher sind nicht immer dabei – mitbringen oder dazubuchen."
    ],
    faq: [
      { q: "Was kostet ein Ferienhaus in Dänemark für 12 Personen?", a: "Je nach Saison und Ausstattung etwa 1.800 bis 4.000 € pro Woche, dazu Nebenkosten für Strom und Reinigung." },
      { q: "Wie rechnen wir den Einkauf ab?", a: "Wer einkauft, trägt den Bon als Ausgabe ein. Am Ende gleicht Split&Fly alles aus – pro Familie, nicht pro Kopf, wenn ihr das so wollt." }
    ],
    plan: { ziel: "Blåvand", land: "DK", name: "Ferienhaus Dänemark", fam: "2-2,2-2,2-2" },
    related: ["familienurlaub-mehrere-familien-kosten", "gardasee-mehrere-familien-kosten", "gruppenreise-kroatien-ferienhaus-kosten"]
  },
  {
    slug: "junggesellenabschied-kosten",
    kind: "anlass",
    title: "Junggesellenabschied: Kosten pro Person",
    description: "Was kostet ein Junggesellenabschied pro Person? Rechnung für 10 Personen in Hamburg, Ideen für Prag und Mallorca und wie ihr den Anteil fürs Brautpaar teilt.",
    h1: "Junggesellenabschied: Was kostet er pro Person?",
    intro: [
      "Ein JGA übers Wochenende ist schnell geplant – und schnell teuer. Damit sich niemand übernimmt, hilft es, das Budget vorher grob festzulegen und offen zu besprechen.",
      "Üblich ist, dass die Gruppe den Anteil der Braut oder des Bräutigams übernimmt. Das erhöht den Preis für alle anderen leicht."
    ],
    example: "10 Erwachsene, 2 Nächte in Hamburg, Anreise mit der Bahn, Hostel oder Apartment auf St. Pauli",
    costs: [
      { cat: "transport", label: "Bahn hin und zurück", from: 40, to: 120 },
      { cat: "stay", label: "Unterkunft (2 Nächte, geteilt)", from: 80, to: 160 },
      { cat: "attractions", label: "Programm (Kiezführung, Escape Room, Bootstour)", from: 60, to: 150 },
      { cat: "misc", label: "Essen und Getränke", from: 80, to: 150 },
      { cat: "misc", label: "Anteil fürs Brautpaar (von der Gruppe übernommen)", from: 10, to: 25 }
    ],
    tips: [
      "Budget vorab in der Gruppe abfragen und das Programm danach ausrichten, nicht umgekehrt.",
      "Günstiger ins Ausland: Prag oder Krakau sind preiswert, Mallorca lohnt sich mit frühen Flügen.",
      "Eine Person zahlt vor, alle tragen ihre Ausgaben ein – so muss niemand Quittungen sammeln.",
      "T-Shirts und Deko kosten zusammen schnell 20 bis 30 € pro Person; gleich mit einplanen."
    ],
    faq: [
      { q: "Wie viel kostet ein JGA im Durchschnitt?", a: "Ein Wochenende in Deutschland kostet meist 250 bis 600 € pro Person, im Ausland mit Flug eher 400 bis 900 €." },
      { q: "Zahlt die Braut oder der Bräutigam mit?", a: "Meist nicht: Die Gruppe teilt ihren Anteil. In Split&Fly ordnet ihr die Posten einfach nur den übrigen Personen zu." }
    ],
    plan: { ziel: "Hamburg", land: "DE", name: "Junggesellenabschied", gruppe: 10 },
    related: ["gruppenreise-prag-kosten", "gruppenreise-mallorca-kosten", "festival-mit-freunden-kosten"]
  },
  {
    slug: "klassenfahrt-berlin-kosten",
    kind: "anlass",
    title: "Klassenfahrt nach Berlin: Kosten pro Schüler",
    description: "Was kostet eine Klassenfahrt nach Berlin? Beispielrechnung für 25 Schülerinnen und Schüler mit Bahn, Jugendherberge, Programm und Taschengeld.",
    h1: "Klassenfahrt nach Berlin: Was kostet sie pro Schülerin und Schüler?",
    intro: [
      "Berlin ist das Klassenfahrtsziel schlechthin: Bundestag, Mauer, Museen und vieles davon kostenlos oder mit Schülerrabatt.",
      "Für Eltern zählt vor allem, dass der Preis früh feststeht und fair verteilt ist. Lehrkräfte reisen oft mit Freiplätzen."
    ],
    example: "25 Schülerinnen und Schüler und 2 Lehrkräfte, 4 Nächte, Anreise mit der Bahn (Gruppenangebot), Jugendherberge mit Halbpension",
    costs: [
      { cat: "transport", label: "Bahn hin und zurück (Gruppenpreis)", from: 40, to: 80 },
      { cat: "stay", label: "Jugendherberge mit Frühstück und Abendessen (4 Nächte)", from: 140, to: 200 },
      { cat: "attractions", label: "Programm (Führungen, Museen mit Schülerpreis)", from: 30, to: 60 },
      { cat: "misc", label: "Mittagessen und Taschengeld", from: 40, to: 70 },
      { cat: "transport", label: "Nahverkehr (Gruppenkarte)", from: 10, to: 20 }
    ],
    tips: [
      "Den Bundestag und das Kanzleramt könnt ihr kostenlos besuchen – Termine aber Monate vorher anfragen.",
      "Gruppenangebote der Bahn rechtzeitig buchen; sie sind kontingentiert.",
      "Viele Museen sind für Schulklassen ermäßigt oder frei.",
      "Kosten für Lehrkräfte und Freiplätze vorher klären, damit der Preis pro Kind stimmt."
    ],
    faq: [
      { q: "Wie viel kostet eine Klassenfahrt nach Berlin pro Kind?", a: "Mit Bahn, Jugendherberge und Programm meist 260 bis 430 € für 4 Nächte, plus Taschengeld." },
      { q: "Wie sammelt man das Geld am besten ein?", a: "Mit einem festen Betrag pro Kind, der früh feststeht. Split&Fly zeigt den Anteil pro Person, auch wenn einzelne Kinder kürzer mitfahren." }
    ],
    plan: { ziel: "Berlin", land: "DE", name: "Klassenfahrt Berlin", gruppe: 27 },
    related: ["vereinsreise-reisebus-kosten", "junggesellenabschied-kosten", "gruppenreise-prag-kosten"]
  },
  {
    slug: "familienurlaub-mehrere-familien-kosten",
    kind: "anlass",
    title: "Urlaub mit mehreren Familien: Kosten teilen",
    description: "Urlaub mit mehreren Familien: Was kostet ein Ferienhaus an der Ostsee pro Familie, und wie teilt ihr fair, wenn Kinder weniger zahlen oder jemand kürzer bleibt?",
    h1: "Urlaub mit mehreren Familien: Wie teilt man die Kosten fair?",
    intro: [
      "Mit befreundeten Familien in ein großes Ferienhaus: Die Kinder spielen zusammen, die Eltern haben mehr Ruhe – und pro Familie wird es oft günstiger als allein.",
      "Streit gibt es meist nur ums Geld: Zahlen Kinder voll? Was, wenn eine Familie später anreist? Wer hat den Einkauf bezahlt? Am besten legt ihr die Regeln vorher fest."
    ],
    example: "2 Familien mit 4 Erwachsenen und 4 Kindern, 7 Nächte im Sommer, Ferienhaus auf Usedom, Anreise mit zwei Autos",
    costs: [
      { cat: "transport", label: "Anreise mit dem Auto (geteilt pro Auto)", from: 30, to: 60 },
      { cat: "stay", label: "Ferienhaus (7 Nächte, geteilt durch 8)", from: 180, to: 320 },
      { cat: "misc", label: "Kurtaxe (Kinder oft frei)", from: 10, to: 20 },
      { cat: "misc", label: "Essen und Getränke", from: 175, to: 280 },
      { cat: "attractions", label: "Ausflüge (Schwimmbad, Schiff, Fahrräder)", from: 40, to: 90 }
    ],
    costNote: "Für eine Familie mit 2 Erwachsenen und 2 Kindern sind das grob 1.750 bis 3.100 € für die Woche.",
    tips: [
      "Vorher festlegen, wie Kinder zählen: voll, halb oder gar nicht – und ab welchem Alter.",
      "Reist eine Familie kürzer an, zahlt sie die Unterkunft nur für ihre Nächte.",
      "Einkäufe gehören in einen gemeinsamen Topf; persönliche Extras zahlt jede Familie selbst.",
      "Am Ende reichen wenige Überweisungen, wenn alle Ausgaben an einem Ort stehen."
    ],
    faq: [
      { q: "Zahlen Kinder bei der Unterkunft mit?", a: "Das ist Vereinbarungssache. Häufig zahlen Kinder die Hälfte, Kleinkinder nichts. Split&Fly rechnet mit Altersklassen und zeigt den Anteil pro Familie." },
      { q: "Pro Person oder pro Familie teilen?", a: "Für Unterkunft und Essen meist pro Person (mit Kinderanteil), für Dinge wie die Endreinigung oft pro Familie. Beides lässt sich je Posten einstellen." }
    ],
    plan: { ziel: "Heringsdorf", land: "DE", name: "Urlaub mit Familien", fam: "2-2,2-2" },
    related: ["ferienhaus-daenemark-familien-kosten", "gardasee-mehrere-familien-kosten", "skiurlaub-gruppe-oesterreich-kosten"]
  },
  {
    slug: "skiurlaub-gruppe-oesterreich-kosten",
    kind: "anlass",
    title: "Skiurlaub in der Gruppe: Kosten pro Person",
    description: "Was kostet ein Skiurlaub in Österreich für eine Gruppe? Beispielrechnung für 8 Personen, 6 Nächte, mit Chalet, Skipass, Ausrüstung und Essen.",
    h1: "Skiurlaub in der Gruppe: Was kostet eine Woche in Österreich?",
    intro: [
      "Gemeinsam auf die Piste und abends ins Chalet: Skiurlaub ist in der Gruppe am schönsten – aber nicht billig. Der größte Posten ist meist der Skipass.",
      "Ein Chalet oder großes Apartment für alle spart gegenüber Hotelzimmern und macht die Abende gemütlicher."
    ],
    example: "8 Erwachsene, 6 Nächte im Januar, Chalet im Zillertal, 6-Tage-Skipass, Anreise mit zwei Autos",
    costs: [
      { cat: "transport", label: "Anreise mit dem Auto (Sprit, Vignette, geteilt)", from: 40, to: 80 },
      { cat: "stay", label: "Chalet oder Apartment (6 Nächte, geteilt)", from: 300, to: 540 },
      { cat: "attractions", label: "Skipass 6 Tage", from: 350, to: 420 },
      { cat: "misc", label: "Ski- und Schuhverleih (wer keine eigene Ausrüstung hat)", from: 0, to: 200 },
      { cat: "misc", label: "Essen, Hütten und Après-Ski", from: 240, to: 360 },
      { cat: "misc", label: "Ortstaxe", from: 12, to: 20 }
    ],
    tips: [
      "Januar nach den Ferien und März sind günstiger als Weihnachten, Fasching und Ostern.",
      "Skipässe online vorab kaufen spart oft ein paar Prozent und Wartezeit.",
      "Leihausrüstung für die ganze Gruppe vorab reservieren – oft mit Gruppenrabatt.",
      "Wer nicht Ski fährt, zahlt keinen Skipass: Den Posten nur den Skifahrenden zuordnen."
    ],
    faq: [
      { q: "Was kostet eine Woche Skiurlaub pro Person?", a: "Mit Chalet, Skipass und Verpflegung meist 940 bis 1.620 € pro Person, mit eigener Ausrüstung etwas weniger." },
      { q: "Wie teilen wir, wenn nicht alle Ski fahren?", a: "Skipass und Verleih zahlt nur, wer sie nutzt. Unterkunft und Einkauf teilen alle. In Split&Fly wählt ihr je Posten, wer dabei ist." }
    ],
    plan: { ziel: "Mayrhofen", land: "AT", name: "Skiurlaub in der Gruppe", gruppe: 8 },
    related: ["familienurlaub-mehrere-familien-kosten", "kurztrip-wien-freunde-kosten", "gruppenreise-prag-kosten"]
  },
  {
    slug: "festival-mit-freunden-kosten",
    kind: "anlass",
    title: "Festival mit Freunden: Kosten pro Person",
    description: "Was kostet ein Festivalwochenende mit Freunden? Beispiel für 6 Personen mit Ticket, Anreise, Camping und Verpflegung – und wie ihr fair abrechnet.",
    h1: "Festival mit Freunden: Was kostet das Wochenende pro Person?",
    intro: [
      "Ein großes Festival in Deutschland dauert meist drei bis vier Tage. Das Ticket ist der größte Posten, dazu kommen Anreise, Camping und Verpflegung.",
      "Wer Zelt, Pavillon und Grill teilt und gemeinsam einkauft, spart viel – muss aber hinterher sauber abrechnen."
    ],
    example: "6 Erwachsene, 4 Tage Camping auf einem großen Festival in Deutschland, Anreise mit zwei Autos",
    costs: [
      { cat: "attractions", label: "Festivalticket inkl. Camping", from: 200, to: 300 },
      { cat: "transport", label: "Anreise mit dem Auto (geteilt)", from: 30, to: 60 },
      { cat: "misc", label: "Gemeinsame Ausrüstung (Pavillon, Grill, Gas, geteilt)", from: 20, to: 60 },
      { cat: "misc", label: "Essen und Getränke (Einkauf und Stände)", from: 100, to: 200 },
      { cat: "misc", label: "Müllpfand und Parkticket", from: 10, to: 25 }
    ],
    tips: [
      "Tickets in der ersten Verkaufsphase sind deutlich günstiger.",
      "Gemeinsamen Einkauf vorher planen; Getränke vor Ort sind teuer.",
      "Wer Ausrüstung mitbringt, die alle nutzen, kann einen Anteil als Ausgabe eintragen.",
      "Parktickets und Müllpfand gibt es oft nur pro Auto – auf die Mitfahrenden aufteilen."
    ],
    faq: [
      { q: "Wie viel Geld braucht man fürs Festival?", a: "Mit Ticket, Anreise und Verpflegung meist 360 bis 650 € pro Person für ein langes Wochenende." },
      { q: "Wie rechnen wir den gemeinsamen Einkauf ab?", a: "Wer bezahlt, trägt den Betrag ein. Split&Fly verteilt ihn auf alle und zeigt am Ende, wer wem was überweist." }
    ],
    plan: { ziel: "Nürburg", land: "DE", name: "Festival mit Freunden", gruppe: 6 },
    related: ["junggesellenabschied-kosten", "kurztrip-wien-freunde-kosten", "gruppenreise-prag-kosten"]
  },
  {
    slug: "vereinsreise-reisebus-kosten",
    kind: "anlass",
    title: "Vereinsreise mit dem Reisebus: Kosten",
    description: "Vereinsausflug oder Mannschaftsfahrt mit dem Reisebus: Beispielrechnung für 20 Personen nach Hamburg mit Bus, Hotel, Musical und Essen – pro Person gerechnet.",
    h1: "Vereinsreise mit dem Reisebus: Was kostet sie pro Person?",
    intro: [
      "Für Vereine, Mannschaften und Firmengruppen ist ein gemieteter Reisebus oft die bequemste Lösung: alle fahren zusammen, das Gepäck ist kein Problem.",
      "Der Buspreis gilt für den ganzen Bus. Je mehr mitfahren, desto günstiger wird es pro Person."
    ],
    example: "20 Erwachsene, 2 Nächte in Hamburg, gemieteter Reisebus aus dem Westen Deutschlands, Hotel mit Doppelzimmern, Musicalbesuch",
    costs: [
      { cat: "transport", label: "Reisebus mit Fahrer (geteilt durch 20)", from: 90, to: 140 },
      { cat: "stay", label: "Hotel im Doppelzimmer (2 Nächte)", from: 90, to: 150 },
      { cat: "attractions", label: "Musical oder Theater", from: 70, to: 150 },
      { cat: "misc", label: "Essen und Getränke", from: 60, to: 100 },
      { cat: "attractions", label: "Hafenrundfahrt", from: 20, to: 30 }
    ],
    tips: [
      "Busangebote von mehreren Unternehmen einholen; Lenk- und Ruhezeiten des Fahrers bestimmen den Preis mit.",
      "Mit 30 statt 20 Personen sinkt der Buspreis pro Kopf um ein Drittel.",
      "Gruppenkontingente für Hotels und Musicals früh anfragen.",
      "Ein Vereinszuschuss lässt sich als Einnahme eintragen und senkt den Anteil aller."
    ],
    faq: [
      { q: "Was kostet ein Reisebus für eine Vereinsfahrt?", a: "Für ein Wochenende mit rund 1.000 km Strecke etwa 1.800 bis 2.800 € für den ganzen Bus, je nach Größe und Saison." },
      { q: "Wie verteilen wir den Bus fair?", a: "Gleichmäßig auf alle, die mitfahren. Wer nur eine Strecke fährt, zahlt anteilig – das lässt sich je Posten einstellen." }
    ],
    plan: { ziel: "Hamburg", land: "DE", name: "Vereinsreise", gruppe: 20 },
    related: ["klassenfahrt-berlin-kosten", "junggesellenabschied-kosten", "gruppenreise-prag-kosten"]
  },
  {
    slug: "kurztrip-wien-freunde-kosten",
    kind: "anlass",
    title: "Kurztrip mit Freunden nach Wien: Kosten",
    description: "Städtetrip mit Freunden: Was kostet ein langes Wochenende in Wien pro Person? Beispielrechnung für 6 Personen mit Anreise, Apartment, Essen und Programm.",
    h1: "Kurztrip mit Freunden: Was kostet ein Wochenende in Wien?",
    intro: [
      "Ein Wochenende mit Freunden in einer anderen Stadt ist der Klassiker für Geburtstage und Wiedersehen. Wien ist mit dem Nachtzug, dem ICE oder dem Flugzeug gut erreichbar.",
      "Kaffeehäuser, Heurige und Museen machen die Stadt abwechslungsreich – und mit einem Apartment für alle bleibt es bezahlbar."
    ],
    example: "6 Erwachsene, 3 Nächte, Anreise mit Bahn oder Flug, Apartment in einem Innenbezirk",
    costs: [
      { cat: "transport", label: "Anreise mit Bahn oder Flug", from: 60, to: 180 },
      { cat: "stay", label: "Apartment (3 Nächte, geteilt)", from: 135, to: 240 },
      { cat: "misc", label: "Ortstaxe", from: 5, to: 10 },
      { cat: "misc", label: "Essen und Getränke", from: 135, to: 195 },
      { cat: "attractions", label: "Museen, Prater, Heuriger", from: 40, to: 90 },
      { cat: "transport", label: "Öffentlicher Verkehr (72-Stunden-Karte)", from: 15, to: 20 }
    ],
    tips: [
      "Der Nachtzug spart eine Hotelnacht und ist für Gruppen ein Erlebnis.",
      "Viele Museen haben einen günstigeren Abend oder Kombitickets.",
      "Ein Heuriger am Stadtrand ist günstiger und gemütlicher als Lokale in der Innenstadt.",
      "Die Geburtstagsperson einladen? Dann ihren Anteil auf alle anderen verteilen."
    ],
    faq: [
      { q: "Was kostet ein Wochenende in Wien?", a: "Mit Anreise, Apartment und Essen meist 390 bis 735 € pro Person für drei Nächte." },
      { q: "Wie laden wir jemanden ein?", a: "Ordnet die Kosten in Split&Fly nur den Zahlenden zu. Die eingeladene Person bleibt dabei, zahlt aber nichts." }
    ],
    plan: { ziel: "Wien", land: "AT", name: "Kurztrip nach Wien", gruppe: 6 },
    related: ["gruppenreise-prag-kosten", "gruppenreise-amsterdam-kosten", "festival-mit-freunden-kosten"]
  }
];

/* ---------- Ausgabe ---------- */

export type Lang = "de" | "en";
/** Ordner der Reiseideen je Sprache, relativ zur Wurzel der Seite */
export const DIR: Record<Lang, string> = { de: "reise/", en: "en/trip-ideas/" };

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number, lang: Lang) => n.toLocaleString(lang === "de" ? "de-DE" : "en-GB");
const range = (a: number, b: number, lang: Lang = "de") => {
  const v = a === b ? num(a, lang) : `${num(a, lang)}–${num(b, lang)}`;
  return lang === "de" ? `${v} €` : `€${v}`;
};

/** Texte rund um die Seite (HTML, schon maskiert) */
const UI = {
  de: {
    locale: "de_DE", stand: STAND, plan: "Reise planen", ideas: "Reiseideen", ziel: "Reiseziele", anlass: "Anlässe",
    example: "Beispielrechnung pro Person", total: "Gesamt pro Person", about: "ca.", perPerson: "pro Person",
    note: `Richtwerte, Stand ${STAND}. Preise schwanken stark nach Saison, Buchungszeitpunkt und Ansprüchen. Keine Angebote.`,
    cta: "Mit diesen Werten eigene Reise planen",
    ctaSub: "Kostenlos und ohne Anmeldung: Ziel, Gruppe und diese Kosten sind schon eingetragen, die echten Preise sucht ihr direkt in Split&amp;Fly.",
    tips: "Tipps", faq: "Häufige Fragen", fair: "Kosten fair aufteilen",
    fairText: "In Split&amp;Fly tragt ihr Flüge, Unterkunft und Ausgaben ein, sucht Angebote und seht sofort, was jede Person und jede Familie zahlt – auch wenn Kinder weniger zahlen, jemand kürzer bleibt oder nicht bei allem dabei ist. Am Ende zeigt die Abrechnung, wer wem wie viel überweist.",
    more: "Weitere Reiseideen", claim: "Split&amp;Fly – Gruppenreisen planen und Kosten fair aufteilen. Kostenlos, in 7 Sprachen.",
    all: "Alle Reiseideen", imprint: ["impressum.html", "Impressum"], privacy: ["datenschutz.html", "Datenschutz"], other: "English",
    index: {
      title: "Reiseideen für Gruppen mit Kosten pro Person",
      description: "Was kosten Gruppenreisen, Junggesellenabschied, Klassenfahrt oder Urlaub mit mehreren Familien? Beispielrechnungen pro Person mit Tipps zum fairen Aufteilen.",
      h1: "Reiseideen für Gruppen: Was kostet es pro Person?",
      intro: `Beispielrechnungen für beliebte Ziele und Anlässe – mit Kosten pro Person, Tipps und einem Klick in die eigene Planung. Alle Werte sind Richtwerte (Stand ${STAND}).`,
      name: "Reiseideen für Gruppen"
    }
  },
  en: {
    locale: "en_GB", stand: STAND_EN, plan: "Plan a trip", ideas: "Trip ideas", ziel: "Destinations", anlass: "Occasions",
    example: "Sample budget per person", total: "Total per person", about: "approx.", perPerson: "per person",
    note: `Guide prices, as of ${STAND_EN}. Prices vary widely by season, booking time and standards. Not offers.`,
    cta: "Plan your own trip with these figures",
    ctaSub: "Free and without sign-up: destination, group and these costs are already filled in – you search for real prices directly in Split&amp;Fly.",
    tips: "Tips", faq: "Frequently asked questions", fair: "Split the costs fairly",
    fairText: "In Split&amp;Fly you enter flights, accommodation and expenses, search for offers and see straight away what each person and each family pays – even when children pay less, someone stays for fewer nights or isn’t in on everything. At the end, the settlement shows who transfers how much to whom.",
    more: "More trip ideas", claim: "Split&amp;Fly – plan group trips and split the costs fairly. Free, in 7 languages.",
    all: "All trip ideas", imprint: ["imprint.html", "Imprint"], privacy: ["privacy.html", "Privacy"], other: "Deutsch",
    index: {
      title: "Group trip ideas with cost per person",
      description: "What do group trips, bachelor parties, school trips or holidays with several families cost? Sample budgets per person with tips on splitting fairly.",
      h1: "Group trip ideas: how much does it cost per person?",
      intro: `Sample budgets for popular destinations and occasions – with cost per person, tips and one click into your own planning. All figures are guide prices (as of ${STAND_EN}).`,
      name: "Group trip ideas"
    }
  }
} as const;

/** Summe auf glatte Zehner: untere Grenze ab-, obere aufrunden */
export const round10 = (n: number, dir: 1 | -1) => (dir > 0 ? Math.ceil(n / 10) : Math.floor(n / 10)) * 10;

export function total(p: Page): { from: number; to: number } {
  return p.costs.reduce((s, c) => ({ from: s.from + c.from, to: s.to + c.to }), { from: 0, to: 0 });
}

/** Seite in der Sprache: Texte aus pages.en.ts, Beträge, slug (App, Bild) und Ziel aus der deutschen Seite */
export function pageIn(p: Page, lang: Lang): Page {
  const e = lang === "en" ? EN[p.slug] : undefined;
  if (!e) return p;
  return {
    ...p, title: e.title, description: e.description, h1: e.h1, intro: e.intro, example: e.example, costNote: e.costNote, tips: e.tips, faq: e.faq,
    costs: p.costs.map((c, i) => ({ ...c, label: e.costs[i].label, note: e.costs[i].note })), plan: { ...p.plan, name: e.name }
  };
}

/** Adresse der Seite in der Sprache, relativ zur Wurzel */
export const pathOf = (p: Page, lang: Lang) => `${DIR[lang]}${lang === "en" ? EN[p.slug].slug : p.slug}/`;
const updatedOf = (p: Page) => p.updated ?? UPDATED;

/** Link in die App, relativ zur Seite /reise/<slug>/ bzw. /en/trip-ideas/<slug>/ */
export function planHref(p: Page, lang: Lang = "de"): string {
  const q = new URLSearchParams({ ziel: p.plan.ziel, land: p.plan.land, name: pageIn(p, lang).plan.name, idee: p.slug });
  if (p.plan.fam) q.set("fam", p.plan.fam);
  else if (p.plan.gruppe) q.set("gruppe", String(p.plan.gruppe));
  return `${lang === "de" ? "../../" : "../../../"}?${q}`;
}

export const CSS = `:root{--ink:#0F1B2D;--mute:#4A5870;--line:#DCE3EE;--bg:#F6F8FC;--card:#fff;--a:#2F6FDB;--link:#2560C4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:20px 16px 48px}header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}
header img{height:30px;display:block}a{color:var(--link)}.crumbs{font-size:14px;color:var(--mute);margin:0 0 6px}
h1{font-size:clamp(26px,5vw,36px);line-height:1.2;margin:0 0 16px}h2{font-size:22px;margin:32px 0 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 18px 8px;margin:20px 0}
.ex{color:var(--mute);margin:0 0 10px}table{width:100%;border-collapse:collapse;font-size:16px}td{padding:8px 0;border-top:1px solid var(--line);vertical-align:top}
td+td{text-align:right;white-space:nowrap;padding-left:12px}tr.sum td{font-weight:700;border-top:2px solid var(--ink)}small{color:var(--mute)}
.cta{display:inline-block;background:var(--a);color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:999px;margin:6px 0 4px}
.cta-top{font-size:15px;padding:8px 14px;margin:0}ul{padding-left:20px}li{margin:4px 0}dt{font-weight:600;margin-top:12px}dd{margin:4px 0 0}
.rel a{display:block;margin:6px 0}footer{margin-top:40px;font-size:14px;color:var(--mute)}footer a{color:var(--mute)}
.list a{display:block;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0;text-decoration:none;color:var(--ink)}
.list span{display:block;color:var(--mute);font-size:15px}
.art{display:block;width:100%;height:auto;aspect-ratio:5/2;border-radius:16px;margin:0 0 18px;background:#E4EDFB}
.list a{display:flex;gap:16px;align-items:center}.list .thumb{flex:0 0 160px;width:160px;height:64px;border-radius:10px}.list a>div{min-width:0;font-weight:600}.list span{font-weight:400}
@media (max-width:560px){.list a{flex-direction:column;align-items:stretch;gap:10px}.list .thumb{flex:none;width:100%;height:auto;aspect-ratio:5/2}}`;

/** Illustration je Seite (art.ts); von scripts/seiten.mjs hereingereicht, damit diese Datei ohne Importe auskommt */
export type Art = (slug: string, cls?: string, alt?: string) => string;
const noArt: Art = () => "";

/** alt: Pfade der Seite in beiden Sprachen (relativ zur Wurzel) für hreflang und den Sprachlink */
function shell(o: { lang: Lang; title: string; description: string; alt: Record<Lang, string>; body: string; ld: object[]; root: string }): string {
  const u = UI[o.lang], other: Lang = o.lang === "de" ? "en" : "de";
  const url = `${SITE}/${o.alt[o.lang]}`;
  return `<!doctype html>
<html lang="${o.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)} | Split&amp;Fly</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="de" href="${SITE}/${o.alt.de}">
<link rel="alternate" hreflang="en" href="${SITE}/${o.alt.en}">
<link rel="alternate" hreflang="x-default" href="${SITE}/${o.alt.de}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Split&amp;Fly">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="${u.locale}">
<meta property="og:locale:alternate" content="${UI[other].locale}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${o.root}icon.svg" type="image/svg+xml">
<style>${CSS}</style>
${o.ld.map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n")}
</head>
<body>
<div class="wrap">
<header><a href="${o.root}"><img src="${o.root}brand/wordmark.svg" alt="Split&amp;Fly" width="140" height="35"></a><a class="cta cta-top" href="${o.root}">${u.plan}</a></header>
${o.body}
<footer><p>${u.claim}</p>
<p><a href="${o.root}${DIR[o.lang]}">${u.all}</a> · <a href="${o.root}${o.alt[other]}" hreflang="${other}" lang="${other}">${u.other}</a> · <a href="${o.root}${u.imprint[0]}">${u.imprint[1]}</a> · <a href="${o.root}${u.privacy[0]}">${u.privacy[1]}</a></p></footer>
</div>
</body>
</html>
`;
}

export function renderPage(p0: Page, all: Page[] = PAGES, art: Art = noArt, lang: Lang = "de"): string {
  const p = pageIn(p0, lang), u = UI[lang], t = total(p);
  const rows = p.costs.map(c => `<tr><td>${esc(c.label)}${c.note ? `<br><small>${esc(c.note)}</small>` : ""}</td><td>${range(c.from, c.to, lang)}</td></tr>`).join("\n");
  const rel = p.related.map(s => all.find(x => x.slug === s)).filter((x): x is Page => !!x)
    .map(x => `<a href="../${pathOf(x, lang).slice(DIR[lang].length)}">${esc(pageIn(x, lang).h1)}</a>`).join("\n");
  const body = `<p class="crumbs"><a href="../">${u.ideas}</a> › ${p.kind === "ziel" ? u.ziel : u.anlass}</p>
<h1>${esc(p.h1)}</h1>
${art(p.slug, "art", lang === "en" ? EN[p.slug].alt : undefined)}
${p.intro.map(x => `<p>${esc(x)}</p>`).join("\n")}
<section class="card">
<h2 style="margin-top:0">${u.example}</h2>
<p class="ex">${esc(p.example)}</p>
<table>
${rows}
<tr class="sum"><td>${u.total}</td><td>${u.about} ${range(round10(t.from, -1), round10(t.to, 1), lang)}</td></tr>
</table>
${p.costNote ? `<p>${esc(p.costNote)}</p>` : ""}
<p><small>${u.note}</small></p>
<p><a class="cta" href="${planHref(p0, lang)}">${u.cta}</a><br><small>${u.ctaSub}</small></p>
</section>
<h2>${u.tips}</h2>
<ul>
${p.tips.map(x => `<li>${esc(x)}</li>`).join("\n")}
</ul>
<h2>${u.faq}</h2>
<dl>
${p.faq.map(f => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("\n")}
</dl>
<h2>${u.fair}</h2>
<p>${u.fairText}</p>
<h2>${u.more}</h2>
<div class="rel">
${rel}
</div>`;
  const path = pathOf(p0, lang);
  const ld = [
    { "@context": "https://schema.org", "@type": "Article", headline: p.h1, description: p.description, inLanguage: lang, dateModified: updatedOf(p0),
      author: { "@type": "Organization", name: "Split&Fly", url: SITE }, publisher: { "@type": "Organization", name: "Split&Fly", url: SITE }, image: `${SITE}/og-image.png`,
      mainEntityOfPage: `${SITE}/${path}` },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: u.ideas, item: `${SITE}/${DIR[lang]}` },
      { "@type": "ListItem", position: 2, name: p.h1, item: `${SITE}/${path}` }] }
  ];
  return shell({ lang, title: p.title, description: p.description, alt: { de: pathOf(p0, "de"), en: pathOf(p0, "en") }, body, ld, root: lang === "de" ? "../../" : "../../../" });
}

export function renderIndex(all: Page[] = PAGES, art: Art = noArt, lang: Lang = "de"): string {
  const u = UI[lang];
  const item = (p0: Page) => {
    const p = pageIn(p0, lang), t = total(p);
    return `<a href="${pathOf(p0, lang).slice(DIR[lang].length)}">${art(p0.slug, "thumb", lang === "en" ? EN[p0.slug].alt : undefined)}<div>${esc(p.h1)}<span>${u.about} ${range(round10(t.from, -1), round10(t.to, 1), lang)} ${u.perPerson}</span></div></a>`;
  };
  const body = `<h1>${u.index.h1}</h1>
<p>${u.index.intro}</p>
<h2>${u.ziel}</h2>
<div class="list">
${all.filter(p => p.kind === "ziel").map(item).join("\n")}
</div>
<h2>${u.anlass}</h2>
<div class="list">
${all.filter(p => p.kind === "anlass").map(item).join("\n")}
</div>`;
  const ld = [{ "@context": "https://schema.org", "@type": "CollectionPage", name: u.index.name, url: `${SITE}/${DIR[lang]}`, inLanguage: lang,
    hasPart: all.map(p => ({ "@type": "Article", headline: pageIn(p, lang).h1, url: `${SITE}/${pathOf(p, lang)}` })) }];
  return shell({ lang, title: u.index.title, description: u.index.description, alt: DIR, body, ld, root: lang === "de" ? "../" : "../../" });
}

/** Einträge für die Sitemap (Übersicht und alle Seiten, beide Sprachen) mit Datum der letzten Änderung */
export function sitemapUrls(all: Page[] = PAGES): { loc: string; lastmod: string }[] {
  const latest = all.map(updatedOf).sort().pop() ?? UPDATED;
  return (["de", "en"] as const).flatMap(lang => [
    { loc: `${SITE}/${DIR[lang]}`, lastmod: latest },
    ...all.map(p => ({ loc: `${SITE}/${pathOf(p, lang)}`, lastmod: updatedOf(p) }))
  ]);
}
