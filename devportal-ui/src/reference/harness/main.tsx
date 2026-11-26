// Pixel-loop harness (development only; not part of the bundle): renders an endpoint page with the real shell
// pieces (PortalHeader, PortalFrame in its reference layout) and the reference UI in the frame's slots, with an
// empty 288px stand-in for the sidebar (W2) and a stand-in for the Copy Page button, so the reference regions sit
// where live puts them. Run `node scripts/build-spec.ts`, start `npx vite`, then open
// /static/bundles/devportal/src/reference/harness/index.html?op=get-v3-texts
import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import '../../styles/readme-tokens.css';
import '../../styles/article.css';
import '../../app/fonts.css';
import '../../app/base.css';
import type { OperationSpec } from '../../contracts';
import { PortalFrame, PortalHeader } from '../../shell';
import { EndpointArticle, EndpointPlayground, EndpointProvider } from '../Endpoint';
import { CopyPageStandIn } from './CopyPageStandIn';
import styles from './harness.module.css';

const params = new URLSearchParams(window.location.search);
const op = params.get('op') ?? 'get-v3-texts';

const response = await fetch(`${import.meta.env.BASE_URL}spec/${op}.json`);
const spec = (await response.json()) as OperationSpec;
document.title = spec.title;

// Live's playground column is as tall as the article (the sticky cards need it); PortalFrame (W2) aligns it to the
// top. Requested of the Integrator; stretched here so the harness measures what live shows.
const stretch = document.createElement('style');
stretch.textContent = "[data-layout='reference'] .dp-rm-playground { align-self: stretch; }";
document.head.append(stretch);

const container = document.getElementById('harness-root');
if (container !== null) {
  createRoot(container).render(
    <EndpointProvider op={spec} apiOrigin="https://www.sefaria.org">
      <div className="dp-app" data-kind="endpoint">
        <PortalHeader
          activeTab="reference"
          subnav={{ label: spec.title, expanded: false, onToggle: () => undefined, controls: 'dp-sidebar' }}
        />
        <PortalFrame
          layout="reference"
          sidebar={<nav className={styles.sidebar} aria-label="Secondary navigation" />}
          rail={<EndpointPlayground />}
        >
          <EndpointArticle
            title={spec.title}
            headerActions={<CopyPageStandIn />}
            footer={<div className={styles.footer} />}
          />
        </PortalFrame>
      </div>
    </EndpointProvider>
  );
}
