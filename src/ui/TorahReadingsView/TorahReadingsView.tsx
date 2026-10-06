import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { MediaClip } from "~/lib/connections/media";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { ClipPlayer } from "./ClipPlayer";
import styles from "./TorahReadingsView.module.css";

export interface TorahReadingsViewProps {
  clips: readonly MediaClip[];
}

/**
 * Audio recordings of the selected passage being read (PocketTorah): the recording's name and description, a
 * player for just that clip, its licence and source. VERIFIED on sefaria.org (Genesis 1:1: "PocketTorah", 0:06).
 * The old MediaList — which showed "Loading…" forever when there were none (a recorded bug); this says so.
 *
 * @feature CON-059 Torah Readings (audio clips)
 */
export function TorahReadingsView({ clips }: TorahReadingsViewProps) {
  const hebrew = useInterfaceLang() === "hebrew";
  if (!clips.length) {
    return (
      <p className={styles.empty}>
        <InterfaceText en="No Torah readings known here." he="אין הקלטות קריאה בתורה כאן." />
      </p>
    );
  }
  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>
        <InterfaceText en="Torah Reading" he="קריאה בתורה" />
      </h3>
      {clips.map((c) => {
        const name = hebrew ? c.source_he || c.source : c.source;
        const description = hebrew ? c.description_he || c.description : c.description;
        return (
          <article key={`${c.media_url}#${c.start_time}`} className={styles.clip}>
            <h4 className={styles.title} lang={hebrew ? "he" : "en"} dir={hebrew ? "rtl" : "ltr"}>{name}</h4>
            {description ? <p className={styles.description}>{description}</p> : null}
            <ClipPlayer url={c.media_url} start={Number(c.start_time)} end={Number(c.end_time)} />
            <div className={styles.meta}>
              {c.license ? (
                <div><InterfaceText en="License" he="רשיון" />: {c.license}</div>
              ) : null}
              <div>
                <InterfaceText en="Source: " he="מקור: " />
                {c.source_site ? <a href={c.source_site} target="_blank" rel="noopener noreferrer">{name}</a> : name}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
