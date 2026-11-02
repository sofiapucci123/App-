// Plain calendar-date helpers. Dates are "YYYY-MM-DD" strings in the user's local calendar;
// the browser sends its own "today" so the server never guesses a time zone.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}

export function addMonths(s: string, n: number) {
  const d = parseDate(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmtDate(d);
}

export function monthOf(s: string) {
  return s.slice(0, 7);
}

export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return fmtDate(new Date(Date.UTC(y, m, 0)));
}

/** Every month from the month of `from` through the month of `to`, as "YYYY-MM". */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
