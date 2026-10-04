/*
 * Früh buchen: Attraktionen mit Kontingent, die oft schon beim Verkaufsstart ausverkauft sind (Shibuya Sky, Vatikan,
 * Anne-Frank-Haus …). Je Ort das Buchungsfenster, daraus der Verkaufsstart für das Reisedatum. Gruppiert je Reiseziel,
 * damit eine Reise nach Tokio einen Punkt unter „Wichtiges“ bekommt statt sechs. Stand und Quellen: docs/ZIELE.md.
 * Fenster ändern sich: maßgeblich ist der offizielle Link; „approx“ heißt: Richtwert, nicht genau belegt.
 */
import type { HintLink } from "./hints";

export type BookWindow =
  /** täglich: Tickets für Tag X ab X minus `days` Tage um `time` */
  | { kind: "days"; days: number; time?: string }
  /** täglich: gleicher Kalendertag `months` Monate vorher (gibt es den Tag nicht: am 1. des Folgemonats) */
  | { kind: "months"; months: number; time?: string }
  /** monatlich: am `day`. um `time`, `months` Monate vor dem Besuchsmonat, für den ganzen Monat (ggf. als Verlosung) */
  | { kind: "monthly"; day: number; months: number; time?: string; lottery?: boolean }
  /** wöchentlich: am Wochentag (0 = Sonntag) um `time`, `weeks` Wochen vorher */
  | { kind: "weekly"; weekday: number; weeks: number; time?: string }
  /** einmal im Jahr: im Monat `month`; season: Saison Juli bis Juni (Neuseeland), prevYear: im Vorjahr der Reise */
  | { kind: "yearly"; month: number; rule: "season" | "prevYear" | "sameYear" }
  /** kein fester Verkaufsstart: Empfehlung, spätestens `lead` Tage vorher zu buchen */
  | { kind: "asap"; lead: number };

export type BookTip = "sunset" | "minutes" | "lottery" | "quarterly" | "named" | "season" | "permit" | "tour";

export interface BookAhead {
  id: string;
  name: string;
  /** Reiseziel (Gruppe unter „Wichtiges“) */
  city: string;
  cc: string;
  /** Zeitzone des Orts (Verkaufsstart in Ortszeit) */
  tz: string;
  window: BookWindow;
  /** Richtwert, nicht genau belegt */
  approx?: boolean;
  /** nur in diesen Monaten relevant (z. B. Keukenhof im Frühling) */
  months?: number[];
  tip?: BookTip;
  links: HintLink[];
  /** gleicher Ort wie ein Hinweis in hints.ts: der Hinweis geht hier auf */
  hint?: string;
}

