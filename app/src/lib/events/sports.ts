/*
 * Sportkalender: große Sportevents außerhalb des Fußballs (Olympische Spiele, Weltmeisterschaften, Grand Slams,
 * Formel 1) und Rennen, bei denen man selbst starten kann (Marathons, Triathlon, Volksläufe auf Ski).
 * Ohne Schlüssel, in App und Such-Dienst gleich. Termine recherchiert im Oktober 2026 (Quellen: Veranstalter,
 * Verbände, Sportpresse); vorbei ist vorbei, neue Jahrgänge kommen von Hand dazu (siehe docs/EVENT.md).
 */
import type { EventHit, EventQuery } from "./types";

export type Sport = "multi" | "run" | "tri" | "bike" | "ski" | "tennis" | "motor" | "golf" | "hand" | "hockey" | "rugby" | "basket" | "nfl" | "athletics" | "darts";
export type Join = "open" | "lottery" | "qualify";
interface Where { city: string; cc: string; lat: number; lon: number; venue?: string }
export interface SportEvent extends Where {
  id: string;
  /** Name (englisch), deutsch falls anders */
  name: string;
  de?: string;
  sport: Sport;
  /** erster und letzter Tag (JJJJ-MM-TT) */
  start: string;
  end?: string;
  url: string;
  /** selbst starten: Anmeldung offen (solange Plätze frei), Losverfahren, nur mit Qualifikation */
  join?: Join;
  /** Termin noch vorläufig */
  tbc?: boolean;
  /** weitere Spielorte (Vorrunden): bei der Suche vor Ort zählt der nächste */
  venues?: Where[];
  /** weitere Suchwörter */
  words?: string;
}

export const TEAM: Sport[] = ["hand", "hockey", "rugby", "basket", "nfl"];
/** Auswahl in der Suche: Sportarten, Mannschaftssport, selbst mitmachen */
export const SPORT_FILTERS = ["multi", "join", "run", "tri", "bike", "ski", "tennis", "motor", "golf", "team", "athletics", "darts", "hand", "hockey", "rugby", "basket", "nfl"];

/** Suchwörter je Sportart, in den Sprachen der App */
const SPORT_WORDS: Record<Sport, string> = {
  multi: "olympia olympische spiele olympics olympic games jeux olympiques juegos olimpicos igrzyska olimpijskie олимпийские игры олимпиада الألعاب الأولمبية",
  run: "laufen lauf marathon running run course carrera maraton bieg бег марафон ultra trail ماراثون",
  tri: "triathlon ironman triatlon триатлон",
  bike: "radsport radrennen rad fahrrad cycling bike cyclisme velo ciclismo kolarstwo велоспорт велогонка",
  ski: "wintersport ski skisport winter sports sports d'hiver deportes de invierno sporty zimowe зимние лыжи esqui narciarstwo",
  tennis: "tennis tenis теннис grand slam",
  motor: "motorsport formel 1 formula 1 f1 grand prix autorennen racing course automobile automovilismo wyścigi гонки",
  golf: "golf гольф",
  hand: "handball balonmano piłka ręczna гандбол mannschaftssport team",
  hockey: "eishockey ice hockey hockey sur glace hockey hielo hokej хоккей mannschaftssport team",
  rugby: "rugby регби mannschaftssport team",
  basket: "basketball baloncesto koszykówka баскетбол mannschaftssport team",
  nfl: "american football nfl super bowl футбол американский mannschaftssport team",
  athletics: "leichtathletik athletics athletisme atletismo lekkoatletyka легкая атлетика",
  darts: "darts dart дартс"
};
/** „selbst mitmachen“ */
const JOIN_WORDS = "mitmachen selbst starten teilnehmen anmelden anmeldung startplatz join participate register inscription participar inscripcion udział zapisy участие регистрация";

const F1 = "https://www.formula1.com/en/racing/2026";
const MAJORS = "world marathon majors";

