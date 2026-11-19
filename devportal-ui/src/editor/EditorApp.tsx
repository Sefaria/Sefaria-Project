// The staff editor (PLAN §2.11; the ReadMe experience of research/notes/NOTES_editor_screenshot.md): sections, the
// page tree, the canvas with View/Edit, page settings or the endpoint overlay, revision history, Save draft and
// Publish with conflict handling.
import type { Editor, JSONContent } from '@tiptap/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EditorPage,
  EditorPreviewResponse,
  EditorTree,
  RevisionContent,
  RevisionSummary,
  Section,
} from '../contracts';
import { ApiError, ConflictError, EditorApi } from './api';
import { Canvas } from './canvas/Canvas';
import { EditorServicesContext } from './canvas/services';
import { parseMarkdown } from './markdown/parse';
import { serializeMarkdown } from './markdown/serialize';
import { EndpointPanel } from './panels/EndpointPanel';
import { RevisionHistory } from './panels/RevisionHistory';
import { SettingsPanel } from './panels/SettingsPanel';
import { findNode } from './tree/flatten';
import { PageTree } from './tree/PageTree';
import styles from './EditorApp.module.css';

export interface EditorBoot {
  contractVersion: 1;
  apiBase: string;
  csrfUrl: string;
  user: { id: number; name: string } | null;
  initial: { section: Section; slug: string | null };
}

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'docs', label: 'Docs' },
  { id: 'reference', label: 'API Reference' },
  { id: 'page', label: 'Custom Pages' },
];

type Notice = { kind: 'info' | 'error'; text: string } | null;

