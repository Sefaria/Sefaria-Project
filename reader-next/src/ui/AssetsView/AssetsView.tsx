import type { PassageAsset } from "~/lib/connections/assets";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { LoadingState } from "../Feedback/Feedback";
import { Icon } from "../Icon/Icon";
import styles from "./AssetsView.module.css";

export interface AssetsViewProps {
  assets: readonly PassageAsset[];
  loading?: boolean;
  /** Open the page beside the text, linked to it. */
  onOpen: (asset: PassageAsset) => void;
}

/**
 * Interactive pages on the selected passage: title, author (a verified author's check mark), description, and Open beside the text.
 * Only published pages of verified authors reach this list (Social decides: owner decision D6).
 *
 * @feature CON-075 Interactive pages on a passage
 */
export function AssetsView({ assets, loading, onOpen }: AssetsViewProps) {
  const he = useInterfaceLang() === "hebrew";
  if (loading && !assets.length) return <LoadingState><p className={styles.message}>{he ? "טוען דפים אינטראקטיביים..." : "Loading interactive pages..."}</p></LoadingState>;
  if (!assets.length) return <p className={styles.message}>{he ? "אין דפים אינטראקטיביים על קטע זה." : "No interactive pages on this passage."}</p>;
  return (
    <ul className={styles.list}>
      {assets.map((a) => (
        <li key={a.id} className={styles.item}>
          <h3 className={styles.title} lang="en" dir="auto">{a.title}</h3>
          {a.author ? (
            <p className={styles.author}>
              {a.author.name}
              {a.author.verified ? <span className={styles.check} role="img" aria-label={he ? "מחבר מאומת" : "Verified author"} title={he ? "מחבר מאומת" : "Verified author"}><Icon name="check" size="0.9em" /></span> : null}
            </p>
          ) : null}
          {a.description ? <p className={styles.description} dir="auto">{a.description}</p> : null}
          {a.refs.length ? <p className={styles.refs} dir="auto">{a.refs.join(" · ")}</p> : null}
          <button type="button" className={styles.open} onClick={() => onOpen(a)}>
            <Icon name="link" size="1em" /> {he ? "פתיחה לצד הטקסט" : "Open beside the text"}
          </button>
        </li>
      ))}
    </ul>
  );
}
