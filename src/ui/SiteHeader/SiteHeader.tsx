import { useEffect, useState, type ReactNode } from "react";
import { DEVELOPERS, HELP, LIBRARY, VOICES, donateHref, interfaceHref } from "~/lib/shell/links";
import { HeaderSearch, type HeaderSearchProps } from "./HeaderSearch";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon, type IconName } from "../Icon/Icon";
import { IconButton } from "../IconButton/IconButton";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Popover } from "../Popover/Popover";
import styles from "./SiteHeader.module.css";

export interface SiteHeaderProps {
  /** The address the reader is on, to come back to after switching the interface language. */
  next: string;
  /** The search box's behaviour (suggestions, submit). */
  search: Omit<HeaderSearchProps, "mobile">;
  /** The phone menu's state, when something else (the reader's panel header) can open it too. */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}

const A = ({ href, children, ...rest }: { href: string; children: ReactNode; className?: string; target?: string; "data-testid"?: string }) => (
  <a href={href} {...(rest.target === "_blank" ? { rel: "noopener noreferrer" } : {})} {...rest}>
    {children}
  </a>
);

/** A header drop-down: an icon button that opens a small menu of links. */
function Menu({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} label={label} trigger={(p) => <IconButton {...p} icon={icon} label={label} />}>
      <div className={styles.menu} onClick={(e) => (e.target as Element).closest("a") && setOpen(false)}>{children}</div>
    </Popover>
  );
}

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
 */
export function SiteHeader({ next, search, menuOpen, onMenuOpenChange }: SiteHeaderProps) {
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

  return (
    <header className={styles.header} lang={he ? "he" : "en"} dir={he ? "rtl" : "ltr"}>
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
          <A href={`${LIBRARY}/register?next=${encodeURIComponent(next)}`} className={styles.signup}><InterfaceText en="Sign Up" he="להרשמה" /></A>
          <div className={styles.icons}>
            <a className={styles.iconLink} href={HELP[lang]} target="_blank" rel="noopener noreferrer" aria-label={t("Help", "עזרה")} title={t("Help", "עזרה")}><Icon name="help" size="1.3em" /></a>
            <Menu icon="globe" label={t("Toggle Interface Language Menu", "החלפת שפת הממשק")}>
              <div className={styles.menuHeading}>{t("Site Language", "שפת האתר")}</div>
              <LanguageLinks next={next} lang={lang} />
            </Menu>
            <Menu icon="grid" label={t("Library", "ספריה")}>
              <A href={`${LIBRARY}/about`} className={styles.menuItem}><img src={logo} alt="Sefaria" height={18} /></A>
              <div className={styles.sep} />
              <A href={`${LIBRARY}/`} className={styles.menuItem}><span className={styles.dot} style={{ background: "var(--sefaria-blue, #18345d)" }} />{t("Library", "ספריה")}</A>
              <A href={`${VOICES}/`} className={styles.menuItem}><span className={styles.dot} style={{ background: "var(--sheets-green, #4b8a6d)" }} />{t("Voices", "חיבורים")}</A>
              <A href={DEVELOPERS} className={styles.menuItem} target="_blank"><span className={styles.dot} style={{ background: "var(--devportal-purple, #5d4b8a)" }} />{t("Developers", "מפתחים")}</A>
              <div className={styles.sep} />
              <A href={`${LIBRARY}/products`} className={styles.menuItem} target="_blank">{t("More from Sefaria", "עוד מספריא")} ›</A>
            </Menu>
            <Menu icon="user" label={t("Account menu", "תפריט חשבון")}>
              <A href={`${LIBRARY}/login?next=${encodeURIComponent(next)}`} className={styles.menuItem}>{t("Log in", "התחברות")}</A>
              <A href={`${LIBRARY}/register?next=${encodeURIComponent(next)}`} className={styles.menuItem}>{t("Sign up", "להרשמה")}</A>
              <div className={styles.sep} />
              <div className={styles.menuHeading}>{t("Site Language", "שפת האתר")}</div>
              <LanguageLinks next={next} lang={lang} />
              <div className={styles.sep} />
              <A href={`${LIBRARY}/updates`} className={styles.menuItem}>{t("New Additions", "חידושים")}</A>
              <A href={HELP[lang]} className={styles.menuItem} target="_blank">{t("Help", "עזרה")}</A>
            </Menu>
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
        <A href={`${LIBRARY}/register?next=${encodeURIComponent(next)}`} className={styles.menuItem}><Icon name="user" /><InterfaceText en="Sign up" he="להרשמה" /></A>
        <A href={`${LIBRARY}/login?next=${encodeURIComponent(next)}`} className={styles.menuItem}><InterfaceText en="Log in" he="התחברות" /></A>
      </nav>
    </header>
  );
}
