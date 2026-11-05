/**
 * The reader state API over a host (docs/READER_STATE_API.md, "The API"): read the whole state, put the reader into a given state, and
 * report every change the person makes — never one an apply made.
 *
 * Telling the two apart is the point of the **apply window**: applying causes the same router events and slice notifications as the
 * person acting, so `applySnapshot` opens a window before it navigates and closes it one scheduled tick after the last slice applied
 * (late notifications, such as a React re-render, land inside it). Subscribers ignore everything inside the window and take a new
 * baseline when it closes, so applied state is never reported as a change. Input from the person during the window aborts it: what
 * happens after is theirs.
 *
 * Applies do not overlap: a newer applySnapshot **supersedes** an older one still running (a follower retargeted to a new leader, a
 * replay exited mid-apply), which stops at its next step, so two applies never land on the reader at once. Both an abort and a
 * supersession fire the AbortSignal the API puts on each slice's ApplyContext, for slices that keep working after apply returns.
 *
 * After the window closes, a **settling tail** lasts until the person's next input (at most {@link SETTLE_TAIL_MS}): changes in it are
 * still the apply's echo and are absorbed into the baseline, not reported. The reader reacts to an applied scroll position by settling
 * its URL (a replace, SETTLE_MS later) and the address canonicalizes after a navigation — without the tail those arrive after the window
 * and a follower would "break away" from every move it was shown. Every change the person makes starts with input (pointer, wheel, key,
 * touch, back/forward), which ends the tail first.
 */
import type {
  ApplyContext,
  ApplyResult,
  ReaderHost,
  ReaderSnapshot,
  ReaderStateApi,
  RestoreWarning,
  SliceFilter,
  SliceValue,
  SnapshotChange,
  StateSlice,
} from "./types";
import { WARNING } from "./types";
import { diff, isEmptyChange } from "./diff";
import { cloneJson, jsonEqual } from "./json";
import { parseSnapshot } from "./schema";

/**
 * The next animation frame where there are frames (at most one report per frame), else a microtask (Node, a test DOM). Raced with a
 * 100 ms timer: a page that is not painting (a background tab, a hidden pane) gets no frames, and a follower or a replay there must not
 * stall.
 */
export function defaultSchedule(cb: () => void): void {
  if (typeof requestAnimationFrame !== "function") return queueMicrotask(cb);
  frameOrTimeout(cb);
}

/** cb once, at the next animation frame or after `ms`, whichever comes first. */
export function frameOrTimeout(cb: () => void, ms = 100): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cb();
  };
  requestAnimationFrame(run);
  setTimeout(run, ms);
}

/** Does this slice pass the filter? Exported for the stream writer and recorder, which filter the same way. */
export function sliceInFilter(slice: Pick<StateSlice, "id" | "scope">, filter?: SliceFilter): boolean {
  if (!filter) return true;
  if (filter.scope === "moment" && slice.scope !== "moment") return false;
  if (filter.include && !filter.include.includes(slice.id)) return false;
  if (filter.exclude && filter.exclude.includes(slice.id)) return false;
  return true;
}

/** undefined and null both mean "no history state"; a host may report either. */
function navEqual(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null) || jsonEqual(a, b);
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** How long after an apply, at most, changes without the person's input are still counted as the apply's echo. */
export const SETTLE_TAIL_MS = 2000;

