// Pixel-loop harness for the shell (development only; not part of the bundle): an endpoint page with the real shell
// (PortalHeader, PortalFrame, Sidebar, Copy Page, page footer with the feedback widget) around W3's reference UI, so the
// sidebar, Copy Page and footer states of the visual harness can be compared with live's baselines without Django.
// Run `node scripts/build-spec.ts`, start `npx vite`, then open
// /static/bundles/devportal/src/shell/harness/index.html?op=get-v3-texts
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import '../../styles/readme-tokens.css';
import '../../styles/article.css';
import '../../app/fonts.css';
import '../../app/base.css';
import type { OperationSpec, Pager, SidebarTree } from '../../contracts';
import { SidebarFooterDiscord } from '../../discord';
import { EndpointArticle, EndpointPlayground, EndpointProvider } from '../../reference';
import { CopyPage, EndpointFooter, PortalFrame, PortalHeader, Sidebar } from '..';
import tree from './reference-tree.json';

const params = new URLSearchParams(window.location.search);
const op = params.get('op') ?? 'get-v3-texts';
const path = `/reference/${op}`;

const response = await fetch(`${import.meta.env.BASE_URL}spec/${op}.json`);
const spec = (await response.json()) as OperationSpec;
document.title = spec.title;

// Live's pager for get-v3-texts (research/site/pages.json).
const pager: Pager = {
  prev: { title: 'Frequently Asked Questions', path: '/reference/others-have-asked' },
  next: { title: 'Texts (v1)', path: '/reference/get-v1-texts' },
};

export function HarnessPage() {
  const [open, setOpen] = useState(false);
  return (
    <EndpointProvider op={spec} apiOrigin="https://www.sefaria.org">
      <div className="dp-app" data-kind="endpoint">
        <PortalHeader
          activeTab="reference"
          subnav={{ label: spec.title, expanded: open, onToggle: () => setOpen((o) => !o), controls: 'dp-sidebar' }}
        />
        <PortalFrame
          layout="reference"
          sidebarId="dp-sidebar"
          sidebarOpen={open}
          sidebar={
            <Sidebar tree={tree as unknown as SidebarTree} activePath={path} footer={<SidebarFooterDiscord />} />
          }
          rail={<EndpointPlayground />}
        >
          <EndpointArticle
            title={spec.title}
            headerActions={
              <CopyPage markdownUrl={`${window.location.origin}${path}.md`} mcpUrl={`${window.location.origin}/mcp`} />
            }
            footer={<EndpointFooter path={path} updatedAt="2026-05-18T10:00:00Z" pager={pager} />}
          />
        </PortalFrame>
      </div>
    </EndpointProvider>
  );
}

const container = document.getElementById('harness-root');
if (container !== null) createRoot(container).render(<HarnessPage />);
