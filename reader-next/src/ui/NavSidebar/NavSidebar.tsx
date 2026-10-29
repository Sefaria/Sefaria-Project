import type { ReactNode } from "react";
import { markdownToHtml } from "~/lib/html/markdown";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { dafYomi, haftarot, parashah, type CalendarItem } from "~/lib/library/calendars";
import { DONATE, HELP, LIBRARY } from "~/lib/shell/links";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./NavSidebar.module.css";

/**
 * The library pages' sidebar modules, ported from the old NavSidebar: a titled block of text and links. Pages this client does
 * not have yet (about, calendars, visualizations…) are the old site's, so every link works.
 *
 * @feature LIB-023 Nav sidebar container and module registry
 * @feature LIB-024 Sidebar module: Titled text
 * @feature LIB-028 Sidebar module: About Sefaria
 * @feature LIB-030 Sidebar module: Resources
 * @feature LIB-031 Sidebar module: Footer links
 * @feature LIB-033 Sidebar module: Support Sefaria
 * @feature LIB-035 Sidebar module: About text category
 * @feature LIB-037 Sidebar module: Translations languages list
 * @feature LIB-038 Sidebar module: Learning schedules
 * @feature LIB-039 Sidebar module: Weekly Torah portion
 * @feature LIB-040 Sidebar module: Daf Yomi
 * @feature LIB-041 Sidebar module: Visualizations links
 */
export function SidebarModule({ title, children, upper, wideOnly }: { title?: ReactNode; children: ReactNode; upper?: boolean; wideOnly?: boolean }) {
  return (
    <section className={wideOnly ? `${styles.module} ${styles.wideOnly}` : styles.module}>
      {title ? <h2 className={`${styles.title} ${upper ? styles.upper : ""}`}>{title}</h2> : null}
      {children}
    </section>
  );
}

const lib = (path: string) => `${LIBRARY}${path}`;

/**
 * The old Promo module's place: a SidebarModule the CMS (Strapi) fills with a promotion, and otherwise empty. Empty, its 34px margin
 * folds into its neighbours' — except when it comes first, as on a phone's home and most category pages, where it pushes the first
 * title 34px down. Kept so the spacing is the old one; the promotions themselves are not built.
 *
 * @feature LIB-026 Sidebar module: Promotions slot
 */
export function PromoSlot() {
  return <div className={styles.module} aria-hidden="true" />;
}

/** The About text and its Learn More link, without the module's title or button (the phone's home page shows it inline, LIB-004). */
export function AboutBlurb({ className }: { className?: string }) {
  return (
    <p className={className}>
      <InterfaceText
        en="Sefaria is home to 3,000 years of Jewish texts. We are a nonprofit organization offering free access to texts, translations, and commentaries so that everyone can participate in the ongoing process of studying, interpreting, and creating Torah."
        he="ספריא היא ביתם של 3,000 שנות ספרות יהודית. אנו ארגון ללא מטרות רווח המציע גישה חופשית למקורות יהודיים, לתרגומים ולפרשנויות, ומטרתנו לאפשר לכל אחד ואחת להשתתף בתהליך המתמשך של לימוד וחידוש בתורה."
      />
      <a className={styles.inText} href={lib("/about")}><InterfaceText en="Learn More ›" he="לקריאה נוספת ›" /></a>
    </p>
  );
}

