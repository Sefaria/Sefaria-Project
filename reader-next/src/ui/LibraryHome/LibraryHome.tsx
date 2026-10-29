import type { ReactNode } from "react";
import { isCategory, type TocNode } from "~/lib/catalog/toc";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
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
export function LibraryHome({ tree, sidebar, footer, admin }: { tree: readonly TocNode[]; sidebar?: ReactNode; footer?: ReactNode; admin?: PageAdmin }) {
  return (
    <NavPage sidebar={sidebar} footer={footer} top={{ main: 60, side: 60 }}>
      {admin?.editor ?? (
        <ContentLanguage phoneHeader>
          <HomeMain tree={tree} admin={admin} />
        </ContentLanguage>
      )}
    </NavPage>
  );
}

function HomeMain({ tree, admin }: { tree: readonly TocNode[]; admin?: PageAdmin }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <>
      <div className={styles.titleBar}>
        <h1 className={styles.title} lang={he ? "he" : "en"}>
          <InterfaceText en="Browse the Library" he="עיון בספריה" />
        </h1>
      </div>
      {admin ? <AdminButtons buttons={admin.buttons} /> : null}
      <AboutBlurb className={styles.phoneAbout} />
      <div className={styles.grid}>
        {tree.filter(isCategory).map((c) => (
          <div key={c.category} className={styles.block} style={{ ["--_line" as string]: categoryColor(c.category) } as React.CSSProperties} data-cat={c.category}>
            <Link className={styles.blockTitle} href={`/texts/${encodeURIComponent(c.category)}`} lang={he ? "he" : "en"}>{he ? c.heCategory : c.category}</Link>
            <div className={styles.desc} lang={he ? "he" : "en"}>{he ? c.heShortDesc || c.enShortDesc : c.enShortDesc}</div>
          </div>
        ))}
      </div>
    </>
  );
}
