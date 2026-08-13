import type { DatePrecision, DateType } from "./types";

/**
 * Parser for GS1 element strings — the data carried by GS1-128, GS1 DataMatrix
 * and GS1 QR codes.
 *
 * A plain retail EAN/UPC carries a product identifier and nothing else, so it
 * can never tell you when an individual item expires. GS1 element strings can:
 * Application Identifier (17) is the use-by date and (15) is best before.
 * These are standard on pharmaceuticals and logistics labels, and GS1's
 * "Sunrise 2027" programme is bringing them to retail packs, so it's worth
 * reading them when they're there.
 */

/** Application Identifiers with a fixed-length data field. */
const FIXED_LENGTH: Record<string, number> = {
  "00": 18, // SSCC
  "01": 14, // GTIN
  "02": 14, // GTIN of contained trade items
  "03": 14,
  "04": 16,
  "11": 6, // production date
  "12": 6, // due date
  "13": 6, // packaging date
  "14": 6,
  "15": 6, // best before date
  "16": 6, // sell by date
  "17": 6, // expiration (use by) date
  "18": 6,
  "19": 6,
  "20": 2, // variant
  "31": 7,
  "32": 7,
  "33": 7,
  "34": 7,
  "35": 7,
  "36": 7,
  "41": 13,
};

/** The GS (group separator) character that terminates variable-length fields. */
const GS = "";

/** Symbology identifiers some scanners prefix to the raw data. */
const SYMBOLOGY_PREFIXES = ["]C1", "]e0", "]d2", "]Q3", "]J1"];

export type GS1Date = {
  iso: string;
  precision: DatePrecision;
};

export type GS1Result = {
  /** GTIN as encoded, 14 digits. */
  gtin?: string;
  /** GTIN reduced to the 13- or 12-digit form our product lookup uses. */
  barcode?: string;
  useBy?: GS1Date;
  bestBefore?: GS1Date;
  packagedOn?: GS1Date;
  lot?: string;
  serial?: string;
  /** Every AI found, for debugging and future use. */
  elements: Record<string, string>;
};

function stripSymbology(raw: string): string {
  for (const prefix of SYMBOLOGY_PREFIXES) {
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }
  return raw;
}

/**
 * GS1 dates are YYMMDD. A day of "00" means "end of this month" — which is
 * exactly the month-only case printed on so much packaging.
 */
export function parseGS1Date(value: string, today = new Date()): GS1Date | null {
  if (!/^\d{6}$/.test(value)) return null;

  const yy = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12) return null;

  // GS1 rule: the century is whichever puts the date within 50 years back and
  // 49 forward of the current year.
  const currentYear = today.getFullYear();
  const currentCentury = Math.floor(currentYear / 100) * 100;
  let year = currentCentury + yy;
  const difference = year - currentYear;
  if (difference > 49) year -= 100;
  else if (difference < -50) year += 100;

  const lastDayOfMonth = new Date(year, month, 0).getDate();
  if (day > lastDayOfMonth) return null;

  const precision: DatePrecision = day === 0 ? "month" : "day";
  const resolvedDay = day === 0 ? lastDayOfMonth : day;

  const iso = `${year}-${`${month}`.padStart(2, "0")}-${`${resolvedDay}`.padStart(2, "0")}`;
  return { iso, precision };
}

/** GTIN-14 -> the 13- or 12-digit code printed on retail packs. */
function gtinToBarcode(gtin: string): string {
  const trimmed = gtin.replace(/^0+/, "");
  if (trimmed.length <= 8) return trimmed.padStart(8, "0");
  if (trimmed.length <= 12) return trimmed.padStart(12, "0");
  return trimmed.padStart(13, "0");
}

/**
 * Returns null when the payload isn't a GS1 element string, so callers can fall
 * back to treating the scan as a plain retail barcode.
 */
export function parseGS1(raw: string): GS1Result | null {
  const data = stripSymbology(raw.trim());
  if (data.length < 4) return null;

  const elements: Record<string, string> = {};
  let cursor = 0;
  let matched = 0;

  while (cursor < data.length) {
    // Variable-length fields end at a GS; skip any that start one.
    if (data[cursor] === GS) {
      cursor += 1;
      continue;
    }

    const two = data.slice(cursor, cursor + 2);
    if (!/^\d{2}$/.test(two)) break;

    // 31nn–36nn encode measurements; the fourth digit is the decimal position.
    const isMeasurement = FIXED_LENGTH[two] !== undefined && two >= "31" && two <= "36";
    const aiLength = isMeasurement ? 4 : 2;
    const ai = data.slice(cursor, cursor + aiLength);
    cursor += aiLength;

    const fixed = FIXED_LENGTH[two];
    let value: string;

    if (fixed !== undefined) {
      value = data.slice(cursor, cursor + fixed);
      if (value.length < fixed) break;
      cursor += fixed;
    } else {
      const end = data.indexOf(GS, cursor);
      value = end === -1 ? data.slice(cursor) : data.slice(cursor, end);
      cursor = end === -1 ? data.length : end + 1;
    }

    if (!value) break;
    elements[ai] = value;
    matched += 1;
  }

  // A bare "01" + 14 digits is the minimum that's meaningfully GS1; anything
  // less is almost certainly a plain barcode that happens to start with digits.
  if (matched === 0 || (!elements["01"] && !elements["17"] && !elements["15"])) {
    return null;
  }

  const result: GS1Result = { elements };

  if (elements["01"]) {
    result.gtin = elements["01"];
    result.barcode = gtinToBarcode(elements["01"]);
  }
  if (elements["17"]) {
    const parsed = parseGS1Date(elements["17"]);
    if (parsed) result.useBy = parsed;
  }
  if (elements["15"]) {
    const parsed = parseGS1Date(elements["15"]);
    if (parsed) result.bestBefore = parsed;
  }
  if (elements["13"]) {
    const parsed = parseGS1Date(elements["13"]);
    if (parsed) result.packagedOn = parsed;
  }
  if (elements["10"]) result.lot = elements["10"];
  if (elements["21"]) result.serial = elements["21"];

  return result;
}

/** The date to prefill, preferring use-by because it's the safety one. */
export function dateFromGS1(
  result: GS1Result,
): { iso: string; precision: DatePrecision; type: DateType } | null {
  if (result.useBy) {
    return { ...result.useBy, type: "use_by" };
  }
  if (result.bestBefore) {
    return { ...result.bestBefore, type: "best_before" };
  }
  return null;
}

/** True when a scanned string is worth trying to parse as GS1. */
export function looksLikeGS1(raw: string): boolean {
  if (raw.includes(GS)) return true;
  if (SYMBOLOGY_PREFIXES.some((p) => raw.startsWith(p))) return true;
  // "01" + a 14-digit GTIN, with something after it.
  return /^01\d{14}.+/.test(raw.trim());
}
