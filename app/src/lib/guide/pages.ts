/*
 * Anleitung für Nutzer (/anleitung/…): eine Seite je Thema, in der Reihenfolge, in der man eine Reise plant.
 * Beim Zusammenstellen der Seite (scripts/anleitung.mjs) entstehen daraus statische Seiten, Illustrationen aus guide/art.ts.
 * Texte beschreiben, was die App heute kann; Bezeichnungen wie in der App (app/src/lib/i18n/de.ts).
 * Neue Funktion: passenden Abschnitt ergänzen, STAND anheben. Ablauf: .claude/skills/anleitung/SKILL.md
 */
import { CSS, esc, SITE } from "../seo/pages.ts";

export interface GuideFaq { q: string; a: string }
export interface GuidePage {
  slug: string;
  /** Kurzname für Übersicht und Navigation */
  nav: string;
  title: string;
  /** meta description, 110 bis 160 Zeichen */
  description: string;
  h1: string;
  intro: string[];
  /** Schritte, in der Reihenfolge der App */
  steps: string[];
  /** „Gut zu wissen“ */
  tips: string[];
  faq: GuideFaq[];
  /** Beschriftung der App-Stelle, wo es losgeht (Kapitel oder Knopf) */
  where: string;
  /** Emoji wie in der App (Überschrift, Navigation) */
  emoji: string;
  /** Echte Bilder aus der App (shots/<img>.jpg, Lage der Markierungen in shots/spots.json) */
  shots?: GuideShot[];
  /** Mini-Demo zum Ausprobieren */
  demo?: "status" | "split";
}
/** Screenshot mit nummerierten Markierungen; pins: Schlüssel aus spots.json → Erklärung (Reihenfolge = Nummer) */
export interface GuideShot { img: string; alt: string; caption: string; pins: Record<string, string> }
/** Lage der Markierungen je Bild in Prozent (von app/e2e/anleitung-shots.mjs erzeugt) */
export type GuideSpots = Record<string, { w: number; h: number; spots: { key: string; x: number; y: number }[] }>;

export const GUIDE_STAND = "Oktober 2026";

