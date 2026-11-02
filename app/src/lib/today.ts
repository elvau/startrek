/** Heutiges Datum (JJJJ-MM-TT) in Ortszeit, nicht in UTC: nach Mitternacht ist es schon der neue Tag */
export const today = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
