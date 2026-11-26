// The endpoint overlay (PLAN §2.7, §2.11; DECISIONS Q7): sidebar label, title and description next to what
// docs/openAPI.json says, which is read-only. The free Markdown is edited in the canvas below the description.
import { useId } from 'react';
import type { EditorPage, EndpointOverlay, RevisionContent } from '../../contracts';
import styles from './Panels.module.css';

export interface EndpointPanelProps {
  page: EditorPage;
  content: RevisionContent;
  onChange(content: RevisionContent): void;
}

export function EndpointPanel({ page, content, onChange }: EndpointPanelProps) {
  const ids = { label: useId(), title: useId(), description: useId() };
  const overlay: EndpointOverlay = content.endpoint ?? {
    sidebarLabel: null,
    titleOverride: null,
    descriptionOverrideMd: null,
  };
  const spec = page.spec;
  const set = (patch: Partial<EndpointOverlay>) => onChange({ ...content, endpoint: { ...overlay, ...patch } });
  return (
    <section className={styles.panel} aria-labelledby="dp-endpoint-title">
      <h2 id="dp-endpoint-title">API endpoint</h2>
      {spec ? (
        <dl className={styles.spec}>
          <dt>Method and path</dt>
          <dd>
            <code>
              {spec.method.toUpperCase()} {spec.path}
            </code>
          </dd>
          <dt>Title in the API definition</dt>
          <dd>{spec.title}</dd>
          <dt>Tags</dt>
          <dd>{spec.tags.join(', ') || '—'}</dd>
          <dt>Description in the API definition</dt>
          <dd className={styles.specDescription}>{spec.description || '—'}</dd>
          {spec.deprecated && (
            <>
              <dt>Status</dt>
              <dd>Deprecated in the API definition</dd>
            </>
          )}
        </dl>
      ) : (
        <p className={styles.hint}>This operation is not in docs/openAPI.json any more.</p>
      )}
      <p className={styles.hint}>
        Parameters, schemas and examples come from docs/openAPI.json and are changed there, in the code. The fields
        below only change how this page shows them.
      </p>
      <div className={styles.field}>
        <label htmlFor={ids.label}>Sidebar label</label>
        <input
          id={ids.label}
          type="text"
          value={overlay.sidebarLabel ?? ''}
          placeholder={overlay.titleOverride ?? spec?.title ?? ''}
          onChange={(e) => set({ sidebarLabel: e.target.value || null })}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={ids.title}>Title</label>
        <input
          id={ids.title}
          type="text"
          value={overlay.titleOverride ?? ''}
          placeholder={spec?.title ?? ''}
          onChange={(e) => set({ titleOverride: e.target.value || null })}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={ids.description}>Description (Markdown; empty keeps the API definition's)</label>
        <textarea
          id={ids.description}
          rows={5}
          value={overlay.descriptionOverrideMd ?? ''}
          placeholder={spec?.description ?? ''}
          onChange={(e) => set({ descriptionOverrideMd: e.target.value || null })}
        />
      </div>
      <p className={styles.hint}>The sidebar position is changed by dragging the page in the tree.</p>
    </section>
  );
}
