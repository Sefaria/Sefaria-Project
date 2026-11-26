// Node views of the canvas (PLAN §2.11): each construct shows as the public page shows it, with its settings next
// to it — callout icon and theme, image source/upload/alignment/width/caption/border, embed URL, HTML-block source
// with a sandboxed preview, code-block language and tab title, raw HTML and Markdown source.
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useId, useState, type ChangeEvent } from 'react';
import { CALLOUT_THEMES, THEME_ICONS, YOUTUBE_RE, codeLabel, resolveTheme } from '../markdown/dialect';
import { sanitizeHtml } from '../html/sanitize';
import { useEditorServices } from './services';
import styles from './Canvas.module.css';

type Props = ReactNodeViewProps;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A labelled text field of a block's settings. */
function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <span className={styles.field}>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(e.target.value)}
      />
    </span>
  );
}

function Select(props: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <span className={styles.field}>
      <label htmlFor={id}>{props.label}</label>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o || '—'}
          </option>
        ))}
      </select>
    </span>
  );
}

function Toolbar(props: { label: string; children: React.ReactNode; onDelete?: () => void }) {
  return (
    <div className={styles.blockToolbar} contentEditable={false} role="group" aria-label={props.label}>
      {props.children}
      {props.onDelete && (
        <button type="button" className={styles.remove} onClick={props.onDelete}>
          Remove
        </button>
      )}
    </div>
  );
}

// --- callout --------------------------------------------------------------------------------------------------

export function CalloutView({ node, updateAttributes, deleteNode }: Props) {
  const theme = resolveTheme(node.attrs.theme);
  const icon = typeof node.attrs.icon === 'string' ? node.attrs.icon : THEME_ICONS[theme];
  return (
    <NodeViewWrapper as="blockquote" className={`dp-callout dp-callout-${theme} ${styles.callout}`}>
      <span className="dp-callout-icon" aria-hidden="true" contentEditable={false}>
        {icon}
      </span>
      <Toolbar label="Callout settings" onDelete={deleteNode}>
        <Field label="Icon" value={icon} onChange={(value) => updateAttributes({ icon: value || null })} />
        <Select
          label="Theme"
          value={theme}
          options={CALLOUT_THEMES}
          onChange={(value) => updateAttributes({ theme: value, icon: THEME_ICONS[resolveTheme(value)] })}
        />
      </Toolbar>
      <NodeViewContent className={styles.calloutContent} />
    </NodeViewWrapper>
  );
}

// --- code block -----------------------------------------------------------------------------------------------

export function CodeBlockView({ node, updateAttributes }: Props) {
  const lang = str(node.attrs.language);
  const title = str(node.attrs.title);
  const settings = (
    <Toolbar label="Code block settings">
      <Field
        label="Language"
        value={lang}
        placeholder="none"
        onChange={(value) => updateAttributes({ language: value.trim() })}
      />
      <Field
        label="Tab title"
        value={title}
        placeholder={lang ? codeLabel(lang, '') : ''}
        onChange={(value) => updateAttributes({ title: value })}
      />
    </Toolbar>
  );
  const pre = (
    <pre className="dp-pre">
      <NodeViewContent<'code'> as="code" className="dp-code" data-lang={lang || undefined} />
    </pre>
  );
  if (!lang) {
    return (
      <NodeViewWrapper className={styles.codeBlock}>
        {settings}
        {pre}
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper className={`dp-codetabs ${styles.codeBlock}`}>
      {settings}
      <div className="dp-codetabs-toolbar" contentEditable={false}>
        <span className="dp-codetabs-tab dp-active">{codeLabel(lang, title)}</span>
      </div>
      <div className="dp-codetabs-inner">{pre}</div>
    </NodeViewWrapper>
  );
}

// --- image ----------------------------------------------------------------------------------------------------

export function ImageView({ node, updateAttributes, deleteNode, selected }: Props) {
  const services = useEditorServices();
  const [status, setStatus] = useState('');
  const a = node.attrs;
  const align = str(a.align);
  const width = str(a.width).trim();
  const classes = ['dp-img', align && `dp-img-align-${align}`, a.border === true && 'dp-img-border'].filter(Boolean);
  const caption = str(a.caption).trim();
  const fileId = useId();

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('Uploading…');
    try {
      const result = await services.upload(file);
      updateAttributes({ src: result.asset.url });
      setStatus('Uploaded.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed.');
    }
  }

  // Changing anything but the source turns a Markdown image into the component, which can hold it.
  const update = (attrs: Record<string, unknown>) =>
    updateAttributes({
      ...attrs,
      ...(Object.keys(attrs).some((k) => k !== 'src' && k !== 'alt') ? { form: 'component' } : {}),
    });

  const img = (
    <span className="dp-img-lightbox" aria-label="Expand image">
      <span className="dp-img-lightbox-inner">
        {a.src ? (
          <img className={classes.join(' ')} src={str(a.src)} alt={str(a.alt)} width={width || undefined} />
        ) : (
          <span className={styles.emptyImage}>No image yet: upload one or paste its URL.</span>
        )}
      </span>
    </span>
  );
  return (
    <NodeViewWrapper className={`dp-image ${styles.image}`} data-selected={selected || undefined}>
      {caption || a.framed ? (
        <figure className={`dp-figure${a.framed ? ` dp-figure-framed dp-figure-align-${align || 'center'}` : ''}`}>
          {img}
          {caption && (
            <figcaption>
              <p>{caption}</p>
            </figcaption>
          )}
        </figure>
      ) : (
        img
      )}
      <Toolbar label="Image settings" onDelete={deleteNode}>
        <span className={styles.field}>
          <label htmlFor={fileId}>Upload</label>
          <input id={fileId} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={upload} />
        </span>
        <Field label="Image URL" value={str(a.src)} onChange={(value) => updateAttributes({ src: value })} />
        <Field
          label="Alt text"
          value={str(a.alt)}
          onChange={(value) => updateAttributes({ alt: value, altSrc: null })}
        />
        <Select
          label="Align"
          value={align}
          options={['', 'left', 'center', 'right']}
          onChange={(value) => update({ align: value || null })}
        />
        <Field
          label="Width"
          value={str(a.width)}
          placeholder="e.g. 70% or 500px"
          onChange={(value) => update({ width: value || null })}
        />
        <Field label="Caption" value={str(a.caption)} onChange={(value) => update({ caption: value })} />
        <span className={styles.field}>
          <label>
            <input type="checkbox" checked={a.border === true} onChange={(e) => update({ border: e.target.checked })} />{' '}
            Border
          </label>
        </span>
        <span role="status" className={styles.status}>
          {status}
        </span>
      </Toolbar>
    </NodeViewWrapper>
  );
}

