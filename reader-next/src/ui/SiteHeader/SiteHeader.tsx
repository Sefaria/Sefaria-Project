import { useEffect, useRef, useState, type ReactNode } from "react";
import { bothEvent, gtagEvent, useOnceFullyVisible } from "~/lib/analytics";
import { DEVELOPERS, HELP, LIBRARY, VOICES, donateHref, interfaceHref } from "~/lib/shell/links";
import { HeaderSearch, type HeaderSearchProps } from "./HeaderSearch";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { isAuthPath, nextFromPath, withNext } from "~/lib/auth/utils";
import { Link } from "../Link/Link";
import { Popover } from "../Popover/Popover";
import { ProfilePic } from "../ProfilePic/ProfilePic";
import { HEADER_PAGE_ACTION_ID } from "./slots";
import styles from "./SiteHeader.module.css";
import dd from "./HeaderDropdown.module.css";
import mn from "./MobileNav.module.css";

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
function Menu({ icon, label, children, anlFeature, picture, optionsClassName }: { icon: string; label: string; children: ReactNode; anlFeature?: string; picture?: ReactNode; optionsClassName?: string }) {
  const he = useInterfaceLang() === "hebrew";
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
        panelClassName={dd.menu}
        trigger={(p) => (
          <span className={styles.trigger} onClickCapture={() => (byButton.current = true)} data-anl-event={anlFeature ? (open ? "modswitch_close:click" : "modswitch_open:click") : undefined}>
            {picture ? (
              <button type="button" {...(p as object)} className={styles.pictureButton} aria-label={label} title={label}>
                {picture}
              </button>
            ) : (
              <button type="button" {...(p as object)} className={styles.iconOnly} aria-label={label} title={label}>
                <img src={`/icons/${icon}.svg`} alt="" width={18} height={18} />
              </button>
            )}
          </span>
        )}
      >
        <div className={optionsClassName ? `${dd.options} ${optionsClassName}` : dd.options} lang={he ? "he" : "en"} onClick={(e) => {
          // a link closes the menu, except one marked data-prevent-close (the reader's name), as the old DropdownMenu
          const a = (e.target as Element).closest("a");
          if (a && !a.hasAttribute("data-prevent-close")) setOpen(false);
        }}>{children}</div>
      </Popover>
    </div>
  );
}

const SWITCH = "modswitch_item_click:click";

/** The old DropdownModuleItem: a coloured dot and the module's name. */
const ModuleItem = ({ href, dot, text, anl, newTab }: { href: string; dot: string; text: string; anl: string; newTab?: boolean }) => (
  <A href={href} className={dd.item} {...(newTab ? { target: "_blank" } : {})} data-anl-event={SWITCH} data-anl-text={anl}>
    <div className={dd.moduleHeader}>
      <span className={dd.dot} style={{ backgroundColor: dot }} />
      <span className={dd.moduleText}>{text}</span>
    </div>
  </A>
);