export const GUIDE: GuidePage[] = [
  {
    slug: "erste-reise",
    nav: "Erste Reise",
    title: "Erste Reise anlegen",
    description: "So legst du in Split&Fly deine erste Reise an: neue Reise starten, Reisende und Kosten eintragen und die Aufteilung ansehen. Kostenlos, ohne Konto.",
    h1: "Deine erste Reise anlegen",
    intro: [
      "In Split&Fly ist eine Reise ein gemeinsamer Platz für alles, was Geld kostet: Wer fährt mit, was kosten Flüge und Unterkunft, und wer zahlt am Ende wie viel. Du kannst sofort loslegen, ein Konto brauchst du erst, wenn du auf mehreren Geräten planen oder mit anderen teilen willst.",
      "Die Reise ist in Kapitel gegliedert, die du von oben nach unten durchgehst: Wer fährt mit, Abheben, Ankommen, Unterwegs, Erleben, Alles andere, Tag für Tag und Wer zahlt was."
    ],
    steps: [
      "Auf der Startseite „🧳 Neue Reise“ antippen. Das geht allein, zu zweit, mit Familie oder Freunden.",
      "Beim ersten Start fragt dich ein kurzer Assistent nach deinen Vorlieben (Wohnort, Auto, Essen, Führerschein). Das ist freiwillig und lässt sich später in den Vorlieben ändern. Mit „Später“ überspringst du es.",
      "Gib der Reise einen Namen. Ziel und Reisedaten kannst du auch erst später eintragen, eine Reise darf zunächst „noch ohne Ziel und Daten“ sein.",
      "Trag im Kapitel „Wer fährt mit“ ein, wer dabei ist (siehe Seite „Reisende und Familien“).",
      "Geh die Kapitel Flüge, Unterkunft, Vor Ort, Erlebnisse und Sonstiges durch und trag ein, was du schon weißt. Geschätzt reicht zum Start.",
      "Schau in „Wer zahlt was“, was jede Familie zahlt."
    ],
    tips: [
      "Die Leiste am Rand (am Handy unten) springt zwischen den Kapiteln. Das Kapitel in der Mitte ist scharf, der Rest tritt zurück.",
      "Auf der Startseite siehst du deine Reisen als Liste oder als Kacheln und kannst sie sortieren, zum Beispiel nach „Als Nächstes“, Preis oder Land.",
      "Zwei Reisen vergleichen: eine Reise auf eine andere ziehen oder „Vergleichen“ wählen. So stellst du Varianten wie „Kroatien“ und „Portugal“ nebeneinander.",
      "An schwierigen Stellen zeigt ein kleines „?“ eine kurze Erklärung. Antippen, noch einmal antippen schließt sie."
    ],
    faq: [
      { q: "Brauche ich ein Konto?", a: "Nein. Ohne Konto liegen deine Reisen nur in diesem Browser auf diesem Gerät. Mit Konto liegen sie sicher in der Cloud, auf allen deinen Geräten, und du kannst sie teilen." },
      { q: "Kostet Split&Fly etwas?", a: "Nein, Split&Fly ist kostenlos. Die Suche nach Flügen und Unterkünften dient als Hilfe für realistische Preise, gebucht wird beim Anbieter." },
      { q: "Muss ich schon alles wissen?", a: "Nein. Eine Reise kann ohne Ziel und Daten beginnen. Trag zuerst grobe Beträge ein und ersetze sie später durch echte Preise." }
    ],
    where: "Startseite → Neue Reise",
    emoji: "🧳",
    shots: [{ img: "home", alt: "Startseite von Split&Fly mit den Karten Neue Reise, Zu einem Event, Mit KI planen und Reiseideen und der Reise Kroatien mit Freunden", caption: "Die Startseite: von hier aus startest du, setzt eine Reise fort oder holst dir Ideen.", pins: {
      neu: "🧳 Neue Reise: hier geht es los. Allein, zu zweit, mit Familie oder Freunden.",
      reise: "Deine Reisen auf einen Blick: Ziel, Zeitraum, wer mitfährt, was gebucht ist und die Kosten gesamt und pro Person. Antippen öffnet die Reise.",
      fuss: "✨ Neues & Ausblick: was neu ist und was als Nächstes kommt." } }]
  },
  {
    slug: "reisende",
    nav: "Reisende",
    title: "Reisende und Familien eintragen",
    description: "Reisende, Alter und Familien in Split&Fly eintragen: Wer fährt mit, wer bleibt kürzer, wer ist nicht überall dabei. Grundlage für faire Preise pro Person.",
    h1: "Reisende und Familien eintragen",
    intro: [
      "Alles, was Split&Fly rechnet, hängt an den Reisenden: Kinder zahlen oft weniger, manche bleiben kürzer, nicht jede Person ist bei jedem Ausflug dabei. Deshalb lohnt es sich, dieses Kapitel („Wer fährt mit“) zuerst sauber auszufüllen."
    ],
    steps: [
      "Im Kapitel „Wer fährt mit“ die Familien oder Haushalte anlegen. Ein Haushalt ist, wer gemeinsam zahlt, zum Beispiel eine Familie.",
      "Personen hinzufügen: Vorname und Nachname bzw. Familie sind Pflicht. Das Alter zur Reise bestimmt, ob jemand als Erwachsener, Kind oder Kleinkind zählt.",
      "Beim Haushalt den Wohnort angeben (Postleitzahl oder Ort). Daraus schätzt Split&Fly die Anreise zum Flughafen, mit Auto und Parken oder mit der Bahn.",
      "Ist jemand nicht die ganze Zeit dabei, trag bei der Familie „eigene Daten“ für An- und Abreise ein. Ohne Eintrag gilt der Flug.",
      "Wer bei einer Reise gar nicht mitfährt, stellst du auf „nicht dabei“. Die Person bleibt in der Gruppe, zahlt aber nichts."
    ],
    tips: [
      "Im Konto kannst du Personen und Gruppen einmal anlegen (zum Beispiel „Familie“ und „Kegelclub“) und für jede neue Reise wiederverwenden. Eine Person darf in mehreren Gruppen sein.",
      "Personen in einer Reise sind eine Kopie. Änderst du die Gruppe später, ändern sich bestehende Reisen nicht.",
      "Bei der Anreise zum Flughafen gibt es mehrere Wege: eigenes Auto, Bahn, Fahrgemeinschaft, bringen und abholen lassen, Fahrdienst oder Gruppenbus. Die Kosten teilen sich nach Personen.",
      "Für jeden Posten kannst du einzelne Personen ausschließen, zum Beispiel wenn Oma beim Freizeitpark nicht mitgeht."
    ],
    faq: [
      { q: "Ab wann zählt jemand als Kind?", a: "Split&Fly ordnet nach dem Alter zum Reisezeitpunkt ein: Erwachsene, Kinder und Kleinkinder (unter 6). Preise für Kinder und Kleinkinder trägst du getrennt ein." },
      { q: "Sieht jede Familie alle Kosten?", a: "In der Abrechnung siehst du je Familie die Summe und tippst für die Einzelheiten auf die Zeile. Wer die Reise teilt, legt über die Rolle fest, was die anderen dürfen." },
      { q: "Was ist, wenn jemand erst später dazukommt?", a: "Gib dieser Person eigene Daten für An- und Abreise. Unterkunft, Verpflegung und Anteile richten sich dann nach den Nächten, die sie wirklich da ist." }
    ],
    where: "Kapitel „Wer fährt mit“",
    emoji: "👥",
    shots: [{ img: "trav", alt: "Kapitel Wer fährt mit mit zwei Familien, Anreise und Anwesenheit, Termin finden und Abstimmungen", caption: "Das Kapitel „Wer fährt mit“ mit zwei Familien. Die Reise im Beispiel hat sieben Personen.", pins: {
      familien: "Je Familie: Wohnort für die Anreise, Auto oder Bahn und An- und Abreise. „aus dem Flug“ heißt: Es gelten die Zeiten des Flugs.",
      termin: "📅 Termin finden: Von, Bis und Nächte angeben, „Loslegen“ sucht passende Zeiten.",
      abst: "🗳 Abstimmungen: wenn ihr euch nicht einig seid, stimmt ihr hier ab." } }]
  },
  {
    slug: "fluege",
    nav: "Flüge",
    title: "Flüge suchen und vergleichen",
    description: "Flüge in Split&Fly eintragen, suchen und vergleichen: Hin- und Rückflug, Umstiege, Gepäck, Preis pro Person und Anreise zum Flughafen.",
    h1: "Flüge suchen und vergleichen",
    intro: [
      "Im Kapitel „Abheben“ sammelst du Flüge und Anreise. Du kannst Flüge von Hand eintragen oder über die Suche Preise holen. Gebucht wird nicht in Split&Fly, sondern beim Anbieter; die App hilft dir, realistische Preise zu sehen und zu vergleichen."
    ],
    steps: [
      "Im Kapitel „Abheben“ einen Flug hinzufügen oder „✈ Flüge suchen“ öffnen.",
      "Strecke, Datum, Zeiten und Preis eintragen, bei Bedarf getrennt für Erwachsene und Kinder, dazu das Gepäck. Split&Fly rechnet auf alle Mitfliegenden hoch.",
      "Mit der Suche findest du echte Angebote: Abflughafen, Ziel und Zeitraum wählen, Treffer ansehen, passenden Flug übernehmen.",
      "Mehrere Angebote für denselben Flug bekommen die Buchstaben A, B, C. Im Vergleich siehst du Hin- und Rückflug, Umstiege, Gepäck und die Kosten der ganzen Reise pro Person nebeneinander.",
      "Wähle das Angebot, das du willst. Nur das gewählte fließt in die Summe ein.",
      "Fehlt für jemanden noch ein Flug, bietet die App „Flug für sie suchen“ an."
    ],
    tips: [
      "Die Anreise zum Flughafen steht beim Haushalt (Kapitel „Wer fährt mit“) und fließt in den Preis ein: Ein weiter entfernter, günstiger Flughafen ist nicht automatisch der billigste.",
      "Der Preis trägt das Datum seiner Abfrage („Preis vom …“). Preise ändern sich, prüfe vor dem Buchen noch einmal beim Anbieter.",
      "Ein Flug mit Zeiten füllt die Anwesenheit im Tagesplan: So weiß die App, wann wer wo ist."
    ],
    faq: [
      { q: "Kann ich in Split&Fly Flüge buchen?", a: "Nein. Split&Fly sucht und vergleicht. Zum Buchen führt dich ein Link zum Anbieter. Den Status der Buchung hältst du danach im Posten fest." },
      { q: "Warum weicht der Preis beim Anbieter ab?", a: "Flugpreise ändern sich laufend. Der gezeigte Preis ist der Stand der Suche, nicht garantiert." },
      { q: "Geht das auch ohne Suche?", a: "Ja. Du kannst jeden Flug von Hand eintragen und die Preise später ersetzen." }
    ],
    where: "Kapitel „Abheben“",
    emoji: "✈️",
    shots: [{ img: "flights", alt: "Kapitel Abheben mit gewähltem Flug und zwei Angeboten A und B im Vergleich", caption: "„Abheben“: der gewählte Flug oben, darunter die Angebote A und B im Vergleich.", pins: {
      modus: "Einfach oder Detailliert: ein Betrag für alle Flüge oder einzelne Flüge mit Zeiten und Angeboten.",
      suche: "✈ Flüge suchen: holt echte Angebote und zeigt Preise mit dem Datum der Abfrage.",
      vergleich: "Angebote vergleichen: Buchstaben A, B, C mit Zeiten, Umstiegen, Anreise zum Flughafen und den Mehrkosten der ganzen Reise pro Person." } }]
  },
  {
    slug: "unterkunft",
    nav: "Unterkunft",
    title: "Unterkünfte suchen und vergleichen",
    description: "Unterkünfte in Split&Fly suchen, auf der Karte vergleichen und nach Nächten verteilen: Hotel, Ferienhaus, Rundreise mit mehreren Stationen.",
    h1: "Unterkünfte suchen und vergleichen",
    intro: [
      "Das Kapitel „Ankommen“ ist für Hotels, Ferienwohnungen und Häuser. Du trägst den Zeitraum ein, Split&Fly prüft, ob die Belegung passt, und zeigt dir pro Person und Nacht, was es kostet. Bei einer Rundreise legst du mehrere Stationen an."
    ],
    steps: [
      "Im Kapitel „Ankommen“ eine Unterkunft hinzufügen oder „🛏 Unterkunft suchen“ wählen.",
      "Ort, Art der Unterkunft (ganze Unterkunft, Hotel …), Zeitraum, Gäste und Zimmer angeben. Bei einer Rundreise wählst du die Station.",
      "Treffer ansehen, filtern (zum Beispiel nach Ausstattung) und passende Angebote übernehmen.",
      "Der Preis lässt sich als Preis pro Nacht, pro Person und Nacht oder als Gesamtpreis eintragen.",
      "Mehrere Angebote erscheinen als A, B, C mit Karte, Entfernung zum Zentrum und zum Meer und den Kosten der ganzen Reise. So findest du die beste Wahl und siehst, was es mit Verpflegung kostet.",
      "Wähle ein Angebot. Der Tagesplan zeigt dann, ob jede Nacht abgedeckt ist."
    ],
    tips: [
      "Pauschalreise? Mit „📦 Paket“ trägst du sie von Hand ein oder importierst das Angebot. Der Paketpreis steht an der Unterkunft, der Flug erscheint im Kapitel Flüge als „im Paket“, der Status gilt für beides. Mit „⇆ einzeln suchen“ vergleichst du das Paket mit Flug und Hotel einzeln.",
      "Der Tagesplan warnt, wenn Nächte ohne Unterkunft sind oder doppelt gebucht wurden.",
      "Nach der Landung ohne Anschluss kannst du direkt „Unterkunft am Flughafen suchen“. Für eine Unterkunft, die du schon hast, gibt es „🏠 Privat“.",
      "Wo die Suche es weiß, siehst du „kostenlos stornierbar“. Für die Buchung gehst du zum Anbieter."
    ],
    faq: [
      { q: "Was ist, wenn die Gruppe nicht in ein Zimmer passt?", a: "Die Belegung berücksichtigt die maximale Gästezahl und die Zimmer. Passt es nicht, teile die Gruppe auf mehrere Unterkünfte auf." },
      { q: "Kann ich auch eine private Unterkunft eintragen?", a: "Ja. Du kannst jede Unterkunft von Hand eintragen, auch eine, die du nicht über die Suche findest, zum Beispiel ein Haus von Bekannten." }
    ],
    where: "Kapitel „Ankommen“",
    emoji: "🛏",
    shots: [{ img: "stay", alt: "Kapitel Ankommen mit dem Plan Wer ist wann wo und einer gebuchten Unterkunft", caption: "„Ankommen“: oben der Plan, wer wann wo schläft, darunter die gebuchte Unterkunft.", pins: {
      suche: "🛏 Unterkunft suchen. Daneben: 🏠 Privat für eine Unterkunft, die du schon hast, und 🗺 Karte.",
      status: "Der Status der Unterkunft. Gebuchte Posten zählen als fest.",
      aufteilung: "Die Aufteilung: Was jede Familie für die Nächte zahlt, die sie wirklich da ist." } }]
  },
  {
    slug: "kosten",
    nav: "Kosten & Status",
    title: "Kosten eintragen und Status verfolgen",
    description: "Kosten vor Ort, Erlebnisse und Sonstiges in Split&Fly eintragen. Status Idee, Gewählt, Gebucht, Bezahlt; einfach oder detailliert; Währungen umrechnen.",
    h1: "Kosten eintragen und Status verfolgen",
    intro: [
      "Neben Flügen und Unterkunft gibt es drei Kapitel: „Unterwegs“ (Transport vor Ort), „Erleben“ (Attraktionen) und „Alles andere“ (Verpflegung, Versicherung, Sonstiges). Alle funktionieren gleich. Jeder Posten hat einen Status, damit du immer weißt, was schon sicher ist."
    ],
    steps: [
      "Im passenden Kapitel einen Posten hinzufügen: zum Beispiel Mietwagen, Tageskarte, Museum oder Reiseversicherung.",
      "Den Preis eintragen, pro Person, für Erwachsene und Kinder getrennt oder als Pauschale für alle. Pauschalen verteilt Split&Fly gleichmäßig auf die Beteiligten.",
      "Beim Posten den Status setzen: Idee, Gewählt, Gebucht oder Bezahlt. Nicht mehr gewollte Posten stellst du auf Verworfen. Sie zählen dann nicht mehr.",
      "Preise in der Landeswährung gibst du direkt ein, Split&Fly rechnet in deine Währung um.",
      "In der Übersicht trennt die App „fest“ (gebucht und bezahlt) von „offen“ (noch in Planung)."
    ],
    tips: [
      "Einfach oder Detailliert: Neue Reisen starten im einfachen Modus mit einem Betrag je Bereich. Du kannst je Bereich oder für die ganze Reise zu „Detailliert“ wechseln und umgekehrt. Dabei geht nichts verloren.",
      "Die Verpflegung lässt sich über Tagessätze nach Stil schätzen, vom Selbstkochen bis gehoben.",
      "Für bekannte Orte schlägt die App Klassiker mit Preisen vor.",
      "Das Datum des Preises steht dabei. Bei Schätzungen zeigt das Kennzeichen „Geschätzt“, dass noch ein echter Preis fehlt."
    ],
    faq: [
      { q: "Was ist der Unterschied zwischen Gewählt und Gebucht?", a: "Gewählt heißt: Das ist mein Favorit, ich vergleiche nicht mehr. Gebucht heißt: Es ist gebucht, die Kosten gelten als fest." },
      { q: "Zählt eine Idee schon in der Summe?", a: "Ja, mit dem gewählten oder dem günstigsten Angebot. Verworfene Posten zählen nicht." },
      { q: "Kann ich zwischen Einfach und Detailliert wechseln?", a: "Jederzeit. Ein Betrag wird beim Umschalten zum ersten Posten, die Summe der Posten wird zum Betrag. Ausgeblendete Posten bleiben gespeichert." }
    ],
    where: "Kapitel „Unterwegs“, „Erleben“ und „Alles andere“",
    emoji: "🎟",
    demo: "status",
    shots: [
      { img: "transport", alt: "Kapitel Unterwegs mit dem Posten Mietwagen im Status Idee", caption: "„Unterwegs“: ein Mietwagen als Idee, Preis pro Einheit.", pins: {
        status: "Der Status: hier noch „Idee“. Antippen und ändern, sobald du dich entscheidest.",
        posten: "+ Posten: fügt weitere Kosten hinzu." } },
      { img: "attractions", alt: "Kapitel Erleben mit zwei Ausflügen, Bootstour gewählt und Krka-Wasserfälle als Idee", caption: "„Erleben“: Ausflüge mit Preisen für Erwachsene, Kinder und Kleinkinder und der Aufteilung auf die Familien.", pins: {
        tabs: "🎡 Touren & Tickets suchen, 🎟 Events vor Ort, Events zum Reisetermin und die Karte.",
        status: "Gewählt: der Favorit steht fest, du vergleichst nicht mehr.",
        aufteilung: "Nur wer dabei ist, zahlt mit: Hase hat zwei von drei Personen beim Ausflug." } }]
  },
  {
    slug: "tagesplan",
    nav: "Tagesplan",
    title: "Tagesplan: wer ist wann wo",
    description: "Der Tagesplan in Split&Fly zeigt, wer wann wo schläft, und warnt bei Nächten ohne Unterkunft oder doppelt gebuchten Nächten. Dazu die Karte der Reise.",
    h1: "Tagesplan: wer ist wann wo",
    intro: [
      "Das Kapitel „Tag für Tag“ zeigt als Zeitstrahl, wer in welcher Nacht wo schläft. So siehst du Lücken und Doppelbuchungen, bevor sie teuer werden."
    ],
    steps: [
      "Trag Reisedaten, Flugzeiten oder Unterkünfte mit Zeitraum ein. Daraus entsteht der Plan von selbst.",
      "Im Kapitel „Tag für Tag“ siehst du je Person, wo sie jede Nacht verbringt, auch die Nacht im Flugzeug.",
      "Fehlt eine Unterkunft, steht dort „keine Unterkunft“ und ein Knopf zum Suchen. Doppelt gebuchte Nächte werden aufgelistet.",
      "Ist die Anwesenheit offen, trägst du einen Flug mit Zeiten ein oder gibst der Familie eigene Daten."
    ],
    tips: [
      "Die Anwesenheit bestimmt auch die Kosten: Wer nur drei Nächte da ist, zahlt nur drei Nächte Unterkunft.",
      "Bei einer Rundreise zeigt die Karte Stationen, Unterkünfte, Flughäfen und die Route.",
      "Im Plan siehst du auf einen Blick, ob „jede Nacht eine Unterkunft“ hat."
    ],
    faq: [
      { q: "Warum bleibt der Plan leer?", a: "Er füllt sich, sobald Daten da sind: Reisedaten, Flugzeiten oder Unterkünfte mit Zeitraum. Ohne sie weiß die App nicht, wer wann wo ist." },
      { q: "Kann ich den Plan ausdrucken?", a: "Die Reiseübersicht lässt sich als PDF erstellen oder drucken. Du findest sie in der Reise unter „Reiseübersicht“." }
    ],
    where: "Kapitel „Tag für Tag“",
    emoji: "📅",
    shots: [{ img: "plan", alt: "Kapitel Tag für Tag mit Flügen, Check-in und Ausflügen an den einzelnen Tagen", caption: "„Tag für Tag“: Flüge, Check-in und Ausflüge sortieren sich von selbst in die Tage.", pins: {
      kalender: "📅 Tagesplan in den Kalender: Flüge, Check-in und -out, Events und Einträge als .ics-Datei.",
      tag: "Jeder Tag zeigt, was passiert. Flüge, Unterkünfte und Erlebnisse kommen automatisch dazu.",
      eintrag: "+ Eintrag: eigene Einträge wie „Abendessen“ oder „Ruhetag“." } }]
  },
  {
    slug: "abrechnung",
    nav: "Abrechnung",
    title: "Abrechnung: wer zahlt was",
    description: "Die Abrechnung in Split&Fly zeigt je Familie den fairen Anteil an den Reisekosten, mit Kinderpreisen und Anwesenheit. Auch als PDF.",
    h1: "Abrechnung: wer zahlt was",
    intro: [
      "Im letzten Kapitel, „Wer zahlt was“, rechnet Split&Fly alles zusammen: pro Person, pro Familie und für die ganze Reise. Kinderpreise und die Zahl der Nächte, die jede Person wirklich da ist, sind schon eingerechnet."
    ],
    steps: [
      "Öffne „Wer zahlt was“. Du siehst die Summe der Reise und den Anteil jeder Familie.",
      "Familien mit fast gleichem Betrag stehen in einer Zeile. Tippe die Zeile an, um die einzelnen Posten zu sehen.",
      "Mit „Alle Einzelheiten“ klappst du alles auf, mit „Nur Übersicht“ wieder zu.",
      "Pro Familie zeigt die App auch den Anteil an der Reise in Prozent.",
      "Für den Austausch mit der Gruppe erstellst du die Reiseübersicht als PDF oder druckst sie."
    ],
    tips: [
      "Kinder und Kleinkinder zahlen ihre eigenen Preise, sofern du sie so eingetragen hast.",
      "Im einfachen Modus verteilt die Abrechnung den Gesamtbetrag gleich auf alle aktiven Personen und zeigt trotzdem eine Summe je Familie.",
      "Alles, was fest ist (gebucht, bezahlt), siehst du getrennt von dem, was sich noch ändern kann."
    ],
    faq: [
      { q: "Wer hat was ausgelegt?", a: "Split&Fly zeigt, was jede Familie insgesamt tragen soll. Das Verrechnen von Auslagen untereinander übernimmst du außerhalb der App." },
      { q: "Kann ich die Abrechnung weitergeben?", a: "Ja, als PDF oder gedruckt aus der Reiseübersicht. Wer die Reise teilt, sieht sie ohnehin live in der App." }
    ],
    where: "Kapitel „Wer zahlt was“",
    emoji: "🧾",
    demo: "split",
    shots: [{ img: "split", alt: "Kapitel Wer zahlt was mit der Familie Klein: Summe, fest und offen, Anteil je Person und die Posten", caption: "„Wer zahlt was“: je Familie die Summe, der Anteil an der Reise, fest und offen und die einzelnen Posten.", pins: {
      familie: "Die Familie mit Summe, Anteil an der Reise und dem Betrag pro Person.",
      fest: "Fest und offen: grün ist gebucht oder bezahlt, lila ist noch in Planung.",
      zeile: "Die Posten je Kapitel. Antippen zeigt die Einzelheiten." } }]
  },
  {
    slug: "gemeinsam",
    nav: "Gemeinsam",
    title: "Gemeinsam planen und abstimmen",
    description: "Reisen in Split&Fly per Einladungslink teilen, Rollen vergeben und über Ziel, Termin oder Unterkunft abstimmen: eine Stimme, mehrere Stimmen oder Meilen.",
    h1: "Gemeinsam planen und abstimmen",
    intro: [
      "Eine Reise teilst du mit einem Link. Alle sehen dieselben Zahlen live, auf allen Geräten. Wenn die Gruppe sich nicht einig ist, stimmt ihr in der Reise ab."
    ],
    steps: [
      "Melde dich an (mit Google oder per E-Mail-Link). Teilen geht nur mit Konto.",
      "Öffne in der Reise „Teilen“ und kopiere den Einladungslink.",
      "Wähle die Rolle: „Plant mit“ darf bearbeiten, „Sieht zu“ darf nur lesen.",
      "Schick den Link per Nachricht an die Mitreisenden. Wer ihn öffnet, ist dabei.",
      "Für Streitfragen eine Abstimmung starten: Frage und Möglichkeiten eintragen (eine pro Zeile), die Art wählen und optional eine Frist setzen."
    ],
    tips: [
      "Eine Stimme: Jeder wählt eine Möglichkeit. Mehrere Stimmen: Jeder wählt alle, die für ihn gehen. Meilen-Wahl: Jeder verteilt seine Meilen frei, auch alle auf eine Möglichkeit.",
      "Bei jeder Möglichkeit kann man „Ohne mich“ sagen: Wird sie gewählt, ist diese Person nicht dabei.",
      "Zwei Abstimmungen sind schon vorbereitet: „Wann fahren wir?“ und „Welches Angebot für …?“. Das Ergebnis lässt sich als Reisedatum oder Angebot übernehmen.",
      "Damit deine Stimme zählt, sag kurz, wer du in der Reise bist. Die App zeigt, wer noch nicht abgestimmt hat."
    ],
    faq: [
      { q: "Kann jeder meine Reise ändern?", a: "Nur wer „Plant mit“ hat. Wer „Sieht zu“ liest nur. Die Reise gehört dir als Besitzer." },
      { q: "Kann ich eine geteilte Reise verlassen?", a: "Ja, im Reisemenü unter „Reise verlassen“. Du siehst die Reise danach nicht mehr. Besitzer können Mitglieder verwalten." },
      { q: "Brauchen die anderen ein Konto?", a: "Zum Mitplanen ja. Das Anmelden geht in wenigen Sekunden mit Google oder per Link in der E-Mail." }
    ],
    where: "Reise → Teilen und Abstimmungen",
    emoji: "🗳",
    shots: [{ img: "trav", alt: "Kapitel Wer fährt mit mit dem Bereich Termin finden und den Abstimmungen", caption: "Abstimmungen und Terminfindung stehen unten im Kapitel „Wer fährt mit“.", pins: {
      termin: "📅 Termin finden: wann passt es allen?",
      abst: "🗳 Abstimmung starten: Frage, Möglichkeiten, Art und optional eine Frist." } }]
  },
  {
    slug: "ideen-und-ki",
    nav: "Ideen & KI",
    title: "Reiseideen, KI-Planer, Import und Events",
    description: "Reisen schneller starten: fertig gerechnete Reiseideen übernehmen, die KI Vorschläge machen lassen, ein Angebot importieren oder die Reise nach einem Event planen.",
    h1: "Reiseideen, KI-Planer, Import und Events",
    intro: [
      "Nicht jede Reise beginnt bei null. Auf der Startseite findest du drei Abkürzungen: Reiseideen, den KI-Planer und Reisen zu einem Event."
    ],
    steps: [
      "Reiseideen: Auf der Startseite „🧭 Reiseideen“ öffnen und eine fertig gerechnete Gruppenreise übernehmen. Ziel, Gruppe und Kosten sind schon eingetragen, die echten Preise suchst du danach.",
      "Mit KI planen (Beta): Beschreibe deine Wunschreise in ein paar Sätzen. Die KI schlägt Ziele und Varianten vor, die du prüfst und übernimmst.",
      "Zu einem Event (🎟): Bei Spiel, Konzert oder Festival planst du die Reise passend zum Termin.",
      "Angebot importieren (mit Konto): Unter „Neue Reise“ auf „Importieren“ tippen und ein Angebot, eine Buchung oder eine Teilnehmerliste einwerfen, als Datei (Screenshot, Foto, PDF, Word, CSV oder Excel), als Text oder als Link. Mit „Auslesen und Reise anlegen“ entsteht daraus eine Reise mit Flug, Unterkunft und Reisenden.",
      "Realitätscheck (mit Konto): Auf der Startseite „🔍 Realitätscheck“ öffnen und ein Angebot einwerfen. Du siehst, was es pro Kopf wirklich kostet, als Spanne mit allen Annahmen. Es wird keine Reise angelegt, bis du „Als Reise übernehmen“ antippst. Für eine offene Reise findest du den Realitätscheck im Reise-Menü.",
      "Die Vorschläge landen als Reise bei dir. Von da an bearbeitest du alles wie gewohnt."
    ],
    tips: [
      "Die KI kennt deine Vorlieben aus dem Start-Assistenten, wenn du ihn ausgefüllt hast.",
      "Persönliche Daten wie Name, Geschlecht, Staatsangehörigkeit und Geburtsdatum gehen nicht an die KI.",
      "Die KI-Vorbefüllung zählt als eine der KI-Anfragen pro Tag und ist optional.",
      "Prüfe KI-Vorschläge wie jede Schätzung: Preise sind Richtwerte, keine Angebote.",
      "Am Handy kannst du ein Angebot auch über das Teilen-Menü an Split&Fly senden, wenn die App installiert ist.",
      "Lässt sich ein Link nicht auslesen, mach einen Screenshot vom Angebot oder kopiere den Text hinein.",
      "Beim Import zeigt die App, wie sicher jede Angabe erkannt ist, und fragt bei Unsicherem kurz nach. Was nur abgeleitet ist, steht in der Reise mit „bitte prüfen“, bis du „Geprüft“ antippst.",
      "Fehlt im Angebot etwas (Unterkunft, Transfer, Mietwagen, Ausflüge), fragt „Was fehlt noch?“ nach: Suchen, Schätzen oder Brauchen wir nicht."
    ],
    faq: [
      { q: "Ist die KI-Planung kostenlos?", a: "Ja, sie ist als Beta enthalten. Pro Tag gibt es eine begrenzte Zahl an Anfragen." },
      { q: "Sind die Reiseideen Angebote?", a: "Nein. Es sind Richtwerte mit Spannen pro Person. Echte Preise ermittelst du danach in deiner eigenen Reise." },
      { q: "Werden meine Dateien beim Import gespeichert?", a: "Nein. Sie werden nur ausgelesen. Aus Teilnehmerlisten übernimmt die App Namen und Alter als Reisende. Lade keine Ausweis- oder Passdaten hoch." }
    ],
    where: "Startseite → Reiseideen, Mit KI planen, Zu einem Event; Neue Reise → Importieren",
    emoji: "✨",
    shots: [{ img: "home", alt: "Startseite mit den Abkürzungen Zu einem Event, Mit KI planen und Reiseideen", caption: "Drei Abkürzungen auf der Startseite.", pins: {
      event: "🎟 Zu einem Event: Spiel, Konzert oder Festival, die Reise passend zum Termin.",
      ki: "Mit KI planen (Beta): beschreibe deine Wunschreise, die KI macht Vorschläge.",
      ideen: "🧭 Reiseideen: fertig gerechnete Gruppenreisen übernehmen." } }]
  },
  {
    slug: "app-und-konto",
    nav: "App & Konto",
    title: "App installieren, Konto und Einstellungen",
    description: "Split&Fly als App installieren, offline nutzen, Sprache, Währung und Design wechseln und deine Daten im Konto verwalten.",
    h1: "App installieren, Konto und Einstellungen",
    intro: [
      "Split&Fly läuft im Browser und lässt sich wie eine App installieren. Sie funktioniert auch ohne Netz und gleicht beim nächsten Mal ab."
    ],
    steps: [
      "App installieren: Unten auf der Startseite „📲 App installieren“ wählen (wo der Browser es anbietet). Am iPhone: Teilen → „Zum Home-Bildschirm“.",
      "Anmelden: Mit Google oder per E-Mail-Link. Danach liegen deine Reisen in der Cloud und sind auf allen Geräten da.",
      "Sprache und Währung wechselst du im Menü „Mehr“. Split&Fly gibt es auf Deutsch, Englisch, Spanisch, Französisch, Polnisch, Russisch und Arabisch (von rechts nach links).",
      "Hell oder dunkel stellst du ebenfalls im Menü ein, sonst folgt die App deinem Gerät.",
      "Vorlieben (Wohnort, Auto, Führerschein, Essen) änderst du jederzeit in den Vorlieben."
    ],
    tips: [
      "Ohne Netz kannst du weiterplanen. Die Änderungen werden beim nächsten Online-Gang abgeglichen.",
      "Buchungsdaten wie Ausweis oder Reisepass liegen nur in deinem Konto, nie in einer Reise und nie bei der KI.",
      "In deinem Konto siehst du jederzeit, was Split&Fly über dich speichert, und kannst es ausdrucken oder als Datei laden.",
      "Etwas klappt nicht? Über „Fehler melden“ (Beta) schickst du uns eine Nachricht."
    ],
    faq: [
      { q: "Gehen meine Reisen verloren, wenn ich mich nicht anmelde?", a: "Ohne Konto liegen sie nur in diesem Browser. Löschst du die Browserdaten, sind sie weg. Mit Konto sind sie gesichert." },
      { q: "Wo sehe ich, was gespeichert wird?", a: "Im Konto unter „Meine Daten“. Dort bekommst du die Auskunft zum Ausdrucken oder als vollständige Datei." }
    ],
    where: "Startseite → Fußzeile, Menü „Mehr“",
    emoji: "📲",
    shots: [{ img: "home", alt: "Startseite mit Fußzeile: Neues und Ausblick, Anmelden, Anleitung, Reiseideen und Rechtliches", caption: "Die Fußzeile der Startseite.", pins: {
      fuss: "✨ Neues & Ausblick. Daneben, wo es der Browser anbietet: 📲 App installieren, und „Anmelden oder Konto anlegen“." } }]
  }
];

