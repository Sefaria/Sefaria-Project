/**
 * The recording dock (see ./RecordingUi.tsx): recording (red dot, elapsed time, Stop), a finished recording (Download, Replay, Discard,
 * Load recording…), or playback (the Timeline, Resume after the person took over, Exit replay). A recording file can also be dropped on
 * it. Loaded lazily, with the controller, the first time there is something to show.
 */
import { useEffect, useState, type DragEvent } from "react";
import { Button } from "~/ui/Button/Button";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { formatTime, Timeline } from "~/ui/Timeline/Timeline";
import type { Recording } from "~/lib/reader-state/core/types";
import type { RecordingController, RecordingState } from "./controller";
import type { RecordingHandle } from "./handle";
import styles from "./RecordingUi.module.css";

/** `read()`, redrawn on every animation frame while `running` (the recorder and player do not notify as time passes). */
function useFrameClock(read: () => number, running: boolean): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running || typeof requestAnimationFrame !== "function") return;
    let id = 0;
    const loop = () => {
      setTick((n) => (n + 1) % 1_000_000);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [running]);
  return read();
}

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

const keyframeCache = new WeakMap<Recording, number[]>();
/** The keyframes' times, for the timeline's ticks (computed once per recording; it can hold thousands of messages). */
function keyframeTimes(rec: Recording): number[] {
  let times = keyframeCache.get(rec);
  if (!times) {
    times = rec.messages.filter((m) => m.type === "keyframe").map((m) => m.t);
    keyframeCache.set(rec, times);
  }
  return times;
}

export function RecordingDock({ c, handle, state }: { c: RecordingController; handle: RecordingHandle; state: RecordingState }) {
  const [dragOver, setDragOver] = useState(false);
  const { view, error, loading } = state;
  const playing = view.mode === "playback" && view.playing;
  const elapsed = useFrameClock(() => c.recorder()?.elapsed() ?? 0, view.mode === "recording");
  const playTime = useFrameClock(() => c.player()?.time() ?? 0, playing);

  const acceptsDrop = view.mode !== "recording";
  const dropHandlers = acceptsDrop
    ? {
        onDragOver: (e: DragEvent) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        },
        onDragLeave: () => setDragOver(false),
        onDrop: (e: DragEvent) => {
          setDragOver(false);
          const file = e.dataTransfer?.files?.[0];
          if (!file) return;
          e.preventDefault();
          void c.load(file);
        },
      }
    : {};

  // Input on the dock is not the person taking the reader back (see markDockInput).
  const mark = () => c.markDockInput();

  const loadButton = (
    <Button size="sm" variant="tertiary" onClick={() => handle.pickFile()} loading={loading}>
      <InterfaceText en="Load recording…" he="טעינת הקלטה…" />
    </Button>
  );

  return (
    <section
      className={styles.dock}
      data-reader-state-ui=""
      data-mode={view.mode}
      data-drag-over={dragOver || undefined}
      aria-label="Session recording"
      data-testid="recording-dock"
      onPointerDownCapture={mark}
      onKeyDownCapture={mark}
      onWheelCapture={mark}
      onTouchStartCapture={mark}
      {...dropHandlers}
    >
      {view.mode === "recording" ? (
        <div className={styles.row}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.status} role="status">
            <InterfaceText en="Recording" he="מקליט" />
          </span>
          <span className={styles.clock} role="timer" aria-label="Elapsed time">
            {formatTime(elapsed)}
          </span>
          <Button size="sm" variant="danger" onClick={() => c.stop()}>
            <InterfaceText en="Stop" he="עצירה" />
          </Button>
        </div>
      ) : null}

      {view.mode === "stopped" ? (
        <div className={styles.row}>
          <span className={styles.status} role="status">
            <InterfaceText en="Recording" he="הקלטה" /> <span className={styles.clock}>{formatTime(view.recording.duration)}</span>
          </span>
          <span className={styles.actions}>
            <Button size="sm" variant="primary" onClick={() => c.download()}>
              <InterfaceText en="Download" he="הורדה" />
            </Button>
            <Button size="sm" onClick={() => void c.replay()}>
              <InterfaceText en="Replay" he="הפעלה חוזרת" />
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => c.discard()}>
              <InterfaceText en="Discard" he="מחיקה" />
            </Button>
            {loadButton}
          </span>
        </div>
      ) : null}

      {view.mode === "playback" ? (
        <>
          <div className={styles.row}>
            <span className={styles.status} role="status">
              {view.exiting ? (
                <InterfaceText en="Returning to where you were…" he="חוזרים למקום הקודם…" />
              ) : view.interrupted ? (
                <InterfaceText en="Replay paused" he="ההפעלה הושהתה" />
              ) : (
                <InterfaceText en="Replaying a recording" he="מפעיל הקלטה" />
              )}
            </span>
            <span className={styles.actions}>
              {view.interrupted && !view.exiting ? (
                <Button size="sm" variant="primary" onClick={() => c.resume()}>
                  <InterfaceText en="Resume" he="המשך" />
                </Button>
              ) : null}
              <Button size="sm" onClick={() => void c.exit()} loading={view.exiting}>
                <InterfaceText en="Exit replay" he="יציאה מההפעלה" />
              </Button>
            </span>
          </div>
          <Timeline
            duration={c.player()?.duration ?? view.recording.duration}
            time={playing ? playTime : (c.player()?.time() ?? 0)}
            markers={keyframeTimes(view.recording)}
            playing={view.playing}
            rate={view.rate}
            disabled={view.exiting}
            onSeek={(t) => void c.player()?.seek(t)}
            onPlayPause={() => {
              const p = c.player();
              if (!p) return;
              if (p.playing) p.pause();
              else c.resume();
            }}
            onRate={(r) => c.player()?.setRate(r)}
            label="Replay position"
          />
        </>
      ) : null}

      {view.mode === "idle" && loading ? (
        <div className={styles.row}>
          <span className={styles.status} role="status">
            <InterfaceText en="Loading recording…" he="טוען הקלטה…" />
          </span>
        </div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <span className={styles.actions}>
            {view.mode === "idle" ? loadButton : null}
            <Button size="sm" variant="tertiary" onClick={() => c.dismissError()}>
              <InterfaceText en="Dismiss" he="סגירה" />
            </Button>
          </span>
        </div>
      ) : null}

      {acceptsDrop && dragOver ? (
        <div className={styles.dropHint} aria-hidden="true">
          <InterfaceText en="Drop a recording to replay it" he="יש לשחרר קובץ הקלטה כדי להפעיל אותו" />
        </div>
      ) : null}
    </section>
  );
}