/** Reiseziele: Flughäfen und Stichwörter, an denen die App sie erkennt */
export const CITIES: Record<string, { label: string; aps?: string[]; words: RegExp }> = {
  tokyo: { label: "Tokyo", aps: ["HND", "NRT"], words: /tok(y|i)o|shibuya|shinjuku|mitaka/i },
  nagoya: { label: "Nagoya", aps: ["NGO"], words: /nagoya|aichi|ghibli.?park/i },
  kansai: { label: "Kyoto & Osaka", aps: ["KIX", "ITM", "UKB"], words: /kyoto|osaka|uji\b/i },
  beijing: { label: "Beijing", aps: ["PEK", "PKX"], words: /peking|beijing/i },
  seoul: { label: "Seoul", aps: ["ICN", "GMP"], words: /seoul|\bdmz\b/i },
  dubai: { label: "Dubai", aps: ["DXB", "DWC"], words: /dubai/i },
  rome: { label: "Roma", aps: ["FCO", "CIA"], words: /\brom\b|\broma\b|\brome\b|vatikan|vatican/i },
  florence: { label: "Firenze", aps: ["FLR"], words: /florenz|firenze|florence/i },
  milan: { label: "Milano", aps: ["MXP", "LIN", "BGY"], words: /mailand|milano|\bmilan\b/i },
  granada: { label: "Granada", aps: ["GRX"], words: /granada|alhambra/i },
  seville: { label: "Sevilla", aps: ["SVQ"], words: /sevilla|seville/i },
  barcelona: { label: "Barcelona", aps: ["BCN"], words: /barcelona|sagrada|g[uü]ell/i },
  malaga: { label: "Málaga", aps: ["AGP"], words: /m[aá]laga|caminito|ardales/i },
  paris: { label: "Paris", aps: ["CDG", "ORY"], words: /\bparis\b|versailles/i },
  normandy: { label: "Mont-Saint-Michel", words: /mont.?saint.?michel|normandie|normandy/i },
  amsterdam: { label: "Amsterdam", aps: ["AMS"], words: /amsterdam|keukenhof|lisse/i },
  london: { label: "London", aps: ["LHR", "LGW", "STN", "LTN", "LCY"], words: /london|stonehenge/i },
  edinburgh: { label: "Edinburgh", aps: ["EDI"], words: /edinburgh/i },
  berlin: { label: "Berlin", aps: ["BER"], words: /berlin/i },
  bavaria: { label: "Bayern", aps: ["MUC", "FMM"], words: /m[üu]nchen|munich|neuschwanstein|hohenschwangau|f[üu]ssen|oktoberfest|wiesn/i },
  athens: { label: "Athína", aps: ["ATH"], words: /athen|athens|akropolis|acropolis/i },
  plitvice: { label: "Plitvice", words: /plitvi/i },
  iceland: { label: "Ísland", aps: ["KEF"], words: /island\b|iceland|reykjav|blue lagoon/i },
  capetown: { label: "Cape Town", aps: ["CPT"], words: /kapstadt|cape town|robben island/i },
  rwanda: { label: "Gorilla-Trekking", words: /gorilla|bwindi|mgahinga|volcanoes national park|virunga/i },
  nyc: { label: "New York", aps: ["JFK", "EWR", "LGA"], words: /new york|\bnyc\b|manhattan/i },
  sf: { label: "San Francisco", aps: ["SFO", "OAK"], words: /san francisco|alcatraz/i },
  southwest: { label: "Utah & Arizona", aps: ["PGA"], words: /antelope|lake powell|\bpage\b.*(az|arizona)|\bmoab\b|arches|\bzion\b|springdale|angels landing/i },
  yosemite: { label: "Yosemite", words: /yosemite|half dome/i },
  banff: { label: "Banff", aps: ["YYC"], words: /banff|moraine|lake louise/i },
  cusco: { label: "Cusco & Machu Picchu", aps: ["CUZ"], words: /machu ?picchu|aguas calientes|cusco|cuzco|inka.?trail|inca.?trail|camino inca/i },
  fiordland: { label: "Fiordland", aps: ["ZQN"], words: /milford|te anau|fiordland/i },
  waikato: { label: "Hobbiton", words: /hobbiton|matamata/i }
};

const L = (label: string, url: string) => ({ label, url });

