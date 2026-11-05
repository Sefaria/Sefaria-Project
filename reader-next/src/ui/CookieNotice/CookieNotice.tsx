import { useEffect, useState } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Button } from "../Button/Button";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import styles from "./CookieNotice.module.css";
import { SITE_ORIGIN } from "~/lib/config";

export const COOKIE_NOTICE_COOKIE = "cookiesNotificationAccepted";

/**
 * A bar telling a new visitor the site uses cookies, with one OK. The choice lasts twenty years, as on the old site (same
 * cookie name). Shown after the page is up, never in the server render, so it cannot move the text.
 *
 * @feature GUI-007 Cookie notice
 */
export function CookieNotice({ privacyHref = `${SITE_ORIGIN}/privacy-policy` }: { privacyHref?: string }) {
  const lang = useInterfaceLang();
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE_NOTICE_COOKIE}=`))), []);
  if (!show) return null;
  const accept = () => {
    document.cookie = `${COOKIE_NOTICE_COOKIE}=1; path=/; max-age=${20 * 365 * 24 * 3600}; samesite=lax`;
    setShow(false);
  };
  return (
    <div className={styles.notice} data-interruptive-ui="" role="region" aria-label={lang === "hebrew" ? "הודעה על עוגיות" : "Cookie notice"}>
      <p className={styles.text}>
        <InterfaceText
          en={<>We use cookies to give you the best experience possible on our site. Click OK to continue using Sefaria. <Link href={privacyHref}>Learn More</Link>.</>}
          he={<>אנחנו משתמשים ב"עוגיות" כדי לתת למשתמשים את חוויית השימוש הטובה ביותר. <Link href={privacyHref}>קראו עוד בנושא</Link></>}
        />
      </p>
      <Button size="sm" variant="secondary" onClick={accept}><InterfaceText en="OK" he="לחצו כאן לאישור" /></Button>
    </div>
  );
}
