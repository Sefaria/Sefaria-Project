/** `/my/data`: what this device stores, export / import, and a clearly simulated "sync to account". */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { createCollection, exportAll, importAll, kv, useKv } from '../store';
import { toast } from '../overlays';
import { COLLECTION_NAMES, collection, LAST_SYNC_KEY } from './collections';
import { download } from './exportFormats';
import { ConfirmButton, Simulated, formatDate, useStoreTick } from './bits';

/** Per-collection preview of an export payload against what is stored now. */
export function importPreview(parsed) {
  if (!parsed || parsed.format !== 'sefaria.libnext' || !parsed.data || typeof parsed.data !== 'object') { return null; }
  return Object.entries(parsed.data).filter(([name, raw]) => raw && typeof raw === 'object').map(([name, raw]) => {
    const incoming = Object.keys(raw.items || {});
    const existing = createCollection(name).items || {};
    return { name, incoming: incoming.length, existing: Object.keys(existing).length, added: incoming.filter(id => !(id in existing)).length };
  });
}

export default function DataPage() {
  const { t, lang } = useT();
  const tick = useStoreTick();
  const [lastSync] = useKv(LAST_SYNC_KEY, null);
  const [syncing, setSyncing] = useState(0);
  const [pending, setPending] = useState(null);
  const fileRef = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);

  const rows = useMemo(() => {
    const out = COLLECTION_NAMES.map(name => {
      const items = collection(name).list();
      return { name, count: items.length, bytes: JSON.stringify(items).length, last: items.reduce((m, i) => Math.max(m, i.ts || 0), 0) };
    });
    const settings = createCollection('kv').list();
    out.push({ name: 'kv', count: settings.length, bytes: JSON.stringify(settings).length, last: settings.reduce((m, i) => Math.max(m, i.ts || 0), 0) });
    return out;
  }, [tick]);
  const totalBytes = rows.reduce((n, r) => n + r.bytes, 0);

  const exportJson = () => toast(download(`sefaria-library-${new Date().toISOString().slice(0, 10)}.json`, exportAll(), 'application/json') ? t('my.data.exported') : t('my.downloadUnavailable'));

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) { return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const preview = importPreview(parsed);
        if (!preview) { throw new Error('format'); }
        setPending({ parsed, preview, name: file.name });
      } catch (err) {
        toast(t('my.data.importInvalid'));
      }
      if (fileRef.current) { fileRef.current.value = ''; }
    };
    reader.readAsText(file);
  };
  const apply = (merge) => {
    const names = importAll(pending.parsed, { merge });
    setPending(null);
    toast(t('my.data.imported', { n: names.length }));
  };

  const sync = () => {
    setSyncing(1);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSyncing(p => {
        if (p >= 100) {
          clearInterval(timer.current);
          kv.set(LAST_SYNC_KEY, new Date().toISOString());
          toast(t('my.data.syncDone'));
          return 0;
        }
        return p + 10;
      });
    }, 120);
  };

  return (
    <div className="ln-my-data">
      <section className="ln-my-section" aria-labelledby="data-stored">
        <h2 id="data-stored" className="ln-section-title">{t('my.data.stored')}</h2>
        <p className="ln-muted">{t('my.data.storedBody')}</p>
        <table className="ln-my-table">
          <thead><tr><th>{t('my.data.col.collection')}</th><th>{t('my.data.col.items')}</th><th>{t('my.data.col.size')}</th><th>{t('my.data.col.updated')}</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name}>
                <td>{t(`my.data.coll.${r.name}`)} <code className="ln-small ln-muted">sefaria.libnext.{r.name}</code></td>
                <td>{r.count}</td>
                <td>{(r.bytes / 1024).toFixed(1)} KB</td>
                <td>{r.last ? formatDate(r.last, lang) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>{t('my.data.total')}</td><td>{rows.reduce((n, r) => n + r.count, 0)}</td><td>{(totalBytes / 1024).toFixed(1)} KB</td><td /></tr></tfoot>
        </table>
      </section>

      <section className="ln-my-section" aria-labelledby="data-export">
        <h2 id="data-export" className="ln-section-title">{t('my.data.exportImport')}</h2>
        <div className="ln-row">
          <button type="button" className="ln-btn ln-btn-primary" onClick={exportJson}>{t('my.data.export')}</button>
          <label className="ln-btn">
            {t('my.data.import')}
            <input ref={fileRef} type="file" accept="application/json,.json" className="ln-sr-only" onChange={onFile} />
          </label>
        </div>
        {pending && (
          <div className="ln-card ln-my-import" role="dialog" aria-label={t('my.data.importPreview')}>
            <h3>{t('my.data.importPreview')} <span className="ln-small ln-muted">{pending.name}</span></h3>
            <table className="ln-my-table">
              <thead><tr><th>{t('my.data.col.collection')}</th><th>{t('my.data.col.inFile')}</th><th>{t('my.data.col.new')}</th><th>{t('my.data.col.onDevice')}</th></tr></thead>
              <tbody>{pending.preview.map(p => <tr key={p.name}><td>{t(`my.data.coll.${p.name}`) === `my.data.coll.${p.name}` ? p.name : t(`my.data.coll.${p.name}`)}</td><td>{p.incoming}</td><td>{p.added}</td><td>{p.existing}</td></tr>)}</tbody>
            </table>
            <div className="ln-row">
              <button type="button" className="ln-btn ln-btn-primary" onClick={() => apply(true)}>{t('my.data.merge')}</button>
              <ConfirmButton className="ln-btn" onConfirm={() => apply(false)} confirmLabel={t('my.data.replaceConfirm')}>{t('my.data.replace')}</ConfirmButton>
              <button type="button" className="ln-btn ln-btn-quiet" onClick={() => setPending(null)}>{t('my.cancel')}</button>
            </div>
            <p className="ln-small ln-muted">{t('my.data.mergeHint')}</p>
          </div>
        )}
      </section>

      <section className="ln-my-section" aria-labelledby="data-sync">
        <h2 id="data-sync" className="ln-section-title">{t('my.data.sync')} <Simulated /></h2>
        <p className="ln-muted">{t('my.data.syncBody')}</p>
        <div className="ln-row">
          <button type="button" className="ln-btn" onClick={sync} disabled={syncing > 0}>{syncing > 0 ? t('my.data.syncing') : t('my.data.syncNow')}</button>
          {lastSync && <span className="ln-small ln-muted">{t('my.data.lastSync', { when: formatDate(new Date(lastSync), lang, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) })}</span>}
        </div>
        {syncing > 0 && (
          <div className="ln-my-progress" role="progressbar" aria-valuenow={syncing} aria-valuemin={0} aria-valuemax={100} aria-label={t('my.data.syncing')}>
            <span style={{ inlineSize: `${syncing}%` }} />
          </div>
        )}
      </section>

      <section className="ln-my-section" aria-labelledby="data-clear">
        <h2 id="data-clear" className="ln-section-title">{t('my.data.clear')}</h2>
        <p className="ln-muted">{t('my.data.clearBody')}</p>
        <ConfirmButton className="ln-btn" confirmLabel={t('my.data.clearConfirm')} onConfirm={() => { COLLECTION_NAMES.forEach(n => collection(n).clear()); toast(t('my.data.cleared')); }}>{t('my.data.clearAll')}</ConfirmButton>
      </section>
    </div>
  );
}
