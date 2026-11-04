import { LIBRARY } from "~/lib/shell/links";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { SidebarModule } from "./NavSidebar";
import styles from "./NavSidebar.module.css";
import t from "./TopicModules.module.css";

/** A topic or category as the sidebar lists it. */
export interface SidebarTopic {
  slug: string;
  primaryTitle: { en: string; he: string };
}

/** A single topic's page (this client's since the topic page port): `/topics/<slug>`, a routed link. */
export const topicPageHref = (slug: string) => `/topics/${slug}`;

/**
 * The topics pages' sidebar modules, ported from the old NavSidebar (static/js/NavSidebar.jsx): About Topics, Trending Topics,
 * Browse Topics, All Topics A–Z, Sponsor a Day of Learning, the Study Companion and Get the Mobile App. They keep the old
 * data-anl-* attributes, so the declarative tracker reports the same navto_topic events.
 *
 * @feature TOP-003 Topics landing page layout
 * @feature TOP-013 Topic category page
 * @feature TOP-014 All Topics A-Z index
 */
export function AboutTopics() {
  return (
    <SidebarModule title={<InterfaceText en="About Topics" he={'אודות "נושאים"'} />}>
      <InterfaceText
        en="Topics Pages present a curated selection of various genres of sources on thousands of chosen subjects. You can browse by category, search for something specific, or view the most popular topics — and related topics — on the sidebar. Explore and click through to learn more."
        he="דפי הנושא מציגים מקורות נבחרים מארון הספרים היהודי עבור אלפי נושאים. ניתן לדפדף לפי קטגוריה או לחפש לפי נושא ספציפי, ובסרגל הצד מוצגים הנושאים הפופולריים ביותר ואלה הקשורים אליהם.  הקליקו ושוטטו בין הנושאים השונים כדי ללמוד עוד."
      />
    </SidebarModule>
  );
}

/** Trending Topics: nothing until the list arrives (the old module rendered null meanwhile). */
export function TrendingTopics({ topics }: { topics: readonly SidebarTopic[] | undefined }) {
  if (!topics) return null;
  return (
    <div data-anl-feature_name="Trending" data-anl-link_type="topic">
      <SidebarModule title={<InterfaceText en="Trending Topics" he="נושאים נפוצים" />}>
        <div className={t.list}>
          {topics.map((topic) => (
            <div className={`${styles.link} ${styles.ref}`} key={topic.slug}>
              <Link href={topicPageHref(topic.slug)} data-anl-link_type="topic" data-anl-event="navto_topic:click" data-anl-text={topic.primaryTitle.en}>
                <InterfaceText en={topic.primaryTitle.en} he={topic.primaryTitle.he} />
              </Link>
            </div>
          ))}
        </div>
      </SidebarModule>
    </div>
  );
}

/** Browse Topics (TopicLandingTopicCatList): the top-level categories; its title is the target of the phone's "Explore all Topics ›". */
export function BrowseTopics({ categories }: { categories: readonly SidebarTopic[] }) {
  return (
    <span data-anl-feature_name="Browse Topics">
      <SidebarModule
        title={
          <span id="browseTopics">
            <InterfaceText en="Browse Topics" he="לדפדוף במגוון נושאים" />
          </span>
        }
      >
        <div className={t.list}>
          {categories.map((c) => (
            <div className={`${styles.link} ${styles.ref}`} key={c.slug}>
              <Link href={`/topics/category/${c.slug}`} data-anl-link_type="category" data-anl-text={c.primaryTitle.en} data-anl-event="navto_topic:click">
                <InterfaceText en={c.primaryTitle.en} he={c.primaryTitle.he} />
              </Link>
            </div>
          ))}
        </div>
      </SidebarModule>
    </span>
  );
}

