const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** "Oct 8, 2026", always in UTC so it doesn't shift with the viewer's timezone. */
export function formatDate(date: Date): string {
  return DATE_FORMAT.format(date);
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
];

/**
 * Trims the text and removes quote marks that wrap all of it (straight or curly), so
 * we can add our own. A lone quote or apostrophe at one end is left alone.
 */
export function stripWrappingQuotes(text: string): string {
  let out = text.trim();
  for (let again = true; again;) {
    const unwrapped = QUOTE_PAIRS.find(
      ([open, close]) => out.length >= 2 && out.startsWith(open) && out.endsWith(close)
    );
    again = unwrapped !== undefined;
    if (unwrapped) out = out.slice(1, -1).trim();
  }
  return out;
}
