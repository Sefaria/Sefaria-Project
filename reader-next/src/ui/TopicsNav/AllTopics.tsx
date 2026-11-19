import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import styles from "./TopicsNav.module.css";

/**
 * The A–Z bar (AlphabeticalTopicsNav): A–Z, or א–ת without the final forms in the Hebrew interface, each linking to
 * /topics/all/<letter in lower case>.
 *
 * @feature TOP-014 All Topics A-Z index
 */
export function AlphabetNav({ letters }: { letters: readonly string[] }) {
  return (
    <div className={styles.alphabet}>
      {letters.map((l) => (
        <Link key={l} href={`/topics/all/${l.toLowerCase()}`}>
          <InterfaceText en={l} he={l} />
        </Link>
      ))}
    </div>
  );
}

/** The A–Z filter box: "Search Topics", and Reset (with its ⓧ) once something is typed. */
export function TopicFilterBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <div className={styles.filterBox}>
      <img className={styles.filterIcon} src="/icons/iconmonstr-magnifier-2.svg" alt={he ? "חפש נושאים" : "Search topics"} />
      <input
        className={styles.filterInput}
        lang={he ? "he" : "en"}
        dir={he ? "rtl" : "ltr"}
        placeholder={he ? "חיפוש נושאים" : "Search Topics"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value.length ? (
        <div className={styles.filterReset} onClick={() => onChange("")} onKeyDown={(e) => (e.key === "Enter" ? onChange("") : undefined)} role="button" tabIndex={0} aria-label={he ? "איפוס מסנן נושאים" : "Reset topic filter"}>
          <InterfaceText en="Reset" he="איפוס" />
          <img className={styles.filterResetIcon} src="/icons/circled-x.svg" alt={he ? "איפוס מסנן" : "Reset filter"} />
        </div>
      ) : null}
    </div>
  );
}
