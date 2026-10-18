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
}

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
      "Auf der Startseite „Neue Reise“ antippen. Das geht allein, zu zweit, mit Familie oder Freunden.",
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
    where: "Startseite → Neue Reise"
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
    where: "Kapitel „Wer fährt mit“"
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
      "Im Kapitel „Abheben“ einen Flug hinzufügen oder die Suche öffnen.",
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
    where: "Kapitel „Abheben“"
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
      "Im Kapitel „Ankommen“ eine Unterkunft hinzufügen oder „Unterkunft suchen“ wählen.",
      "Ort, Art der Unterkunft (ganze Unterkunft, Hotel …), Zeitraum, Gäste und Zimmer angeben. Bei einer Rundreise wählst du die Station.",
      "Treffer ansehen, filtern (zum Beispiel nach Ausstattung) und passende Angebote übernehmen.",
      "Der Preis lässt sich als Preis pro Nacht, pro Person und Nacht oder als Gesamtpreis eintragen.",
      "Mehrere Angebote erscheinen als A, B, C mit Karte, Entfernung zum Zentrum und zum Meer und den Kosten der ganzen Reise. So findest du die beste Wahl und siehst, was es mit Verpflegung kostet.",
      "Wähle ein Angebot. Der Tagesplan zeigt dann, ob jede Nacht abgedeckt ist."
    ],
    tips: [
      "Der Tagesplan warnt, wenn Nächte ohne Unterkunft sind oder doppelt gebucht wurden.",
      "Nach der Landung ohne Anschluss kannst du direkt „Unterkunft am Flughafen suchen“.",
      "Wo die Suche es weiß, siehst du „kostenlos stornierbar“. Für die Buchung gehst du zum Anbieter."
    ],
    faq: [
      { q: "Was ist, wenn die Gruppe nicht in ein Zimmer passt?", a: "Die Belegung berücksichtigt die maximale Gästezahl und die Zimmer. Passt es nicht, teile die Gruppe auf mehrere Unterkünfte auf." },
      { q: "Kann ich auch eine private Unterkunft eintragen?", a: "Ja. Du kannst jede Unterkunft von Hand eintragen, auch eine, die du nicht über die Suche findest, zum Beispiel ein Haus von Bekannten." }
    ],
    where: "Kapitel „Ankommen“"
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
    where: "Kapitel „Unterwegs“, „Erleben“ und „Alles andere“"
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
    where: "Kapitel „Tag für Tag“"
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
    where: "Kapitel „Wer zahlt was“"
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
    where: "Reise → Teilen und Abstimmungen"
  },
  {
    slug: "ideen-und-ki",
    nav: "Ideen & KI",
    title: "Reiseideen, KI-Planer und Events",
    description: "Reisen schneller starten: fertig gerechnete Reiseideen übernehmen, die KI Vorschläge machen lassen oder die Reise nach einem Event planen.",
    h1: "Reiseideen, KI-Planer und Events",
    intro: [
      "Nicht jede Reise beginnt bei null. Auf der Startseite findest du drei Abkürzungen: Reiseideen, den KI-Planer und Reisen zu einem Event."
    ],
    steps: [
      "Reiseideen: Auf der Startseite „Reiseideen“ öffnen und eine fertig gerechnete Gruppenreise übernehmen. Ziel, Gruppe und Kosten sind schon eingetragen, die echten Preise suchst du danach.",
      "Mit KI planen (Beta): Beschreibe deine Wunschreise in ein paar Sätzen. Die KI schlägt Ziele und Varianten vor, die du prüfst und übernimmst.",
      "Zu einem Event: Bei Spiel, Konzert oder Festival planst du die Reise passend zum Termin.",
      "Die Vorschläge landen als Reise bei dir. Von da an bearbeitest du alles wie gewohnt."
    ],
    tips: [
      "Die KI kennt deine Vorlieben aus dem Start-Assistenten, wenn du ihn ausgefüllt hast.",
      "Persönliche Daten wie Name, Geschlecht, Staatsangehörigkeit und Geburtsdatum gehen nicht an die KI.",
      "Die KI-Vorbefüllung zählt als eine der KI-Anfragen pro Tag und ist optional.",
      "Prüfe KI-Vorschläge wie jede Schätzung: Preise sind Richtwerte, keine Angebote."
    ],
    faq: [
      { q: "Ist die KI-Planung kostenlos?", a: "Ja, sie ist als Beta enthalten. Pro Tag gibt es eine begrenzte Zahl an Anfragen." },
      { q: "Sind die Reiseideen Angebote?", a: "Nein. Es sind Richtwerte mit Spannen pro Person. Echte Preise ermittelst du danach in deiner eigenen Reise." }
    ],
    where: "Startseite → Reiseideen, Mit KI planen, Zu einem Event"
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
      "App installieren: Unten auf der Startseite „App installieren“ wählen (wo der Browser es anbietet). Am iPhone: Teilen → „Zum Home-Bildschirm“.",
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
    where: "Startseite → Fußzeile, Menü „Mehr“"
  }
];

