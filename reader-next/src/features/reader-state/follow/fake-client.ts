/**
 * A stand-in session client for the follow bar's tests and stories: holds a SessionState you set by hand and records the commands it
 * was given. No room, no transport.
 */
import type { PresentParticipant, SessionClient, SessionState } from "~/lib/session/client";

export const DANA: PresentParticipant = { id: "dana", name: "Dana Levi", isHost: true, canLead: true, following: null, away: false };
export const SARAH: PresentParticipant = { id: "sarah", name: "Sarah Cohen", isHost: false, canLead: true, following: "dana", away: false };
export const GUEST: PresentParticipant = { id: "guestx7k", name: "Guest X7K", isHost: false, canLead: true, following: "dana", away: false };

export type FakeCall = { cmd: keyof SessionClient; arg?: unknown };

export interface FakeSessionClient extends SessionClient {
  set(patch: Partial<SessionState>): void;
  calls: FakeCall[];
}

/** A follower (GUEST) live behind DANA, the host and spotlight holder, with SARAH also following; override with `patch`. */
export function fakeSessionState(patch: Partial<SessionState> = {}): SessionState {
  return {
    status: "live",
    room: { spotlight: DANA.id, term: 1, mode: "presenter", hands: [], ended: false },
    participants: [DANA, SARAH, GUEST],
    following: DANA.id,
    chosen: null,
    self: { id: GUEST.id, name: GUEST.name, isHost: false, canLead: true },
    warnings: [],
    refused: null,
    ...patch,
  };
}

/** The host's view: DANA leads, SARAH and GUEST follow. */
export function fakeLeaderState(patch: Partial<SessionState> = {}): SessionState {
  return fakeSessionState({ status: "leading", following: null, self: { id: DANA.id, name: DANA.name, isHost: true, canLead: true }, ...patch });
}

export function createFakeSessionClient(initial: SessionState = fakeSessionState()): FakeSessionClient {
  let state = initial;
  const listeners = new Set<() => void>();
  const calls: FakeCall[] = [];
  const record = (cmd: keyof SessionClient) => (arg?: unknown) => void calls.push(arg === undefined ? { cmd } : { cmd, arg });
  return {
    calls,
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    set(patch) {
      state = { ...state, ...patch };
      for (const cb of [...listeners]) cb();
    },
    follow: record("follow"),
    followAgain: record("followAgain"),
    spotlight: record("spotlight"),
    raiseHand: record("raiseHand"),
    setMode: record("setMode"),
    end: record("end"),
    stop: record("stop"),
  };
}
