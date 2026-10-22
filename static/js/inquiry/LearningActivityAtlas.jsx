import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createAtlasMap } from './atlasCanvas';

const POLL_SECONDS = 5;
const EMPTY = {sizes: [], readers: [], events: []};

export default function LearningActivityAtlas({config}) {
  const canvasRef = useRef(null);
  const mapRef = useRef(null);
  const [catalog, setCatalog] = useState(null);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [status, setStatus] = useState('Loading the library…');
  const [hover, setHover] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(config.baselineUrl, {signal: controller.signal})
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setCatalog)
      .catch(() => { if (!controller.signal.aborted) setStatus('Could not load the library catalog. Reload to retry.'); });
    return () => controller.abort();
  }, [config.baselineUrl]);

  useEffect(() => {
    if (!catalog) return undefined;
    const map = createAtlasMap(canvasRef.current, catalog, {onHover: setHover});
    mapRef.current = map;
    const controller = new AbortController();
    let timer = null;
    async function poll() {
      try {
        const response = await fetch(config.activityUrl, {cache: 'no-store', signal: controller.signal});
        if (response.status === 401 || response.status === 403) { window.location.assign(config.loginUrl); return; }
        if (!response.ok) throw new Error();
        const next = await response.json();
        if (next.catalog_revision && next.catalog_revision !== config.catalogRevision) {
          setStatus('The library catalog changed. Reload this page.');
        } else if (next.status === 'current') {
          map.update(next, POLL_SECONDS);
          setSnapshot(next);
          setStatus(`Updated ${new Date(next.generated_at * 1000).toLocaleTimeString()}`);
        } else {
          setStatus(next.status === 'stale' ? 'Refreshing the snapshot (needs a Celery tasks worker)…' : 'Waiting for the first snapshot from Celery…');
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setStatus('Activity unavailable. Retrying…');
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, POLL_SECONDS * 1000);
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); map.destroy(); mapRef.current = null; };
  }, [catalog, config]);

  const titles = useMemo(() => (catalog ? catalog.books.map(b => b[0]) : []), [catalog]);
  const lookup = useMemo(() => new Map(titles.map((t, i) => [t.toLowerCase(), i])), [titles]);
  const sizes = useMemo(() => new Map(snapshot.sizes), [snapshot]);
  const readers = useMemo(() => new Map(snapshot.readers), [snapshot]);
  const moves = snapshot.events.filter(e => e.from !== null).length;
  const top = useMemo(() => {
    const ids = new Set([...readers.keys(), ...sizes.keys()]);
    return [...ids].sort((a, b) => (readers.get(b) || 0) - (readers.get(a) || 0) || (sizes.get(b) || 0) - (sizes.get(a) || 0)).slice(0, 10);
  }, [readers, sizes]);
  const maxTop = Math.max(1, ...top.map(id => readers.get(id) || 0));
  const suggestions = query.length < 2 ? [] : titles.filter(t => t.toLowerCase().includes(query.toLowerCase())).slice(0, 30);

  function onSearch(value) {
    setQuery(value);
    const id = lookup.get(value.toLowerCase());
    if (id !== undefined) mapRef.current?.focus(id);
  }

  return (
    <main className="atlas">
      <header className="atlas-header">
        <div>
          <a className="atlas-back" href={config.adminUrl}>← Sefaria admin</a>
          <h1>What people are reading</h1>
        </div>
        <div className="atlas-search">
          <input type="search" list="atlas-books" placeholder="Find a book…" value={query}
            onChange={e => onSearch(e.target.value)} aria-label="Find a book" />
          <datalist id="atlas-books">{suggestions.map(t => <option key={t} value={t} />)}</datalist>
          <button type="button" onClick={() => { setQuery(''); mapRef.current?.reset(); }}>Whole library</button>
        </div>
      </header>
      {snapshot.demo_records > 0 && <p className="atlas-demo" role="status">Demo feed: {snapshot.demo_records} synthetic reads are mixed in. Real history is untouched.</p>}
      <div className="atlas-layout">
        <aside className="atlas-panel">
          <div className="atlas-kpi">
            <span className="atlas-kpi-value">{(snapshot.readers_now || 0).toLocaleString()}</span>
            <span className="atlas-kpi-label">reading now</span>
            <span className="atlas-kpi-sub">signed-in readers active in the last {Math.round((snapshot.presence_window || 1800) / 60)} minutes</span>
          </div>
          <div className="atlas-kpi atlas-kpi-small">
            <span className="atlas-kpi-value">{moves}</span>
            <span className="atlas-kpi-label">moves between books in the last {snapshot.event_window || 60}s</span>
          </div>
          <h2>Top books right now</h2>
          <ol className="atlas-top">
            {top.map(id => (
              <li key={id}>
                <button type="button" onClick={() => { setQuery(titles[id]); mapRef.current?.focus(id); }}>
                  <span className="atlas-top-title">{titles[id]}</span>
                  <span className="atlas-top-count">{readers.get(id) || 0}</span>
                  <span className="atlas-top-bar" style={{width: `${100 * (readers.get(id) || 0) / maxTop}%`}} />
                </button>
              </li>
            ))}
            {!top.length && <li className="atlas-muted">No reads yet.</li>}
          </ol>
        </aside>
        <div className="atlas-map">
          <canvas ref={canvasRef} role="img" aria-label="Map of the library. Circle size shows recent reads; moving dots show readers moving between books." />
          {hover && (
            <div className="atlas-tooltip" style={{left: hover.x, top: hover.y}}>
              <strong>{titles[hover.id]}</strong>
              <span>{readers.get(hover.id) || 0} reading now</span>
              <span>{sizes.get(hover.id) || 0} of the last {snapshot.baseline_records || 0} reads</span>
            </div>
          )}
          <div className="atlas-legend">
            <span><i className="atlas-legend-dot" /> Size = share of the last {snapshot.baseline_records || 500} reads</span>
            <span><i className="atlas-legend-ring" /> Halo = someone just opened it</span>
            <span><i className="atlas-legend-move" /> Moving dot = a reader moving between books</span>
            <span>Scroll to zoom for reader counts · {status}</span>
          </div>
        </div>
      </div>
      <p className="atlas-footnote">From signed-in reading history only (sidebar opens, bookmarks and sheets excluded). Anonymous readers and readers with history turned off do not appear.</p>
    </main>
  );
}