export const SPORTS: SportEvent[] = [
  // Olympische Spiele
  { id: "dakar26", name: "Youth Olympic Games Dakar 2026", de: "Olympische Jugendspiele Dakar 2026", sport: "multi", start: "2026-10-31", end: "2026-11-13", city: "Dakar", cc: "SN", lat: 14.7167, lon: -17.4677, url: "https://www.olympics.com/en/olympic-games/dakar-2026" },
  { id: "la28", name: "Olympic Games LA28", de: "Olympische Sommerspiele Los Angeles 2028", sport: "multi", start: "2028-07-14", end: "2028-07-30", city: "Los Angeles", cc: "US", lat: 34.0522, lon: -118.2437, url: "https://la28.org/", words: "sommerspiele summer" },
  { id: "la28p", name: "Paralympic Games LA28", de: "Paralympische Spiele Los Angeles 2028", sport: "multi", start: "2028-08-15", end: "2028-08-27", city: "Los Angeles", cc: "US", lat: 34.0522, lon: -118.2437, url: "https://la28.org/", words: "paralympics paralympische" },
  { id: "alps30", name: "Olympic Winter Games French Alps 2030", de: "Olympische Winterspiele Französische Alpen 2030", sport: "multi", start: "2030-02-01", end: "2030-02-17", city: "Nice", cc: "FR", lat: 43.7102, lon: 7.262, venue: "Nizza & Französische Alpen", url: "https://www.olympics.com/en/olympic-games/french-alps-2030", words: "winterspiele winter alpen alpes nizza briancon courchevel" },
  { id: "bne32", name: "Olympic Games Brisbane 2032", de: "Olympische Sommerspiele Brisbane 2032", sport: "multi", start: "2032-07-23", end: "2032-08-08", city: "Brisbane", cc: "AU", lat: -27.4698, lon: 153.0251, url: "https://www.olympics.com/en/olympic-games/brisbane-2032", words: "sommerspiele summer" },
  // Marathons (selbst starten)
  { id: "chi26", name: "Chicago Marathon 2026", sport: "run", start: "2026-10-11", city: "Chicago", cc: "US", lat: 41.8781, lon: -87.6298, url: "https://www.chicagomarathon.com/", join: "lottery", words: MAJORS },
  { id: "ams26", name: "Amsterdam Marathon 2026", sport: "run", start: "2026-10-18", city: "Amsterdam", cc: "NL", lat: 52.3676, lon: 4.9041, url: "https://www.tcsamsterdammarathon.eu/", join: "open" },
  { id: "fra26", name: "Frankfurt Marathon 2026", sport: "run", start: "2026-10-25", city: "Frankfurt am Main", cc: "DE", lat: 50.1109, lon: 8.6821, url: "https://www.frankfurt-marathon.com/", join: "open" },
  { id: "nyc26", name: "New York City Marathon 2026", sport: "run", start: "2026-11-01", city: "New York", cc: "US", lat: 40.7128, lon: -74.006, url: "https://www.nyrr.org/tcsnycmarathon", join: "lottery", words: MAJORS },
  { id: "ath26", name: "Athens Marathon 2026", de: "Athen-Marathon 2026", sport: "run", start: "2026-11-08", city: "Athens", cc: "GR", lat: 37.9838, lon: 23.7275, url: "https://www.athensauthenticmarathon.gr/", join: "open", words: "athen" },
  { id: "vlc26", name: "Valencia Marathon 2026", sport: "run", start: "2026-12-06", city: "Valencia", cc: "ES", lat: 39.4699, lon: -0.3763, url: "https://www.valenciaciudaddelrunning.com/en/marathon/", join: "open" },
  { id: "tyo27", name: "Tokyo Marathon 2027", sport: "run", start: "2027-03-07", city: "Tokyo", cc: "JP", lat: 35.6895, lon: 139.6917, url: "https://www.marathon.tokyo/en/", join: "lottery", words: `${MAJORS} tokio` },
  { id: "rom27", name: "Rome Marathon 2027", de: "Rom-Marathon 2027", sport: "run", start: "2027-03-14", city: "Rome", cc: "IT", lat: 41.9028, lon: 12.4964, url: "https://www.runromethemarathon.com/", join: "open", words: "rom roma" },
  { id: "par27", name: "Paris Marathon 2027", sport: "run", start: "2027-04-04", city: "Paris", cc: "FR", lat: 48.8566, lon: 2.3522, url: "https://www.schneiderelectricparismarathon.com/", join: "lottery" },
  { id: "vie27", name: "Vienna City Marathon 2027", sport: "run", start: "2027-04-18", city: "Vienna", cc: "AT", lat: 48.2082, lon: 16.3738, url: "https://www.vienna-marathon.com/", join: "open", words: "wien" },
  { id: "bos27", name: "Boston Marathon 2027", sport: "run", start: "2027-04-19", city: "Boston", cc: "US", lat: 42.3601, lon: -71.0589, url: "https://www.baa.org/", join: "qualify", words: MAJORS },
  { id: "lon27", name: "London Marathon 2027", sport: "run", start: "2027-04-24", end: "2027-04-25", city: "London", cc: "GB", lat: 51.5072, lon: -0.1276, url: "https://www.tcslondonmarathon.com/", join: "lottery", words: MAJORS },
  { id: "ham27", name: "Hamburg Marathon 2027", sport: "run", start: "2027-04-25", city: "Hamburg", cc: "DE", lat: 53.5511, lon: 9.9937, url: "https://www.haspa-marathon-hamburg.de/", join: "open" },
  { id: "cpt27", name: "Cape Town Marathon 2027", de: "Kapstadt-Marathon 2027", sport: "run", start: "2027-05-23", city: "Cape Town", cc: "ZA", lat: -33.9249, lon: 18.4241, url: "https://www.capetownmarathon.com/", join: "open", words: `${MAJORS} kapstadt` },
  { id: "com27", name: "Comrades Marathon 2027", sport: "run", start: "2027-06-13", city: "Durban", cc: "ZA", lat: -29.8587, lon: 31.0218, url: "https://comrades.com/", join: "open", words: "ultra pietermaritzburg" },
  { id: "syd27", name: "Sydney Marathon 2027", sport: "run", start: "2027-08-29", city: "Sydney", cc: "AU", lat: -33.8688, lon: 151.2093, url: "https://www.sydneymarathon.com/", join: "lottery", words: MAJORS },
  { id: "jun27", name: "Jungfrau Marathon 2027", sport: "run", start: "2027-09-10", end: "2027-09-11", city: "Interlaken", cc: "CH", lat: 46.6863, lon: 7.8632, url: "https://www.jungfrau-marathon.ch/", join: "open", words: "berglauf mountain" },
  { id: "ber27", name: "Berlin Marathon 2027", sport: "run", start: "2027-09-26", city: "Berlin", cc: "DE", lat: 52.52, lon: 13.405, url: "https://www.bmw-berlin-marathon.com/", join: "lottery", words: MAJORS },
  { id: "chi27", name: "Chicago Marathon 2027", sport: "run", start: "2027-10-10", city: "Chicago", cc: "US", lat: 41.8781, lon: -87.6298, url: "https://www.chicagomarathon.com/", join: "lottery", words: MAJORS },
  { id: "nyc27", name: "New York City Marathon 2027", sport: "run", start: "2027-11-07", city: "New York", cc: "US", lat: 40.7128, lon: -74.006, url: "https://www.nyrr.org/tcsnycmarathon", join: "lottery", words: MAJORS },
  // Triathlon
  { id: "kona26", name: "IRONMAN World Championship 2026", de: "Ironman-WM Hawaii 2026", sport: "tri", start: "2026-10-10", city: "Kailua-Kona", cc: "US", lat: 19.64, lon: -155.9969, url: "https://www.ironman.com/races/im-world-championship", join: "qualify", words: "hawaii kona" },
  { id: "roth27", name: "Challenge Roth 2027", sport: "tri", start: "2027-07-04", city: "Roth", cc: "DE", lat: 49.2453, lon: 11.0911, url: "https://www.challenge-roth.com/", join: "open", words: "langdistanz nürnberg nuremberg" },
  // Radsport
  { id: "tdf27", name: "Tour de France 2027", sport: "bike", start: "2027-07-02", end: "2027-07-25", city: "Edinburgh", cc: "GB", lat: 55.9533, lon: -3.1883, venue: "Grand Départ Edinburgh – Paris", url: "https://www.letour.fr/", words: "edinburg paris" },
  { id: "uci27", name: "UCI Cycling World Championships 2027", de: "Rad-WM Haute-Savoie 2027", sport: "bike", start: "2027-08-24", end: "2027-09-05", city: "Annecy", cc: "FR", lat: 45.8992, lon: 6.1294, venue: "Haute-Savoie Mont-Blanc", url: "https://www.uci.org/", words: "weltmeisterschaft wm world championships mont blanc" },
  // Wintersport
  { id: "4h-obe", name: "Four Hills Tournament: Oberstdorf", de: "Vierschanzentournee: Oberstdorf", sport: "ski", start: "2026-12-28", end: "2026-12-29", city: "Oberstdorf", cc: "DE", lat: 47.4099, lon: 10.2797, url: "https://www.vierschanzentournee.com/", words: "skispringen ski jumping" },
  { id: "4h-gap", name: "Four Hills Tournament: Garmisch-Partenkirchen", de: "Vierschanzentournee: Garmisch-Partenkirchen (Neujahrsspringen)", sport: "ski", start: "2026-12-31", end: "2027-01-01", city: "Garmisch-Partenkirchen", cc: "DE", lat: 47.4921, lon: 11.0955, url: "https://www.vierschanzentournee.com/", words: "skispringen ski jumping neujahr" },
  { id: "4h-ibk", name: "Four Hills Tournament: Innsbruck", de: "Vierschanzentournee: Innsbruck", sport: "ski", start: "2027-01-02", end: "2027-01-03", city: "Innsbruck", cc: "AT", lat: 47.2692, lon: 11.4041, url: "https://www.vierschanzentournee.com/", words: "skispringen ski jumping bergisel" },
  { id: "4h-bis", name: "Four Hills Tournament: Bischofshofen", de: "Vierschanzentournee: Bischofshofen", sport: "ski", start: "2027-01-05", end: "2027-01-06", city: "Bischofshofen", cc: "AT", lat: 47.4167, lon: 13.2167, url: "https://www.vierschanzentournee.com/", words: "skispringen ski jumping" },
  { id: "kitz27", name: "Hahnenkamm Races Kitzbühel 2027", de: "Hahnenkamm-Rennen Kitzbühel 2027", sport: "ski", start: "2027-01-22", end: "2027-01-24", city: "Kitzbühel", cc: "AT", lat: 47.4467, lon: 12.3925, url: "https://hahnenkamm.com/", words: "streif abfahrt downhill weltcup" },
  { id: "crans27", name: "FIS Alpine World Ski Championships 2027", de: "Alpine Ski-WM Crans-Montana 2027", sport: "ski", start: "2027-02-01", end: "2027-02-14", city: "Crans-Montana", cc: "CH", lat: 46.3117, lon: 7.4813, url: "https://www.cransmontana2027.ch/", words: "weltmeisterschaft wm world championships alpin" },
  { id: "ote27", name: "IBU Biathlon World Championships 2027", de: "Biathlon-WM Otepää 2027", sport: "ski", start: "2027-02-10", end: "2027-02-21", city: "Otepää", cc: "EE", lat: 58.0583, lon: 26.4961, url: "https://www.biathlonworld.com/", words: "biathlon weltmeisterschaft wm world championships" },
  { id: "falun27", name: "FIS Nordic World Ski Championships 2027", de: "Nordische Ski-WM Falun 2027", sport: "ski", start: "2027-02-24", end: "2027-03-07", city: "Falun", cc: "SE", lat: 60.6065, lon: 15.6355, url: "https://www.fis-ski.com/", words: "langlauf skispringen nordische kombination cross-country weltmeisterschaft wm world championships" },
  { id: "vasa27", name: "Vasaloppet 2027", sport: "ski", start: "2027-03-07", city: "Mora", cc: "SE", lat: 61.007, lon: 14.543, venue: "Sälen – Mora", url: "https://vasaloppet.se/en/", join: "open", words: "langlauf cross-country volkslauf" },
  { id: "eng27", name: "Engadin Skimarathon 2027", sport: "ski", start: "2027-03-14", city: "St. Moritz", cc: "CH", lat: 46.4908, lon: 9.8355, venue: "Maloja – S-chanf", url: "https://www.engadin-skimarathon.ch/", join: "open", words: "langlauf cross-country volkslauf engadin" },
  // Tennis
  { id: "atp26", name: "Nitto ATP Finals 2026", sport: "tennis", start: "2026-11-15", end: "2026-11-22", city: "Turin", cc: "IT", lat: 45.0703, lon: 7.6869, url: "https://www.nittoatpfinals.com/", words: "torino" },
  { id: "ao27", name: "Australian Open 2027", sport: "tennis", start: "2027-01-17", end: "2027-01-31", city: "Melbourne", cc: "AU", lat: -37.8213, lon: 144.9785, url: "https://ausopen.com/" },
  { id: "rg27", name: "Roland-Garros 2027", de: "French Open (Roland-Garros) 2027", sport: "tennis", start: "2027-05-23", end: "2027-06-06", city: "Paris", cc: "FR", lat: 48.847, lon: 2.249, url: "https://www.rolandgarros.com/", words: "french open" },
  { id: "wim27", name: "Wimbledon 2027", sport: "tennis", start: "2027-06-28", end: "2027-07-11", city: "London", cc: "GB", lat: 51.434, lon: -0.214, url: "https://www.wimbledon.com/" },
  { id: "uso27", name: "US Open 2027", sport: "tennis", start: "2027-08-29", end: "2027-09-12", city: "New York", cc: "US", lat: 40.7498, lon: -73.846, url: "https://www.usopen.org/" },
  // Motorsport
  { id: "f1-usa26", name: "F1 United States Grand Prix 2026", de: "Formel 1: Großer Preis der USA 2026", sport: "motor", start: "2026-10-23", end: "2026-10-25", city: "Austin", cc: "US", lat: 30.1328, lon: -97.6411, url: F1 },
  { id: "f1-mex26", name: "F1 Mexico City Grand Prix 2026", de: "Formel 1: Großer Preis von Mexiko 2026", sport: "motor", start: "2026-10-30", end: "2026-11-01", city: "Mexico City", cc: "MX", lat: 19.4042, lon: -99.0907, url: F1, words: "mexiko" },
  { id: "f1-bra26", name: "F1 São Paulo Grand Prix 2026", de: "Formel 1: Großer Preis von São Paulo 2026", sport: "motor", start: "2026-11-06", end: "2026-11-08", city: "São Paulo", cc: "BR", lat: -23.7036, lon: -46.6997, url: F1, words: "brasilien brazil interlagos" },
  { id: "f1-lv26", name: "F1 Las Vegas Grand Prix 2026", de: "Formel 1: Großer Preis von Las Vegas 2026", sport: "motor", start: "2026-11-19", end: "2026-11-21", city: "Las Vegas", cc: "US", lat: 36.1147, lon: -115.1728, url: F1 },
  { id: "f1-qat26", name: "F1 Qatar Grand Prix 2026", de: "Formel 1: Großer Preis von Katar 2026", sport: "motor", start: "2026-11-27", end: "2026-11-29", city: "Lusail", cc: "QA", lat: 25.49, lon: 51.4542, url: F1, words: "katar doha" },
  { id: "f1-abu26", name: "F1 Abu Dhabi Grand Prix 2026", de: "Formel 1: Großer Preis von Abu Dhabi 2026", sport: "motor", start: "2026-12-04", end: "2026-12-06", city: "Abu Dhabi", cc: "AE", lat: 24.4672, lon: 54.6031, url: F1, words: "yas marina" },
  { id: "lm27", name: "24 Hours of Le Mans 2027", de: "24 Stunden von Le Mans 2027", sport: "motor", start: "2027-06-09", end: "2027-06-13", city: "Le Mans", cc: "FR", lat: 47.956, lon: 0.207, url: "https://www.24h-lemans.com/", words: "24h langstrecke endurance wec" },
  // Golf
  { id: "mas27", name: "The Masters 2027", sport: "golf", start: "2027-04-08", end: "2027-04-11", city: "Augusta", cc: "US", lat: 33.503, lon: -82.023, url: "https://www.masters.com/" },
  { id: "open27", name: "The Open 2027", de: "The Open (British Open) 2027", sport: "golf", start: "2027-07-15", end: "2027-07-18", city: "St Andrews", cc: "GB", lat: 56.3398, lon: -2.7967, url: "https://www.theopen.com/", words: "british open st. andrews" },
  { id: "ryder27", name: "Ryder Cup 2027", sport: "golf", start: "2027-09-17", end: "2027-09-19", city: "Adare", cc: "IE", lat: 52.564, lon: -8.79, venue: "Adare Manor", url: "https://www.rydercup.com/", words: "limerick irland ireland" },
  // Mannschaftssport
  { id: "hb27", name: "IHF Men's Handball World Championship 2027", de: "Handball-WM 2027 in Deutschland", sport: "hand", start: "2027-01-13", end: "2027-01-31", city: "Köln", cc: "DE", lat: 50.9375, lon: 6.9603, venue: "LANXESS arena (Finale)", url: "https://www.ihf.info/", words: "weltmeisterschaft wm world championship cologne koeln",
    venues: [{ city: "München", cc: "DE", lat: 48.1351, lon: 11.582, venue: "SAP Garden" }, { city: "Stuttgart", cc: "DE", lat: 48.7758, lon: 9.1829, venue: "Porsche-Arena" }, { city: "Kiel", cc: "DE", lat: 54.3233, lon: 10.1228, venue: "Wunderino Arena" }, { city: "Magdeburg", cc: "DE", lat: 52.1205, lon: 11.6276, venue: "GETEC-Arena" }, { city: "Hannover", cc: "DE", lat: 52.3759, lon: 9.732, venue: "ZAG arena" }] },
  { id: "sb61", name: "Super Bowl LXI", sport: "nfl", start: "2027-02-14", city: "Inglewood", cc: "US", lat: 33.9535, lon: -118.3392, venue: "SoFi Stadium", url: "https://www.nfl.com/super-bowl/", tbc: true, words: "los angeles" },
  { id: "ih27", name: "IIHF Ice Hockey World Championship 2027", de: "Eishockey-WM 2027 in Deutschland", sport: "hockey", start: "2027-05-13", end: "2027-05-30", city: "Düsseldorf", cc: "DE", lat: 51.2277, lon: 6.7735, url: "https://www.iihf.com/", words: "weltmeisterschaft wm world championship",
    venues: [{ city: "Mannheim", cc: "DE", lat: 49.4875, lon: 8.466, venue: "SAP Arena" }, { city: "Gelsenkirchen", cc: "DE", lat: 51.5541, lon: 7.0676, venue: "Veltins-Arena (Eröffnungsspiel)" }] },
  { id: "fiba27", name: "FIBA Basketball World Cup 2027", de: "Basketball-WM Katar 2027", sport: "basket", start: "2027-08-27", end: "2027-09-12", city: "Doha", cc: "QA", lat: 25.2854, lon: 51.531, url: "https://www.fiba.basketball/", words: "weltmeisterschaft wm katar qatar" },
  { id: "rwc27", name: "Rugby World Cup 2027", de: "Rugby-WM Australien 2027", sport: "rugby", start: "2027-10-01", end: "2027-11-13", city: "Sydney", cc: "AU", lat: -33.847, lon: 151.063, venue: "Stadium Australia (Finale)", url: "https://www.rugbyworldcup.com/", words: "weltmeisterschaft wm australien australia",
    venues: [{ city: "Perth", cc: "AU", lat: -31.9505, lon: 115.8605 }, { city: "Brisbane", cc: "AU", lat: -27.4698, lon: 153.0251 }, { city: "Melbourne", cc: "AU", lat: -37.8136, lon: 144.9631 }, { city: "Adelaide", cc: "AU", lat: -34.9285, lon: 138.6007 }] },
  // Leichtathletik, Darts
  { id: "wch27", name: "World Athletics Championships Beijing 2027", de: "Leichtathletik-WM Peking 2027", sport: "athletics", start: "2027-09-10", end: "2027-09-19", city: "Beijing", cc: "CN", lat: 39.9929, lon: 116.3965, url: "https://worldathletics.org/", words: "peking weltmeisterschaft wm" },
  { id: "wdc27", name: "PDC World Darts Championship 2026/27", de: "Darts-WM 2026/27", sport: "darts", start: "2026-12-11", end: "2027-01-03", city: "London", cc: "GB", lat: 51.5942, lon: -0.131, venue: "Alexandra Palace", url: "https://www.pdc.tv/", words: "ally pally weltmeisterschaft wm" }
];

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