export const BOOK_AHEAD: BookAhead[] = [
  // Japan
  { id: "shibuya-sky", name: "Shibuya Sky", city: "tokyo", cc: "JP", tz: "Asia/Tokyo", window: { kind: "days", days: 14, time: "00:00" }, tip: "sunset", links: [L("Shibuya Sky", "https://www.shibuya-scramble-square.com/sky/ticket/")] },
  { id: "ghibli-museum", name: "Ghibli Museum (Mitaka)", city: "tokyo", cc: "JP", tz: "Asia/Tokyo", window: { kind: "monthly", day: 10, months: 1, time: "10:00" }, tip: "minutes", links: [L("Ghibli Museum", "https://www.ghibli-museum.jp/en/tickets/")] },
  { id: "pokemon-cafe-tokyo", name: "Pokémon Café Tokyo", city: "tokyo", cc: "JP", tz: "Asia/Tokyo", window: { kind: "days", days: 31, time: "18:00" }, tip: "minutes", links: [L("Pokémon Café", "https://reserve.pokemon-cafe.jp/")] },
  { id: "tokyo-disney", name: "Tokyo Disneyland & DisneySea", city: "tokyo", cc: "JP", tz: "Asia/Tokyo", window: { kind: "months", months: 2, time: "14:00" }, links: [L("Tokyo Disney Resort", "https://www.tokyodisneyresort.jp/en/ticket/")] },
  { id: "teamlab-tokyo", name: "teamLab Planets / Borderless", city: "tokyo", cc: "JP", tz: "Asia/Tokyo", window: { kind: "asap", lead: 30 }, links: [L("teamLab", "https://www.teamlab.art/")] },
  { id: "sumo-tokyo", name: "Grand Sumo (Ryōgoku Kokugikan)", city: "tokyo", cc: "JP", tz: "Asia/Tokyo", window: { kind: "asap", lead: 35 }, months: [1, 5, 9], tip: "season", links: [L("Sumo Ticket", "https://sumo.pia.jp/en/")] },
  { id: "ghibli-park", name: "Ghibli Park", city: "nagoya", cc: "JP", tz: "Asia/Tokyo", window: { kind: "monthly", day: 10, months: 2, time: "14:00" }, tip: "named", links: [L("Ghibli Park", "https://ghibli-park.jp/en/ticket/")] },
  { id: "pokemon-cafe-osaka", name: "Pokémon Café Osaka", city: "kansai", cc: "JP", tz: "Asia/Tokyo", window: { kind: "days", days: 31, time: "18:00" }, tip: "minutes", links: [L("Pokémon Café", "https://reserve.pokemon-cafe.jp/")] },
  { id: "nintendo-museum", name: "Nintendo Museum (Uji)", city: "kansai", cc: "JP", tz: "Asia/Tokyo", window: { kind: "monthly", day: 1, months: 3, lottery: true }, tip: "lottery", links: [L("Nintendo Museum", "https://museum.nintendo.com/en/")] },
  { id: "katsura", name: "Katsura Imperial Villa", city: "kansai", cc: "JP", tz: "Asia/Tokyo", window: { kind: "monthly", day: 1, months: 3, lottery: true }, tip: "lottery", links: [L("Imperial Household Agency", "https://sankan.kunaicho.go.jp/english/")] },
  { id: "shugakuin", name: "Shugakuin Imperial Villa", city: "kansai", cc: "JP", tz: "Asia/Tokyo", window: { kind: "monthly", day: 1, months: 3, lottery: true }, tip: "lottery", links: [L("Imperial Household Agency", "https://sankan.kunaicho.go.jp/english/")] },
  { id: "usj", name: "Universal Studios Japan (Super Nintendo World)", city: "kansai", cc: "JP", tz: "Asia/Tokyo", window: { kind: "asap", lead: 45 }, links: [L("USJ", "https://www.usj.co.jp/web/en/us")] },
  // Asien und Naher Osten
  { id: "forbidden-city", name: "Forbidden City (Palace Museum)", city: "beijing", cc: "CN", tz: "Asia/Shanghai", window: { kind: "days", days: 7, time: "20:00" }, tip: "minutes", links: [L("Palace Museum", "https://intl.dpm.org.cn/")] },
  { id: "dmz", name: "DMZ / JSA Tour", city: "seoul", cc: "KR", tz: "Asia/Seoul", window: { kind: "asap", lead: 21 }, tip: "named", links: [L("Visit Korea", "https://english.visitkorea.or.kr/")] },
  { id: "burj-khalifa", name: "Burj Khalifa (At the Top, Sonnenuntergang)", city: "dubai", cc: "AE", tz: "Asia/Dubai", window: { kind: "asap", lead: 21 }, tip: "sunset", links: [L("Burj Khalifa", "https://www.burjkhalifa.ae/")] },
  // Italien
  { id: "vatican", name: "Musei Vaticani & Cappella Sistina", city: "rome", cc: "IT", tz: "Europe/Rome", window: { kind: "days", days: 60, time: "00:00" }, links: [L("Musei Vaticani", "https://tickets.museivaticani.va/")] },
  { id: "colosseum", name: "Colosseo (Arena, Untergeschoss)", city: "rome", cc: "IT", tz: "Europe/Rome", window: { kind: "days", days: 30 }, links: [L("Parco archeologico del Colosseo", "https://ticketing.colosseo.it/")] },
  { id: "borghese", name: "Galleria Borghese", city: "rome", cc: "IT", tz: "Europe/Rome", window: { kind: "asap", lead: 45 }, links: [L("Galleria Borghese", "https://galleriaborghese.beniculturali.it/")] },
  { id: "accademia", name: "Galleria dell'Accademia (David)", city: "florence", cc: "IT", tz: "Europe/Rome", window: { kind: "asap", lead: 30 }, links: [L("Galleria dell'Accademia", "https://www.galleriaaccademiafirenze.it/")] },
  { id: "uffizi", name: "Galleria degli Uffizi", city: "florence", cc: "IT", tz: "Europe/Rome", window: { kind: "asap", lead: 30 }, links: [L("Uffizi", "https://www.uffizi.it/")] },
  { id: "duomo-florence", name: "Cupola del Brunelleschi", city: "florence", cc: "IT", tz: "Europe/Rome", window: { kind: "asap", lead: 30 }, links: [L("Duomo di Firenze", "https://duomo.firenze.it/")] },
  { id: "cenacolo", name: "Cenacolo Vinciano (Abendmahl)", city: "milan", cc: "IT", tz: "Europe/Rome", window: { kind: "asap", lead: 90 }, tip: "quarterly", links: [L("Cenacolo Vinciano", "https://cenacolovinciano.org/en/")] },
  // Spanien und Portugal
  { id: "alhambra", name: "Alhambra (Palacios Nazaríes)", city: "granada", cc: "ES", tz: "Europe/Madrid", window: { kind: "months", months: 3 }, tip: "named", hint: "alhambra", links: [L("Alhambra (Patronato)", "https://tickets.alhambra-patronato.es/")] },
  { id: "alcazar-sevilla", name: "Real Alcázar de Sevilla", city: "seville", cc: "ES", tz: "Europe/Madrid", window: { kind: "asap", lead: 21 }, links: [L("Real Alcázar", "https://www.alcazarsevilla.org/")] },
  { id: "sagrada", name: "Sagrada Família", city: "barcelona", cc: "ES", tz: "Europe/Madrid", window: { kind: "months", months: 2 }, approx: true, hint: "sagrada", links: [L("Sagrada Família", "https://sagradafamilia.org/")] },
  { id: "park-guell", name: "Park Güell", city: "barcelona", cc: "ES", tz: "Europe/Madrid", window: { kind: "asap", lead: 14 }, links: [L("Park Güell", "https://parkguell.barcelona/")] },
  { id: "caminito", name: "Caminito del Rey", city: "malaga", cc: "ES", tz: "Europe/Madrid", window: { kind: "asap", lead: 60 }, links: [L("Caminito del Rey", "https://www.caminitodelrey.info/")] },
  // Frankreich
  { id: "eiffel", name: "Tour Eiffel (Gipfel)", city: "paris", cc: "FR", tz: "Europe/Paris", window: { kind: "days", days: 60, time: "00:00" }, tip: "sunset", links: [L("Tour Eiffel", "https://ticket.toureiffel.paris/")] },
  { id: "louvre", name: "Musée du Louvre", city: "paris", cc: "FR", tz: "Europe/Paris", window: { kind: "asap", lead: 30 }, links: [L("Louvre", "https://www.louvre.fr/")] },
  { id: "versailles", name: "Château de Versailles", city: "paris", cc: "FR", tz: "Europe/Paris", window: { kind: "asap", lead: 30 }, links: [L("Versailles", "https://www.chateauversailles.fr/")] },
  { id: "sainte-chapelle", name: "Sainte-Chapelle", city: "paris", cc: "FR", tz: "Europe/Paris", window: { kind: "asap", lead: 14 }, links: [L("Sainte-Chapelle", "https://www.sainte-chapelle.fr/")] },
  { id: "catacombs", name: "Catacombes de Paris", city: "paris", cc: "FR", tz: "Europe/Paris", window: { kind: "asap", lead: 14 }, links: [L("Catacombes", "https://www.catacombes.paris.fr/")] },
  { id: "mont-saint-michel", name: "Abbaye du Mont-Saint-Michel", city: "normandy", cc: "FR", tz: "Europe/Paris", window: { kind: "asap", lead: 14 }, links: [L("Abbaye du Mont-Saint-Michel", "https://www.abbaye-mont-saint-michel.fr/")] },
  // Benelux, Großbritannien, Deutschland
  { id: "anne-frank", name: "Anne Frank Huis", city: "amsterdam", cc: "NL", tz: "Europe/Amsterdam", window: { kind: "weekly", weekday: 2, weeks: 6, time: "10:00" }, tip: "minutes", links: [L("Anne Frank Huis", "https://www.annefrank.org/en/museum/tickets/")] },
  { id: "van-gogh", name: "Van Gogh Museum", city: "amsterdam", cc: "NL", tz: "Europe/Amsterdam", window: { kind: "asap", lead: 14 }, links: [L("Van Gogh Museum", "https://www.vangoghmuseum.nl/")] },
  { id: "keukenhof", name: "Keukenhof", city: "amsterdam", cc: "NL", tz: "Europe/Amsterdam", window: { kind: "asap", lead: 21 }, months: [3, 4, 5], tip: "season", links: [L("Keukenhof", "https://keukenhof.nl/en/")] },
  { id: "harry-potter-studio", name: "Warner Bros. Studio Tour London (Harry Potter)", city: "london", cc: "GB", tz: "Europe/London", window: { kind: "asap", lead: 60 }, links: [L("Studio Tour", "https://www.wbstudiotour.co.uk/")] },
  { id: "sky-garden", name: "Sky Garden (kostenlos, mit Zeitfenster)", city: "london", cc: "GB", tz: "Europe/London", window: { kind: "days", days: 21 }, approx: true, tip: "sunset", links: [L("Sky Garden", "https://skygarden.london/")] },
  { id: "stonehenge", name: "Stonehenge", city: "london", cc: "GB", tz: "Europe/London", window: { kind: "asap", lead: 14 }, links: [L("English Heritage", "https://www.english-heritage.org.uk/visit/places/stonehenge/")] },
  { id: "edinburgh-castle", name: "Edinburgh Castle (Festival-Sommer)", city: "edinburgh", cc: "GB", tz: "Europe/London", window: { kind: "asap", lead: 30 }, months: [7, 8], tip: "season", links: [L("Edinburgh Castle", "https://www.edinburghcastle.scot/")] },
  { id: "reichstag", name: "Reichstagskuppel (kostenlose Anmeldung)", city: "berlin", cc: "DE", tz: "Europe/Berlin", window: { kind: "asap", lead: 21 }, tip: "named", links: [L("Deutscher Bundestag", "https://visite.bundestag.de/")] },
  { id: "neuschwanstein", name: "Schloss Neuschwanstein", city: "bavaria", cc: "DE", tz: "Europe/Berlin", window: { kind: "asap", lead: 30 }, hint: "neuschwanstein", links: [L("Ticket-Center Hohenschwangau", "https://www.hohenschwangau.de/")] },
  { id: "oktoberfest", name: "Oktoberfest (Tischreservierung im Festzelt)", city: "bavaria", cc: "DE", tz: "Europe/Berlin", window: { kind: "yearly", month: 1, rule: "sameYear" }, months: [9, 10], tip: "season", links: [L("Oktoberfest", "https://www.oktoberfest.de/en/")] },
  // Südosteuropa und Norden
  { id: "acropolis", name: "Akropolis (Zeitfenster)", city: "athens", cc: "GR", tz: "Europe/Athens", window: { kind: "asap", lead: 14 }, hint: "acropolis", links: [L("Hellenic Heritage", "https://hhticket.gr/")] },
  { id: "plitvice", name: "Plitvicer Seen (Sommer)", city: "plitvice", cc: "HR", tz: "Europe/Zagreb", window: { kind: "asap", lead: 21 }, months: [6, 7, 8, 9], links: [L("Nacionalni park Plitvička jezera", "https://np-plitvicka-jezera.hr/en/")] },
  { id: "blue-lagoon", name: "Blue Lagoon", city: "iceland", cc: "IS", tz: "Atlantic/Reykjavik", window: { kind: "asap", lead: 14 }, links: [L("Blue Lagoon", "https://www.bluelagoon.com/")] },
  // Afrika
  { id: "robben-island", name: "Robben Island", city: "capetown", cc: "ZA", tz: "Africa/Johannesburg", window: { kind: "asap", lead: 14 }, links: [L("Robben Island Museum", "https://www.robben-island.org.za/")] },
  { id: "gorilla", name: "Gorilla-Permit", city: "rwanda", cc: "RW", tz: "Africa/Kigali", window: { kind: "asap", lead: 180 }, tip: "permit", hint: "gorilla", links: [L("Visit Rwanda", "https://visitrwandabookings.rdb.rw/"), L("Uganda Wildlife Authority", "https://ugandawildlife.org/")] },
  // Amerika
  { id: "statue-crown", name: "Statue of Liberty (Krone)", city: "nyc", cc: "US", tz: "America/New_York", window: { kind: "months", months: 6 }, approx: true, tip: "minutes", links: [L("Statue City Cruises", "https://www.statuecitycruises.com/")] },
  { id: "summit-one", name: "Summit One Vanderbilt (Sonnenuntergang)", city: "nyc", cc: "US", tz: "America/New_York", window: { kind: "asap", lead: 21 }, tip: "sunset", links: [L("Summit One Vanderbilt", "https://summitov.com/")] },
  { id: "alcatraz", name: "Alcatraz", city: "sf", cc: "US", tz: "America/Los_Angeles", window: { kind: "days", days: 90 }, links: [L("Alcatraz City Cruises", "https://www.cityexperiences.com/san-francisco/city-cruises/alcatraz/")] },
  { id: "antelope", name: "Antelope Canyon (geführte Tour)", city: "southwest", cc: "US", tz: "America/Phoenix", window: { kind: "months", months: 3 }, approx: true, tip: "tour", links: [L("Navajo Parks", "https://navajonationparks.org/")] },
  { id: "arches", name: "Arches National Park (Timed Entry)", city: "southwest", cc: "US", tz: "America/Denver", window: { kind: "monthly", day: 1, months: 3, time: "08:00" }, months: [4, 5, 6, 7, 8, 9, 10], links: [L("Recreation.gov", "https://www.recreation.gov/timed-entry/10088426")] },
  { id: "angels-landing", name: "Angels Landing (Permit-Verlosung)", city: "southwest", cc: "US", tz: "America/Denver", window: { kind: "asap", lead: 90 }, tip: "lottery", links: [L("NPS Zion", "https://www.nps.gov/zion/planyourvisit/angels-landing-hiking-permits.htm")] },
  { id: "half-dome", name: "Half Dome (Permit-Verlosung)", city: "yosemite", cc: "US", tz: "America/Los_Angeles", window: { kind: "yearly", month: 3, rule: "sameYear" }, months: [5, 6, 7, 8, 9, 10], tip: "lottery", links: [L("NPS Yosemite", "https://www.nps.gov/yose/planyourvisit/hdpermits.htm")] },
  { id: "moraine-lake", name: "Moraine Lake (Shuttle von Parks Canada)", city: "banff", cc: "CA", tz: "America/Edmonton", window: { kind: "asap", lead: 60 }, months: [6, 7, 8, 9, 10], links: [L("Parks Canada", "https://parks.canada.ca/pn-np/ab/banff")] },
  { id: "machu-picchu", name: "Machu Picchu (Eintritt, Huayna Picchu)", city: "cusco", cc: "PE", tz: "America/Lima", window: { kind: "asap", lead: 90 }, hint: "machu", links: [L("Ministerio de Cultura", "https://tuboleto.cultura.pe/")] },
  { id: "inca-trail", name: "Inka-Trail (Permits)", city: "cusco", cc: "PE", tz: "America/Lima", window: { kind: "yearly", month: 11, rule: "prevYear" }, tip: "permit", hint: "inca", links: [L("Machu Picchu (Ministerio de Cultura)", "https://www.machupicchu.gob.pe/")] },
  // Ozeanien
  { id: "milford-track", name: "Milford Track (Great Walk)", city: "fiordland", cc: "NZ", tz: "Pacific/Auckland", window: { kind: "yearly", month: 5, rule: "season" }, tip: "minutes", links: [L("DOC Great Walks", "https://www.doc.govt.nz/parks-and-recreation/places-to-go/fiordland/places/fiordland-national-park/things-to-do/tracks/milford-track/")] },
  { id: "hobbiton", name: "Hobbiton Movie Set", city: "waikato", cc: "NZ", tz: "Pacific/Auckland", window: { kind: "asap", lead: 30 }, links: [L("Hobbiton Tours", "https://www.hobbitontours.com/")] }
];