const LEARN = [
  ["🧳", "Reise", "Ein Vorhaben mit Reisenden, Zeitraum und Posten."],
  ["👥", "Haushalt", "Wer gemeinsam zahlt, zum Beispiel eine Familie."],
  ["🧾", "Posten", "Eine Kostenstelle: Flug, Unterkunft, Transport, Erlebnis oder Sonstiges."],
  ["🔤", "Angebot", "Ein konkreter Vorschlag für einen Posten, mit Buchstaben A, B, C zum Vergleichen."],
  ["🚦", "Status", "Idee, Gewählt, Gebucht, Bezahlt oder Verworfen."],
  ["🔒", "Fest und offen", "Fest ist gebucht und bezahlt, offen ist noch in Planung."]
];

export type GuideArt = (slug: string, cls?: string) => string;
const noArt: GuideArt = () => "";

const EXTRA_CSS = `
.wrap{max-width:820px}
.topics{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;margin:0 -16px 8px;padding-inline:16px;scrollbar-width:thin}
.topics a{flex:none;text-decoration:none;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:14px;font-weight:600;white-space:nowrap}
.topics a[aria-current]{background:var(--a);border-color:var(--a);color:#fff}
.topics a .ck{margin-left:4px;color:#2E7D4F}.topics a[aria-current] .ck{color:#fff}
h1 .em{margin-right:8px}
.steps{list-style:none;padding:0;margin:0}.steps li{margin:8px 0}
.steps label{display:flex;gap:12px;align-items:flex-start;cursor:pointer;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;transition:background .2s,border-color .2s}
.steps label:hover{border-color:var(--a)}
.steps input{position:absolute;opacity:0;pointer-events:none}
.steps .n{flex:none;width:30px;height:30px;border-radius:50%;background:var(--a);color:#fff;font-weight:700;display:grid;place-items:center;font-size:15px;transition:background .2s}
.steps input:checked+.n{background:#2E7D4F}.steps input:checked+.n::after{content:"✓"}.steps input:checked+.n b{display:none}
.steps input:checked~.t{color:var(--mute);text-decoration:line-through;text-decoration-color:#9fb0c8}
.steps input:focus-visible+.n{outline:3px solid #9CC8F5;outline-offset:2px}
.prog{display:flex;align-items:center;gap:12px;margin:8px 0 4px;font-size:14px;color:var(--mute)}
.prog .bar{flex:1;height:8px;border-radius:99px;background:#DCE3EE;overflow:hidden}.prog .bar i{display:block;height:100%;width:0;background:#2E7D4F;border-radius:99px;transition:width .35s}
.prog button{border:0;background:none;color:var(--link);font:inherit;cursor:pointer;padding:0}
.hooray{display:none;background:#E2F2E8;color:#1F5C38;border-radius:14px;padding:12px 16px;margin:10px 0;font-weight:600}.hooray.on{display:block}
.where{display:inline-block;background:#E4EDFB;color:#1B4FA3;border-radius:999px;font-size:14px;font-weight:600;padding:3px 12px;margin:0 0 14px}
.shot{margin:18px 0 22px}.shot .frame{position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--line);background:#fff;box-shadow:0 10px 30px -14px rgba(15,27,45,.35)}
.shot img{display:block;width:100%;height:auto}
.shot figcaption{font-size:14px;color:var(--mute);margin:8px 2px 0}
.pin{position:absolute;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;border:3px solid #fff;background:#E5484D;color:#fff;font:700 14px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.35);padding:0;transition:transform .15s}
.pin:hover,.pin.on{transform:translate(-50%,-50%) scale(1.18);background:#C43338}
.pin::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid #E5484D;opacity:0;animation:ping 2.4s ease-out infinite}
.pin:nth-of-type(2)::after{animation-delay:.4s}.pin:nth-of-type(3)::after{animation-delay:.8s}.pin:nth-of-type(4)::after{animation-delay:1.2s}
@keyframes ping{0%{opacity:.7;transform:scale(.7)}70%,100%{opacity:0;transform:scale(1.5)}}
@media (prefers-reduced-motion:reduce){.pin::after{animation:none}}
.legend{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:6px}
.legend li{display:flex;gap:10px;align-items:flex-start;border-radius:12px;padding:8px 10px;margin:0;cursor:pointer;border:1px solid transparent;transition:background .15s}
.legend li b{flex:none;width:24px;height:24px;border-radius:50%;background:#E5484D;color:#fff;display:grid;place-items:center;font-size:13px}
.legend li.on{background:#FDECEC;border-color:#F3B9BB}
.tipbox{background:#EEF5FE;border:1px solid var(--line);border-radius:14px;padding:6px 18px 10px;margin:18px 0}
.tipbox ul{list-style:none;padding:0}.tipbox li{padding-left:28px;position:relative}.tipbox li::before{content:"💡";position:absolute;left:0}
details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:0 14px;margin:8px 0}
details[open]{border-color:var(--a)}summary{cursor:pointer;font-weight:600;padding:12px 0;list-style:none;display:flex;gap:10px;align-items:center}
summary::-webkit-details-marker{display:none}summary::before{content:"❓"}details[open] summary::before{content:"💬"}
details p{margin:0 0 12px;color:var(--ink)}
.demo{background:linear-gradient(180deg,#FFF6E3,#FFFBF2);border:1px solid #F0DDB4;border-radius:16px;padding:16px 18px;margin:22px 0}
.demo h2{margin-top:0}.demo small{display:block;margin-top:10px}
.demo .row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin:10px 0}
.demo button.pillb{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 14px;font:600 14px system-ui,sans-serif;cursor:pointer;color:var(--ink)}
.demo button.pillb[data-s="idea"]{background:#ECE9FB;color:#6B5BD2}.demo button.pillb[data-s="chosen"]{background:#FBEFD9;color:#A0660B}
.demo button.pillb[data-s="booked"]{background:#E2F2E8;color:#2E7D4F}.demo button.pillb[data-s="paid"]{background:#2E7D4F;color:#fff}
.demo .line{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #EFE3C4}.demo .line:first-of-type{border-top:0}
.demo .sums{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}.demo .sums span{flex:1;min-width:130px;border-radius:12px;padding:8px 12px;background:#fff;border:1px solid var(--line)}
.demo .sums b{display:block;font-size:22px}
.demo .fest b{color:#2E7D4F}.demo .open b{color:#6B5BD2}
.demo input[type=number]{width:74px;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:10px}
.demo input[type=range]{width:160px;accent-color:#2F6FDB}
.demo .fam{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0}
.demo .fam .who{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:14px}
.demo .fam .who label{display:flex;gap:6px;align-items:center}.demo .fam .who input{width:56px}
.demo .fam .amt{font-size:20px;font-weight:700;margin-top:4px}
.pn{display:flex;justify-content:space-between;gap:12px;margin:34px 0 0}.pn a{flex:1;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-decoration:none;color:var(--ink);font-weight:600}
.pn a span{display:block;font-weight:400;font-size:14px;color:var(--mute)}.pn a+a{text-align:right}
.hello{background:linear-gradient(135deg,#E4EDFB,#FDF0E4);border-radius:16px;padding:16px 18px;margin:0 0 18px}.hello p{margin:4px 0}
.list .em{font-size:22px;font-style:normal;margin-right:2px}.list .st{margin-left:auto;flex:none;font-size:13px;font-weight:600;color:#2E7D4F}
.list a.done{border-color:#B7DEC5}
dl.words dt{margin-top:10px}`;

