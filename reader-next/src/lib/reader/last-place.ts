/**
 * Where the reader last was in each book, kept in this browser (the old client kept the same in `user_history`). The
 * book page's "Continue Reading" resumes from it. Nothing leaves the device.
 *
 * @feature BOK-003 Start / Continue Reading button
 */
const KEY = "sefaria-reader:last-place";
type Places = Record<string, { ref: string; time: number }>;

const read = (): Places => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Places;
  } catch {
    return {};
  }
};

export function rememberPlace(book: string, ref: string): void {
  try {
    const all = read();
    all[book] = { ref, time: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private window or storage off: Continue Reading simply falls back to Start Reading */
  }
}

export const lastPlace = (book: string): string | undefined => read()[book]?.ref;
