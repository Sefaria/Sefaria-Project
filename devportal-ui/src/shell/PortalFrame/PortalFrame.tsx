import type { ReactNode } from 'react';
import styles from './PortalFrame.module.css';

/**
 * How the columns are arranged (REFERENCE_SPEC.md §1.2, §1.4, §1.6; SITE_ATLAS.md §4):
 * - `docs`: the right rail (Copy Page, table of contents) sits inside the article, as on live.
 * - `reference`: the playground is a third column beside the article; at ≤1065px it stacks below it.
 * - `plain`: no sidebar, no rail (custom pages, the 404 page).
 */
export type FrameLayout = 'docs' | 'reference' | 'plain';

export interface PortalFrameProps {
  layout: FrameLayout;
  /** The sidebar (`Sidebar`). Hidden at ≤768px unless `sidebarOpen`, when it floats under the header. */
  sidebar?: ReactNode;
  sidebarOpen?: boolean;
  /** Id of the sidebar column, for the mobile sub-nav button's `aria-controls`. */
  sidebarId?: string;
  /** The right column: the table of contents on docs pages, the playground on endpoint pages. */
  rail?: ReactNode;
  /** The article's content. The frame supplies `article#content`, the skip link's target. */
  children: ReactNode;
}

/** C6 `PortalMain` + `Article`: the three-column frame under the header. */
export function PortalFrame({ layout, sidebar, sidebarOpen = false, sidebarId, rail, children }: PortalFrameProps) {
  const hasSidebar = layout !== 'plain' && sidebar !== undefined && sidebar !== null;
  const hasRail = layout !== 'plain' && rail !== undefined && rail !== null;
  return (
    <main className={`dp-rm-app ${styles.main}`} data-layout={layout}>
      <div className={styles.container}>
        {hasSidebar && (
          <div id={sidebarId} className={styles.sidebar} data-open={sidebarOpen ? 'true' : undefined}>
            {sidebar}
          </div>
        )}
        {layout === 'reference' ? (
          <div className={styles.columnsHost}>
            <div className={styles.columns}>
              <article id="content" className={styles.article} tabIndex={-1}>
                {children}
              </article>
              {hasRail && <div className={`dp-rm-playground ${styles.playground}`}>{rail}</div>}
            </div>
          </div>
        ) : (
          <article id="content" className={styles.article} tabIndex={-1}>
            {hasRail ? (
              <div className={styles.docsColumns}>
                <div className={styles.docsBody}>{children}</div>
                <div className={styles.docsRail}>{rail}</div>
              </div>
            ) : (
              children
            )}
          </article>
        )}
      </div>
    </main>
  );
}
