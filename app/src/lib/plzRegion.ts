/*
 * Ferien-Region aus der Postleitzahl (#570): Bundesland zu einer deutschen PLZ, geschätzt. PLZ-Bereiche folgen den
 * Leitregionen der Post, nicht den Landesgrenzen; deshalb je erste zwei Ziffern das überwiegende Land, bekannte
 * Mischgebiete auf drei Ziffern verfeinert. Wo Bereiche über eine Landesgrenze gehen, heißt das Ergebnis „bitte prüfen“
 * (check), die Region bleibt je Familie änderbar. Andere Länder: ganzes Land (nur landesweite Ferien und Feiertage).
 */

/** erste zwei Ziffern → Land (ohne „DE-“) */
const TWO: Record<string, string> = {
  "01": "SN", "02": "SN", "03": "BB", "04": "SN", "06": "ST", "07": "TH", "08": "SN", "09": "SN",
  "10": "BE", "12": "BE", "13": "BE", "14": "BB", "15": "BB", "16": "BB", "17": "MV", "18": "MV", "19": "MV",
  "20": "HH", "21": "NI", "22": "HH", "23": "SH", "24": "SH", "25": "SH", "26": "NI", "27": "NI", "28": "HB", "29": "NI",
  "30": "NI", "31": "NI", "32": "NW", "33": "NW", "34": "HE", "35": "HE", "36": "HE", "37": "NI", "38": "NI", "39": "ST",
  "40": "NW", "41": "NW", "42": "NW", "44": "NW", "45": "NW", "46": "NW", "47": "NW", "48": "NW", "49": "NI",
  "50": "NW", "51": "NW", "52": "NW", "53": "NW", "54": "RP", "55": "RP", "56": "RP", "57": "NW", "58": "NW", "59": "NW",
  "60": "HE", "61": "HE", "63": "HE", "64": "HE", "65": "HE", "66": "SL", "67": "RP", "68": "BW", "69": "BW",
  "70": "BW", "71": "BW", "72": "BW", "73": "BW", "74": "BW", "75": "BW", "76": "BW", "77": "BW", "78": "BW", "79": "BW",
  "80": "BY", "81": "BY", "82": "BY", "83": "BY", "84": "BY", "85": "BY", "86": "BY", "87": "BY", "88": "BW", "89": "BW",
  "90": "BY", "91": "BY", "92": "BY", "93": "BY", "94": "BY", "95": "BY", "96": "BY", "97": "BY", "98": "TH", "99": "TH"
};
/** erste drei Ziffern, wo das Land vom überwiegenden abweicht */
const THREE: Record<string, string> = {
  "046": "TH", "140": "BE", "141": "BE", "172": "BB", "193": "BB",
  "210": "HH", "211": "HH", "214": "SH", "228": "SH", "229": "SH", "239": "MV",
  "275": "HB", "287": "NI", "288": "NI", "344": "NW", "364": "TH", "372": "HE", "373": "TH",
  "388": "ST", "389": "ST", "485": "NI", "494": "NW", "495": "NW", "534": "RP", "535": "RP", "575": "RP", "576": "RP",
  "637": "BY", "638": "BY", "639": "BY", "664": "RP", "665": "RP", "668": "RP", "669": "RP", "685": "HE", "686": "HE",
  "881": "BY", "892": "BY", "893": "BY", "894": "BY", "965": "TH", "978": "BW", "979": "BW"
};
/** Bereiche, die über eine Landesgrenze gehen: Ergebnis bitte prüfen */
const MIXED = new Set(["04", "06", "07", "14", "17", "19", "21", "22", "23", "27", "28", "34", "36", "37", "38", "48", "49", "53", "57", "63", "65", "66", "68", "69", "88", "89", "96", "97"]);

export interface PlzRegion { region: string; check: boolean }

/** Region („DE-NW“ bzw. „FR-“ für ein ganzes Land) zu Land und PLZ; unbekannt: undefined */
export function regionFromPlz(cc: string | undefined, plz: string | undefined): PlzRegion | undefined {
  const c = (cc || "DE").toUpperCase();
  if (c !== "DE") return /^[A-Z]{2}$/.test(c) ? { region: `${c}-`, check: false } : undefined;
  const p = (plz || "").trim();
  if (!/^\d{5}$/.test(p)) return undefined;
  const st = THREE[p.slice(0, 3)] || TWO[p.slice(0, 2)];
  return st ? { region: `DE-${st}`, check: MIXED.has(p.slice(0, 2)) } : undefined;
}

/** Region einer Familie: selbst gewählt, sonst aus der PLZ geschätzt */
export function householdRegion(h: { region?: string; plz?: string; cc?: string } | undefined): (PlzRegion & { guessed: boolean }) | undefined {
  if (h?.region) return { region: h.region, check: false, guessed: false };
  const r = regionFromPlz(h?.cc, h?.plz);
  return r ? { ...r, guessed: true } : undefined;
}
