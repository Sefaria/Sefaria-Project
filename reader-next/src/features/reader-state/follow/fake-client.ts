/**
 * A stand-in session client for the follow bar's tests and stories: holds a SessionState you set by hand and records the commands it
 * was given. No room, no transport.
 */
import type { PresentParticipant, SessionClient, SessionState } from "~/lib/session/client";

export const READER_ONE: PresentParticipant = { id: "reader1", name: "Reader One", isHost: true, canLead: true, following: null, away: false };
export const READER_TWO: PresentParticipant = { id: "reader2", name: "Reader Two", isHost: false, canLead: true, following: "reader1", away: false };
export const GUEST: PresentParticipant = { id: "guestx7k", name: "Guest X7K", isHost: false, canLead: true, following: "reader1", away: false };

export type FakeCall = { cmd: keyof SessionClient; arg?: unknown };

export interface FakeSessionClient extends SessionClient {
  set(patch: Partial<SessionState>): void;
  calls: FakeCall[];
}

/** A follower (GUEST) live behind READER_ONE, the host and spotlight holder, with READER_TWO also following; override with `patch`. */
export function fakeSessionState(patch: Partial<SessionState> = {}): SessionState {
  return {
    status: "live",
    room: { spotlight: READER_ONE.id, term: 1, mode: "presenter", hands: [], ended: false },
    participants: [READER_ONE, READER_TWO, GUEST],
    following: READER_ONE.id,
    chosen: null,
    self: { id: GUEST.id, name: GUEST.name, isHost: false, canLead: true },
    warnings: [],
    refused: null,
    ...patch,
  };
}

/** The host's view: READER_ONE leads, READER_TWO and GUEST follow. */
export function fakeLeaderState(patch: Partial<SessionState> = {}): SessionState {
  return fakeSessionState({ status: "leading", following: null, self: { id: READER_ONE.id, name: READER_ONE.name, isHost: true, canLead: true }, ...patch });
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