/** passt die Sportart zur Auswahl (Sportart, „team“ = Mannschaftssport, „join“ = selbst mitmachen)? */
export const sportMatches = (e: Pick<SportEvent, "sport" | "join">, s: string) => (s === "join" ? !!e.join : s === "team" ? TEAM.includes(e.sport) : e.sport === s);

/**
 * Treffer aus dem Sportkalender: Stichwort (alle Wörter müssen vorkommen), Sportart oder Ort (Umkreis macht search.ts);
 * ohne alles keine Treffer. Vorbei ist vorbei; mehrtägige Events zählen, solange sie laufen (Beginn dann der erste Tag im Zeitraum).
 */
export function searchSports(q: EventQuery, today = new Date().toISOString().slice(0, 10)): EventHit[] {
  const from = q.from && q.from > today ? q.from : today;
  const words = plain(q.q || "").split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2);
  if (!words.length && !q.sport && !q.city) return [];
  const near = q.lat != null && q.lon != null ? { lat: q.lat, lon: q.lon } : null;
  return SPORTS.filter(e => (e.end || e.start) >= from && (!q.to || e.start <= q.to))
    .filter(e => !q.sport || sportMatches(e, q.sport))
    .filter(e => {
      if (!words.length) return true;
      const hay = plain([e.name, e.de, e.city, e.venue, e.words, SPORT_WORDS[e.sport], e.join ? JOIN_WORDS : "", ...(e.venues || []).map(v => v.city)].filter(Boolean).join(" "));
      return words.every(w => hay.includes(w));
    })
    .map(e => {
      // vor Ort: der nächste Spielort (Vorrunde in München statt Finale in Köln)
      const at = near && e.venues ? [e as Where, ...e.venues].reduce((a, b) => (km(near, b) < km(near, a) ? b : a)) : e;
      const start = e.end && q.from && q.from > e.start ? q.from : e.start;
      return {
        id: `sp:${e.id}`, source: "sports", sourceName: "Sportkalender", name: (q.lang === "de" && e.de) || e.name, start,
        ...(e.end ? { end: e.end } : {}), city: at.city, cc: at.cc, lat: at.lat, lon: at.lon, ...(at.venue ? { venue: at.venue } : {}),
        url: e.url, sport: e.sport, ...(e.join ? { join: e.join } : {}), ...(e.tbc ? { tbc: true } : {})
      };
    });
}
