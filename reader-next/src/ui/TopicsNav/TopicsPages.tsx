import type { ReactNode } from "react";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { NavPage } from "../NavPage/NavPage";
import { AdminButtons, type PageAdmin } from "../AdminButtons/AdminButtons";
import styles from "./TopicsNav.module.css";

/** The analytics frame of a topics page (the old .readerNavMenu's data-anl-*), around the whole page, sidebar included. */
function Frame({ anl, children }: { anl: Record<string, string>; children: ReactNode }) {
  const attrs = Object.fromEntries(Object.entries(anl).map(([k, v]) => [`data-anl-${k}`, v]));
  return (
    <div className={styles.frame} {...attrs}>
      {children}
    </div>
  );
}

/**
 * The library's topics home (TopicsLandingPage): "Explore by Topic", then the search, the word cloud, the featured topic, the
 * newsletter, the random cards, and this week's portion beside the seasonal topic; a sidebar of Browse Topics, Trending Topics,
 * All Topics A–Z and the promotion slot. Its column is wider than other library pages' (783px).
 *
 * @feature TOP-003 Topics landing page layout
 */
export function TopicsLandingPage({ search, salad, featured, newsletter, deck, parasha, seasonal, sidebar, footer }: Record<"search" | "salad" | "featured" | "newsletter" | "deck" | "parasha" | "seasonal" | "sidebar" | "footer", ReactNode>) {
  return (
    <Frame anl={{ project: "topics", panel_name: "Explore by Topic", panel_type: "Topic Landing" }}>
      <NavPage layout="landing" top={{ main: 60, side: 60 }} sidebar={sidebar} footer={footer}>
        <div className={styles.landing}>
          <h1 className={styles.landingHeader}>
            <InterfaceText en="Explore by Topic" he="למדו לפי נושא" />
          </h1>
          <div className={`${styles.section} ${styles.firstSection}`}>{search}</div>
          <div className={`${styles.section} ${styles.afterSearch}`}>{salad}</div>
          <div className={styles.section}>{featured}</div>
          <div className={styles.section}>{newsletter}</div>
          <div className={styles.section}>{deck}</div>
          <div className={`${styles.section} ${styles.temporal}`}>
            {parasha}
            {seasonal}
          </div>
        </div>
      </NavPage>
    </Frame>
  );
}

/**
 * A topic category (TopicCategory): its title, the moderators' buttons, and its subtopics as cards; a sidebar of About Topics, the
 * promotion slot (the Study Companion after About on Torah Portions in English), Trending Topics and Sponsor a Day.
 *
 * @feature TOP-013 Topic category page
 */
export function TopicCategoryPage({ title, panelCategory, admin, cards, sidebar, footer }: { title: { en: string; he: string }; panelCategory: string; admin?: PageAdmin; cards: ReactNode; sidebar: ReactNode; footer: ReactNode }) {
  return (
    <Frame anl={{ project: "topics", panel_category: panelCategory }}>
      <NavPage top={{ main: 60, side: 60 }} sidebar={sidebar} footer={footer}>
        {admin?.editor ?? (
          <div data-anl-feature_name="Main">
            <div className={styles.navTitle}>
              <h1 className={styles.pageTitle}>
                <InterfaceText en={title.en} he={title.he} />
              </h1>
              {admin ? <AdminButtons buttons={admin.buttons} /> : null}
            </div>
            {cards}
          </div>
        )}
      </NavPage>
    </Frame>
  );
}

/**
 * All Topics A–Z (TopicPageAll): the title, the filter box, the letters, then the cards — "Loading..." until they arrive, "There
 * are no topics here." for none; a sidebar of the promotion slot, Trending Topics, Get the App and Support Sefaria.
 *
 * @feature TOP-014 All Topics A-Z index
 */
export function AllTopicsPage({ filter, letters, cards, sidebar, footer }: Record<"filter" | "letters" | "cards" | "sidebar" | "footer", ReactNode>) {
  return (
    <NavPage top={{ main: 60, side: 60 }} sidebar={sidebar} footer={footer}>
      <h1 className={styles.pageTitle}>
        <InterfaceText en="All Topics" he="כל הנושאים" />
      </h1>
      {filter}
      {letters}
      <div className={styles.allTopicsList}>{cards}</div>
    </NavPage>
  );
}

/**
 * The old LoadingMessage: a grey line in place of the list. Its Hebrew is "טוען מידע..." unless given one — so the Hebrew
 * interface's empty letter reads "loading" too, as on sefaria.org.
 */
export function TopicsMessage({ en = "Loading...", he }: { en?: string; he?: string }) {
  return (
    <div className={styles.message} aria-live="polite">
      <InterfaceText en={en} he={he || "טוען מידע..."} />
    </div>
  );
}