// --- embed ----------------------------------------------------------------------------------------------------

export function EmbedView({ node, updateAttributes, deleteNode }: Props) {
  const url = str(node.attrs.url);
  const title = str(node.attrs.title);
  const youtube = YOUTUBE_RE.exec(url);
  return (
    <NodeViewWrapper className={`dp-embed ${youtube ? '' : 'dp-embed-link'} ${styles.embed}`}>
      {youtube ? (
        <div className="dp-embed-media">
          <iframe
            className="dp-embed-iframe"
            src={`https://www.youtube-nocookie.com/embed/${youtube[1]}`}
            title={title || 'YouTube embed'}
            width="854"
            height="480"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-presentation"
          />
        </div>
      ) : (
        <span>{title || url || 'Paste a YouTube URL below.'}</span>
      )}
      <Toolbar label="Embed settings" onDelete={deleteNode}>
        <Field label="URL" value={url} onChange={(value) => updateAttributes({ url: value })} />
        <Field label="Title" value={title} onChange={(value) => updateAttributes({ title: value })} />
      </Toolbar>
    </NodeViewWrapper>
  );
}

// --- HTML block -----------------------------------------------------------------------------------------------

/** The block's source and a preview in a frame that can run no script (no allow-scripts, no same origin). */
export function HtmlBlockView({ node, updateAttributes, deleteNode }: Props) {
  const id = useId();
  const html = str(node.attrs.html);
  return (
    <NodeViewWrapper className={`dp-htmlblock ${styles.htmlBlock}`}>
      <Toolbar label="HTML block" onDelete={deleteNode}>
        <span className={styles.fieldWide}>
          <label htmlFor={id}>HTML</label>
          <textarea
            id={id}
            value={html}
            rows={8}
            spellCheck={false}
            onChange={(e) => updateAttributes({ html: e.target.value })}
          />
        </span>
      </Toolbar>
      <iframe className="dp-htmlblock-frame" title="HTML block preview" sandbox="" srcDoc={html} />
    </NodeViewWrapper>
  );
}

// --- raw HTML and raw Markdown --------------------------------------------------------------------------------

export function RawHtmlView({ node, updateAttributes, deleteNode, selected }: Props) {
  const id = useId();
  const html = str(node.attrs.html);
  return (
    <NodeViewWrapper className={styles.raw}>
      <div
        className={styles.rawPreview}
        contentEditable={false}
        // The C4 sanitizer, as the server applies it when the page is rendered.
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
      />
      {selected && (
        <Toolbar label="HTML" onDelete={deleteNode}>
          <span className={styles.fieldWide}>
            <label htmlFor={id}>HTML source</label>
            <textarea
              id={id}
              value={html}
              rows={5}
              spellCheck={false}
              onChange={(e) => updateAttributes({ html: e.target.value })}
            />
          </span>
        </Toolbar>
      )}
    </NodeViewWrapper>
  );
}

export function RawMarkdownView({ node, updateAttributes }: Props) {
  const id = useId();
  if (node.attrs.kind === 'frontmatter') return <NodeViewWrapper className={styles.hidden} />;
  return (
    <NodeViewWrapper className={`dp-editor-raw ${styles.raw}`}>
      <div contentEditable={false} className={styles.fieldWide}>
        <label htmlFor={id}>Markdown the editor shows as source</label>
        <textarea
          id={id}
          value={str(node.attrs.markdown)}
          rows={4}
          spellCheck={false}
          onChange={(e) => updateAttributes({ markdown: e.target.value })}
        />
      </div>
    </NodeViewWrapper>
  );
}
