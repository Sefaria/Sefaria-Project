/**
 * Share's "Follow me" entry before follow me has loaded. FollowUi registers this stand-in at once (so Share shows the entry on every
 * page) and loads the real controller only when it is needed: the first "Follow me" click, a `follow` link, or a session sessionStorage
 * kept. Until then it reads idle; once the real source is attached, everything goes to it.
 */
import type { FollowMeSource, FollowMeState } from "~/ui/ShareView/follow-me";

const IDLE: FollowMeState = { status: "idle", following: 0 };

export interface LazyFollowMe extends FollowMeSource {
  /** The real source, once loaded: the stand-in forwards to it from now on and tells its subscribers. */
  attach(real: FollowMeSource): void;
}

export function lazyFollowMe(load: () => Promise<unknown>): LazyFollowMe {
  let real: FollowMeSource | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const cb of [...listeners]) cb();
  };
  return {
    getState: () => (real ? real.getState() : IDLE),
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    start() {
      if (real) return real.start();
      // attach() runs as part of the load, so `real` is set once it resolves.
      load().then(
        () => real?.start(),
        () => {
          /* could not load (offline): the entry stays idle, and the next click tries again */
        },
      );
    },
    stop: () => real?.stop(),
    linkFor: (url) => real?.linkFor(url) ?? null,
    attach(source) {
      if (real) return;
      real = source;
      source.subscribe(notify);
      notify();
    },
  };
}
