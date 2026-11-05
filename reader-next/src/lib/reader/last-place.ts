/**
 * Where the reader last was in each book, kept in this browser (the old client kept the same in `user_history`). The
 * book page's "Continue Reading" resumes from it. Nothing leaves the device.
 *
 * The places belong to whoever was reading (CODE_REVIEW R-29): a signed-in reader's places are not shown to the next person
 * on a shared machine after sign-out, nor a guest's to someone who signs in; a different reader starts afresh. At most
 * {@link MAX_BOOKS} books are kept (oldest go first), and a place is written when reading settles, not once per verse.
 *
 * @feature BOK-003 Start / Continue Reading button
 */
const KEY = "sefaria-reader:last-place";
export const MAX_BOOKS = 100;
const SETTLE_MS = 1500;

/** Who the places belong to: a user id, or null for a guest. */
export type PlaceOwner = number | null;
type Places = Record<string, { ref: string; time: number }>;
interface Stored {
  owner: PlaceOwner;
  places: Places;
}

const ownerKey = (o: PlaceOwner) => (o === null ? "guest" : `u${o}`);

function read(owner: PlaceOwner): Places {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | Places | null;
    // the first version kept the places alone, unowned: nobody can say whose they are, so they are not shown
    if (!raw || !("places" in raw) || typeof raw.places !== "object") return {};
    return ownerKey((raw as Stored).owner ?? null) === ownerKey(owner) ? (raw as Stored).places : {};
  } catch {
    return {};
  }
}

let pending: { owner: PlaceOwner; book: string; ref: string } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function flush(): void {
  clearTimeout(timer);
  timer = undefined;
  if (!pending) return;
  const { owner, book, ref } = pending;
  pending = null;
  try {
    const places = read(owner); // another reader's places are replaced, not merged
    places[book] = { ref, time: Date.now() };
    const kept = Object.entries(places).sort((a, b) => b[1].time - a[1].time).slice(0, MAX_BOOKS);
    localStorage.setItem(KEY, JSON.stringify({ owner, places: Object.fromEntries(kept) } satisfies Stored));
  } catch {
    /* private window or storage off: Continue Reading simply falls back to Start Reading */
  }
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flush);

/** Remember the place once reading settles there (a newer place replaces a pending one). */
export function rememberPlace(book: string, ref: string, owner: PlaceOwner): void {
  if (pending && pending.book !== book) flush();
  pending = { owner, book, ref };
  clearTimeout(timer);
  timer = setTimeout(flush, SETTLE_MS);
}

export function lastPlace(book: string, owner: PlaceOwner): string | undefined {
  if (pending && pending.book === book && ownerKey(pending.owner) === ownerKey(owner)) return pending.ref;
  return read(owner)[book]?.ref;
}

/** Test helper: write what is pending now. */
export const flushPlaces = flush;
