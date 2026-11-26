/** Local-date helpers shared by the streak, plans and flashcards. Keys are `YYYY-MM-DD` in local time. */

const pad = n => String(n).padStart(2, '0');

/** `YYYY-MM-DD` for a Date (local time) or an existing key. */
export function dayKey(d = new Date()) {
  if (typeof d === 'string') { return d.slice(0, 10); }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight Date for a day key. */
export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a, b) {
  const ms = fromDayKey(dayKey(b)) - fromDayKey(dayKey(a));
  return Math.round(ms / 86400000);
}

export function isValidDayKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(fromDayKey(key).getTime());
}