/** "All Topics A-Z ›": a module whose title is the link. */
export function AZTopicsLink() {
  return (
    <span data-anl-feature_name="Browse A-Z">
      <SidebarModule>
        <Link className={t.azLink} href="/topics/all/a" data-anl-link_type="see all" data-anl-text="All Topics A-Z ›" data-anl-event="navto_topic:click">
          <h2 className={styles.title}>
            <InterfaceText en="All Topics A-Z ›" he="כל הנושאים מא׳ עד ת׳ ›" />
          </h2>
        </Link>
      </SidebarModule>
    </span>
  );
}

/** Sponsor A Day of Learning: the donate page's day-of-learning campaign (DonateLink link="dayOfLearning"). */
export function SponsorADay() {
  const he = useInterfaceLang() === "hebrew";
  // the old DonateLink link="dayOfLearning": the interface language's campaign, the module as its source
  const href = `https://donate.sefaria.org/${he ? "sponsorhe" : "sponsor"}?c_src=NavSidebar-SponsorADay`;
  return (
    <SidebarModule title={<InterfaceText en="Sponsor A Day of Learning" he="תרמו יום לימוד בספריא" />}>
      <InterfaceText
        en="With your help, we can add more texts and translations to the library, develop new tools for learning, and keep Sefaria accessible for Torah study anytime, anywhere."
        he="בעזרת התרומה שלכם נוכל להוסיף מקורות, תרגומים, לפתח כלים חדשים ללימוד ולשמור על גישה חופשית ללימוד תורה, בכל מקום ובכל זמן."
      />
      <br />
      <a className={`${styles.button} ${styles.auto}`} href={href} target="_blank" rel="noopener noreferrer">
        <img src="/icons/heart.png" alt={he ? "סמל תרומה" : "donation icon"} />
        <InterfaceText en="Sponsor A Day" he="הקדישו יום לימוד" />
      </a>
    </SidebarModule>
  );
}

/** The weekly parashah study companion (Torah Portions, English interface only — the page decides). */
export function StudyCompanion() {
  return (
    <SidebarModule title={<InterfaceText en="Study Companion" />}>
      <div>
        <InterfaceText en="Get the Weekly Parashah Study Companion in your inbox." />
      </div>
      <a
        className={`${styles.button} ${styles.auto}`}
        data-anl-event="select_promotion:click|view_promotion:scrollIntoView"
        data-anl-promotion_name="Parashah Email Signup - Topic TOC"
        href="https://learn.sefaria.org/weekly-parashah/"
      >
        <img src="/icons/email-newsletter.svg" alt="Sign up for our weekly parashah study companion" />
        <InterfaceText en="Sign Up" he="להרשמה" />
      </a>
    </SidebarModule>
  );
}

/** Get the Mobile App: the blurb, its link to /mobile, and the two store buttons. */
export function GetTheApp() {
  const he = useInterfaceLang() === "hebrew";
  return (
    <SidebarModule title={<InterfaceText en="Get the Mobile App" he="הורידו את היישומון" />}>
      <InterfaceText en="Access the Jewish library anywhere and anytime with the" he="בעזרת היישומון תוכלו לגשת לארון הספרים היהודי בכל מקום ובכל זמן." />{" "}
      <a href={`${LIBRARY}/mobile`} className={styles.inText}>
        <InterfaceText en="Sefaria mobile app." he="אפליקציית ספריא לנייד." />
      </a>
      <br />
      <a className={t.store} href="https://itunes.apple.com/us/app/sefaria/id1163273965?ls=1&mt=8" target="_blank" rel="noopener noreferrer">
        <img src="/icons/ios.svg" alt={he ? "אפליקציית ספריא לאייפון" : "Sefaria app on IOS"} />
        <span>iOS</span>
      </a>
      <a className={t.store} href="https://play.google.com/store/apps/details?id=org.sefaria.sefaria" target="_blank" rel="noopener noreferrer">
        <img src="/icons/android.svg" alt={he ? "אפליקציית ספריא לאנדרואיד" : "Sefaria app on Android"} />
        <span>Android</span>
      </a>
    </SidebarModule>
  );
}

