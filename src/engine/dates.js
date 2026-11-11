// Calendar-day helpers. Everything uses the DEVICE'S LOCAL DATE as a
// "YYYY-MM-DD" string. Day math is done on those strings via UTC, so
// daylight-saving changes (23- or 25-hour days) can never skip or double a day.

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date of a moment, e.g. "2026-11-11". */
export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toUTC(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from a to b ("2026-11-10" → "2026-11-11" = 1). */
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function addDays(key, n) {
  const t = new Date(toUTC(key) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Monday of the week containing `key` (weeks run Monday–Sunday). */
export function weekStart(key) {
  const dow = new Date(toUTC(key)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

/** The last n dates ending today, oldest first. */
export function lastNDays(today, n) {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dayLetter(key) {
  return DAY_NAMES[new Date(toUTC(key)).getUTCDay()].slice(0, 1);
}
export function dayShort(key) {
  return DAY_NAMES[new Date(toUTC(key)).getUTCDay()];
}

/** "Nov 25" style label. */
export function prettyDate(key) {
  const d = new Date(toUTC(key));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
