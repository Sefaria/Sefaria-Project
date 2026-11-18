// The endpoint headline: actions slot (Copy Page, W2), title with the tags popover, the URL line with its
// `{placeholder}` chips, and the description.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { pathParts } from '../model/path';
import { TAG_DESCRIPTIONS } from '../spec/tagDescriptions';
import { useEndpoint } from '../state';
import { Icon } from '../ui/icons';
import { CopyButton, Dropdown, Markdown, MethodBadge } from '../ui/primitives';
import styles from './Article.module.css';

function TagsButton({ tags }: { tags: string[] }) {
  return (
    <Dropdown
      className={styles.tags}
      popup="dialog"
      label="Tags"
      panelClassName={styles.tagsPanel}
      frameClassName={styles.tagsFrame}
      wholePixels
      trigger={(props) => (
        <button type="button" className={styles.tagsButton} aria-label="View tags" {...props}>
          <Icon name="tag" className={styles.tagsIcon} />
        </button>
      )}
    >
      {() => (
        <ul className={styles.tagsList}>
          {tags.map((tag) => (
            <li key={tag} className={styles.tagsItem}>
              <div className={styles.tagsName}>
                {tag}
                <Icon name="tag" className={styles.tagsNameIcon} />
              </div>
              {TAG_DESCRIPTIONS[tag] ? <div className={styles.tagsDescription}>{TAG_DESCRIPTIONS[tag]}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </Dropdown>
  );
}

export function UrlLine() {
  const { op, form, values, initial } = useEndpoint();
  const byName = new Map(form.path.map((f) => [f.name, f]));
  const fullUrl = `${op.server}${op.path}`;
  // As live: a URL wider than its column is clipped with a fade and a "…" button that shows it whole.
  const urlId = useId();
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const el = document.getElementById(urlId);
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [urlId]);
  return (
    <div className={[styles.urlLine, expanded ? styles.urlExpanded : ''].filter(Boolean).join(' ')}>
      <MethodBadge method={op.method} visual="badgeLg" />
      {op.deprecated ? <span className={styles.deprecatedBadge}>deprecated</span> : null}
      <div className={styles.urlContainer}>
        <span
          id={urlId}
          className={[styles.url, overflowing && !expanded ? styles.urlClipped : ''].filter(Boolean).join(' ')}
          title={fullUrl}
          data-testid="serverurl"
          data-visual="urlText"
        >
          {op.server}
          {pathParts(op.path).map((part, i) => {
            if (part.param === null) return <span key={i}>{part.text}</span>;
            const field = byName.get(part.param);
            // Live keeps the placeholder until the visitor changes the value (a prefilled default does not count).
            const value = field === undefined ? '' : (values[field.key] ?? '');
            const changed = field !== undefined && value !== (initial[field.key] ?? '');
            return field === undefined ? (
              <span key={i}>{part.text}</span>
            ) : (
              <label key={i} htmlFor={field.inputId} className={styles.urlParam}>
                {changed && value !== '' ? value : part.text}
              </label>
            );
          })}
        </span>
        {overflowing || expanded ? (
          <button
            type="button"
            className={styles.urlMore}
            aria-expanded={expanded}
            aria-controls={urlId}
            aria-label={expanded ? 'Shorten URL' : 'Show full URL'}
            onClick={() => setExpanded((e) => !e)}
          >
            …
          </button>
        ) : null}
      </div>
      <CopyButton text={fullUrl} className={styles.urlCopy} />
    </div>
  );
}

export interface HeadlineProps {
  title: string;
  /** Sanitized HTML from the server (the payload's `descriptionHtml`); when absent the spec's Markdown is rendered. */
  descriptionHtml?: string;
  /** The Copy Page split button (W2's CopyPageMenu) or any other actions shown at the top right. */
  actions?: ReactNode;
}

export function Headline({ title, descriptionHtml, actions }: HeadlineProps) {
  const { op } = useEndpoint();
  return (
    <header className={styles.headline} data-visual-region="headline">
      <div className={styles.actionsRow}>
        <div className={styles.actions}>{actions}</div>
      </div>
      <div className={styles.titleRow}>
        <div id="content-head" className={styles.pageHeader}>
          <h1 className={styles.title} data-visual="h1">
            <span data-dp-slot="title">{title}</span>
            {op.tags.length > 0 ? <TagsButton tags={op.tags} /> : null}
          </h1>
        </div>
      </div>
      <UrlLine />
      {descriptionHtml !== undefined ? (
        descriptionHtml === '' ? null : (
          <div
            className={styles.excerpt}
            data-visual="excerpt"
            data-dp-slot="description"
            // Rendered and sanitized by the server's Markdown pipeline (PLAN §2.6).
            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          />
        )
      ) : (
        <div className={styles.excerpt} data-visual="excerpt" data-dp-slot="description">
          <Markdown source={op.description} className={styles.excerptMarkdown} />
        </div>
      )}
    </header>
  );
}
