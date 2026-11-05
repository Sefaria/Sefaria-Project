import { useEffect, useState } from "react";
import { gtagEvent } from "~/lib/analytics";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { NUDGE_SCHEDULE, backoffScript, migrateLegacyCookie, readState, recordMaybeLater, sessionLengthSeconds, shouldHide, updateSessionCounter, type NudgeSchedule } from "~/lib/shell/promo-backoff";
import styles from "./SiteWideBanner.module.css";

const CAMPAIGN = { campaignID: "LA Stand Alone Promo", project: "Library Assistant" };
const EXCLUDED_PATHS = ["/login", "/register", "/password/reset/confirm"];

export const isBannerExcludedPath = (pathname: string) => EXCLUDED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export interface LibraryAssistantBannerProps {
  /** The address the reader is on: where signing in comes back to, with the assistant switched on. */
  path: string;
  /** remote config `feature.chatbot.promoMaybeLaterJSON` */
  schedule?: NudgeSchedule | null;
  /** remote config `feature.chatbot.promoSessionLengthSeconds` */
  sessionSeconds?: number | null;
}

/**
 * "Ask the Library Assistant": the old ChatbotExperimentBanner for a signed-out reader on a wide screen, under the header — Log in
 * to Try (signing in turns the assistant on and comes back here) and Maybe later (the back-off in promo-backoff.ts). The old one
 * appeared after the page was up and pushed it down; this one is in the server's page, and an inline script hides it before the first
 * paint when the reader has put it off (dismissals live in localStorage), so nothing moves.
 *
 * @feature PRM-014 Site-wide banner with maybe-later back-off
 * @feature AI-001 Chatbot experiment banner (shell mount)
 */
export function LibraryAssistantBanner({ path, schedule, sessionSeconds }: LibraryAssistantBannerProps) {
  const he = useInterfaceLang() === "hebrew";
  const cookieName = "signup_promo_banner_dismissed";
  const [session, setSession] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      // the inline script has usually done this already (a second call in the same session counts nothing)
      migrateLegacyCookie(localStorage, cookieName, document.cookie);
      const n = updateSessionCounter(localStorage, cookieName, sessionLengthSeconds(sessionSeconds));
      setSession(n);
      if (shouldHide(readState(localStorage, cookieName), n, schedule ?? NUDGE_SCHEDULE)) setHidden(true);
    } catch {
      setHidden(true); // no storage: the old banner could not be dismissed either, but showing one that cannot stay closed is worse
    }
  }, [sessionSeconds, schedule]);
  useEffect(() => {
    if (session === null || hidden) return;
    const key = `promo_viewed_${cookieName}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      gtagEvent("promo_viewed", CAMPAIGN);
    }
  }, [session, hidden]);
  if (hidden || isBannerExcludedPath(path.split("?")[0]!)) return null;
  const track = (feature_name: string) => gtagEvent("promo_clicked", { ...CAMPAIGN, feature_name });
  const enable = `/enable-library-assistant?next=${encodeURIComponent(path)}`;
  return (
    <>
    <script dangerouslySetInnerHTML={{ __html: backoffScript(cookieName, schedule ?? NUDGE_SCHEDULE, sessionLengthSeconds(sessionSeconds)) }} />
    <div className={styles.banner} data-site-banner="" lang={he ? "he" : "en"} dir={he ? "rtl" : "ltr"}>
      <div className={styles.content}>
        <img className={styles.icon} src="/icons/ai-double-star.svg" alt="" aria-hidden="true" />
        <div className={styles.textBox}>
          <span className={styles.main}>{he ? "שאלו את עוזר הספרייה" : "Ask the Library Assistant"}</span>
          <span className={styles.secondary}>{he ? "דרך חדשה לגלות תשובות מעוגנות במקורות היהדות." : "Discover answers to your questions, grounded in Jewish sources."}</span>
        </div>
        <div className={styles.buttons}>
          <a className={`${styles.button} ${styles.white}`} href={`/login?next=${encodeURIComponent(enable)}`} data-signup-source="la_banner" onClick={() => track("login")}>
            <span>{he ? "התחברות כדי להתנסות" : "Log in to Try"}</span>
          </a>
          <button
            type="button"
            className={`${styles.button} ${styles.later}`}
            onClick={() => {
              recordMaybeLater(localStorage, cookieName, session ?? 0);
              track("maybe_later");
              setHidden(true);
            }}
          >
            <span>{he ? "אולי מאוחר יותר" : "Maybe later"}</span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