const JS = `(function(){
var K="sf-guide",d=document;
function load(){try{return JSON.parse(localStorage.getItem(K)||"{}")}catch(e){return{}}}
function save(o){try{localStorage.setItem(K,JSON.stringify(o))}catch(e){}}
var st=load();
function count(slug){var a=st[slug]||[];return a.filter(Boolean).length}
// Navigation und Übersicht: erledigte Themen
d.querySelectorAll("[data-slug]").forEach(function(el){var n=+el.getAttribute("data-n"),c=count(el.getAttribute("data-slug"));
  if(el.classList.contains("st")){if(c)el.textContent=c>=n?"✓ fertig":c+" von "+n}
  else if(c>=n&&n){var s=d.createElement("span");s.className="ck";s.textContent="✓";el.appendChild(s)}
  if(c>=n&&n&&el.parentNode&&el.parentNode.classList)el.parentNode.classList.add("done")});
// Schritte abhaken
var steps=d.querySelector(".steps");
if(steps){var slug=steps.getAttribute("data-slug"),boxes=[].slice.call(steps.querySelectorAll("input")),bar=d.querySelector(".prog .bar i"),cnt=d.querySelector(".prog .cnt"),hoo=d.querySelector(".hooray");
  var saved=st[slug]||[];boxes.forEach(function(b,i){b.checked=!!saved[i]});
  function upd(){var c=boxes.filter(function(b){return b.checked}).length;bar.style.width=(c/boxes.length*100)+"%";cnt.textContent=c+" von "+boxes.length+" erledigt";hoo.classList.toggle("on",c===boxes.length)}
  boxes.forEach(function(b,i){b.addEventListener("change",function(){st=load();st[slug]=boxes.map(function(x){return x.checked});save(st);upd()})});
  var rs=d.querySelector(".prog button");if(rs)rs.addEventListener("click",function(){boxes.forEach(function(b){b.checked=false});st=load();st[slug]=[];save(st);upd()});
  upd()}
// Markierungen auf Screenshots
d.querySelectorAll(".shot").forEach(function(fig){
  var pins=[].slice.call(fig.querySelectorAll(".pin")),lis=[].slice.call(fig.querySelectorAll(".legend li"));
  function on(i,v){pins[i]&&pins[i].classList.toggle("on",v);lis[i]&&lis[i].classList.toggle("on",v)}
  pins.forEach(function(p,i){["mouseenter","focus"].forEach(function(e){p.addEventListener(e,function(){on(i,true)})});["mouseleave","blur"].forEach(function(e){p.addEventListener(e,function(){on(i,false)})});
    p.addEventListener("click",function(){lis[i]&&lis[i].scrollIntoView({block:"nearest",behavior:"smooth"});lis.forEach(function(l,j){on(j,j===i)})})});
  lis.forEach(function(l,i){l.addEventListener("mouseenter",function(){on(i,true)});l.addEventListener("mouseleave",function(){on(i,false)});l.addEventListener("click",function(){pins.forEach(function(_,j){on(j,j===i)})})})});
// Demo Status
var ds=d.querySelector("[data-demo=status]");
if(ds){var ORDER=["idea","chosen","booked","paid"],NAME={idea:"Idee",chosen:"Gewählt",booked:"Gebucht",paid:"Bezahlt"};
  var lines=[].slice.call(ds.querySelectorAll(".line"));
  function eur(n){return n.toLocaleString("de-DE")+" €"}
  function sum(){var f=0,o=0;lines.forEach(function(l){var s=l.querySelector("button").getAttribute("data-s"),v=+l.getAttribute("data-v");if(s==="booked"||s==="paid")f+=v;else o+=v});
    ds.querySelector(".fest b").textContent=eur(f);ds.querySelector(".open b").textContent=eur(o)}
  lines.forEach(function(l){var b=l.querySelector("button");b.addEventListener("click",function(){var s=ORDER[(ORDER.indexOf(b.getAttribute("data-s"))+1)%4];b.setAttribute("data-s",s);b.textContent=NAME[s];sum()})});
  sum()}
// Demo Abrechnung
var dp=d.querySelector("[data-demo=split]");
if(dp){var tot=dp.querySelector("[name=tot]"),kid=dp.querySelector("[name=kid]"),kv=dp.querySelector(".kv");
  var fams=[].slice.call(dp.querySelectorAll(".fam"));
  function calc(){var t=+tot.value||0,k=kid.value/100;kv.textContent=kid.value+" %";
    var w=fams.map(function(f){var a=+f.querySelector("[name=a]").value||0,c=+f.querySelector("[name=c]").value||0;return a+c*k}),sw=w.reduce(function(x,y){return x+y},0);
    fams.forEach(function(f,i){var v=sw?t*w[i]/sw:0,n=(+f.querySelector("[name=a]").value||0)+(+f.querySelector("[name=c]").value||0);
      f.querySelector(".amt").textContent=Math.round(v).toLocaleString("de-DE")+" €";f.querySelector(".pp").textContent=n?" · "+Math.round(v/n).toLocaleString("de-DE")+" € pro Person":""})}
  dp.addEventListener("input",calc);calc()}
})();`;

