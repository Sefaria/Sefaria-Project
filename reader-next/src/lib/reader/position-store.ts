/**
 * Where each panel was reading, per history entry, so back/forward puts the reader back (old reader: scroll
 * position persisted into history.state, atlas SHL-064/SHL-065/RTE-055). A position is the segment being read
 * and its distance from the top of the column — not a raw scrollTop, which means nothing once the column
 * holds different sections.
 *
 * Kept in memory and in sessionStorage (so a reload keeps the trail: history entry keys survive reloads).
 *
 * @feature SHL-065 Scroll position persistence in history
 * @feature SHL-064 Back/forward (popstate) restoration
 */
export interface SavedPosition {
  /** The segment the reader was on, e.g. "Genesis 1:8". */
  ref: string;
  /** Pixels from the top of the scrolling area to the top of that segment. */
  offset: number;
}

/** panel id → position */
export type EntryPositions = Record<string, SavedPosition>;

const STORAGE_KEY = "reader.positions";

export class PositionStore {
  private entries = new Map<string, EntryPositions>();

  constructor(
    private storage: Pick<Storage, "getItem" | "setItem"> | null = null,
    private max = 80,
  ) {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) for (const [k, v] of JSON.parse(raw) as [string, EntryPositions][]) this.entries.set(k, v);
    } catch {
      /* private mode or corrupt data: start empty */
    }
  }

  get(key: string | undefined): EntryPositions | undefined {
    return key ? this.entries.get(key) : undefined;
  }

  set(key: string | undefined, positions: EntryPositions): void {
    if (!key || Object.keys(positions).length === 0) return;
    this.entries.delete(key); // re-insert: most recently written last
    this.entries.set(key, positions);
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value as string);
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.entries]));
    } catch {
      /* quota or private mode: in-memory only */
    }
  }
}
