/*
 * Reiseideen auf Englisch (/en/trip-ideas/…): Übersetzung der Inhaltsseiten aus pages.ts, Schlüssel = deutscher slug.
 * Beträge, Kategorien und App-Link kommen aus der deutschen Seite; hier nur Texte (costs in derselben Reihenfolge).
 * Ändert sich der deutsche Text, hier mitziehen. Ohne Importe, damit Node die Datei direkt laden kann.
 */

export interface PageText {
  /** englischer slug unter /en/trip-ideas/ */
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string[];
  example: string;
  /** Texte der Zeilen in der Reihenfolge von Page.costs */
  costs: { label: string; note?: string }[];
  costNote?: string;
  tips: string[];
  faq: { q: string; a: string }[];
  /** Name der Reise in der App */
  name: string;
  /** Bildbeschreibung der Illustration */
  alt: string;
}

export const STAND_EN = "October 2026";

export const EN: Record<string, PageText> = {
  "gruppenreise-mallorca-kosten": {
    slug: "group-trip-mallorca-cost",
    title: "Group trip to Mallorca: cost per person",
    description: "How much does a group trip to Mallorca cost? Sample budget for 8 people with finca, flights and rental cars, plus tips on splitting the costs fairly.",
    h1: "Group trip to Mallorca: how much does it cost per person?",
    intro: [
      "Mallorca is ideal for groups: plenty of direct flights, fincas with a pool for 8 to 14 people and short distances between beaches, mountains and Palma.",
      "Most of the money goes on flights and accommodation. Book early and share a finca with several bathrooms, and you often pay less per person than in a hotel."
    ],
    example: "8 adults, 5 nights in June, finca with pool inland, flights from Germany, two rental cars",
    costs: [
      { label: "Return flight incl. luggage" },
      { label: "Finca with pool (5 nights, split 8 ways)" },
      { label: "Rental cars and fuel (2 cars, shared)" },
      { label: "Food and drinks (groceries and restaurants)" },
      { label: "Trips, beach club, boat tour" },
      { label: "Local tourist tax", note: "per night and person, depending on the accommodation" }
    ],
    tips: [
      "Flights to Palma are often cheaper from Tuesday to Thursday than at the weekend.",
      "Fincas often ask for a deposit and a final cleaning fee – include both in your budget straight away.",
      "Two rental cars are more flexible than a minibus; split the cost among everyone who rides along.",
      "May and late September are warm but much cheaper than July and August."
    ],
    faq: [
      { q: "How expensive is a week in Mallorca for a group?", a: "For a week with finca, flights and rental cars, expect around €900 to €1,600 per person in high season, and considerably less in the off-season." },
      { q: "How do we split the finca fairly?", a: "The simplest way is per person and night. Anyone staying for fewer nights or getting a room with a private bathroom pays proportionally less or more – Split&Fly works this out per person and per household." }
    ],
    name: "Group trip to Mallorca",
    alt: "Finca with pool, palm trees and the sea in Mallorca"
  },
  "gruppenreise-prag-kosten": {
    slug: "group-trip-prague-cost",
    title: "Group trip to Prague: cost per person",
    description: "Prague with friends or your club: sample budget for 10 people, 3 nights, with travel, accommodation, food and activities – plus tips on saving and splitting.",
    h1: "Group trip to Prague: how much does it cost per person?",
    intro: [
      "Prague is one of the most popular group destinations: easy to reach by train or long-distance bus, lots to see and much cheaper than cities like Amsterdam or Paris.",
      "It is a classic for stag and hen parties, club outings and birthday trips."
    ],
    example: "10 adults, 3 nights, travel by train or long-distance bus, two apartments in the Old Town",
    costs: [
      { label: "Train or long-distance bus, return" },
      { label: "Apartments (3 nights, shared)" },
      { label: "Food and drinks" },
      { label: "Activities (city tour, boat trip, escape room)" },
      { label: "Public transport (multi-day pass)" }
    ],
    tips: [
      "Booked early, saver train fares from Dresden, Berlin or Munich start at just a few euros.",
      "The Czech Republic uses the koruna; cards work almost everywhere, but avoid the exchange offices in the Old Town.",
      "For large groups, two neighbouring apartments are often cheaper than one huge one.",
      "Restaurants outside the Old Town are noticeably cheaper and less crowded."
    ],
    faq: [
      { q: "How much is a weekend in Prague per person?", a: "With travel, accommodation, food and some activities, you end up at around €250 to €520 per person for three nights." },
      { q: "Is it worth taking the car?", a: "Rarely for a large group: parking in the Old Town is expensive and scarce. Train, long-distance bus or a hired coach are usually more relaxed." }
    ],
    name: "Group trip to Prague",
    alt: "Prague Castle and Charles Bridge in the evening light"
  },
  "gruppenreise-amsterdam-kosten": {
    slug: "amsterdam-with-friends-cost",
    title: "Amsterdam with friends: cost per person",
    description: "How much does a city break to Amsterdam cost for a group? Sample budget for 6 people, 3 nights, with train, accommodation, museums and food.",
    h1: "Amsterdam with friends: how much does the trip cost per person?",
    intro: [
      "Amsterdam is close, easy to reach by train and perfect for a long weekend. It is not cheap, though: accommodation in particular costs a lot.",
      "Stay a little outside the centre and book museums in advance, and you save a good deal."
    ],
    example: "6 adults, 3 nights, travel by train, apartment or hotel outside the canal ring",
    costs: [
      { label: "Train, return" },
      { label: "Accommodation (3 nights, shared) incl. tourist tax" },
      { label: "Food and drinks" },
      { label: "Museums, canal cruise" },
      { label: "Public transport or rental bikes" }
    ],
    tips: [
      "The Rijksmuseum, Van Gogh Museum and Anne Frank House only work with time slots – book online early.",
      "Areas like Noord or Oost are well connected and cheaper than the centre.",
      "Bikes are the fastest way around; you can rent them for the whole group.",
      "Amsterdam's tourist tax is high – check whether it is already included in the price."
    ],
    faq: [
      { q: "How much money do you need for 3 days in Amsterdam?", a: "Expect around €475 to €860 per person including travel and accommodation; without accommodation it is about €60 to €100 per day." },
      { q: "Train or car?", a: "The train is usually more relaxed: parking in Amsterdam is very expensive. If you drive, a park-and-ride on the edge of the city is worth it." }
    ],
    name: "Amsterdam with friends",
    alt: "Colourful canal houses, canal, bicycle and tulips in Amsterdam"
  },
  "gruppenreise-barcelona-kosten": {
    slug: "group-trip-barcelona-cost",
    title: "Group trip to Barcelona: cost per person",
    description: "Barcelona as a group: sample budget for 8 people, 4 nights, with flights, apartment, Sagrada Família and beach – and tips on settling up fairly.",
    h1: "Group trip to Barcelona: how much does it cost per person?",
    intro: [
      "Barcelona combines big city and beach: Gaudí, tapas, nightlife and the sea in one place. There are plenty of large apartments for groups.",
      "The main costs are flights during the holidays and the tourist tax, which Barcelona charges per night and person."
    ],
    example: "8 adults, 4 nights in spring, flights from Germany, large apartment in Eixample or Gràcia",
    costs: [
      { label: "Return flight incl. luggage" },
      { label: "Apartment (4 nights, shared)" },
      { label: "Tourist tax", note: "per night and person, depending on the accommodation" },
      { label: "Food and drinks" },
      { label: "Tickets (Sagrada Família, Park Güell)" },
      { label: "Metro and bus" }
    ],
    tips: [
      "The Sagrada Família and Park Güell are often sold out days ahead – book tickets together with the trip.",
      "Check the apartment's official registration number; unregistered flats get cancelled at short notice.",
      "At lunchtime many restaurants offer a cheap set menu (menú del día).",
      "Watch out for pickpockets on the metro and on La Rambla."
    ],
    faq: [
      { q: "How much is a long weekend in Barcelona?", a: "For 4 nights with flights and an apartment, expect around €520 to €940 per person." },
      { q: "How do we settle tapas nights?", a: "One person pays and enters it as an expense. At the end, Split&Fly shows who owes whom how much – with as few transfers as possible." }
    ],
    name: "Group trip to Barcelona",
    alt: "Church towers, beach and sailing boat in Barcelona"
  },
  "gardasee-mehrere-familien-kosten": {
    slug: "lake-garda-several-families-cost",
    title: "Lake Garda with several families: cost",
    description: "Holiday home on Lake Garda with three families: what does a week cost per person and per family? Sample budget with car travel, house, food and day trips.",
    h1: "Lake Garda with several families: how much does a week cost?",
    intro: [
      "From southern Germany, Lake Garda is a day's drive away and has everything families want: beaches, theme parks, cycle paths and boat trips.",
      "A shared holiday home is often cheaper for several families than hotel rooms – as long as the costs are split fairly, even when children pay less."
    ],
    example: "3 families with 6 adults and 5 children, 7 nights in summer, holiday home with pool, travel in three cars",
    costs: [
      { label: "Travel by car (fuel, vignette, tolls, shared)" },
      { label: "Holiday home with pool (7 nights, split 11 ways)" },
      { label: "Tourist tax (children often free)" },
      { label: "Food and drinks" },
      { label: "Day trips (theme park, boat trip)" }
    ],
    costNote: "For a family with 2 adults and 2 children, that is roughly €2,200 to €3,700 for the week – depending on whether children pay a smaller share of the house and food.",
    tips: [
      "The north shore (Riva, Torbole) is sportier, the south shore (Lazise, Bardolino) flatter and closer to the theme parks.",
      "Budget for the Austrian vignette and Italian motorway tolls; many families split the travel costs per car.",
      "Agree in advance whether children count fully, half or not at all for the accommodation.",
      "Theme park tickets are usually cheaper online than at the gate."
    ],
    faq: [
      { q: "How do several families share a holiday home fairly?", a: "A common rule: adults pay in full, children a fixed share (for example half). If a family stays for fewer nights, they only pay for their nights. Split&Fly calculates each family with its nights and the price per person; you enter child prices with the offer, a fixed child share for flat rates is not available yet." },
      { q: "How much does the drive to Lake Garda cost?", a: "From southern Germany around €120 to €200 per car for fuel, vignette and tolls there and back, correspondingly more from further north." }
    ],
    name: "Lake Garda with families",
    alt: "Calm Lake Garda between mountains in the evening light, village with church tower and sailing boat"
  },
  "gruppenreise-kroatien-ferienhaus-kosten": {
    slug: "croatia-villa-with-friends-cost",
    title: "Croatia with friends: holiday villa cost",
    description: "Holiday villa in Istria for 10 people: what does a week in Croatia cost per person? Sample budget with travel, house, tourist tax, food and day trips.",
    h1: "Croatia with friends: how much does a week in a holiday villa cost?",
    intro: [
      "Istria and Dalmatia are popular for group holidays: houses with a pool, clear water and good food. Istria is an easy drive from southern Germany.",
      "Prices in Croatia have risen since it adopted the euro, but a villa for a big group is still an affordable way to travel together."
    ],
    example: "10 adults, 7 nights in summer, holiday villa with pool in Istria, travel in four cars",
    costs: [
      { label: "Travel by car (fuel, vignettes, tolls, shared)" },
      { label: "Holiday villa with pool (7 nights, split 10 ways)" },
      { label: "Tourist tax" },
      { label: "Food and drinks" },
      { label: "Day trips (boat tour, national park)" }
    ],
    tips: [
      "You need vignettes to drive through Austria and Slovenia; Croatia charges motorway tolls.",
      "In June and September it is warm, and the house is often 30 to 40 % cheaper than in August.",
      "Many houses ask for a cash deposit – agree in good time who pays it upfront.",
      "National parks such as Plitvice or Krka use timed tickets in high season."
    ],
    faq: [
      { q: "How much is a week in Croatia as a group?", a: "With car travel and a villa with pool, you are looking at around €640 to €1,160 per person." },
      { q: "Who pays for the drive?", a: "The fairest way is for the passengers of each car to split its fuel, vignettes and tolls. In Split&Fly you create one item per car for this." }
    ],
    name: "Croatia with friends",
    alt: "Old town with red roofs by the turquoise sea in Croatia"
  },
  "gruppenreise-lissabon-kosten": {
    slug: "group-trip-lisbon-cost",
    title: "Group trip to Lisbon: cost per person",
    description: "Lisbon as a group: sample budget for 6 people, 4 nights, with flights, apartment, a day trip to Sintra and food – plus tips on splitting fairly.",
    h1: "Group trip to Lisbon: how much does it cost per person?",
    intro: [
      "Lisbon is hilly, sunny and relaxed: viewpoints, trams, fado and beaches nearby. There are plenty of apartments in old buildings for groups.",
      "Compared with other Western European capitals, food is cheap, but central accommodation is in high demand."
    ],
    example: "6 adults, 4 nights in spring or autumn, flights from Germany, apartment in Alfama or Graça",
    costs: [
      { label: "Return flight incl. luggage" },
      { label: "Apartment (4 nights, shared)" },
      { label: "Tourist tax" },
      { label: "Food and drinks" },
      { label: "Day trips (Sintra, Belém)" },
      { label: "Public transport" }
    ],
    tips: [
      "Tram 28 is often packed – ride it early in the morning or walk.",
      "Suburban trains take you cheaply to Sintra and Cascais.",
      "Lisbon is steep: if you carry luggage, check the location and whether there is a lift.",
      "In spring and autumn the weather is pleasant and flights are cheaper."
    ],
    faq: [
      { q: "How much does a city break to Lisbon cost?", a: "For 4 nights with flights and an apartment, budget around €520 to €960 per person." },
      { q: "Do we need a car?", a: "Not in the city. Trains and buses are enough for trips to the coast; a rental car only pays off for the Algarve." }
    ],
    name: "Group trip to Lisbon",
    alt: "Yellow tram, colourful houses and red bridge in Lisbon"
  },
  "ferienhaus-daenemark-familien-kosten": {
    slug: "denmark-holiday-home-families-cost",
    title: "Denmark holiday home with families: cost",
    description: "Holiday home on Denmark's North Sea coast with three families: sample budget for a week with travel, house, electricity, food and trips – per person and family.",
    h1: "Holiday home in Denmark with several families: how much does a week cost?",
    intro: [
      "Large holiday homes with sauna and pool, wide beaches and a short drive from Germany: Denmark's North Sea coast is ideal for several families.",
      "On top of the rent there is often a separate charge for electricity, water and final cleaning. And because eating out in Denmark is expensive, most groups cook for themselves."
    ],
    example: "3 families with 6 adults and 6 children, 7 nights in the autumn holidays, pool house on the North Sea, travel in three cars",
    costs: [
      { label: "Travel by car (shared)" },
      { label: "Holiday home with pool (7 nights, split 12 ways)" },
      { label: "Electricity, water, final cleaning" },
      { label: "Food and drinks (mostly self-catered)" },
      { label: "Day trips (theme park, zoo, swimming pool)" }
    ],
    costNote: "For a family with 2 adults and 2 children, that is roughly €1,850 to €3,550 for the week.",
    tips: [
      "Many houses bill electricity by consumption – pool and sauna push the costs up.",
      "A big grocery shop in Germany before the border saves noticeably.",
      "Outside the summer holidays, large pool houses are often available for half the price.",
      "Bed linen and towels are not always included – bring them or book them."
    ],
    faq: [
      { q: "How much is a holiday home in Denmark for 12 people?", a: "Depending on season and amenities, around €1,800 to €4,000 per week, plus extra costs for electricity and cleaning." },
      { q: "How do we settle the groceries?", a: "Whoever does the shopping enters the receipt as an expense. At the end, Split&Fly balances everything – per family rather than per head, if that is what you want." }
    ],
    name: "Holiday home in Denmark",
    alt: "Wooden holiday home in the dunes with a lighthouse on the Danish North Sea coast"
  },
  "junggesellenabschied-kosten": {
    slug: "bachelor-party-cost",
    title: "Bachelor or bachelorette party: cost",
    description: "What does a bachelor or bachelorette party cost per person? Budget for 10 people in Hamburg, ideas for Prague and Mallorca, and covering the guest of honour.",
    h1: "Bachelor or bachelorette party: how much does it cost per person?",
    intro: [
      "A weekend stag or hen party is quickly planned – and quickly expensive. So that nobody overstretches, agree on a rough budget in advance and talk about it openly.",
      "It is usual for the group to cover the bride's or groom's share. That makes it slightly more expensive for everyone else."
    ],
    example: "10 adults, 2 nights in Hamburg, travel by train, hostel or apartment in St. Pauli",
    costs: [
      { label: "Train, return" },
      { label: "Accommodation (2 nights, shared)" },
      { label: "Activities (St. Pauli tour, escape room, boat trip)" },
      { label: "Food and drinks" },
      { label: "Share for the bride or groom (covered by the group)" }
    ],
    tips: [
      "Ask the group about their budget first and plan the activities around it, not the other way round.",
      "Cheaper abroad: Prague or Kraków are affordable, Mallorca pays off with early flights.",
      "One person pays upfront and everyone enters their expenses – that way nobody has to collect receipts.",
      "T-shirts and decorations easily add up to €20 to €30 per person; budget for them from the start."
    ],
    faq: [
      { q: "How much does a bachelor party cost on average?", a: "A weekend in Germany usually costs €250 to €600 per person, abroad with flights more like €400 to €900." },
      { q: "Does the bride or groom pay too?", a: "Usually not: the group splits their share. In Split&Fly you simply assign those items to the other people only." }
    ],
    name: "Bachelor party",
    alt: "Stretch limousine, champagne with a popping cork, disco ball and confetti at night"
  },
  "klassenfahrt-berlin-kosten": {
    slug: "school-trip-berlin-cost",
    title: "School trip to Berlin: cost per student",
    description: "How much does a school trip to Berlin cost? Sample budget for 25 students with train, youth hostel, activities and pocket money – per student.",
    h1: "School trip to Berlin: how much does it cost per student?",
    intro: [
      "Berlin is the school trip destination: the Bundestag, the Wall, museums – and much of it free or with student discounts.",
      "For parents, what matters most is that the price is fixed early and shared fairly. Teachers often travel on free places."
    ],
    example: "25 students and 2 teachers, 4 nights, travel by train (group fare), youth hostel with half board",
    costs: [
      { label: "Train, return (group fare)" },
      { label: "Youth hostel with breakfast and dinner (4 nights)" },
      { label: "Activities (guided tours, museums at student rates)" },
      { label: "Lunch and pocket money" },
      { label: "Public transport (group ticket)" }
    ],
    tips: [
      "You can visit the Bundestag and the Chancellery for free – but request dates months in advance.",
      "Book Deutsche Bahn group fares in good time; they are limited.",
      "Many museums are discounted or free for school classes.",
      "Agree on costs for teachers and free places beforehand so the price per child is right."
    ],
    faq: [
      { q: "How much does a school trip to Berlin cost per child?", a: "With train, youth hostel and activities, usually €260 to €430 for 4 nights, plus pocket money." },
      { q: "What is the best way to collect the money?", a: "With a fixed amount per child that is set early. Split&Fly shows the share per person, even if some children join for fewer days." }
    ],
    name: "School trip to Berlin",
    alt: "Brandenburg Gate and TV tower with a school class"
  },
  "familienurlaub-mehrere-familien-kosten": {
    slug: "holiday-with-several-families-cost",
    title: "Holiday with several families: split costs",
    description: "Holiday with several families: what does a Baltic Sea holiday home cost per family, and how do you split fairly when children pay less or someone leaves early?",
    h1: "Holiday with several families: how do you split the costs fairly?",
    intro: [
      "Into one big holiday home with friends' families: the children play together, the parents get more peace – and per family it is often cheaper than going alone.",
      "Arguments are usually only about money: do children pay in full? What if one family arrives later? Who paid for the shopping? Best to agree on the rules in advance."
    ],
    example: "2 families with 4 adults and 4 children, 7 nights in summer, holiday home on Usedom (Baltic Sea), travel in two cars",
    costs: [
      { label: "Travel by car (shared per car)" },
      { label: "Holiday home (7 nights, split 8 ways)" },
      { label: "Tourist tax (children often free)" },
      { label: "Food and drinks" },
      { label: "Day trips (swimming pool, boat, bikes)" }
    ],
    costNote: "For a family with 2 adults and 2 children, that is roughly €1,750 to €3,100 for the week.",
    tips: [
      "Agree beforehand how children count: fully, half or not at all – and from what age.",
      "If a family arrives later, they only pay the accommodation for their nights.",
      "Groceries go into a shared pot; personal extras are paid by each family.",
      "At the end, a few transfers are enough when all expenses are in one place."
    ],
    faq: [
      { q: "Do children pay for the accommodation?", a: "That is up to you. Often children pay half and toddlers nothing. Split&Fly calculates with age groups and shows the share per family." },
      { q: "Split per person or per family?", a: "For accommodation and food usually per person (with a child share), for things like the final cleaning often per family. Both can be set per item." }
    ],
    name: "Holiday with families",
    alt: "Baltic Sea beach with pier, beach chairs, sandcastle and families"
  },
  "skiurlaub-gruppe-oesterreich-kosten": {
    slug: "ski-trip-group-austria-cost",
    title: "Group ski trip: cost per person",
    description: "How much does a ski holiday in Austria cost for a group? Sample budget for 8 people, 6 nights, with chalet, ski pass, equipment and food.",
    h1: "Group ski trip: how much does a week in Austria cost?",
    intro: [
      "Hitting the slopes together and back to the chalet in the evening: skiing is best in a group – but not cheap. The biggest item is usually the ski pass.",
      "A chalet or large apartment for everyone saves money compared with hotel rooms and makes the evenings cosier."
    ],
    example: "8 adults, 6 nights in January, chalet in the Zillertal, 6-day ski pass, travel in two cars",
    costs: [
      { label: "Travel by car (fuel, vignette, shared)" },
      { label: "Chalet or apartment (6 nights, shared)" },
      { label: "6-day ski pass" },
      { label: "Ski and boot rental (for those without their own gear)" },
      { label: "Food, mountain huts and après-ski" },
      { label: "Local tourist tax" }
    ],
    tips: [
      "January after the holidays and March are cheaper than Christmas, carnival and Easter.",
      "Buying ski passes online in advance often saves a few percent and queuing.",
      "Reserve rental gear for the whole group in advance – often with a group discount.",
      "Non-skiers don't pay for a ski pass: assign that item only to the skiers."
    ],
    faq: [
      { q: "How much does a week of skiing cost per person?", a: "With chalet, ski pass and food, usually €940 to €1,620 per person, slightly less with your own equipment." },
      { q: "How do we split when not everyone skis?", a: "Only those who use them pay for the ski pass and rental. Everyone shares accommodation and groceries. In Split&Fly you choose for each item who is in." }
    ],
    name: "Group ski trip",
    alt: "Snowy mountains, chalet, gondola and skiers in Austria"
  },
  "festival-mit-freunden-kosten": {
    slug: "festival-with-friends-cost",
    title: "Festival with friends: cost per person",
    description: "How much does a festival weekend with friends cost? Example for 6 people with ticket, travel, camping and food – and how to settle up fairly.",
    h1: "Festival with friends: how much does the weekend cost per person?",
    intro: [
      "A big festival in Germany usually lasts three to four days. The ticket is the biggest item, plus travel, camping and food.",
      "Sharing tent, gazebo and barbecue and shopping together saves a lot – but you need to settle up properly afterwards."
    ],
    example: "6 adults, 4 days of camping at a big festival in Germany, travel in two cars",
    costs: [
      { label: "Festival ticket incl. camping" },
      { label: "Travel by car (shared)" },
      { label: "Shared gear (gazebo, barbecue, gas, shared)" },
      { label: "Food and drinks (groceries and stalls)" },
      { label: "Rubbish deposit and parking ticket" }
    ],
    tips: [
      "Tickets in the first sales phase are much cheaper.",
      "Plan the group shop in advance; drinks on site are expensive.",
      "Anyone bringing gear that everyone uses can enter a share as an expense.",
      "Parking tickets and rubbish deposits are often per car – split them among the passengers."
    ],
    faq: [
      { q: "How much money do you need for a festival?", a: "With ticket, travel and food, usually €360 to €650 per person for a long weekend." },
      { q: "How do we settle the shared shopping?", a: "Whoever pays enters the amount. Split&Fly spreads it across everyone and shows at the end who transfers what to whom." }
    ],
    name: "Festival with friends",
    alt: "Festival stage with lights, tents and a cheering crowd"
  },
  "vereinsreise-reisebus-kosten": {
    slug: "club-trip-by-coach-cost",
    title: "Club trip by coach: cost per person",
    description: "Club outing or team trip by coach: sample budget for 20 people to Hamburg with coach, hotel, musical and food – calculated per person.",
    h1: "Club trip by coach: how much does it cost per person?",
    intro: [
      "For clubs, teams and company groups, a hired coach is often the most convenient solution: everyone travels together and luggage is no problem.",
      "The coach price is for the whole bus. The more people come along, the cheaper it gets per person."
    ],
    example: "20 adults, 2 nights in Hamburg, hired coach from western Germany, hotel with double rooms, a musical",
    costs: [
      { label: "Coach with driver (split 20 ways)" },
      { label: "Hotel in a double room (2 nights)" },
      { label: "Musical or theatre" },
      { label: "Food and drinks" },
      { label: "Harbour cruise" }
    ],
    tips: [
      "Get quotes from several coach companies; the driver's driving and rest times also affect the price.",
      "With 30 instead of 20 people, the coach price per head drops by a third.",
      "Ask early for group allocations at hotels and musicals.",
      "A club subsidy can be entered as income and lowers everyone's share."
    ],
    faq: [
      { q: "How much does a coach cost for a club trip?", a: "For a weekend with around 1,000 km, about €1,800 to €2,800 for the whole coach, depending on size and season." },
      { q: "How do we split the coach fairly?", a: "Evenly among everyone on board. Anyone who only travels one way pays proportionally – this can be set per item." }
    ],
    name: "Club trip",
    alt: "Coach in front of the harbour, cranes and concert hall in Hamburg"
  },
  "kurztrip-wien-freunde-kosten": {
    slug: "weekend-vienna-with-friends-cost",
    title: "Weekend in Vienna with friends: cost",
    description: "City break with friends: how much does a long weekend in Vienna cost per person? Sample budget for 6 people with travel, apartment, food and activities.",
    h1: "Short trip with friends: how much is a weekend in Vienna?",
    intro: [
      "A weekend with friends in another city is the classic for birthdays and reunions. Vienna is easy to reach by night train, high-speed train or plane.",
      "Coffee houses, wine taverns and museums make the city varied – and with one apartment for everyone it stays affordable."
    ],
    example: "6 adults, 3 nights, travel by train or plane, apartment in a central district",
    costs: [
      { label: "Travel by train or plane" },
      { label: "Apartment (3 nights, shared)" },
      { label: "Local tourist tax" },
      { label: "Food and drinks" },
      { label: "Museums, Prater, wine tavern" },
      { label: "Public transport (72-hour ticket)" }
    ],
    tips: [
      "The night train saves a hotel night and is an experience for groups.",
      "Many museums have a cheaper evening or combined tickets.",
      "A wine tavern (Heuriger) on the edge of town is cheaper and cosier than places in the centre.",
      "Treating the birthday person? Then spread their share across everyone else."
    ],
    faq: [
      { q: "How much is a weekend in Vienna?", a: "With travel, apartment and food, usually €390 to €735 per person for three nights." },
      { q: "How do we treat someone?", a: "In Split&Fly, assign the costs only to those paying. The invited person stays on the trip but pays nothing." }
    ],
    name: "Weekend in Vienna",
    alt: "Giant Ferris wheel, St. Stephen's Cathedral and a Viennese melange coffee"
  }
};
