import type { DatePrecision, DateType, ExpiryStatus } from "./types";

/** Local-time YYYY-MM-DD. We never use UTC here — "today" means the user's today. */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysISO(days: number, from: string = todayISO()): string {
  const [y, m, d] = from.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

/** Whole days from today until `iso`. Negative means it is already in the past. */
export function daysUntil(iso: string, from: string = todayISO()): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = iso.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

export function expiryStatus(
  iso: string | null,
  soonDays: number,
  from: string = todayISO(),
): ExpiryStatus {
  if (!iso) return "none";
  const days = daysUntil(iso, from);
  if (days < 0) return "expired";
  if (days <= soonDays) return "soon";
  return "fresh";
}

/** Human phrasing aimed at someone who does not want to do date arithmetic. */
export function expiryLabel(
  iso: string | null,
  from: string = todayISO(),
): string {
  if (!iso) return "No date";
  const days = daysUntil(iso, from);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) {
    const n = Math.abs(days);
    if (n < 7) return `${n} days ago`;
    if (n < 31) return `${Math.round(n / 7)} weeks ago`;
    return formatDate(iso);
  }
  if (days < 7) return `${days} days`;
  if (days < 14) return "Next week";
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return formatDate(iso);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDate(iso: string, precision: DatePrecision = "day"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const thisYear = new Date().getFullYear();
  if (precision === "month") return `${MONTHS[m - 1]} ${y}`;
  return y === thisYear ? `${d} ${MONTHS[m - 1]}` : `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatDateLong(
  iso: string,
  precision: DatePrecision = "day",
): string {
  const [y, m, d] = iso.split("-").map(Number);
  return precision === "month"
    ? `${MONTHS[m - 1]} ${y}`
    : `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Last day of the month a date falls in — where month-only dates are stored. */
export function endOfMonthISO(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return todayISO(new Date(y, m, 0));
}

/** "2026-09" from a full ISO date, for a native <input type="month">. */
export function toMonthValue(iso: string): string {
  return iso.slice(0, 7);
}

/** "2026-09" -> "2026-09-30". A month-only date means the end of that month. */
export function fromMonthValue(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return todayISO(new Date(y, m, 0));
}

/**
 * How the date reads on a row. Month-only dates deliberately never say
 * "3 days" — the packet didn't promise that much precision.
 */
export function expiryPhrase(
  iso: string | null,
  precision: DatePrecision,
  from: string = todayISO(),
): string {
  if (!iso) return "No date";
  if (precision === "month") {
    const days = daysUntil(iso, from);
    if (days < 0) return `End of ${formatDate(iso, "month")}`;
    return formatDate(iso, "month");
  }
  return expiryLabel(iso, from);
}

const PAST_WORD: Record<DateType, string> = {
  best_before: "Past its best",
  use_by: "Don't eat",
};

/** The headline a person needs when something is already over its date. */
export function overdueWord(type: DateType): string {
  return PAST_WORD[type];
}

/** Trims float noise: 1 -> "1", 1.5 -> "1.5", 0.30000000004 -> "0.3" */
export function formatQty(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** Measurements never pluralise; countable things do. */
const INVARIANT_UNITS = new Set(["g", "kg", "ml", "L", "pcs"]);

export function pluralUnit(unit: string, qty: number): string {
  if (qty === 1 || INVARIANT_UNITS.has(unit)) return unit;
  if (/(s|x|ch|sh)$/i.test(unit)) return `${unit}es`;
  return `${unit}s`;
}

export function formatRelativeTime(sqlDatetime: string): string {
  // SQLite's datetime('now') is UTC without a timezone marker.
  const then = new Date(`${sqlDatetime.replace(" ", "T")}Z`).getTime();
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.round(days / 7)}w ago`;
}