function shell(o: { title: string; description: string; path: string; body: string; ld: object[]; root: string }): string {
  const url = `${SITE}/${o.path}`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)} | Anleitung | Split&amp;Fly</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Split&amp;Fly">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="de_DE">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${o.root}icon.svg" type="image/svg+xml">
<style>${CSS}${EXTRA_CSS}</style>
${o.ld.map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n")}
</head>
<body>
<div class="wrap">
<header><a href="${o.root}"><img src="${o.root}brand/wordmark.svg" alt="Split&amp;Fly" width="140" height="35"></a><a class="cta cta-top" href="${o.root}">Zur App</a></header>
${o.body}
<footer><p>Split&amp;Fly – Gruppenreisen planen und Kosten fair aufteilen. Kostenlos, in 7 Sprachen. Diese Anleitung ist auf Deutsch, Stand ${GUIDE_STAND}. Die Bilder zeigen eine Beispielreise.</p>
<p><a href="${o.root}anleitung/">Alle Themen der Anleitung</a> · <a href="${o.root}reise/">Reiseideen</a> · <a href="${o.root}impressum.html">Impressum</a> · <a href="${o.root}datenschutz.html">Datenschutz</a></p></footer>
</div>
<script>${JS}</script>
</body>
</html>
`;
}

/** Navigation mit allen Themen; sub: Pfad zu den Themen von der Seite aus */
function topics(all: GuidePage[], cur: string, sub: string): string {
  return `<nav class="topics" aria-label="Themen">${all.map(p => `<a href="${sub}${p.slug}/" data-slug="${p.slug}" data-n="${p.steps.length}"${p.slug === cur ? ' aria-current="page"' : ""}>${p.emoji} ${esc(p.nav)}</a>`).join("")}</nav>`;
}

function renderShot(sh: GuideShot, spots: GuideSpots): string {
  const sp = spots[sh.img];
  const pins = sp ? Object.keys(sh.pins).map(k => ({ k, at: sp.spots.find(s => s.key === k) })).filter((x): x is { k: string; at: { key: string; x: number; y: number } } => !!x.at) : [];
  return `<figure class="shot"><div class="frame"><img src="../img/${sh.img}.jpg" alt="${esc(sh.alt)}" width="${sp?.w ?? 700}" height="${sp?.h ?? 600}" loading="lazy">
${pins.map((p, i) => `<button type="button" class="pin" style="left:${p.at.x}%;top:${p.at.y}%" aria-label="Markierung ${i + 1}: ${esc(sh.pins[p.k])}">${i + 1}</button>`).join("\n")}</div>
<figcaption>${esc(sh.caption)}</figcaption>
${pins.length ? `<ol class="legend">${pins.map((p, i) => `<li><b>${i + 1}</b><span>${esc(sh.pins[p.k])}</span></li>`).join("")}</ol>` : ""}</figure>`;
}

const DEMO_STATUS = `<section class="demo" data-demo="status"><h2>🚦 Probier’s aus: fest und offen</h2>
<p>Tipp auf den Status, er springt weiter: Idee → Gewählt → Gebucht → Bezahlt. Gebucht und bezahlt zählt als fest, alles andere ist noch offen.</p>
<div class="line" data-v="1008"><span>🛏 Ferienhaus mit Pool<br><small>1.008 €</small></span><button type="button" class="pillb" data-s="booked">Gebucht</button></div>
<div class="line" data-v="550"><span>✈️ Flug Köln – Split<br><small>550 €</small></span><button type="button" class="pillb" data-s="chosen">Gewählt</button></div>
<div class="line" data-v="240"><span>🚗 Mietwagen (Van)<br><small>240 €</small></span><button type="button" class="pillb" data-s="idea">Idee</button></div>
<div class="sums"><span class="fest">🔒 Fest<b>0 €</b></span><span class="open">🕓 Offen<b>0 €</b></span></div>
<small>Nur zum Ausprobieren, die Beträge sind aus der Beispielreise der Bilder (Familie Klein).</small></section>`;

const DEMO_SPLIT = `<section class="demo" data-demo="split"><h2>🧾 Probier’s aus: fair teilen</h2>
<p>Ändere den Gesamtbetrag, die Zahl der Personen oder den Kinderpreis und sieh, wie sich der Anteil der Familien verschiebt.</p>
<div class="row"><label>Gesamtbetrag <input type="number" name="tot" value="3600" min="0" step="50"> €</label>
<label>Kinder zahlen <input type="range" name="kid" min="0" max="100" value="60" step="5"> <b class="kv">60 %</b></label></div>
<div class="fam"><div class="who"><b>Familie Klein</b><label>Erwachsene <input type="number" name="a" value="2" min="0" max="9"></label><label>Kinder <input type="number" name="c" value="2" min="0" max="9"></label></div><div class="amt">–</div><span class="pp"></span></div>
<div class="fam"><div class="who"><b>Familie Hase</b><label>Erwachsene <input type="number" name="a" value="2" min="0" max="9"></label><label>Kinder <input type="number" name="c" value="1" min="0" max="9"></label></div><div class="amt">–</div><span class="pp"></span></div>
<small>Vereinfachte Spielwiese. In der App rechnet Split&amp;Fly jeden Posten einzeln, mit echten Kinderpreisen und den Nächten, die jede Person da ist.</small></section>`;

export function renderGuidePage(p: GuidePage, all: GuidePage[] = GUIDE, art: GuideArt = noArt, spots: GuideSpots = {}): string {
  const i = all.findIndex(x => x.slug === p.slug);
  const prev = all[i - 1], next = all[i + 1];
  const body = `${topics(all, p.slug, "../")}
<p class="crumbs"><a href="../">Anleitung</a> › ${esc(p.nav)}</p>
<h1><span class="em" aria-hidden="true">${p.emoji}</span>${esc(p.h1)}</h1>
${art(p.slug)}
<p class="where">📍 Hier: ${esc(p.where)}</p>
${p.intro.map(x => `<p>${esc(x)}</p>`).join("\n")}
${(p.shots ?? []).map(sh => renderShot(sh, spots)).join("\n")}
<h2>So geht’s</h2>
<p class="crumbs">Hake ab, was du erledigt hast. Wir merken es uns auf diesem Gerät.</p>
<div class="prog"><div class="bar"><i></i></div><span class="cnt">0 von ${p.steps.length} erledigt</span><button type="button">Zurücksetzen</button></div>
<ol class="steps" data-slug="${p.slug}">
${p.steps.map((x, n) => `<li><label><input type="checkbox"><span class="n"><b>${n + 1}</b></span><span class="t">${esc(x)}</span></label></li>`).join("\n")}
</ol>
<p class="hooray">🎉 Geschafft! Weiter geht’s mit dem nächsten Thema.</p>
${p.demo === "status" ? DEMO_STATUS : ""}${p.demo === "split" ? DEMO_SPLIT : ""}
<div class="tipbox">
<h2 style="margin-top:12px">Gut zu wissen</h2>
<ul>
${p.tips.map(x => `<li>${esc(x)}</li>`).join("\n")}
</ul>
</div>
<h2>Häufige Fragen</h2>
${p.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n")}
<p><a class="cta" href="../../">Split&amp;Fly öffnen</a></p>
<nav class="pn" aria-label="Weiter in der Anleitung">${prev ? `<a href="../${prev.slug}/"><span>← Zurück</span>${prev.emoji} ${esc(prev.nav)}</a>` : "<span></span>"}${next ? `<a href="../${next.slug}/"><span>Weiter →</span>${next.emoji} ${esc(next.nav)}</a>` : ""}</nav>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "HowTo", name: p.h1, description: p.description, inLanguage: "de",
      step: p.steps.map((s, n) => ({ "@type": "HowToStep", position: n + 1, text: s })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Anleitung", item: `${SITE}/anleitung/` },
      { "@type": "ListItem", position: 2, name: p.h1, item: `${SITE}/anleitung/${p.slug}/` }] }
  ];
  return shell({ title: p.title, description: p.description, path: `anleitung/${p.slug}/`, body, ld, root: "../../" });
}