const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createReaderStateApi(host: ReaderHost): ReaderStateApi {
  const schedule = host.schedule ? (cb: () => void) => host.schedule!(cb) : defaultSchedule;

  // ── The apply window ──
  let windowOpen = false;
  /**
   * Bumped when local input aborts the window and when a new apply starts: applies started before it stop at their next step (local
   * input: the person took over; a new apply: it supersedes them).
   */
  let abortGeneration = 0;
  let inFlight = 0;
  /** The running applies' signals, aborted with each bump of abortGeneration. */
  const running = new Set<AbortController>();
  const abortRunning = () => {
    for (const c of running) c.abort();
    running.clear();
  };
  /** Subscribers re-baseline when the window closes (or is aborted). */
  const onWindowClosed = new Set<() => void>();

  const closeWindow = () => {
    windowOpen = false;
    tailUntil = clock() + SETTLE_TAIL_MS;
    for (const cb of [...onWindowClosed]) cb();
  };
  /** End of the settling tail (clock ms); 0 when there is none. */
  let tailUntil = 0;
  const inTail = () => tailUntil !== 0 && clock() < tailUntil;

  const localInputListeners = new Set<() => void>();
  host.onLocalInput(() => {
    if (windowOpen) {
      abortGeneration++;
      abortRunning();
      closeWindow();
    }
    tailUntil = 0; // what happens now is the person's
    for (const cb of [...localInputListeners]) {
      try {
        cb();
      } catch (err) {
        console.error("[reader-state] local input listener failed", err);
      }
    }
  });

  function getSnapshot(filter?: SliceFilter): ReaderSnapshot {
    const location = host.getLocation();
    const slices: Record<string, SliceValue> = {};
    for (const slice of host.slices.list()) {
      if (!sliceInFilter(slice, filter)) continue;
      try {
        // A detached copy: the slice may mutate the object it returned, and a snapshot taken must stay as it was.
        slices[slice.id] = { v: slice.version, value: cloneJson(slice.get()) };
      } catch (err) {
        console.error(`[reader-state] slice ${slice.id} could not be read`, err);
      }
    }
    let nav: unknown;
    try {
      nav = cloneJson(location.nav);
    } catch {
      nav = undefined;
    }
    return { v: 1, url: location.url, nav, slices };
  }

  /** Turns an incoming slice value into the slice's current shape, or explains why not. */
  function acceptValue(slice: StateSlice, sv: SliceValue): { ok: true; value: unknown } | { ok: false; detail: string } {
    let value = sv.value;
    if (sv.v > slice.version) return { ok: false, detail: `version ${sv.v} is newer than ${slice.version}` };
    if (sv.v < slice.version) {
      if (!slice.migrate) return { ok: false, detail: `version ${sv.v} cannot be migrated to ${slice.version}` };
      let migrated: unknown;
      try {
        migrated = slice.migrate(value, sv.v);
      } catch (err) {
        return { ok: false, detail: `migrate threw: ${errorDetail(err)}` };
      }
      if (migrated === undefined) return { ok: false, detail: `migrate declined version ${sv.v}` };
      value = migrated;
    }
    if (slice.validate) {
      let valid = false;
      try {
        valid = slice.validate(value);
      } catch {
        valid = false;
      }
      if (!valid) return { ok: false, detail: "failed validation" };
    }
    return { ok: true, value };
  }

  async function applySnapshot(raw: ReaderSnapshot, ctx: ApplyContext): Promise<ApplyResult> {
    const warnings: RestoreWarning[] = [];
    // Never trust the shape: this may come straight from a room, a peer page or a file.
    const snapshot = parseSnapshot(raw);
    if (!snapshot) {
      // No code fits "the whole snapshot is malformed"; URL_REFUSED is the nearest (nothing is navigated to). See contractIssues.
      return { warnings: [{ code: WARNING.URL_REFUSED, detail: "invalid snapshot" }] };
    }

    // Supersede any apply still running: it stops at its next step and its slices' signals fire.
    abortRunning();
    const generation = ++abortGeneration;
    const live = () => generation === abortGeneration;
    const controller = new AbortController();
    running.add(controller);
    const sliceCtx: ApplyContext = { origin: ctx.origin, persist: ctx.persist, signal: controller.signal };
    windowOpen = true;
    inFlight++;
    try {
      const target = snapshot.url;
      if (!host.acceptsUrl(target)) {
        warnings.push({ code: WARNING.URL_REFUSED, detail: target });
      } else {
        const here = host.getLocation();
        if (here.url !== target || !navEqual(here.nav, snapshot.nav)) {
          try {
            // Replace: an applied state must not fill the person's back button with someone else's moves.
            await host.navigate(target, snapshot.nav, "replace");
          } catch (err) {
            warnings.push({ code: WARNING.URL_REFUSED, detail: `navigation failed: ${errorDetail(err)}` });
          }
        }
      }
      if (!live()) return { warnings };
      try {
        await host.settled();
      } catch (err) {
        console.error("[reader-state] host.settled() failed", err);
      }

      const known: { slice: StateSlice; value: unknown; order: number; index: number }[] = [];
      let index = 0;
      for (const id of Object.keys(snapshot.slices)) {
        const sv = snapshot.slices[id]!;
        const slice = host.slices.get(id);
        if (!slice) {
          warnings.push({ code: WARNING.SLICE_UNKNOWN, slice: id });
          continue;
        }
        const accepted = acceptValue(slice, sv);
        if (!accepted.ok) {
          warnings.push({ code: WARNING.SLICE_REJECTED, slice: id, detail: accepted.detail });
          continue;
        }
        known.push({ slice, value: accepted.value, order: slice.applyOrder ?? 0, index: index++ });
      }
      known.sort((a, b) => a.order - b.order || a.index - b.index);

      for (const { slice, value } of known) {
        if (!live()) break; // the person took over: leave the rest as they are
        try {
          await slice.apply(value, sliceCtx);
        } catch (err) {
          warnings.push({ code: WARNING.SLICE_FAILED, slice: slice.id, detail: errorDetail(err) });
        }
      }
      return { warnings };
    } finally {
      running.delete(controller);
      inFlight--;
      // Whichever apply finishes last closes the window (a superseded one may finish after the one that replaced it). After an abort
      // by local input the window is already closed, and the check below finds it so.
      if (inFlight === 0) {
        // One tick later: notifications the apply caused but that arrive late (a re-render, a scroll event) still fall inside.
        schedule(() => {
          if (inFlight === 0 && windowOpen) closeWindow();
        });
      }
    }
  }

  function subscribe(onChange: (change: SnapshotChange, snapshot: ReaderSnapshot) => void, filter?: SliceFilter): () => void {
    let closed = false;
    let scheduled = false;
    let last = getSnapshot(filter);

    const flush = () => {
      scheduled = false;
      if (closed || windowOpen) return;
      const now = getSnapshot(filter);
      const change = diff(last, now);
      if (isEmptyChange(change)) return;
      last = now;
      if (inTail()) return; // the apply's echo, absorbed
      try {
        onChange(change, now);
      } catch (err) {
        console.error("[reader-state] subscriber failed", err);
      }
    };
    const onEvent = () => {
      if (closed || windowOpen) return;
      if (!scheduled) {
        scheduled = true;
        schedule(flush);
      }
    };
    const rebaseline = () => {
      if (!closed) last = getSnapshot(filter);
    };

    // Slice subscriptions follow the registry: a slice registered later is listened to, an unregistered one let go.
    const sliceSubs = new Map<StateSlice, () => void>();
    const wireSlices = () => {
      const current = new Set(host.slices.list().filter((s) => sliceInFilter(s, filter)));
      for (const [slice, unsub] of sliceSubs) {
        if (!current.has(slice)) {
          unsub();
          sliceSubs.delete(slice);
        }
      }
      for (const slice of current) {
        if (!sliceSubs.has(slice)) sliceSubs.set(slice, slice.subscribe(onEvent));
      }
    };
    wireSlices();
    const unsubRegistry = host.slices.onChange(() => {
      wireSlices();
      onEvent(); // a slice appearing or going is itself a change of the snapshot
    });
    const unsubLocation = host.onLocationChange(onEvent);
    onWindowClosed.add(rebaseline);

    return () => {
      if (closed) return;
      closed = true;
      unsubLocation();
      unsubRegistry();
      for (const unsub of sliceSubs.values()) unsub();
      sliceSubs.clear();
      onWindowClosed.delete(rebaseline);
    };
  }

  return {
    getSnapshot,
    applySnapshot,
    subscribe,
    onLocalInput(cb) {
      localInputListeners.add(cb);
      return () => {
        localInputListeners.delete(cb);
      };
    },
    get applying() {
      return windowOpen;
    },
  };
}
