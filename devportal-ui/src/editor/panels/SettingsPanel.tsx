// Page settings (PLAN §2.11): page type, visibility, subtitle, SEO metadata, next pages, link URL and new-tab flag,
// and the slug. Everything but the slug is part of the draft; the slug is changed at once (a 301 is left behind).
import { useId, useState } from 'react';
import type { EditorPage, NextPageRef, RevisionContent } from '../../contracts';
import styles from './Panels.module.css';

export interface SettingsPanelProps {
  page: EditorPage;
  content: RevisionContent;
  onChange(content: RevisionContent): void;
  onSlug(slug: string): Promise<void>;
}

function TextField(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  multiline?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{props.label}</label>
      {props.multiline ? (
        <textarea id={id} rows={3} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      )}
      {props.hint && <span className={styles.hint}>{props.hint}</span>}
    </div>
  );
}

function Check(props: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <div className={styles.check}>
      <label>
        <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />{' '}
        {props.label}
      </label>
    </div>
  );
}

const PAGE_TYPES: Record<string, string> = {
  category: 'Category',
  page: 'Page',
  link: 'Link',
  tag_group: 'Tag group',
  endpoint: 'API endpoint',
  api_config: 'API reference stub',
};

export function SettingsPanel({ page, content, onChange, onSlug }: SettingsPanelProps) {
  const [slug, setSlug] = useState(page.page.slug ?? '');
  const [slugStatus, setSlugStatus] = useState('');
  const set = (patch: Partial<RevisionContent>) => onChange({ ...content, ...patch });
  const isCategory = page.page.kind === 'category';
  const slugId = useId();

  async function saveSlug() {
    setSlugStatus('Saving…');
    try {
      await onSlug(slug);
      setSlugStatus('Saved. The old address now redirects here.');
    } catch (error) {
      setSlugStatus(error instanceof Error ? error.message : 'Could not change the slug.');
    }
  }

  const nextPages = content.next.pages;
  const setNext = (pages: NextPageRef[]) => set({ next: { ...content.next, pages } });

  return (
    <section className={styles.panel} aria-labelledby="dp-settings-title">
      <h2 id="dp-settings-title">Page settings</h2>
      <p className={styles.meta}>
        Type: <strong>{PAGE_TYPES[page.page.kind] ?? page.page.kind}</strong>
        {page.page.path && (
          <>
            {' · '}
            <a href={page.page.path} target="_blank" rel="noreferrer">
              {page.page.path}
            </a>
          </>
        )}
      </p>
      <Check
        label="Hidden (not in the sidebar, search or llms.txt)"
        checked={content.hidden}
        onChange={(hidden) => set({ hidden })}
      />
      {!isCategory && (
        <>
          <Check label="Deprecated" checked={content.deprecated} onChange={(deprecated) => set({ deprecated })} />
          <TextField
            label="Subtitle (excerpt)"
            value={content.excerpt}
            multiline
            onChange={(excerpt) => set({ excerpt })}
          />
        </>
      )}
      {page.page.kind === 'link' && (
        <>
          <TextField
            label="Link URL"
            value={content.linkUrl ?? ''}
            onChange={(linkUrl) => set({ linkUrl: linkUrl || null })}
            hint="https://…, mailto:… or /path"
          />
          <Check
            label="Open in a new tab"
            checked={content.linkNewTab}
            onChange={(linkNewTab) => set({ linkNewTab })}
          />
        </>
      )}
      {page.page.slug !== null && page.page.kind !== 'endpoint' && (
        <div className={styles.field}>
          <label htmlFor={slugId}>Slug</label>
          <div className={styles.inline}>
            <input id={slugId} type="text" value={slug} onChange={(e) => setSlug(e.target.value)} />
            <button type="button" onClick={saveSlug} disabled={!slug || slug === page.page.slug}>
              Change slug
            </button>
          </div>
          <span className={styles.hint} role="status">
            {slugStatus}
          </span>
        </div>
      )}
      {!isCategory && page.page.kind !== 'link' && (
        <fieldset className={styles.group}>
          <legend>SEO</legend>
          <TextField
            label="Meta title"
            value={content.metadata.title}
            onChange={(title) => set({ metadata: { ...content.metadata, title } })}
          />
          <TextField
            label="Meta description"
            value={content.metadata.description}
            multiline
            onChange={(description) => set({ metadata: { ...content.metadata, description } })}
          />
          <Check
            label="Hide from search engines (noindex)"
            checked={content.metadata.robots === 'noindex'}
            onChange={(noindex) => set({ metadata: { ...content.metadata, robots: noindex ? 'noindex' : 'index' } })}
          />
        </fieldset>
      )}
      {!isCategory && page.page.kind !== 'link' && (
        <fieldset className={styles.group}>
          <legend>Next pages</legend>
          <TextField
            label="Description"
            value={content.next.description}
            onChange={(description) => set({ next: { ...content.next, description } })}
          />
          <ul className={styles.nextList}>
            {nextPages.map((ref, index) => (
              <li key={index}>
                <TextField
                  label={`Page ${index + 1} slug`}
                  value={ref.slug}
                  onChange={(value) => setNext(nextPages.map((r, i) => (i === index ? { ...r, slug: value } : r)))}
                />
                <TextField
                  label={`Page ${index + 1} title`}
                  value={ref.title}
                  onChange={(value) => setNext(nextPages.map((r, i) => (i === index ? { ...r, title: value } : r)))}
                />
                <button type="button" onClick={() => setNext(nextPages.filter((_, i) => i !== index))}>
                  Remove page {index + 1}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setNext([...nextPages, { type: 'basic', slug: '', title: '' }])}>
            Add a next page
          </button>
        </fieldset>
      )}
    </section>
  );
}
