// "Updated N ago" (contract C6 `UpdatedAt`). Live prints ReadMe's relative date ("Updated 5 months ago",
// `showExactDate=false`), which follows dayjs's `fromNow` thresholds. The server template prints the
// date; the client replaces it with this text.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** dayjs `fromNow` wording for a past instant ("a few seconds ago", "5 months ago", "a year ago"). */
export function relativeTime(then: Date, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - then.getTime());
  const seconds = Math.round(ms / SECOND);
  const minutes = Math.round(ms / MINUTE);
  const hours = Math.round(ms / HOUR);
  const days = Math.round(ms / DAY);
  // Months by calendar difference, as dayjs does, rounded.
  const months = Math.round(monthDiff(then, now));
  const years = Math.round(monthDiff(then, now) / 12);
  if (seconds < 45) return 'a few seconds ago';
  if (seconds < 90) return 'a minute ago';
  if (minutes < 45) return `${minutes} minutes ago`;
  if (minutes < 90) return 'an hour ago';
  if (hours < 22) return `${hours} hours ago`;
  if (hours < 36) return 'a day ago';
  if (days < 26) return `${days} days ago`;
  if (days < 46) return 'a month ago';
  if (days < 320) return `${Math.max(2, months)} months ago`;
  if (days < 548) return 'a year ago';
  return `${Math.max(2, years)} years ago`;
}

function monthDiff(a: Date, b: Date): number {
  const whole = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  const anchor = Date.UTC(
    a.getUTCFullYear(),
    a.getUTCMonth() + whole,
    a.getUTCDate(),
    a.getUTCHours(),
    a.getUTCMinutes()
  );
  const nextAnchor = Date.UTC(
    a.getUTCFullYear(),
    a.getUTCMonth() + whole + 1,
    a.getUTCDate(),
    a.getUTCHours(),
    a.getUTCMinutes()
  );
  const prevAnchor = Date.UTC(
    a.getUTCFullYear(),
    a.getUTCMonth() + whole - 1,
    a.getUTCDate(),
    a.getUTCHours(),
    a.getUTCMinutes()
  );
  const t = b.getTime();
  if (t < anchor) return whole - 1 + (t - prevAnchor) / (anchor - prevAnchor);
  return whole + (t - anchor) / (nextAnchor - anchor);
}

/** "Updated 5 months ago". */
export function updatedText(iso: string, now: Date = new Date()): string | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return `Updated ${relativeTime(then, now)}`;
}