/** `wideOnly`: the home page, whose phone layout shows the blurb above the categories instead (the old TextsPage, multiPanel only). */
export function AboutSefaria({ wideOnly }: { wideOnly?: boolean } = {}) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <SidebarModule wideOnly={wideOnly} title={<InterfaceText en="A Living Library of Torah" he="ספריה יהודית דינמית" />}>
      <p className={styles.body}>
        <InterfaceText
          en="Sefaria is home to 3,000 years of Jewish texts. We are a nonprofit organization offering free access to texts, translations, and commentaries so that everyone can participate in the ongoing process of studying, interpreting, and creating Torah."
          he="ספריא היא ביתם של 3,000 שנות ספרות יהודית. אנו ארגון ללא מטרות רווח המציע גישה חופשית למקורות יהודיים, לתרגומים ולפרשנויות, ומטרתנו לאפשר לכל אחד ואחת להשתתף בתהליך המתמשך של לימוד וחידוש בתורה."
        />
        <a className={styles.inText} href={lib("/about")}><InterfaceText en="Learn More ›" he="לקריאה נוספת ›" /></a>
      </p>
      <a className={styles.button} href={he ? "https://youtu.be/rCADxtqPqnw" : "https://help.sefaria.org/hc/en-us/articles/21471911125020-Video-Guide-How-to-Get-Started-Navigating-the-Library"} target="_blank" rel="noopener noreferrer">
        <img src="/icons/vector.svg" alt={he ? "הפעלת סרטון" : "Play video"} />
        <InterfaceText en="Getting Started (2 min)" he="הכירו את ספריא (2 דק')" />
      </a>
    </SidebarModule>
  );
}

const TRANSLATION_LANGUAGES: [string, string][] = [["ar", "عربى"], ["de", "Deutsch"], ["en", "English"], ["eo", "Esperanto"], ["es", "Español"], ["fa", "فارسی"], ["fi", "suomen kieli"], ["fr", "Français"], ["it", "Italiano"], ["ro", "română"], ["pl", "Polski"], ["pt", "Português"], ["ru", "Pусский"], ["tr", "Türkçe"], ["yi", "יידיש"]];
export function Translations() {
  return (
    <SidebarModule title={<InterfaceText en="Translations" he="תרגומים" />}>
      <p className={styles.body}><InterfaceText en="Access key works from the library in several languages." he="יצירות נבחרות מהספרייה בתרגומים לשפות שונות." /></p>
      <div className={styles.langs}>
        <ul>
          {TRANSLATION_LANGUAGES.map(([code, name]) => <li key={code}><a href={lib(`/translations/${code}`)}>{name}</a></li>)}
        </ul>
      </div>
    </SidebarModule>
  );
}

const RefLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <div className={`${styles.link} ${styles.ref}`}>
    <img className={styles.icon} src="/icons/book.svg" alt="" />
    <a href={`/${href}`}>{children}</a>
  </div>
);

/** The old IconLink: an 18px icon from the old site's set and a grey link. */
const IconLink = ({ icon, href, children, newTab }: { icon: string; href: string; children: ReactNode; newTab?: boolean }) => (
  <div className={styles.link}>
    <img className={styles.icon} src={`/icons/${icon}`} alt="" />
    <a href={href} {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>
  </div>
);

export function LearningSchedules({ items }: { items: readonly CalendarItem[] | undefined }) {
  const p = items && parashah(items), d = items && dafYomi(items);
  return (
    <SidebarModule title={<InterfaceText en="Learning Schedules" he="לוח לימוד יומי" />}>
      {p ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}><InterfaceText en="Weekly Torah Portion" he="פרשת השבוע" />: <InterfaceText en={p.displayValue.en} he={p.displayValue.he} /></span>
          <RefLink href={p.url}><InterfaceText en={p.ref} he={p.heRef ?? p.ref} /></RefLink>
        </div>
      ) : null}
      {items && haftarot(items).length ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}><InterfaceText en="Haftarah" he="הפטרה" /></span>
          {haftarot(items).map((h) => <RefLink key={h.url} href={h.url}><InterfaceText en={h.displayValue.en} he={h.displayValue.he} /></RefLink>)}
        </div>
      ) : null}
      {d ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}><InterfaceText en="Daf Yomi" he="דף יומי" /></span>
          <RefLink href={d.url}><InterfaceText en={d.displayValue.en} he={d.displayValue.he} /></RefLink>
        </div>
      ) : null}
      <a className={styles.all} href={lib("/calendars")}><InterfaceText en="All Learning Schedules ›" he="לוחות לימוד נוספים ›" /></a>
    </SidebarModule>
  );
}

