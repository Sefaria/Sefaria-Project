/**
 * Record, download, load and replay reading sessions (docs/READER_STATE_API.md, "Recording and replay"; docs/READER_STATE_PLAN.md, task H).
 *
 * A small floating dock (./RecordingDock.tsx), shown only while there is something to show. It starts from the display settings menu
 * ("Record session", "Load recording…", useRecordSessionEntry in ./entry.ts).
 *
 * Mounted once by ReaderStateProvider on every page, so this shell is kept small: a hidden file input and nothing else until the person
 * records or picks a file. The controller (with the recorder, player and file code) and the dock load then, with dynamic imports
 * (./handle.ts) — a page whose reader never records does not download them.
 *
 * On the server and at hydration it renders only the hidden file input (the same on both, so hydration matches); the controller changes
 * state only from the person's actions on the client.
 */
import { lazy, Suspense, useEffect, useRef } from "react";
import { useRecordingHandle, useRecordingState } from "./entry";
import styles from "./RecordingUi.module.css";

export { useRecordSessionEntry } from "./entry";

const RecordingDock = lazy(() => import("./RecordingDock").then((m) => ({ default: m.RecordingDock })));

export function RecordingUi() {
  const handle = useRecordingHandle();
  const state = useRecordingState(handle);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!handle) return;
    handle.setFilePicker(() => input.current?.click());
    return () => handle.setFilePicker(null);
  }, [handle]);

  if (!handle) return null;

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept=".json,application/json"
      className={styles.fileInput}
      tabIndex={-1}
      aria-hidden="true"
      data-testid="recording-file-input"
      onChange={(e) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = ""; // so the same file can be chosen again
        if (file) void handle.load().then((c) => c.load(file));
      }}
    />
  );

  const c = handle.controller();
  const { view, error, loading } = state;
  if (!c || (view.mode === "idle" && error === null && !loading)) return fileInput;

  return (
    <>
      {fileInput}
      <Suspense fallback={null}>
        <RecordingDock c={c} handle={handle} state={state} />
      </Suspense>
    </>
  );
}
