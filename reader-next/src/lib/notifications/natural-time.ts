/**
 * The old `Sefaria.util.naturalTime(timeStamp)` (static/js/sefaria/util.js): the time since an epoch time stamp in its largest unit,
 * as humanize-duration 3.28 wrote it with `{units: [y, mo, w, d, h, m, s], largest: 1, round: true}` and the site's unit sizes
 * (a month is 30 days, a year 365) — "3 weeks", "1 day"; Hebrew "3 שבועות", "יום" is "1 יום". The notification and New Additions
 * lists put it in "<time> ago" / "לפני <time>".
 *
 * @feature NTF-002 Notification types and rendering
 */
const DAY = 86400;
const UNITS: readonly [Unit, number][] = [
  ["y", 365 * DAY],
  ["mo", 30 * DAY],
  ["w", 7 * DAY],
  ["d", DAY],
  ["h", 3600],
  ["m", 60],
  ["s", 1],
];
type Unit = "y" | "mo" | "w" | "d" | "h" | "m" | "s";

/** humanize-duration's "en" and "he" dictionaries. */
const WORDS: Record<"en" | "he", Record<Unit, (n: number) => string>> = {
  en: {
    y: (n) => `year${n === 1 ? "" : "s"}`,
    mo: (n) => `month${n === 1 ? "" : "s"}`,
    w: (n) => `week${n === 1 ? "" : "s"}`,
    d: (n) => `day${n === 1 ? "" : "s"}`,
    h: (n) => `hour${n === 1 ? "" : "s"}`,
    m: (n) => `minute${n === 1 ? "" : "s"}`,
    s: (n) => `second${n === 1 ? "" : "s"}`,
  },
  he: {
    y: (n) => (n === 1 ? "שנה" : "שנים"),
    mo: (n) => (n === 1 ? "חודש" : "חודשים"),
    w: (n) => (n === 1 ? "שבוע" : "שבועות"),
    d: (n) => (n === 1 ? "יום" : "ימים"),
    h: (n) => (n === 1 ? "שעה" : "שעות"),
    m: (n) => (n === 1 ? "דקה" : "דקות"),
    s: (n) => (n === 1 ? "שניה" : "שניות"),
  },
};

/** The old Util.epoch_time(): now in whole epoch seconds. */
export const epochNow = () => Math.round(Date.now() / 1000);

/**
 * humanize-duration's doHumanization with `largest: 1, round: true`: whole units from the largest down, the last one fractional;
 * then from the smallest up each piece is rounded and, below the largest occupied unit, folded into the next one up as a fraction.
 */
export function humanizeSeconds(seconds: number, lang: "en" | "he"): string {
  let rest = Math.abs(seconds);
  const pieces = UNITS.map(([unit, size], i) => {
    const count = i + 1 === UNITS.length ? rest / size : Math.floor(rest / size);
    rest -= count * size;
    return { unit, size, count };
  });
  const first = Math.max(0, pieces.findIndex((p) => p.count));
  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i]!;
    piece.count = Math.round(piece.count);
    if (i === 0) break;
    const previous = pieces[i - 1]!;
    const ratio = previous.size / piece.size;
    if (piece.count % ratio === 0 || i - first > 0) {
      previous.count += piece.count / ratio;
      piece.count = 0;
    }
  }
  const shown = pieces.find((p) => p.count);
  const { unit, count } = shown ?? { unit: "s" as Unit, count: 0 };
  return `${count} ${WORDS[lang][unit](count)}`;
}

/** "3 weeks ago" / "לפני 3 שבועות" (the lists' date: `${naturalTime(date)} ago`, `לפני ${naturalTime(date)}`). */
export function timeAgo(timeStamp: number, lang: "en" | "he", now = epochNow()): string {
  const span = humanizeSeconds(now - timeStamp, lang);
  return lang === "he" ? `לפני ${span}` : `${span} ago`;
}
