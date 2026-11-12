import { useEffect, useRef, useState } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { formatClipTime } from "~/lib/connections/media";
import { Icon } from "../Icon/Icon";
import styles from "./ClipPlayer.module.css";

export interface ClipPlayerProps {
  url: string;
  /** Seconds into the recording where the clip starts and ends. */
  start: number;
  end: number;
}

/**
 * Plays one clip of a longer recording: play/pause, a position slider and "elapsed / length" counted from the clip's
 * own start, not the file's. Playback stops and rewinds when it passes the clip's end. The old Media.jsx player
 * with real labelled controls (its play button was an image input with a relative path).
 *
 * @feature CON-059 Torah Readings (audio clips)
 */
export function ClipPlayer({ url, start, end }: ClipPlayerProps) {
  const hebrew = useInterfaceLang() === "hebrew";
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(start);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onLoaded = () => (el.currentTime = start);
    const onTime = () => {
      if (el.currentTime >= end) {
        el.pause();
        el.currentTime = start;
        setPlaying(false);
        setNow(start);
      } else {
        setNow(el.currentTime);
      }
    };
    el.addEventListener("loadeddata", onLoaded);
    el.addEventListener("timeupdate", onTime);
    return () => {
      el.removeEventListener("loadeddata", onLoaded);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [start, end]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play()?.catch?.(() => setPlaying(false));
    setPlaying(!playing);
  };

  return (
    <div className={styles.player}>
      <audio ref={audio} preload="metadata" src={`${url}#t=${start},${end}`} />
      <div className={styles.row}>
        <button type="button" className={styles.button} onClick={toggle} aria-label={playing ? (hebrew ? "השהיה" : "Pause Audio") : hebrew ? "נגן" : "Play Audio"}>
          <Icon name={playing ? "pause" : "play"} size="1.2em" />
        </button>
        <span className={styles.time}>{`${formatClipTime(now - start)} / ${formatClipTime(end - start)}`}</span>
      </div>
      <input
        type="range"
        className={styles.slider}
        min={start}
        max={end}
        step="any"
        value={now}
        aria-label={hebrew ? "מיקום השמעה" : "Audio playback position"}
        onChange={(e) => {
          const v = Number(e.target.value);
          setNow(v);
          if (audio.current) audio.current.currentTime = v;
        }}
      />
    </div>
  );
}
