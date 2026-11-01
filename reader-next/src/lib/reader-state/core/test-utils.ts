/**
 * A fake ReaderHost for the core's tests: an in-memory location, slices held in plain variables, and a manual scheduler so a test decides
 * when a "frame" passes.
 */
import { vi } from "vitest";
import type { ReaderHost, SliceScope, StateSlice } from "./types";
import { createSliceRegistry } from "./registry";

export interface FakeSlice<T> extends StateSlice<T> {
  /** Change the value as the person would (notifies subscribers). */
  set(value: T): void;
  readonly applied: T[];
}

export function fakeSlice<T>(
  id: string,
  initial: T,
  opts: Partial<Pick<StateSlice<T>, "migrate" | "validate" | "applyOrder" | "version">> & {
    scope?: SliceScope;
    apply?: (value: T) => void | Promise<void>;
  } = {},
): FakeSlice<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const applied: T[] = [];
  const notify = () => listeners.forEach((cb) => cb());
  return {
    id,
    version: opts.version ?? 1,
    scope: opts.scope ?? "moment",
    applyOrder: opts.applyOrder,
    migrate: opts.migrate,
    validate: opts.validate,
    get: () => value,
    async apply(next) {
      applied.push(next);
      await opts.apply?.(next);
      value = next;
      notify(); // an applied value notifies like a local one: the API must tell them apart
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    set(next) {
      value = next;
      notify();
    },
    applied,
  };
}

export function fakeHost(url = "/Genesis.1", nav: unknown = null) {
  const location = { url, nav };
  const locationListeners = new Set<() => void>();
  const inputListeners = new Set<(kind: "input" | "history") => void>();
  const ticks: (() => void)[] = [];
  const slices = createSliceRegistry();
  const navigate = vi.fn(async (to: string, toNav: unknown, _mode: "push" | "replace") => {
    location.url = to;
    location.nav = toNav;
    locationListeners.forEach((cb) => cb());
  });
  const settled = vi.fn(async () => undefined);
  const host: ReaderHost = {
    getLocation: () => ({ ...location }),
    navigate,
    settled,
    onLocationChange(cb) {
      locationListeners.add(cb);
      return () => locationListeners.delete(cb);
    },
    onLocalInput(cb) {
      inputListeners.add(cb);
      return () => inputListeners.delete(cb);
    },
    acceptsUrl: (u) => u.startsWith("/") && !u.startsWith("//"),
    slices,
    schedule: (cb) => ticks.push(cb),
  };
  return {
    host,
    navigate,
    settled,
    slices,
    /** The person navigates. */
    go(to: string, toNav: unknown = location.nav) {
      location.url = to;
      location.nav = toNav;
      locationListeners.forEach((cb) => cb());
    },
    input(kind: "input" | "history" = "input") {
      inputListeners.forEach((cb) => cb(kind));
    },
    /** One "frame": run the callbacks scheduled so far (ones they schedule wait for the next tick). */
    tick() {
      ticks.splice(0).forEach((cb) => cb());
    },
    /** Frames until nothing is scheduled (bounded). */
    tickAll() {
      for (let i = 0; i < 10 && ticks.length; i++) ticks.splice(0).forEach((cb) => cb());
    },
    pendingTicks: () => ticks.length,
  };
}

/** Let pending promise callbacks run. */
export const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));
