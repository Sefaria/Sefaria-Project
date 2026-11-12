/**
 * The reader state API inside React: the provider (ReaderStateProvider.tsx) puts the registry and the API here; owners of state register
 * their slices with useRegisterSlice.
 */
import { createContext, useContext, useEffect } from "react";
import type { ReaderStateApi, SliceRegistry, StateSlice } from "~/lib/reader-state/core/types";

export interface ReaderStateContextValue {
  registry: SliceRegistry;
  api: ReaderStateApi;
}

export const ReaderStateContext = createContext<ReaderStateContextValue | null>(null);

/** The API, or null outside the provider (stories, isolated tests). */
export function useReaderState(): ReaderStateContextValue | null {
  return useContext(ReaderStateContext);
}

/** Register a slice for as long as the component is mounted. Pass a stable slice (useMemo); no-op outside the provider. */
export function useRegisterSlice(slice: StateSlice<any> | null): void { // eslint-disable-line @typescript-eslint/no-explicit-any -- the registry holds slices of every state type
  const ctx = useContext(ReaderStateContext);
  useEffect(() => (ctx && slice ? ctx.registry.register(slice) : undefined), [ctx, slice]);
}
