/** IATA-Code → Name für Anbieter, die nur den Code liefern (Travelpayouts); an einer Stelle gepflegt */
export const AIRLINES: Record<string, string> = {
  // Billigflieger (wie LOW_COST in addons.ts)
  FR: "Ryanair", RK: "Ryanair UK", AL: "Malta Air", RR: "Buzz",
  W6: "Wizz Air", W4: "Wizz Air Malta", W9: "Wizz Air UK",
  U2: "easyJet", EC: "easyJet Europe", DS: "easyJet Switzerland",
  VY: "Vueling", EW: "Eurowings", HV: "Transavia", TO: "Transavia France", V7: "Volotea",
  PC: "Pegasus", XQ: "SunExpress", LS: "Jet2", DY: "Norwegian", D8: "Norwegian Air Sweden",
  // Linienairlines Europa
  LH: "Lufthansa", LX: "Swiss", OS: "Austrian", SN: "Brussels Airlines", EN: "Air Dolomiti", "4U": "Germanwings",
  AF: "Air France", KL: "KLM", BA: "British Airways", IB: "Iberia", I2: "Iberia Express", UX: "Air Europa",
  TP: "TAP Air Portugal", AZ: "ITA Airways", SK: "SAS", AY: "Finnair", FI: "Icelandair", EI: "Aer Lingus",
  LO: "LOT Polish Airlines", OK: "Czech Airlines", OU: "Croatia Airlines", JU: "Air Serbia", A3: "Aegean Airlines",
  RO: "TAROM", FB: "Bulgaria Air", BT: "airBaltic", CY: "Cyprus Airways", KM: "Air Malta",
  // Golf und Türkei
  TK: "Turkish Airlines", EK: "Emirates", QR: "Qatar Airways", EY: "Etihad Airways", WY: "Oman Air",
  GF: "Gulf Air", KU: "Kuwait Airways", SV: "Saudia", FZ: "flydubai", G9: "Air Arabia", XY: "flynas",
  // weitere häufige
  DE: "Condor", X3: "TUIfly", TB: "TUI fly Belgium", OR: "TUI fly Netherlands", BY: "TUI Airways", "6H": "Israir",
  LY: "El Al", MS: "EgyptAir", AT: "Royal Air Maroc", TU: "Tunisair", AC: "Air Canada", AA: "American Airlines",
  DL: "Delta Air Lines", UA: "United Airlines"
};

/** Name zum Code; unbekannte Codes (und leere Angaben) bleiben, wie sie sind */
export const airlineName = (code: string): string => (code && AIRLINES[code.trim().toUpperCase()]) || code;
