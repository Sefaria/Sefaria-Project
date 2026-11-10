import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import styles from "./NotFoundPage.module.css";

/**
 * The reader's "Page Not Found" (T-F28): what the old site's 404 page says (templates/404.html, word for word), inside the new shell.
 * Drawn when neither this client nor Django has a page at the address (src/start.ts, src/lib/routing/not-found.ts) and for any address
 * the router has no route for. The answer is a 404 with `X-Robots-Tag: noindex` and a robots meta (the root route's head).
 *
 * @feature RTE-040 404 and error pages
 */
export function NotFoundPage() {
  return (
    <div className={styles.page} data-reader-not-found="">
      <h1 className={styles.title}>
        <InterfaceText en="Page Not Found" he="הדף שביקשת איננו נמצא" />
      </h1>
      <p className={styles.body}>
        <InterfaceText
          en="The requested URL couldn't be found. If you've arrived here from a link on another site, you may want to let them know their link isn't working."
          he="הדף המבוקש איננו נמצא. אם הגעת לכאן מקישור מאתר אחר, ייתכן ותרצה ליידע אותם כי הקישור שלהם איננו תקין."
        />
      </p>
    </div>
  );
}