/** The old DropdownLanguageToggle: "Site Language" over English • עברית (the globe's menu stacks them, with a tick). */
const DropdownLanguageToggle = ({ next, lang, globe }: { next: string; lang: "english" | "hebrew"; globe?: boolean }) => {
  const check = <svg className={dd.check} viewBox="0 0 1792 1792" aria-hidden="true" focusable="false"><path fill="currentColor" d="M1671 566q0 40-28 68l-724 724-136 136q-28 28-68 28t-68-28l-136-136-362-362q-28-28-28-68t28-68l136-136q28-28 68-28t68 28l294 295 656-657q28-28 68-28t68 28l136 136q28 28 28 68z" /></svg>;
  return (
    <>
      <div className={dd.languageHeader}>{lang === "hebrew" ? "שפת האתר" : "Site Language"}</div>
      <div className={dd.languageToggle}>
        <span className={dd.englishButton}>
          <a href={interfaceHref("english", next)} aria-current={lang === "english"} data-testid="lang-en">{globe && lang === "english" ? check : null}English</a>
        </span>
        <a href={interfaceHref("hebrew", next)} aria-current={lang === "hebrew"} data-testid="lang-he">{globe && lang === "hebrew" ? check : null}עברית</a>
      </div>
    </>
  );
};

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
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    // Escape closes the menu; focus that was inside it goes back to the button (CODE_REVIEW R-31: it was lost to <body>)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inside = document.getElementById("mobile-nav")?.contains(document.activeElement);
      setMobileOpen(false);
      if (inside) menuButton.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);
  const logo = he ? "/brand/library-logo-hebrew.svg" : "/brand/library-logo-english.svg";
  const logoLabel = he ? "לוגו ספריית ספריא" : "Sefaria library logo";
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
          <A href={LIBRARY + "/"} className={styles.logo}><img src={logo} alt={logoLabel} /><span className={styles.samech} role="img" aria-label={logoLabel} /></A>
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
            <a className={styles.iconLink} href={HELP[lang]} target="_blank" rel="noopener noreferrer" aria-label={t("Help", "עזרה")} title={t("Help", "עזרה")}><img src="/icons/help_mdl.svg" alt="" width={18} height={18} /></a>
            {viewer ? (
              <a className={styles.iconLink} href={`${LIBRARY}/saved`} aria-label={t("Saved items", "שמורים")} title={t("Saved items", "שמורים")} data-testid="saved-link"><img src="/icons/bookmarkset_outline_mdl.svg" alt="" width={18} height={18} /></a>
            ) : (
              <Menu icon="globallanguageswitcher_mdl" label={t("Toggle Interface Language Menu", "החלפת שפת הממשק")} optionsClassName={dd.globe}>
                <DropdownLanguageToggle next={next} lang={lang} globe />
              </Menu>
            )}
            <Menu icon="moduleswitcher_mdl" label={t("Library", "ספריה")} anlFeature="module_switcher" optionsClassName={dd.modules}>
              <A href={`${LIBRARY}/about`} className={`${dd.item} ${dd.logoItem}`} data-anl-event={SWITCH} data-anl-text="About Sefaria"><img src={he ? "/brand/sefaria-logo-hebrew.png" : "/brand/sefaria-logo.svg"} alt={t("Sefaria", "ספריא")} /></A>
              <div className={dd.separator} />
              <ModuleItem href={`${LIBRARY}/`} dot="#18345d" text={t("Library", "ספריה")} anl="Library" />
              <div className={dd.separator} />
              <ModuleItem href={`${VOICES}/`} dot="#518159" text={t("Voices", "חיבורים")} anl="Voices" newTab />
              <div className={dd.separator} />
              <ModuleItem href={DEVELOPERS} dot="#7c416f" text={t("Developers", "מפתחים")} anl="Developers" newTab />
              <div className={dd.separator} />
              <A href={`${LIBRARY}/products`} className={`${dd.item} ${dd.moreItem}`} target="_blank" data-anl-event={SWITCH} data-anl-text="More">{t("More from Sefaria", "עוד מספריא")} ›</A>
            </Menu>
            {viewer ? (
              <Menu icon="profile_loggedout_mdl" label={t("Account menu", "תפריט חשבון")} picture={<ProfilePic name={viewer.name} url={viewer.imageUrl} size={24} alt={t("User Profile Picture", "תמונת פרופיל משתמש")} />}>
                <a className={dd.item} data-prevent-close="true"><strong>{viewer.name}</strong></a>
                <div className={dd.separator} />
                <A href={`${LIBRARY}/settings/account`} className={dd.item}>{t("Account Settings", "הגדרות")}</A>
                <A href={`${LIBRARY}/torahtracker`} className={dd.item}>{t("Torah Tracker", "לימוד במספרים")}</A>
                <div className={dd.separator} />
                <DropdownLanguageToggle next={next} lang={lang} />
                <div className={dd.separator} />
                <A href={`${LIBRARY}/updates`} className={dd.item}>{t("New Additions", "חידושים בארון הספרים של ספריא")}</A>
                <A href={HELP[lang]} className={dd.item} target="_blank">{t("Help", "עזרה")}</A>
                <div className={dd.separator} />
                <A href={`${LIBRARY}${LOGOUT_HREF}`} className={dd.item}>{t("Log Out", "ניתוק")}</A>
              </Menu>
            ) : (
            <Menu icon="profile_loggedout_mdl" label={t("Account menu", "תפריט חשבון")}>
              {authLink("login", dd.item, t("Log in", "התחברות"))}
              {authLink("register", dd.item, t("Sign up", "להרשמה"))}
              <div className={dd.separator} />
              <DropdownLanguageToggle next={next} lang={lang} />
              <div className={dd.separator} />
              <A href={`${LIBRARY}/updates`} className={dd.item}>{t("New Additions", "חידושים בארון הספרים של ספריא")}</A>
              <A href={HELP[lang]} className={dd.item} target="_blank">{t("Help", "עזרה")}</A>
            </Menu>
            )}
          </div>
        </div>
      </div>

      <div className={styles.mobileBar}>
        <div>
          <button ref={menuButton} type="button" className={styles.menuButton} aria-label={t("Menu", "תפריט")} title={t("Menu", "תפריט")} aria-expanded={mobileOpen} aria-controls="mobile-nav" onClick={() => setMobileOpen((o) => !o)}>
            {/* the old Font Awesome 4 "fa-bars" glyph at 24px */}
            <svg viewBox="0 0 1536 1280" width="21" height="17" aria-hidden="true" focusable="false"><path fill="currentColor" d="M1536 1088v128q0 26-19 45t-45 19H64q-26 0-45-19t-19-45v-128q0-26 19-45t45-19h1408q26 0 45 19t19 45zm0-512v128q0 26-19 45t-45 19H64q-26 0-45-19T0 704V576q0-26 19-45t45-19h1408q26 0 45 19t19 45zm0-512v128q0 26-19 45t-45 19H64q-26 0-45-19T0 192V64q0-26 19-45T64 0h1408q26 0 45 19t19 45z" /></svg>
          </button>
        </div>
        <div className={styles.mobileCenter}>
          <A href={LIBRARY + "/"} className={styles.logo}><img src={logo} alt={logoLabel} /></A>
        </div>
        {/* a library page puts its content-language toggle here (ContentLanguage, through a portal), as the old mobile header did */}
        <div id={HEADER_PAGE_ACTION_ID} className={styles.mobileAction} />
      </div>
      <nav id="mobile-nav" className={mn.menu} hidden={!mobileOpen} lang={he ? "he" : "en"} aria-label={t("Mobile navigation menu", "תפריט ניווט במובייל")}>
        <div className={mn.searchLine}>
          <HeaderSearch mobile {...search} onSearch={(q) => { setMobileOpen(false); search.onSearch(q); }} onSmartSubmit={(q) => { setMobileOpen(false); search.onSmartSubmit(q); }} onChoose={(x) => { setMobileOpen(false); search.onChoose(x); }} />
        </div>
        <A href={`${LIBRARY}/texts`}><img src="/icons/book.svg" alt="" /><InterfaceText en="Texts" he="מקורות" /></A>
        <A href={`${LIBRARY}/topics`}><img src="/icons/topic.svg" alt="" /><InterfaceText en="Topics" he="נושאים" /></A>
        <A href={`${LIBRARY}/calendars`}><img src="/icons/calendar.svg" alt="" /><InterfaceText en="Learning Schedules" he="לוח לימוד יומי" /></A>
        <A href={donateHref("MobileNavMenu")} className={mn.blue} target="_blank"><img src="/icons/heart.png" alt="" /><InterfaceText en="Donate" he="תרומה" /></A>
        <div className={mn.accountLinks}>
          {viewer ? (
            <>
              <A href={`${LIBRARY}/saved`}><img src="/icons/bookmarkset_outline_mdl.svg" alt="" /><InterfaceText en="Saved, History & Notes" he="שמורים, היסטוריה והערות" /></A>
              <A href={`${LIBRARY}/settings/account`}><img src="/icons/settings.svg" alt="" /><InterfaceText en="Account Settings" he="הגדרות" /></A>
            </>
          ) : null}
          <div className={mn.languageToggle}>
            <img src="/icons/globallanguageswitcher_mdl.svg" alt="" />
            {he ? (
              <>
                <a href={interfaceHref("hebrew", next)} lang="he" aria-current="true" data-testid="lang-he">עברית</a>
                <span className={mn.separator}>•</span>
                <a href={interfaceHref("english", next)} className={mn.inactive} data-testid="lang-en">English</a>
              </>
            ) : (
              <>
                <a href={interfaceHref("english", next)} aria-current="true" data-testid="lang-en">English</a>
                <span className={mn.separator}>•</span>
                <a href={interfaceHref("hebrew", next)} lang="he" className={mn.inactive} data-testid="lang-he">עברית</a>
              </>
            )}
          </div>
          <hr />
          <A href={HELP[lang]} target="_blank"><img src="/icons/help_mdl.svg" alt="" /><InterfaceText en="Get Help" he="עזרה" /></A>
          <A href={`${LIBRARY}/mobile-about-menu`}><img src="/icons/info.svg" alt="" /><InterfaceText en="About Sefaria" he="אודות ספריא" /></A>
          <hr />
          <A href={`${VOICES}/`} className={mn.moduleSwitcher}><span className={mn.dot} style={{ backgroundColor: "#518159" }} /><InterfaceText en="Voices on Sefaria" he="חיבורים בספריא" /></A>
          <A href={DEVELOPERS} className={mn.moduleSwitcher} target="_blank"><span className={mn.dot} style={{ backgroundColor: "#7c416f" }} /><InterfaceText en="Developers on Sefaria" he="מפתחים בספריא" /></A>
          <A href={`${LIBRARY}/products`}><img className={mn.chevron} src="/icons/chevron-right.svg" alt="" /><InterfaceText en="More from Sefaria" he="עוד מספריא" /></A>
          <hr />
          {viewer ? (
            <A href={`${LIBRARY}${LOGOUT_HREF}`} className={mn.logout}><img src="/icons/logout.svg" alt="" /><InterfaceText en="Logout" he="התנתקות" /></A>
          ) : (
            <span>
              {authLink("register", mn.first, <><img src="/icons/login.svg" alt="" /><InterfaceText en="Sign up" he="להרשמה" /></>)}
              {authLink("login", mn.last, <InterfaceText en="Log in" he="התחברות" />)}
            </span>
          )}
          <hr />
        </div>
      </nav>
    </header>
  );
}
