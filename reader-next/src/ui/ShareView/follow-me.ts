/**
 * The seam between Share's "Follow me" entry (a ui component, which must not reach into features) and the follow controller that does the
 * work (src/features/reader-state/follow). The controller registers itself here once it runs in the browser; ShareView reads whatever is
 * registered. Nothing registered — the server, a story, an isolated test — means no entry, unless a source is passed in as a prop.
 *
 * A module-level slot rather than a context: ShareView sits deep in the connections panel, the controller is mounted beside the app by
 * the reader state provider, and neither owns a common ancestor to put a provider in.
 */
import { useSyncExternalStore } from "react";

export interface FollowMeState {
  /** idle: not sharing; starting: the room is opening; sharing: this tab leads a session. "busy" means joined to someone else's. */
  status: "idle" | "starting" | "sharing" | "busy";
  /** How many others are following (sharing only). */
  following: number;
}

export interface FollowMeSource {
  getState(): FollowMeState;
  subscribe(cb: () => void): () => void;
  /** Open a session and lead it. */
  start(): void;
  /** End the session for everyone. */
  stop(): void;
  /** The link to hand out for the address being shared (it carries `follow=<session id>`); null when not sharing. */
  linkFor(url: string): string | null;
}

let current: FollowMeSource | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const cb of [...listeners]) cb();
};

/** Make `source` the one Share uses. Returns the unregister function (it only clears the slot if `source` is still in it). */
export function registerFollowMe(source: FollowMeSource): () => void {
  current = source;
  notify();
  return () => {
    if (current !== source) return;
    current = null;
    notify();
  };
}

const subscribeSlot = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const NO_SOURCE = () => null;

/** The registered source (null on the server and before the controller mounts). */
export function useRegisteredFollowMe(): FollowMeSource | null {
  return useSyncExternalStore(subscribeSlot, () => current, NO_SOURCE);
}

const IDLE: FollowMeState = { status: "idle", following: 0 };
const noop = () => () => {};

/** A source's state, live. */
export function useFollowMeState(source: FollowMeSource | null): FollowMeState {
  return useSyncExternalStore(source ? source.subscribe : noop, source ? source.getState : () => IDLE, () => IDLE);
}
