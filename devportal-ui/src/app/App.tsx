import type { PagePayload } from '../contracts';

export interface AppProps {
  data: PagePayload | null;
}

/**
 * Phase 0 placeholder root. W2 replaces it with the router and the three-column frame (PLAN §3, Phase 1).
 */
export function App({ data }: AppProps) {
  const title = data !== null && data.kind !== 'redirect' ? data.title : 'Developers on Sefaria';
  return (
    <div className="dp-app" data-kind={data?.kind ?? 'none'}>
      <p className="dp-app__hello">{title}</p>
    </div>
  );
}