export function WeeklyTorahPortion({ items }: { items: readonly CalendarItem[] | undefined }) {
  const p = items && parashah(items);
  return (
    <SidebarModule title={<InterfaceText en="Weekly Torah Portion" he="פרשת השבוע" />}>
      {p ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}><InterfaceText en={p.displayValue.en} he={p.displayValue.he} /></span>
          <RefLink href={p.url}><InterfaceText en={p.ref} he={p.heRef ?? p.ref} /></RefLink>
        </div>
      ) : null}
      {items && haftarot(items).length ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}><InterfaceText en="Haftarah" he="הפטרה" /></span>
          {haftarot(items).map((h) => <RefLink key={h.url} href={h.url}><InterfaceText en={h.displayValue.en} he={h.displayValue.he} /></RefLink>)}
        </div>
      ) : null}
      <a className={styles.all} href={lib("/topics/category/torah-portions")}><InterfaceText en="All Portions ›" he="פרשות השבוע ›" /></a>
    </SidebarModule>
  );
}

export function DafYomi({ items }: { items: readonly CalendarItem[] | undefined }) {
  const d = items && dafYomi(items);
  return (
    <SidebarModule title={<InterfaceText en="Daily Learning" he="לימוד יומי" />}>
      {d ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}><InterfaceText en="Daf Yomi" he="דף יומי" /></span>
          <RefLink href={d.url}><InterfaceText en={d.displayValue.en} he={d.displayValue.he} /></RefLink>
        </div>
      ) : null}
    </SidebarModule>
  );
}

const ICON_LINKS: { en: string; he: string; path: string; icon: string }[] = [
  { en: "Mobile Apps", he: "יישומון לטלפון הנייד", path: "/mobile", icon: "mobile.svg" },
  { en: "Teach with Sefaria", he: "מלמדים עם ספריא", path: "/educators", icon: "educators.svg" },
  { en: "Visualizations", he: "תרשימים גרפיים", path: "/visualizations", icon: "visualizations.svg" },
  { en: "Torah Tab", he: "תורה טאב (תוסף)", path: "/torah-tab", icon: "torah-tab.svg" },
];
export function Resources() {
  const lang = useInterfaceLang();
  return (
    <SidebarModule upper title={<InterfaceText en="Resources" he="משאבים" />}>
      <div className={styles.links}>
        {ICON_LINKS.map((l) => (
          <IconLink key={l.path} icon={l.icon} href={lib(l.path)}><InterfaceText en={l.en} he={l.he} /></IconLink>
        ))}
        <IconLink icon="help.svg" href={HELP[lang]} newTab><InterfaceText en="Help" he="עזרה" /></IconLink>
      </div>
    </SidebarModule>
  );
}

export function SupportSefaria() {
  return (
    <SidebarModule title={<InterfaceText en="Support Sefaria" he="תמכו בספריא" />}>
      <p className={styles.body}><InterfaceText en="Sefaria is an open source, nonprofit project. Support us by making a tax-deductible donation." he="ספריא היא מאגר פתוח וחינמי. תמכו בנו בעזרת תרומה." /></p>
      <a className={`${styles.button} ${styles.auto}`} href={`${DONATE}?c_src=NavSidebar-SupportSefaria`} target="_blank" rel="noopener noreferrer"><img src="/icons/heart.png" alt="" /><InterfaceText en="Make a Donation" he="לתרומה" /></a>
    </SidebarModule>
  );
}

const VISUALIZATIONS = [
  { en: "Tanakh & Talmud", he: 'תנ"ך ותלמוד', url: "/explore" },
  { en: "Talmud & Mishneh Torah", he: "תלמוד ומשנה תורה", url: "/explore-Bavli-and-Mishneh-Torah" },
  { en: "Talmud & Shulchan Arukh", he: "תלמוד ושולחן ערוך", url: "/explore-Bavli-and-Shulchan-Arukh" },
  { en: "Mishneh Torah & Shulchan Arukh", he: "משנה תורה ושולחן ערוך", url: "/explore-Mishneh-Torah-and-Shulchan-Arukh" },
  { en: "Tanakh & Midrash Rabbah", he: 'תנ"ך ומדרש רבה', url: "/explore-Tanakh-and-Midrash-Rabbah" },
  { en: "Tanakh & Mishneh Torah", he: 'תנ"ך ומשנה תורה', url: "/explore-Tanakh-and-Mishneh-Torah" },
  { en: "Tanakh & Shulchan Arukh", he: 'תנ"ך ושולחן ערוך', url: "/explore-Tanakh-and-Shulchan-Arukh" },
];
/** Visualizations whose name mentions one of the page's categories. */
export const visualizationsFor = (categories: readonly string[]) => VISUALIZATIONS.filter((v) => categories.some((c) => v.en.includes(c)));

