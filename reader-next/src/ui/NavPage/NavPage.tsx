import type { ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { categoryColor } from "../tokens/category-color";
import styles from "./NavPage.module.css";

export interface NavPageProps {
  children: ReactNode;
  /** Sidebar modules, top to bottom. */
  sidebar?: ReactNode;
  /** The footer under the sidebar's modules. */
  footer?: ReactNode;
  /** Top category: tints the line under the header. Omit for none. */
  colorCategory?: string;
  /** Accessible name of the sidebar. */
  sidebarLabel?: string;
  /** Top padding of the page column and of the sidebar on a wide screen, where a page sits lower than the library's 56px (search). */
  top?: { main?: number; side?: number };
}

/**
 * The frame of the library's pages — home, category, book: the page's own column and a sidebar of modules with a footer,
 * a coloured line on top, one column on a phone. Replaces the old `.readerNavMenu .sidebarLayout` + NavSidebar.
 *
 * @feature LIB-023 Nav sidebar container and module registry
 * @feature LIB-019 Category and text color coding
 */
export function NavPage({ children, sidebar, footer, colorCategory, sidebarLabel, top }: NavPageProps) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <div className={styles.page} lang={he ? "he" : "en"} dir={he ? "rtl" : "ltr"} style={colorCategory ? { borderBlockStart: `4px solid ${categoryColor(colorCategory)}` } : undefined}>
      <div className={styles.main} style={top?.main ? ({ "--_top": `${top.main}px` } as React.CSSProperties) : undefined}>{children}</div>
      <aside className={styles.side} style={top?.side ? ({ "--_top": `${top.side}px` } as React.CSSProperties) : undefined} aria-label={sidebarLabel ?? (he ? "ניווט בסרגל הצד" : "Sidebar navigation")}>
        {sidebar}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </aside>
    </div>
  );
}
