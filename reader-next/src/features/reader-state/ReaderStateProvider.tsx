/**
 * The reader state API for the whole app (docs/READER_STATE_API.md): one slice registry and one API per router, put in
 * ReaderStateContext for the slices' owners (useRegisterSlice) and the recording and follow UIs, and on window.sefariaReaderState for
 * tests and embedding pages — on every page. Recording and follow me are labs (src/lib/labs.ts): their UIs mount only where switched on.
 *
 * Mounted in __root.tsx above ReaderSettingsProvider (the settings slice registers from inside it) and inside the router.
 *
 * Server rendering: the registry and API are built there too (a component may read the context while rendering), but nothing on the
 * server registers a slice (effects do not run), applies a snapshot or listens for input; the host touches window only when asked to.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { createSliceRegistry } from "~/lib/reader-state/core/registry";
import { createReaderStateApi } from "~/lib/reader-state/core/api";
import type { ReaderStateApi } from "~/lib/reader-state/core/types";
import { createSefariaHost, type HostRouter } from "~/lib/reader-state/sefaria/host";
import { ReaderStateContext, type ReaderStateContextValue } from "./context";
import { RecordingUi } from "./recording/RecordingUi";
import { FollowUi } from "./follow/FollowUi";
import { useLab } from "./labs";

declare global {
  interface Window {
    /** The reader state API (getSnapshot, applySnapshot, subscribe…): the public entry point for tests and embedders. Client only. */
    sefariaReaderState?: ReaderStateApi;
  }
}

/**
 * One value per router, kept outside React state: StrictMode's double render and a remount of the root keep the same registry, so slices
 * registered by components below are never split across two registries. A WeakMap, since the server builds a router per request.
 */
const perRouter = new WeakMap<object, ReaderStateContextValue>();

export function readerStateFor(router: HostRouter): ReaderStateContextValue {
  let value = perRouter.get(router);
  if (!value) {
    const registry = createSliceRegistry();
    const api = createReaderStateApi(createSefariaHost(router, registry));
    value = { registry, api };
    perRouter.set(router, value);
  }
  return value;
}

export function ReaderStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter() as unknown as HostRouter;
  const [value] = useState(() => readerStateFor(router));
  // The API is on every page; the two features built on it are labs (src/lib/labs.ts), mounted only where switched on.
  const recording = useLab("recording");
  const followMe = useLab("follow_me");
  useEffect(() => {
    window.sefariaReaderState = value.api;
    return () => {
      if (window.sefariaReaderState === value.api) delete window.sefariaReaderState;
    };
  }, [value]);
  return (
    <ReaderStateContext.Provider value={value}>
      {children}
      {recording ? <RecordingUi /> : null}
      {followMe ? <FollowUi /> : null}
    </ReaderStateContext.Provider>
  );
}