const LEARN = [
  ["Reise", "Ein Vorhaben mit Reisenden, Zeitraum und Posten."],
  ["Haushalt", "Wer gemeinsam zahlt, zum Beispiel eine Familie."],
  ["Posten", "Eine Kostenstelle: Flug, Unterkunft, Transport, Erlebnis oder Sonstiges."],
  ["Angebot", "Ein konkreter Vorschlag für einen Posten, mit Buchstaben A, B, C zum Vergleichen."],
  ["Status", "Idee, Gewählt, Gebucht, Bezahlt oder Verworfen."],
  ["Fest und offen", "Fest ist gebucht und bezahlt, offen ist noch in Planung."]
];

export type GuideArt = (slug: string, cls?: string) => string;
const noArt: GuideArt = () => "";

const EXTRA_CSS = `
.steps{counter-reset:s;list-style:none;padding:0;margin:0}.steps li{counter-increment:s;position:relative;padding:4px 0 4px 44px;margin:10px 0;min-height:34px}
.steps li::before{content:counter(s);position:absolute;left:0;top:2px;width:30px;height:30px;border-radius:50%;background:var(--a);color:#fff;font-weight:700;display:grid;place-items:center;font-size:15px}
.where{display:inline-block;background:#E4EDFB;color:#1B4FA3;border-radius:999px;font-size:14px;font-weight:600;padding:3px 12px;margin:0 0 14px}
.tipbox{background:#EEF5FE;border:1px solid var(--line);border-radius:14px;padding:6px 18px;margin:16px 0}
.pn{display:flex;justify-content:space-between;gap:12px;margin:34px 0 0}.pn a{flex:1;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-decoration:none;color:var(--ink);font-weight:600}
.pn a span{display:block;font-weight:400;font-size:14px;color:var(--mute)}.pn a+a{text-align:right}
.toc a{counter-increment:t}.toc a b{color:var(--a)}
dl.words dt{margin-top:8px}`;

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
<footer><p>Split&amp;Fly – Gruppenreisen planen und Kosten fair aufteilen. Kostenlos, in 7 Sprachen. Diese Anleitung ist auf Deutsch, Stand ${GUIDE_STAND}.</p>
<p><a href="${o.root}anleitung/">Alle Themen der Anleitung</a> · <a href="${o.root}reise/">Reiseideen</a> · <a href="${o.root}impressum.html">Impressum</a> · <a href="${o.root}datenschutz.html">Datenschutz</a></p></footer>
</div>
</body>
</html>
`;
}

export function renderGuidePage(p: GuidePage, all: GuidePage[] = GUIDE, art: GuideArt = noArt): string {
  const i = all.findIndex(x => x.slug === p.slug);
  const prev = all[i - 1], next = all[i + 1];
  const body = `<p class="crumbs"><a href="../">Anleitung</a> › ${esc(p.nav)}</p>
<h1>${esc(p.h1)}</h1>
${art(p.slug)}
<p class="where">Hier: ${esc(p.where)}</p>
${p.intro.map(x => `<p>${esc(x)}</p>`).join("\n")}
<h2>So geht’s</h2>
<ol class="steps">
${p.steps.map(x => `<li>${esc(x)}</li>`).join("\n")}
</ol>
<div class="tipbox">
<h2 style="margin-top:12px">Gut zu wissen</h2>
<ul>
${p.tips.map(x => `<li>${esc(x)}</li>`).join("\n")}
</ul>
</div>
<h2>Häufige Fragen</h2>
<dl>
${p.faq.map(f => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("\n")}
</dl>
<p><a class="cta" href="../../">Split&amp;Fly öffnen</a></p>
<nav class="pn" aria-label="Weiter in der Anleitung">${prev ? `<a href="../${prev.slug}/"><span>Zurück</span>${esc(prev.nav)}</a>` : "<span></span>"}${next ? `<a href="../${next.slug}/"><span>Weiter</span>${esc(next.nav)}</a>` : ""}</nav>`;
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
  const item = (p: GuidePage, n: number) => `<a href="${p.slug}/">${art(p.slug, "thumb")}<div>${n}. ${esc(p.h1)}<span>${esc(p.where)}</span></div></a>`;
  const body = `<h1>Anleitung: Split&amp;Fly Schritt für Schritt</h1>
<p>So planst du eine Gruppenreise und teilst die Kosten fair auf. Die Themen folgen der Reihenfolge in der App: von der ersten Reise bis zur Abrechnung. Stand ${GUIDE_STAND}.</p>
<div class="list">
${all.map((p, n) => item(p, n + 1)).join("\n")}
</div>
<h2>Die wichtigsten Begriffe</h2>
<dl class="words">
${LEARN.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("\n")}
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