export function renderGuideIndex(all: GuidePage[] = GUIDE, art: GuideArt = noArt): string {
  const item = (p: GuidePage, n: number) => `<a href="${p.slug}/">${art(p.slug, "thumb")}<div><i class="em" aria-hidden="true">${p.emoji}</i> ${n}. ${esc(p.h1)}<span>${esc(p.where)}</span></div><span class="st" data-slug="${p.slug}" data-n="${p.steps.length}"></span></a>`;
  const body = `<h1>Anleitung: Split&amp;Fly Schritt für Schritt</h1>
<div class="hello"><p><b>Hallo und willkommen! 👋</b></p><p>Hier planst du Schritt für Schritt eine Gruppenreise und teilst die Kosten fair auf. Die Themen folgen der Reihenfolge in der App, von der ersten Reise bis zur Abrechnung. Alle Bilder stammen aus der echten App, die roten Zahlen darauf kannst du antippen.</p>
<p><a class="cta" href="${all[0].slug}/">Los geht’s: ${all[0].emoji} ${esc(all[0].nav)}</a></p></div>
<div class="list">
${all.map((p, n) => item(p, n + 1)).join("\n")}
</div>
<h2>Die wichtigsten Begriffe</h2>
<dl class="words">
${LEARN.map(([e, a, b]) => `<dt>${e} ${esc(a)}</dt><dd>${esc(b)}</dd>`).join("\n")}
</dl>
<p><a class="cta" href="../">Split&amp;Fly öffnen</a></p>`;
  const ld = [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Anleitung Split&Fly", url: `${SITE}/anleitung/`, inLanguage: "de",
    hasPart: all.map(p => ({ "@type": "HowTo", name: p.h1, url: `${SITE}/anleitung/${p.slug}/` })) }];
  return shell({ title: "Anleitung für Split&Fly", description: "Schritt für Schritt: Reise anlegen, Reisende eintragen, Flüge und Unterkünfte vergleichen, Kosten verfolgen, gemeinsam abstimmen und fair abrechnen.", path: "anleitung/", body, ld, root: "../" });
}

/** Einträge für die Sitemap (Übersicht und alle Seiten) */
export function guideSitemapUrls(all: GuidePage[] = GUIDE): string[] {
  return [`${SITE}/anleitung/`, ...all.map(p => `${SITE}/anleitung/${p.slug}/`)];
}