export function Visualizations({ categories }: { categories: readonly string[] }) {
  const links = visualizationsFor(categories);
  if (!links.length) return null;
  return (
    <SidebarModule title={<InterfaceText en="Visualizations" he="תרשימים גרפיים" />}>
      <p className={styles.body}><InterfaceText en="Explore interconnections among texts with our interactive visualizations." he="העזרו בתרשימים הגרפיים כדי לגלות קשרים מעניינים בין מקורות." /></p>
      <div className={styles.links}>
        {links.map((v) => <IconLink key={v.url} icon="visualization.svg" href={lib(v.url)}><InterfaceText en={v.en} he={v.he} /></IconLink>)}
      </div>
      <a className={styles.all} href={lib("/visualizations")}><InterfaceText en="All Visualizations ›" he="תרשימים גרפיים נוספים ›" /></a>
    </SidebarModule>
  );
}

/** `wideOnly`: a category page, whose phone layout shows the description under the title instead (the old aboutModule, multiPanel only). */
export function AboutTextCategory({ category, heCategory, enDesc, heDesc, wideOnly }: { category: string; heCategory: string; enDesc?: string; heDesc?: string; wideOnly?: boolean }) {
  const he = useInterfaceLang() === "hebrew";
  const desc = he ? heDesc : enDesc;
  if (!desc) return null;
  return (
    <SidebarModule wideOnly={wideOnly} title={<InterfaceText en={`About ${category}`} he={`אודות ${heCategory}`} />}>
      <div className={styles.body} lang={he ? "he" : "en"} dangerouslySetInnerHTML={{ __html: markdownToHtml(desc) }} />
    </SidebarModule>
  );
}

const FOOTER: { en: string; he: string; url: string }[] = [
  { en: "About", he: "אודות", url: lib("/about") },
  { en: "Help", he: "עזרה", url: "help" },
  { en: "Contact Us", he: "צרו קשר", url: "mailto:hello@sefaria.org" },
  { en: "Newsletter", he: "ניוזלטר", url: lib("/newsletter") },
  { en: "Blog", he: "בלוג", url: "https://blog.sefaria.org/" },
  { en: "Instagram", he: "אינסטגרם", url: "https://www.instagram.com/sefariaproject/" },
  { en: "Facebook", he: "פייסבוק", url: "https://www.facebook.com/sefaria.org" },
  { en: "YouTube", he: "יוטיוב", url: "https://www.youtube.com/user/SefariaProject" },
  { en: "Shop", he: "חנות", url: "https://store.sefaria.org/" },
  { en: "Terms", he: "תנאים", url: lib("/terms") },
  { en: "Privacy Policy", he: "מדיניות פרטיות", url: lib("/privacy-policy") },
  { en: "Ways to Give", he: "אפשרויות תרומה", url: lib("/ways-to-give") },
  { en: "Donate", he: "תרומות", url: "donate" },
];
export function SidebarFooter() {
  const lang = useInterfaceLang();
  const url = (u: string) => (u === "help" ? HELP[lang] : u === "donate" ? (lang === "hebrew" ? "https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=Footer" : `${DONATE}?c_src=Footer`) : u);
  return (
    <nav className={`${styles.module} ${styles.footer}`} aria-label={lang === "hebrew" ? "קישורי תחתית" : "Footer links"}>
      <div className={styles.title} aria-hidden="true" />
      <div className={styles.footerLinks}>
        {FOOTER.map((f) => (
          <a key={f.en} href={url(f.url)}><InterfaceText en={f.en} he={f.he} /></a>
        ))}
      </div>
    </nav>
  );
}
