import { useEffect, useRef, useState, type ReactNode } from "react";
import { bothEvent, gtagEvent, useOnceFullyVisible } from "~/lib/analytics";
import { DEVELOPERS, HELP, LIBRARY, VOICES, donateHref, interfaceHref } from "~/lib/shell/links";
import { HeaderSearch, type HeaderSearchProps } from "./HeaderSearch";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon, type IconName } from "../Icon/Icon";
import { IconButton } from "../IconButton/IconButton";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { isAuthPath, nextFromPath, withNext } from "~/lib/auth/utils";
import { Link } from "../Link/Link";
import { Popover } from "../Popover/Popover";
import { ProfilePic } from "../ProfilePic/ProfilePic";
import styles from "./SiteHeader.module.css";

export interface SiteHeaderProps {
  /** The address the reader is on, to come back to after switching the interface language. */
  next: string;
  /** The search box's behaviour (suggestions, submit). */
  search: Omit<HeaderSearchProps, "mobile">;
  /** The phone menu's state, when something else (the reader's panel header) can open it too. */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /** The signed-in reader (null or absent: signed out). */
  viewer?: HeaderViewer | null;
}

export interface HeaderViewer {
  name: string;
  imageUrl?: string;
  profileUrl?: string;
}

/** Where Log Out goes (Sefaria.getLogoutUrl() in the Library module). */
export const LOGOUT_HREF = "/logout?next=/texts";

const A = ({ href, children, ...rest }: { href: string; children: ReactNode; className?: string; target?: string; "data-testid"?: string; "data-anl-event"?: string; "data-anl-text"?: string }) => (
  <a href={href} {...(rest.target === "_blank" ? { rel: "noopener noreferrer" } : {})} {...rest}>
    {children}
  </a>
);

/**
 * A header drop-down: an icon button (or the reader's picture) that opens a small menu of links. With `anlFeature` it reports as the
 * old DropdownMenu does: modswitch_open / modswitch_close on the button (data-anl), and modswitch_close when dismissed some other way.
 */