function message(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = Object.entries(error.fields)
      .map(([k, v]) => `${k}: ${v.join(' ')}`)
      .join('; ');
    return fields ? `${error.message} (${fields})` : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export interface EditorAppProps {
  boot: EditorBoot;
  api?: EditorApi;
}

export function EditorApp({ boot, api: givenApi }: EditorAppProps) {
  const api = useMemo(
    () => givenApi ?? new EditorApi({ apiBase: boot.apiBase, csrfUrl: boot.csrfUrl }),
    [givenApi, boot]
  );
  const [section, setSection] = useState<Section>(boot.initial.section);
  const [tree, setTree] = useState<EditorTree | null>(null);
  const [page, setPage] = useState<EditorPage | null>(null);
  const [content, setContent] = useState<RevisionContent | null>(null);
  const [doc, setDoc] = useState<JSONContent | null>(null);
  const [mode, setMode] = useState<'edit' | 'view'>('edit');
  const [panel, setPanel] = useState<'settings' | 'history'>('settings');
  const [preview, setPreview] = useState<EditorPreviewResponse | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [conflict, setConflict] = useState<ConflictError | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const initialSlug = useRef(boot.initial.slug);

  const loadTree = useCallback(
    async (which: Section) => {
      try {
        const next = await api.tree(which);
        setTree(next);
        return next;
      } catch (error) {
        setNotice({ kind: 'error', text: message(error) });
        return null;
      }
    },
    [api]
  );

  const openPage = useCallback(
    async (id: number) => {
      try {
        const next = await api.page(id);
        setPage(next);
        setContent(next.content);
        setDoc(parseMarkdown(next.content.bodyMd));
        setChanged(false);
        setPreview(null);
        setRevisions(null);
        setConflict(null);
        setMode('edit');
      } catch (error) {
        setNotice({ kind: 'error', text: message(error) });
      }
    },
    [api]
  );

  useEffect(() => {
    let cancelled = false;
    api
      .tree(section)
      .then((next) => {
        if (cancelled) return;
        setTree(next);
        const slug = initialSlug.current;
        if (!slug) return;
        initialSlug.current = null;
        const node = findNode(next.nodes, (n) => n.slug === slug);
        if (node) void openPage(node.id);
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice({ kind: 'error', text: message(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [section, api, openPage]);

  const currentContent = useCallback((): RevisionContent | null => {
    if (!content) return null;
    const editor = editorRef.current;
    const bodyMd = editor ? serializeMarkdown(editor.state.doc) : content.bodyMd;
    return { ...content, bodyMd };
  }, [content]);

  async function save(base: number | null = page?.revision?.number ?? null): Promise<RevisionSummary | null> {
    if (!page) return null;
    const body = currentContent();
    if (!body) return null;
    setBusy(true);
    try {
      const saved = await api.saveDraft(page.page.id, { baseRevision: base, content: body });
      setPage({ ...page, page: saved.page, revision: saved.revision, content: body });
      setContent(body);
      setChanged(false);
      setConflict(null);
      setNotice({
        kind: 'info',
        text: `Draft saved as revision ${saved.revision.number}. Visitors still see the published page.`,
      });
      void loadTree(section);
      return saved.revision;
    } catch (error) {
      if (error instanceof ConflictError) setConflict(error);
      else setNotice({ kind: 'error', text: message(error) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!page) return;
    // Unsaved changes are saved as a draft first; then the newest revision is published.
    const revision = changed || !page.revision ? await save() : page.revision;
    if (!revision) return;
    setBusy(true);
    try {
      const result = await api.publish(page.page.id, revision.number);
      setPage((p) => (p ? { ...p, page: result.page, revision: result.revision } : p));
      setNotice({ kind: 'info', text: `Published revision ${result.revision.number}: ${result.url}` });
      void loadTree(section);
    } catch (error) {
      if (error instanceof ConflictError) setConflict(error);
      else setNotice({ kind: 'error', text: message(error) });
    } finally {
      setBusy(false);
    }
  }

  async function showView() {
    const body = currentContent();
    if (!page || !body) return;
    setMode('view');
    setPreview(null);
    try {
      setPreview(
        await api.preview({ section: page.page.section, kind: page.page.kind, pageId: page.page.id, content: body })
      );
    } catch (error) {
      setNotice({ kind: 'error', text: message(error) });
    }
  }

  async function showHistory() {
    if (!page) return;
    setPanel('history');
    setRevisions(null);
    try {
      setRevisions((await api.revisions(page.page.id)).revisions);
    } catch (error) {
      setNotice({ kind: 'error', text: message(error) });
    }
  }

  async function restore(number: number) {
    if (!page) return;
    setBusy(true);
    try {
      const result = await api.restore(page.page.id, number, page.revision?.number ?? null);
      setNotice({ kind: 'info', text: `Revision ${number} restored as draft revision ${result.revision.number}.` });
      await openPage(page.page.id);
      await showHistoryFor(page.page.id);
    } catch (error) {
      if (error instanceof ConflictError) setConflict(error);
      else setNotice({ kind: 'error', text: message(error) });
    } finally {
      setBusy(false);
    }
  }

  async function showHistoryFor(id: number) {
    setPanel('history');
    setRevisions((await api.revisions(id)).revisions);
  }

  async function create(parentId: number | null, kind: 'page' | 'category' | 'link') {
    const title = window.prompt(kind === 'category' ? 'Category name' : kind === 'link' ? 'Link title' : 'Page title');
    if (!title) return;
    let parent = parentId;
    if (kind !== 'category' && parent === null && section !== 'page') {
      // A page or link in docs and reference belongs to a category: the selected page's, else the first.
      const categories = tree?.nodes ?? [];
      const selected = page
        ? categories.find((c) => c.id === page.page.id || findNode(c.children, (n) => n.id === page.page.id))
        : null;
      parent = (selected ?? categories[0])?.id ?? null;
    }
    try {
      const created = await api.create({ section, kind, parentId: parent, position: null, title, slug: null });
      await loadTree(section);
      await openPage(created.page.id);
      setNotice({ kind: 'info', text: `Created “${title}”. It is not public until you publish it.` });
    } catch (error) {
      setNotice({ kind: 'error', text: message(error) });
    }
  }

  async function move(id: number, projection: { parentId: number | null; position: number }) {
    if (!tree) return;
    try {
      setTree(
        await api.move(id, {
          parentId: projection.parentId,
          position: projection.position,
          baseGeneration: tree.generation,
        })
      );
    } catch (error) {
      if (error instanceof ConflictError) {
        setNotice({
          kind: 'error',
          text: 'The page tree changed while you were working. It has been reloaded; try the move again.',
        });
        await loadTree(section);
      } else setNotice({ kind: 'error', text: message(error) });
    }
  }

  async function remove(id: number) {
    const node = tree ? findNode(tree.nodes, (n) => n.id === id) : null;
    if (!window.confirm(`Delete “${node?.title ?? 'this page'}”? Visitors will get a 404.`)) return;
    try {
      setTree(await api.remove(id));
      if (page?.page.id === id) {
        setPage(null);
        setDoc(null);
      }
    } catch (error) {
      setNotice({ kind: 'error', text: message(error) });
    }
  }

  async function changeSlug(slug: string) {
    if (!page) return;
    const next = await api.settings(page.page.id, { slug });
    setPage({ ...page, page: next.page });
    void loadTree(section);
  }

  const isEndpoint = page?.page.kind === 'endpoint';
  const editableBody =
    page && page.page.kind !== 'category' && page.page.kind !== 'link' && page.page.kind !== 'tag_group';
  const services = useMemo(() => ({ upload: (file: File) => api.upload(file) }), [api]);

  return (
    <EditorServicesContext.Provider value={services}>
      <div className={styles.app}>
        <header className={styles.topbar}>
          <span className={styles.brand}>Sefaria Developers · Editor</span>
          <nav aria-label="Sections" className={styles.sections}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={section === s.id}
                onClick={() => {
                  setSection(s.id);
                  setPage(null);
                  setDoc(null);
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>
          {page && (
            <div className={styles.actions}>
              <div role="group" aria-label="Mode" className={styles.toggle}>
                <button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>
                  Edit
                </button>
                <button type="button" aria-pressed={mode === 'view'} onClick={showView}>
                  View
                </button>
              </div>
              <button
                type="button"
                aria-pressed={panel === 'history'}
                onClick={() => (panel === 'history' ? setPanel('settings') : showHistory())}
              >
                History
              </button>
              <button type="button" disabled={busy} onClick={() => save()}>
                Save draft
              </button>
              <button type="button" className={styles.primary} disabled={busy} onClick={publish}>
                Publish
              </button>
            </div>
          )}
          {boot.user && <span className={styles.user}>{boot.user.name}</span>}
        </header>

        <div className={styles.messages} aria-live="polite">
          {notice && (
            <p
              className={notice.kind === 'error' ? styles.error : styles.info}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              {notice.text}{' '}
              <button type="button" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </p>
          )}
          {conflict && (
            <div className={styles.error} role="alert">
              <p>
                {conflict.message}
                {conflict.conflict.latest && (
                  <>
                    {' '}
                    Revision {conflict.conflict.latest.number} was saved
                    {conflict.conflict.latest.author ? ` by ${conflict.conflict.latest.author.name}` : ''}.
                  </>
                )}
              </p>
              <button type="button" onClick={() => page && openPage(page.page.id)}>
                Load their version (discard mine)
              </button>
              {conflict.conflict.latest && (
                <button type="button" onClick={() => save(conflict.conflict.latest?.number ?? null)}>
                  Save mine on top of theirs
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.body}>
          <aside className={styles.sidebar}>
            {tree ? (
              <PageTree
                tree={tree}
                selectedId={page?.page.id ?? null}
                onSelect={(id) => {
                  if (changed && !window.confirm('Leave this page? Unsaved changes will be lost.')) return;
                  void openPage(id);
                }}
                onCreate={create}
                onMove={move}
                onDelete={remove}
              />
            ) : (
              <p>Loading pages…</p>
            )}
          </aside>

          <main className={styles.main} aria-label="Page">
            {!page || !content ? (
              <p className={styles.placeholder}>Choose a page in the tree, or create one.</p>
            ) : mode === 'view' ? (
              <article className={`dp-article ${styles.view}`} aria-label="Preview of the draft">
                {preview ? (
                  <>
                    <header className="dp-docs-header">
                      <h1 className="dp-docs-header__title">{preview.title}</h1>
                      {preview.excerpt && <div className="dp-docs-header__excerpt">{preview.excerpt}</div>}
                    </header>
                    {/* Rendered and sanitized by the server's Markdown pipeline (the public page's rendering). */}
                    <div className="dp-markdown" dangerouslySetInnerHTML={{ __html: preview.bodyHtml }} />
                    {preview.sanitizerRemovals.length > 0 && (
                      <p className={styles.info}>Removed when rendered: {preview.sanitizerRemovals.join(', ')}</p>
                    )}
                  </>
                ) : (
                  <p>Rendering…</p>
                )}
              </article>
            ) : (
              <article className={`dp-article ${styles.edit}`}>
                {!isEndpoint ? (
                  <header className="dp-docs-header">
                    <label className={styles.visuallyHidden} htmlFor="dp-editor-title">
                      Title
                    </label>
                    <input
                      id="dp-editor-title"
                      className={`dp-docs-header__title ${styles.titleInput}`}
                      value={content.title}
                      onChange={(e) => {
                        setContent({ ...content, title: e.target.value });
                        setChanged(true);
                      }}
                    />
                    {page.page.kind !== 'category' && (
                      <>
                        <label className={styles.visuallyHidden} htmlFor="dp-editor-excerpt">
                          Subtitle
                        </label>
                        <textarea
                          id="dp-editor-excerpt"
                          className={`dp-docs-header__excerpt ${styles.excerptInput}`}
                          placeholder="Subtitle (optional)"
                          rows={2}
                          value={content.excerpt}
                          onChange={(e) => {
                            setContent({ ...content, excerpt: e.target.value });
                            setChanged(true);
                          }}
                        />
                      </>
                    )}
                  </header>
                ) : (
                  <header className="dp-docs-header">
                    <h1 className="dp-docs-header__title">
                      {content.endpoint?.titleOverride || page.spec?.title || content.title}
                    </h1>
                    <p className={styles.info}>Free Markdown shown after the endpoint's description:</p>
                  </header>
                )}
                {editableBody && doc && (
                  <Canvas
                    content={doc}
                    label={`Body of ${content.title}`}
                    onReady={(editor) => {
                      editorRef.current = editor;
                    }}
                    onChange={() => setChanged(true)}
                  />
                )}
              </article>
            )}
          </main>

          <aside className={styles.rail} aria-label="Page details">
            {page && content && panel === 'history' ? (
              <RevisionHistory revisions={revisions} busy={busy} onRestore={restore} />
            ) : page && content && isEndpoint ? (
              <EndpointPanel
                page={page}
                content={content}
                onChange={(next) => {
                  setContent(next);
                  setChanged(true);
                }}
              />
            ) : page && content ? (
              <SettingsPanel
                key={page.page.id}
                page={page}
                content={content}
                onChange={(next) => {
                  setContent(next);
                  setChanged(true);
                }}
                onSlug={changeSlug}
              />
            ) : null}
          </aside>
        </div>
      </div>
    </EditorServicesContext.Provider>
  );
}
