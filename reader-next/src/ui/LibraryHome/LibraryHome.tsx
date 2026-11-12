import type { ReactNode } from "react";
import { isCategory, type TocNode } from "~/lib/catalog/toc";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { markdownToHtml } from "~/lib/html/markdown";
import { ContentLanguage } from "../ContentLanguage/ContentLanguage";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { NavPage } from "../NavPage/NavPage";
import { AboutBlurb } from "../NavSidebar/NavSidebar";
import { categoryColor } from "../tokens/category-color";
import { AdminButtons, type PageAdmin } from "../AdminButtons/AdminButtons";
import styles from "./LibraryHome.module.css";

/**
 * Browse the Library: every top-level category as a card with a coloured line, its name and a short description.
 *
 * @feature LIB-001 Browse the Library category grid
 * @feature LIB-002 Library home header and edit buttons
 */
/** `beforeGrid`: what the old TextsPage put between the About blurb and the categories (the dedication, a phone's Recently Viewed). */
export function LibraryHome({ tree, sidebar, footer, admin, beforeGrid }: { tree: readonly TocNode[]; sidebar?: ReactNode; footer?: ReactNode; admin?: PageAdmin; beforeGrid?: ReactNode }) {
  return (
    <NavPage sidebar={sidebar} footer={footer} top={{ main: 60, side: 60 }}>
      {admin?.editor ?? (
        <ContentLanguage phoneHeader>
          <HomeMain tree={tree} admin={admin} beforeGrid={beforeGrid} />
        </ContentLanguage>
      )}
    </NavPage>
  );
}

function HomeMain({ tree, admin, beforeGrid }: { tree: readonly TocNode[]; admin?: PageAdmin; beforeGrid?: ReactNode }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <>
      <div className={styles.titleBar}>
        <h1 className={styles.title} lang={he ? "he" : "en"} dir={he ? "rtl" : "ltr"}>
          <InterfaceText en="Browse the Library" he="עיון בספריה" />
        </h1>
      </div>
      {admin ? <AdminButtons buttons={admin.buttons} /> : null}
      <AboutBlurb className={styles.phoneAbout} />
      {beforeGrid}
      <div className={styles.grid}>
        {tree.filter(isCategory).map((c) => (
          <div key={c.category} className={styles.block} style={{ ["--_line" as string]: categoryColor(c.category) } as React.CSSProperties} data-cat={c.category}>
            <Link className={styles.blockTitle} href={`/texts/${encodeURIComponent(c.category)}`} lang={he ? "he" : "en"} dir={he ? "rtl" : "ltr"}>{he ? c.heCategory : c.category}</Link>
            {/* the language and direction of what is shown: a Hebrew interface without a Hebrew description shows the English */}
            <div className={styles.desc} {...(he && c.heShortDesc ? { lang: "he", dir: "rtl" } : { lang: "en", dir: "ltr" })}>{he ? c.heShortDesc || c.enShortDesc : c.enShortDesc}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * The old TextsPage's daily dedication: a pale band, the English in italic Garamond, the Hebrew in Heebo, links underlined.
 * @feature LIB-005 Daily dedication banner
 */
export function Dedication({ text }: { text: { en?: string; he?: string } }) {
  const he = useInterfaceLang() === "hebrew";
  const lang = he && text.he ? "he" : text.en ? "en" : "he";
  const md = lang === "he" ? text.he : text.en;
  if (!md) return null;
  return (
    <div className={styles.dedication} data-dedication="">
      <span lang={lang} dir={lang === "he" ? "rtl" : "ltr"} dangerouslySetInnerHTML={{ __html: markdownToHtml(md) }} />
    </div>
  );
}
