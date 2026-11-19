/**
 * `sefaria.focus` (moment): the panel last interacted with. A phone shows one panel; a phone replaying or following a desktop
 * shows this one (features/workspace/Workspace.tsx owns the value and registers the slice).
 */
import type { ApplyContext, StateSlice } from "~/lib/reader-state/core/types";

export const FOCUS_SLICE_ID = "sefaria.focus";
export const FOCUS_SLICE_VERSION = 1;

export type FocusValue = { panelKey: string } | null;

export function isFocusValue(x: unknown): x is FocusValue {
  if (x === null) return true;
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const k = (x as { panelKey?: unknown }).panelKey;
  return typeof k === "string" && k.length > 0 && k.length <= 200;
}

export interface FocusSliceSource {
  get(): FocusValue;
  apply(value: FocusValue, ctx: ApplyContext): void;
  subscribe(onChange: () => void): () => void;
}

export function createFocusSlice(source: FocusSliceSource): StateSlice<FocusValue> {
  return {
    id: FOCUS_SLICE_ID,
    version: FOCUS_SLICE_VERSION,
    scope: "moment",
    get: () => source.get(),
    apply: (value, ctx) => source.apply(value ? { panelKey: value.panelKey } : null, ctx),
    subscribe: (cb) => source.subscribe(cb),
    validate: isFocusValue,
  };
}
