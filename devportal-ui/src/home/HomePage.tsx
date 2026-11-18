// The homepage in the browser (PLAN Phase 5). The page is server-rendered (devportal/home.html with
// devportal/home_body.html) and works without JavaScript; React only adopts the body unchanged, the same
// <main> as the server's, so nothing moves. After a client-side navigation to "/" it sets the payload's
// bodyHtml (the same markup).
import type { PagePayload } from '../contracts';
import { AdoptedHtml } from '../ui';

export type HomePayload = Extract<PagePayload, { kind: 'home' }>;

export function HomePage({ data }: { data: HomePayload }) {
  return (
    <main className="dp-rm-app" id="content" tabIndex={-1} data-visual="main">
      <AdoptedHtml adoptKey="body" html={data.bodyHtml} />
    </main>
  );
}
