import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import styles from "./SkipLink.module.css";

/**
 * The first tab stop: jumps over the header to the page's main content. Hidden until focused.
 *
 * @feature I18-002 Skip link and main landmark
 */
export function SkipLink({ target = "main" }: { target?: string }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <a className={styles.skip} href={`#${target}`}>
      {he ? "דלגו לתוכן האתר" : "Skip to main content"}
    </a>
  );
}