/* ---------- Verkaufsstart ---------- */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const shiftDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Ortszeit (Datum, Uhrzeit, Zeitzone) als Zeitpunkt */
export function zoned(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (t: number) => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t));
      const g = (k: string) => Number(parts.find(p => p.type === k)!.value);
      return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")) - t;
    } catch { return 0; }
  };
  const t1 = guess - offset(guess);
  return new Date(guess - offset(t1));
}

export interface Sale {
  /** Verkaufsstart (Ortsdatum und -zeit); fehlt bei „so früh wie möglich“ */
  date?: string;
  time?: string;
  /** nur Monat bekannt (jährliche Fenster) */
  monthOnly?: boolean;
  /** Zeitpunkt des Verkaufsstarts */
  at?: Date;
  /** spätestens buchen bis (Empfehlung bei „so früh wie möglich“) */
  by?: string;
}

/** Verkaufsstart für einen Besuch am Tag `visit` (JJJJ-MM-TT) */
export function saleFor(e: BookAhead, visit: string): Sale {
  const w = e.window, [y, m, d] = visit.split("-").map(Number);
  const at = (date: string, time = "00:00") => ({ date, time, at: zoned(date, time, e.tz) });
  switch (w.kind) {
    case "days": return at(shiftDays(visit, -w.days), w.time);
    case "months": {
      let mm = m - w.months, yy = y;
      while (mm < 1) { mm += 12; yy--; }
      const date = d <= daysIn(yy, mm) ? ymd(yy, mm, d) : (mm === 12 ? ymd(yy + 1, 1, 1) : ymd(yy, mm + 1, 1));
      return at(date, w.time);
    }
    case "monthly": {
      let mm = m - w.months, yy = y;
      while (mm < 1) { mm += 12; yy--; }
      return at(ymd(yy, mm, w.day), w.time);
    }
    case "weekly": {
      let date = shiftDays(visit, -7 * w.weeks);
      while (new Date(`${date}T00:00:00Z`).getUTCDay() !== w.weekday) date = shiftDays(date, -1);
      return at(date, w.time);
    }
    case "yearly": {
      const yy = w.rule === "prevYear" ? y - 1 : w.rule === "season" ? (m >= 7 ? y : y - 1) : y;
      return { date: ymd(yy, w.month, 1), monthOnly: true, at: zoned(ymd(yy, w.month, 1), "00:00", e.tz) };
    }
    case "asap": return { by: shiftDays(visit, -w.lead) };
  }
}

/** Orte, die für die Reise passen: Reiseziel erkannt (Flughafen oder Stichwort), Reisemonat passt */
export function bookAheadFor(text: string, aps: Set<string>, visit?: string): BookAhead[] {
  const month = visit ? Number(visit.slice(5, 7)) : 0;
  const cities = new Set(Object.entries(CITIES).filter(([, c]) => c.words.test(text) || (c.aps || []).some(a => aps.has(a))).map(([k]) => k));
  return BOOK_AHEAD.filter(e => cities.has(e.city) && (!e.months || !month || e.months.includes(month)));
}

/** Kalendereintrag (.ics) für den Verkaufsstart: 30 Minuten, Erinnerung 15 Minuten vorher */
export function icsFor(e: BookAhead, at: Date, summary: string, stamp = new Date()): string {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Split&Fly//Fruehbuchen//DE", "BEGIN:VEVENT",
    `UID:${e.id}-${z(at)}@splitandfly.com`, `DTSTAMP:${z(stamp)}`, `DTSTART:${z(at)}`, "DURATION:PT30M",
    `SUMMARY:${esc(summary)}`, `URL:${e.links[0]?.url || ""}`,
    "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${esc(summary)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