function Menu({ icon, label, children, anlFeature, picture }: { icon: IconName; label: string; children: ReactNode; anlFeature?: string; picture?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const byButton = useRef(false);
  const change = (o: boolean) => {
    if (!o && open && anlFeature && !byButton.current) gtagEvent("modswitch_close", { feature_name: anlFeature });
    byButton.current = false;
    setOpen(o);
  };
  return (
    <div className={styles.menuWrap} data-anl-feature_name={anlFeature}>
      <Popover
        open={open}
        onOpenChange={change}
        label={label}
        trigger={(p) => (
          <span onClickCapture={() => (byButton.current = true)} data-anl-event={anlFeature ? (open ? "modswitch_close:click" : "modswitch_open:click") : undefined}>
            {picture ? (
              <button type="button" {...(p as object)} className={styles.pictureButton} aria-label={label} title={label}>
                {picture}
              </button>
            ) : (
              <IconButton {...p} icon={icon} label={label} />
            )}
          </span>
        )}
      >
        <div className={styles.menu} onClick={(e) => (e.target as Element).closest("a") && setOpen(false)}>{children}</div>
      </Popover>
    </div>
  );
}

const SWITCH = "modswitch_item_click:click";

const LanguageLinks = ({ next, lang }: { next: string; lang: "english" | "hebrew" }) => (
  <div className={styles.langRow}>
    <a href={interfaceHref("english", next)} aria-current={lang === "english"} data-testid="lang-en">English</a>
    <a href={interfaceHref("hebrew", next)} aria-current={lang === "hebrew"} data-testid="lang-he">עברית</a>
  </div>
);

/**
 * The site header. Desktop: logo, Texts / Topics / Donate, search, Sign Up, help, language, module switcher and account
 * menus. Phone: menu button, logo and a language toggle over a slide-out menu. Destinations this client does not have yet
 * are the old site's pages. No accounts yet: the account menu offers Log in / Sign up.
 *
 * @feature GUI-002 Desktop site header
 * @feature GUI-003 Header right-side controls
 * @feature GUI-009 Module switcher (Library / Voices / Developers)
 * @feature GUI-010 Profile / account dropdown
 * @feature GUI-011 Mobile navigation menu
 * @feature I18-008 Interface language switcher
 * @feature ANL-003 Header and category line impression events
 */
export function SiteHeader({ next, search, menuOpen, onMenuOpenChange, viewer }: SiteHeaderProps) {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const [ownOpen, setOwnOpen] = useState(false);
  const mobileOpen = menuOpen ?? ownOpen;
  const setMobileOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const n = typeof v === "function" ? v(mobileOpen) : v;
    setOwnOpen(n);
    onMenuOpenChange?.(n);
  };
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);
  const logo = he ? "/brand/library-logo-hebrew.svg" : "/brand/library-logo-english.svg";
  const logoLabel = he ? "לוגו ספריית ספריא" : "Sefaria library logo";
  const other = he ? "english" : "hebrew";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  // header_viewed once per session when the header is fully on screen (ANL-003)
  const seen = useOnceFullyVisible<HTMLElement>(() => bothEvent("header_viewed", { impression_type: "regular_header" }), "sa.header_viewed");
  // on an auth page, its own `next` is where Log in / Sign up come back to (ReaderApp.openURL did the same)
  const authNext = isAuthPath(next.split("?")[0]!) ? nextFromPath(next) : next;
  // the auth pages are this client's own (in-app links; data-signup-source=nav_bar for the funnel, as the old AuthNavLink)
  const authLink = (flow: "login" | "register", className: string | undefined, children: ReactNode) => (
    <Link href={withNext(`/${flow}`, authNext)} className={className} data-signup-source="nav_bar">{children}</Link>
  );

  return (
    <header ref={seen} className={styles.header} lang={he ? "he" : "en"} dir={he ? "rtl" : "ltr"}>
      <div className={`${styles.inner} ${styles.desktop}`}>
        <nav className={styles.nav} aria-label={t("Primary navigation", "ניווט ראשי")}>
          <A href={LIBRARY + "/"} className={styles.logo}><img src={logo} alt={logoLabel} /></A>
          <div className={styles.links}>
            <A href={`${LIBRARY}/texts`} className={styles.link}><InterfaceText en="Texts" he="מקורות" /></A>
            <A href={`${LIBRARY}/topics`} className={styles.link}><InterfaceText en="Topics" he="נושאים" /></A>
            <A href={donateHref("Header")} className={styles.link} target="_blank"><InterfaceText en="Donate" he="תרומה" /></A>
          </div>
        </nav>
        <div className={styles.right}>
          <HeaderSearch {...search} />
          {viewer ? null : authLink("register", styles.signup, <InterfaceText en="Sign Up" he="להרשמה" />)}
          <div className={styles.icons}>
            <a className={styles.iconLink} href={HELP[lang]} target="_blank" rel="noopener noreferrer" aria-label={t("Help", "עזרה")} title={t("Help", "עזרה")}><Icon name="help" size="1.3em" /></a>
            {viewer ? (
              <a className={styles.iconLink} href={`${LIBRARY}/saved`} aria-label={t("Saved items", "שמורים")} title={t("Saved items", "שמורים")} data-testid="saved-link"><Icon name="bookmark" size="1.3em" /></a>
            ) : (
              <Menu icon="globe" label={t("Toggle Interface Language Menu", "החלפת שפת הממשק")}>
                <div className={styles.menuHeading}>{t("Site Language", "שפת האתר")}</div>
                <LanguageLinks next={next} lang={lang} />
              </Menu>
            )}
            <Menu icon="grid" label={t("Library", "ספריה")} anlFeature="module_switcher">
              <A href={`${LIBRARY}/about`} className={styles.menuItem} data-anl-event={SWITCH} data-anl-text="About Sefaria"><img src={logo} alt="Sefaria" height={18} /></A>
              <div className={styles.sep} />
              <A href={`${LIBRARY}/`} className={styles.menuItem} data-anl-event={SWITCH} data-anl-text="Library"><span className={styles.dot} style={{ background: "var(--sefaria-blue, #18345d)" }} />{t("Library", "ספריה")}</A>
              <A href={`${VOICES}/`} className={styles.menuItem} data-anl-event={SWITCH} data-anl-text="Voices"><span className={styles.dot} style={{ background: "var(--sheets-green, #4b8a6d)" }} />{t("Voices", "חיבורים")}</A>
              <A href={DEVELOPERS} className={styles.menuItem} target="_blank" data-anl-event={SWITCH} data-anl-text="Developers"><span className={styles.dot} style={{ background: "var(--devportal-purple, #5d4b8a)" }} />{t("Developers", "מפתחים")}</A>
              <div className={styles.sep} />
              <A href={`${LIBRARY}/products`} className={styles.menuItem} target="_blank" data-anl-event={SWITCH} data-anl-text="More">{t("More from Sefaria", "עוד מספריא")} ›</A>
            </Menu>
            {viewer ? (
              <Menu icon="user" label={t("Account menu", "תפריט חשבון")} picture={<ProfilePic name={viewer.name} url={viewer.imageUrl} size={24} alt={t("User Profile Picture", "תמונת פרופיל משתמש")} />}>
                <div className={`${styles.menuItem} ${styles.menuName}`}><strong>{viewer.name}</strong></div>
                <div className={styles.sep} />
                <A href={`${LIBRARY}/settings/account`} className={styles.menuItem}>{t("Account Settings", "הגדרות")}</A>
                <A href={`${LIBRARY}/torahtracker`} className={styles.menuItem}>{t("Torah Tracker", "לימוד במספרים")}</A>
                <div className={styles.sep} />
                <div className={styles.menuHeading}>{t("Site Language", "שפת האתר")}</div>
                <LanguageLinks next={next} lang={lang} />
                <div className={styles.sep} />
                <A href={`${LIBRARY}/updates`} className={styles.menuItem}>{t("New Additions", "חידושים")}</A>
                <A href={HELP[lang]} className={styles.menuItem} target="_blank">{t("Help", "עזרה")}</A>
                <div className={styles.sep} />
                <A href={`${LIBRARY}${LOGOUT_HREF}`} className={styles.menuItem}>{t("Log Out", "ניתוק")}</A>
              </Menu>
            ) : (
            <Menu icon="user" label={t("Account menu", "תפריט חשבון")}>
              {authLink("login", styles.menuItem, t("Log in", "התחברות"))}
              {authLink("register", styles.menuItem, t("Sign up", "להרשמה"))}
              <div className={styles.sep} />
              <div className={styles.menuHeading}>{t("Site Language", "שפת האתר")}</div>
              <LanguageLinks next={next} lang={lang} />
              <div className={styles.sep} />
              <A href={`${LIBRARY}/updates`} className={styles.menuItem}>{t("New Additions", "חידושים")}</A>
              <A href={HELP[lang]} className={styles.menuItem} target="_blank">{t("Help", "עזרה")}</A>
            </Menu>
            )}
          </div>
        </div>
      </div>

      <div className={styles.mobileBar}>
        <IconButton icon="menu" label={t("Menu", "תפריט")} aria-expanded={mobileOpen} aria-controls="mobile-nav" onClick={() => setMobileOpen((o) => !o)} />
        <A href={LIBRARY + "/"} className={styles.logo}><img src={logo} alt={logoLabel} /></A>
        <a className={styles.iconLink} href={interfaceHref(other, next)} aria-label={he ? "Switch to English" : "עברית"} title={he ? "English" : "עברית"}><Icon name="translate" size="1.3em" /></a>
      </div>
      <nav id="mobile-nav" className={styles.mobileMenu} hidden={!mobileOpen} aria-label={t("Mobile navigation menu", "תפריט ניווט במובייל")}>
        <HeaderSearch mobile {...search} onSearch={(q) => { setMobileOpen(false); search.onSearch(q); }} onSmartSubmit={(q) => { setMobileOpen(false); search.onSmartSubmit(q); }} onChoose={(x) => { setMobileOpen(false); search.onChoose(x); }} />
        <A href={`${LIBRARY}/texts`} className={styles.menuItem}><Icon name="book" /><InterfaceText en="Texts" he="מקורות" /></A>
        <A href={`${LIBRARY}/topics`} className={styles.menuItem}><Icon name="hash" /><InterfaceText en="Topics" he="נושאים" /></A>
        <A href={`${LIBRARY}/calendars`} className={styles.menuItem}><Icon name="list" /><InterfaceText en="Learning Schedules" he="לוח לימוד יומי" /></A>
        <A href={donateHref("MobileNavMenu")} className={styles.menuItem} target="_blank"><Icon name="star" /><InterfaceText en="Donate" he="תרומה" /></A>
        {viewer ? (
          <>
            <A href={`${LIBRARY}/saved`} className={styles.menuItem}><Icon name="bookmark" /><InterfaceText en="Saved, History & Notes" he="שמורים, היסטוריה והערות" /></A>
            <A href={`${LIBRARY}/settings/account`} className={styles.menuItem}><Icon name="settings" /><InterfaceText en="Account Settings" he="הגדרות" /></A>
          </>
        ) : null}
        <div className={styles.sep} />
        <div className={styles.menuItem}><Icon name="globe" /><LanguageLinks next={next} lang={lang} /></div>
        <div className={styles.sep} />
        <A href={HELP[lang]} className={styles.menuItem} target="_blank"><Icon name="help" /><InterfaceText en="Get Help" he="עזרה" /></A>
        <A href={`${LIBRARY}/mobile-about-menu`} className={styles.menuItem}><Icon name="info" /><InterfaceText en="About Sefaria" he="אודות ספריא" /></A>
        <div className={styles.sep} />
        <A href={`${VOICES}/`} className={styles.menuItem}><span className={styles.dot} style={{ background: "var(--sheets-green, #4b8a6d)" }} /><InterfaceText en="Voices on Sefaria" he="חיבורים בספריא" /></A>
        <A href={DEVELOPERS} className={styles.menuItem} target="_blank"><span className={styles.dot} style={{ background: "var(--devportal-purple, #5d4b8a)" }} /><InterfaceText en="Developers on Sefaria" he="מפתחים בספריא" /></A>
        <A href={`${LIBRARY}/products`} className={styles.menuItem}><Icon name="chevron-right" /><InterfaceText en="More from Sefaria" he="עוד מספריא" /></A>
        <div className={styles.sep} />
        {viewer ? (
          <A href={`${LIBRARY}${LOGOUT_HREF}`} className={styles.menuItem}><Icon name="log-out" /><InterfaceText en="Logout" he="התנתקות" /></A>
        ) : (
          <>
            {authLink("register", styles.menuItem, <><Icon name="user" /><InterfaceText en="Sign up" he="להרשמה" /></>)}
            {authLink("login", styles.menuItem, <InterfaceText en="Log in" he="התחברות" />)}
          </>
        )}
      </nav>
    </header>
  );
}
