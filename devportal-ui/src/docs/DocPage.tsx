// The docs page layout (SITE_ATLAS §4; PLAN §6.2 G): the sidebar column, the article (page header,
// body, footer) and the right rail (Copy Page, table of contents). Custom pages (`/page/<slug>`) have
// no sidebar and no rail but keep the footer. page_doc.html renders the same markup on the server, so
// React's takeover moves nothing (PLAN §2.5). The shell (header, main landmark, mobile sub-nav) is W2's.
import type { ReactNode } from 'react';
import type { DocPayload } from '../contracts';
import { DocBody } from './DocBody';
import { DocsSidebarTree } from './DocsSidebarTree';
import { PageFooter } from './PageFooter';
import { TableOfContents, type TocItem } from './TableOfContents';
import type { EnhanceOptions } from './enhance';

export interface DocPageSlots {
  /** W2's Copy Page split button, top of the rail. */
  copyPage?: ReactNode;
  /** W2's feedback widget. */
  feedback?: ReactNode;
  /** W11's Discord button, placement docs_page_end. */
  discord?: ReactNode;
}

export interface DocPageProps {
  data: DocPayload;
  adopt?: Node[] | null;
  slots?: DocPageSlots;
  enhance?: EnhanceOptions;
  now?: Date;
  /** Id of the sidebar column, for the shell's mobile sub-nav button (`aria-controls`). */
  sidebarId?: string;
  /** At ≤768px the sidebar is hidden unless the sub-nav button opened it. */
  sidebarOpen?: boolean;
}

export function DocPage({ data, adopt, slots = {}, enhance, now, sidebarId, sidebarOpen = false }: DocPageProps) {
  const { page } = data;
  const isCustom = data.section === 'page';
  const tree = data.nav?.tree ?? null;
  const toc = page.toc as TocItem[];
  return (
    <div className={`dp-docs dp-docs--${isCustom ? 'custom' : 'standard'}`} data-layout={data.layout}>
      {tree && (
        <div
          className="dp-docs__sidebar"
          data-slot="sidebar"
          id={sidebarId}
          data-open={sidebarOpen ? 'true' : undefined}
        >
          <nav className="dp-sidebar" aria-label="Secondary navigation">
            <DocsSidebarTree tree={tree} activePath={data.path} />
          </nav>
        </div>
      )}
      <article id="content" className="dp-article dp-docs__article">
        <header className="dp-docs-header">
          <h1 className="dp-docs-header__title">{page.title}</h1>
          {page.excerpt && (
            <div className="dp-docs-header__excerpt">
              <p>{page.excerpt}</p>
            </div>
          )}
        </header>
        <div className="dp-docs__grid">
          <div className="dp-docs__content">
            <DocBody html={page.bodyHtml} adopt={adopt} enhance={enhance} />
            <PageFooter
              updatedAt={isCustom ? null : page.updatedAt}
              pager={data.pager}
              feedback={slots.feedback}
              discord={slots.discord}
              now={now}
            />
          </div>
          {!isCustom && (
            <div className="dp-docs__rail">
              <div className="dp-docs__copy-page" data-slot="copy-page">
                {slots.copyPage}
              </div>
              <TableOfContents entries={toc} />
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
