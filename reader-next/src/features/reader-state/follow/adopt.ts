/**
 * What FollowUi does with the address on load and on every navigation (docs/READER_STATE_API.md, "Joining: the follower"):
 *  - a `follow=<session id>` parameter: keep the id in sessionStorage (so a reload rejoins), take the parameter out of the address with a
 *    replace navigation through the router — the follower's own address, if they share it, is a plain link, not a second invitation — and
 *    only then join. Joining after the replace matters: the session client counts any URL change it did not apply as the person's own
 *    move, and would break away from following before it began.
 *  - no parameter: rejoin (or re-host) whatever sessionStorage kept, once.
 *
 * Separate from the component so it can be tested with a fake router and controller.
 */
import type { FollowController } from "./controller";
import { followParamOf, readStoredFollow, withoutFollowParam, writeStoredFollow } from "./params";
import { newParticipantId } from "~/lib/session/ids";

export interface AdoptRouter {
  history: { location: { pathname: string; search: string; hash: string; state: unknown } };
  navigate(opts: { href: string; replace: true; state: never; resetScroll: false }): Promise<unknown>;
}

/** Keys the router writes into each history entry (they belong to that entry; the router makes new ones on replace). */
const ENTRY_KEYS = new Set(["__TSR_key", "__TSR_index", "key"]);

/** The entry's history state without the router's per-entry keys: everything the app put there (NavState) survives the replace. */
export function keptHistoryState(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object") return {};
  return Object.fromEntries(Object.entries(state as Record<string, unknown>).filter(([k]) => !ENTRY_KEYS.has(k)));
}

/**
 * Act on the current location. Returns what it did ("joined", "resumed" or "none"); resolves once any join has started.
 */
export async function adoptFollowLocation(router: AdoptRouter, controller: FollowController, storage: Storage | null): Promise<"joined" | "resumed" | "none"> {
  const loc = router.history.location;
  const sessionId = followParamOf(loc.search);
  const current = controller.getState().session;

  if (sessionId) {
    // Opening one's own link (or the same link twice) keeps the role this tab already has.
    const same = current?.sessionId === sessionId && current.client.getState().status !== "ended";
    const stored = same ? readStoredFollow(storage) : null;
    const next = stored?.sessionId === sessionId ? stored : { sessionId, role: "guest" as const, participantId: newParticipantId() };
    writeStoredFollow(storage, next);
    try {
      await router.navigate({ href: `${loc.pathname}${withoutFollowParam(loc.search)}${loc.hash}`, replace: true, state: keptHistoryState(loc.state) as never, resetScroll: false });
    } catch {
      /* the address keeps the parameter; joining still works */
    }
    if (same) return "none";
    controller.resume(next);
    return "joined";
  }

  if (current) return "none";
  const stored = readStoredFollow(storage);
  if (!stored) return "none";
  controller.resume(stored);
  return "resumed";
}
