/**
 * The light end of the recording feature, for the parts of the app that are always loaded: the display settings menu's entry
 * (TextPanel) and the dock's shell (RecordingUi). Imports nothing heavy: the controller, the recorder, the player and the dock load only
 * when the person starts recording or picks a file (./handle.ts).
 */
import { useCallback, useSyncExternalStore } from "react";
import { useReaderState } from "../context";
import { useLab } from "../labs";
import type { RecordingState } from "./controller";
import { IDLE_RECORDING_STATE, recordingHandleFor, type RecordingHandle } from "./handle";

const noopSubscribe = () => () => {};
const idle = () => IDLE_RECORDING_STATE;

/** This reader's recording handle, or null outside the provider. */
export function useRecordingHandle(): RecordingHandle | null {
  const ctx = useReaderState();
  return ctx ? recordingHandleFor(ctx.api) : null;
}

export function useRecordingState(h: RecordingHandle | null): RecordingState {
  return useSyncExternalStore(h ? h.subscribe : noopSubscribe, h ? h.getState : idle, idle);
}

/**
 * The display settings menu's entry: handlers while nothing is being recorded or replayed, undefined otherwise (and outside the provider),
 * so the menu shows the entry only when it can act. Undefined too when the recording lab is off (src/lib/labs.ts).
 */
export function useRecordSessionEntry(): { onRecordSession: () => void; onLoadRecording: () => void } | undefined {
  const on = useLab("recording");
  const h = useRecordingHandle();
  const { view } = useRecordingState(h);
  const onRecordSession = useCallback(() => {
    if (h) void h.load().then((c) => c.start());
  }, [h]);
  // Synchronous: the picker opens only inside the click.
  const onLoadRecording = useCallback(() => h?.pickFile(), [h]);
  if (!on || !h || view.mode !== "idle") return undefined;
  return { onRecordSession, onLoadRecording };
}
