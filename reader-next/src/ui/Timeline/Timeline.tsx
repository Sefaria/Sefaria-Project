import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Icon } from "../Icon/Icon";
import styles from "./Timeline.module.css";

export interface TimelineProps {
  /** Length in ms. */
  duration: number;
  /** Position in ms. */
  time: number;
  /** Times (ms) worth a tick on the track: the recording's keyframes, where seeking is exact. */
  markers?: readonly number[];
  /** A new position (ms, clamped to 0..duration): from a click, a drag (called on every move) or the keyboard. */
  onSeek: (time: number) => void;
  playing: boolean;
  onPlayPause: () => void;
  /** Current speed (1 is real time). */
  rate: number;
  onRate: (rate: number) => void;
  /** The speeds offered. Default 1x, 2x, 4x. */
  rates?: readonly number[];
  /** Accessible name of the scrubber. Default "Playback position". */
  label?: string;
  disabled?: boolean;
}

/** Arrow keys move this far: far enough to see a change, near enough not to skip a moment. */
export const TIMELINE_STEP_MS = 5_000;
/** Page Up / Page Down. */
export const TIMELINE_PAGE_MS = 30_000;
const DEFAULT_RATES = [1, 2, 4] as const;

/** "1:05", or "1:02:05" past an hour; never negative. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const clampTo = (duration: number) => (t: number) => Math.min(duration, Math.max(0, t));

/**
 * A media timeline: play/pause, a scrubber, the time out of the duration, and the speed. Presentational — the owner holds the clock and
 * re-renders it as often as it wants the position drawn. Used by recording playback (features/reader-state/recording).
 *
 * The scrubber is an ARIA slider (aria-valuenow in ms, aria-valuetext as "1:05 of 3:20") so a screen reader announces a time, not a
 * number of milliseconds. Arrow keys step 5 s, Page keys 30 s, Home/End jump to the ends. The track always runs left to right, as time
 * does on every media player, including in a Hebrew interface (the controls around it still follow the interface direction).
 */
export function Timeline({
  duration,
  time,
  markers = [],
  onSeek,
  playing,
  onPlayPause,
  rate,
  onRate,
  rates = DEFAULT_RATES,
  label = "Playback position",
  disabled,
}: TimelineProps) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const span = Math.max(0, duration);
  const clamp = clampTo(span);
  const now = clamp(time);
  const pct = (t: number) => (span > 0 ? (clamp(t) / span) * 100 : 0);

  const timeAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return now;
    return clamp(((clientX - box.left) / box.width) * span);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    dragging.current = true;
    // keeps the drag going when the pointer leaves the track (setPointerCapture is missing in some test DOMs)
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
    onSeek(timeAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onSeek(timeAt(e.clientX));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step: Record<string, number> = {
      ArrowRight: TIMELINE_STEP_MS,
      ArrowUp: TIMELINE_STEP_MS,
      ArrowLeft: -TIMELINE_STEP_MS,
      ArrowDown: -TIMELINE_STEP_MS,
      PageUp: TIMELINE_PAGE_MS,
      PageDown: -TIMELINE_PAGE_MS,
    };
    let next: number | null = null;
    if (e.key in step) next = now + step[e.key]!;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = span;
    if (next === null) return;
    e.preventDefault();
    onSeek(clamp(next));
  };

  const valueText = `${formatTime(now)} of ${formatTime(span)}`;

  return (
    <div className={styles.timeline} data-disabled={disabled || undefined}>
      <button type="button" className={styles.play} onClick={onPlayPause} disabled={disabled} aria-label={playing ? "Pause" : "Play"}>
        <Icon name={playing ? "pause" : "play"} size={18} />
      </button>

      <div
        ref={track}
        className={styles.track}
        dir="ltr"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={Math.round(now)}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className={styles.rail} aria-hidden="true">
          <div className={styles.fill} style={{ width: `${pct(now)}%` }} />
          {markers.map((m, i) => (
            <span key={`${m}-${i}`} className={styles.marker} style={{ left: `${pct(m)}%` }} data-testid="timeline-marker" />
          ))}
          <span className={styles.thumb} style={{ left: `${pct(now)}%` }} />
        </div>
      </div>

      <span className={styles.clock} dir="ltr" aria-hidden="true">
        {formatTime(now)} / {formatTime(span)}
      </span>

      <div className={styles.rates} role="group" aria-label="Playback speed">
        {rates.map((r) => (
          <button
            key={r}
            type="button"
            className={styles.rate}
            aria-pressed={r === rate}
            aria-label={`${r}x speed`}
            disabled={disabled}
            onClick={() => onRate(r)}
          >
            {r}x
          </button>
        ))}
      </div>
    </div>
  );
}
