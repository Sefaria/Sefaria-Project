// The docs page layout (SITE_ATLAS §4; PLAN §6.2 G): the sidebar column, the article (page header,
// body, footer) and the right rail (Copy Page, table of contents). Custom pages (`/page/<slug>`) have
// no sidebar and no rail but keep the footer. page_doc.html renders the same markup on the server, so
// React's takeover moves nothing (PLAN §2.5). The shell (header, main landmark, mobile sub-nav) is W2's.
//
// Two article layouts, as live has them (measured 2026-11-18):
// - docs pages (`/docs/...`): the page header spans the article; under it the body and, beside it, the
//   rail with Copy Page above the table of contents;
// - guide pages of the reference section (`/reference/getting-started`, ReadMe's "SuperHubReference"):
//   an article at most 800px wide with Copy Page in the header's top row, and the table of contents in
//   a 280px column at the right edge, from the top of the page.
// `data-visual*` attributes are the visual-parity hooks (e2e-tests/developers-visual/README.md).
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

/** `custom` (`/page/...`), `guide` (a guide page of the reference section) or `standard` (`/docs/...`). */
type DocLayout = 'custom' | 'guide' | 'standard';

function docLayout(data: Pick<DocPayload, 'section'>): DocLayout {
  if (data.section === 'page') return 'custom';
  return data.section === 'reference' ? 'guide' : 'standard';
}

function DocHeader({ data, actions }: { data: DocPayload; actions?: ReactNode }) {
  const { page } = data;
  const title = (
    <h1 className="dp-docs-header__title" data-visual="h1">
      {page.title}
    </h1>
  );
  return (
    <header className="dp-docs-header" data-visual-region="headline">
      {actions !== undefined ? (
        <>
          <div className="dp-docs-header__top">
            <div className="dp-docs-header__actions" data-slot="copy-page">
              {actions}
            </div>
          </div>
          <div className="dp-docs-header__title-row">{title}</div>
        </>
      ) : (
        title
      )}
      {/* Live's excerpt: on docs pages a Markdown block (15px) inside the excerpt box, its paragraph 18px; on
          guide pages the excerpt box is the 18px Markdown block itself. */}
      {page.excerpt &&
        (actions !== undefined ? (
          <div className="dp-docs-header__excerpt dp-docs-header__excerpt--guide" data-visual="docBody">
            <p data-visual="docP">{page.excerpt}</p>
          </div>
        ) : (
          <div className="dp-docs-header__excerpt">
            <div className="dp-docs-header__excerpt-body" data-visual="docBody">
              <p data-visual="docP">{page.excerpt}</p>
            </div>
          </div>
        ))}
    </header>
  );
}

export function DocPage({ data, adopt, slots = {}, enhance, now, sidebarId, sidebarOpen = false }: DocPageProps) {
  const { page } = data;
  const layout = docLayout(data);
  const tree = data.nav?.tree ?? null;
  const toc = page.toc as TocItem[];
  const content = (
    <div className="dp-docs__content">
      <DocBody html={page.bodyHtml} adopt={adopt} enhance={enhance} />
      <PageFooter
        updatedAt={layout === 'custom' ? null : page.updatedAt}
        pager={data.pager}
        feedback={slots.feedback}
        discord={slots.discord}
        now={now}
      />
    </div>
  );
  const article =
    layout === 'guide' ? (
      <div className="dp-docs__guide" data-visual="articleWrap">
        <article id="content" className="dp-article dp-docs__article" tabIndex={-1} data-visual="article">
          <DocHeader data={data} actions={slots.copyPage ?? null} />
          {content}
        </article>
        <div className="dp-docs__rail" data-visual-region="docsToc">
          <TableOfContents entries={toc} />
        </div>
      </div>
    ) : (
      <article id="content" className="dp-article dp-docs__article" tabIndex={-1} data-visual="article">
        <DocHeader data={data} />
        <div className="dp-docs__grid">
          {content}
          {layout === 'standard' && (
            // Live keeps this column even when the page has no headings (the Hebrew citation guide).
            <div className="dp-docs__rail" data-visual-region="docsToc">
              <div className="dp-docs__copy-page" data-slot="copy-page" data-visual="copyPage">
                {slots.copyPage}
              </div>
              <TableOfContents entries={toc} />
            </div>
          )}
        </div>
      </article>
    );
  return (
    <div className={`dp-docs dp-docs--${layout}`} data-layout={data.layout}>
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
      {article}
    </div>
  );
}
