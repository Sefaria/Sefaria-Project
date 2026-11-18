// The editing canvas: TipTap with the C4 schema inside `.dp-markdown`, so article.css styles it as the public page
// (PLAN §2.11 "Edit shows TipTap with article.css"), a formatting toolbar and the "/" menu.
import type { Editor, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { LOAD_META, dirtyKey } from '../markdown/dirty';
import { canvasExtensions } from './extensions';
import { filterSlashItems, slashQuery, type SlashItem, type SlashQuery } from './slash';
import { SlashMenu } from './SlashMenu';
import { addColumn, addRow, deleteColumn, deleteRow, tableAt } from './table';
import styles from './Canvas.module.css';

export interface CanvasProps {
  /** The document to edit (from `parseMarkdown`). A new value replaces the document. */
  content: JSONContent;
  /** Accessible name of the editable region. */
  label: string;
  onReady?(editor: Editor): void;
  onChange?(editor: Editor): void;
}

interface MenuState {
  query: SlashQuery;
  items: SlashItem[];
  active: number;
  position: { top: number; left: number } | null;
}

function caretPosition(editor: Editor, pos: number): MenuState['position'] {
  try {
    const coords = editor.view.coordsAtPos(pos);
    const box = editor.view.dom.getBoundingClientRect();
    return { top: coords.bottom - box.top + 4, left: coords.left - box.left };
  } catch {
    return null; // no layout (tests)
  }
}

export function Canvas({ content, label, onReady, onChange }: CanvasProps) {
  const menuId = useId();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<MenuState | null>(null);
  const dismissed = useRef<number | null>(null);
  const callbacks = useRef({ onReady, onChange });
  useEffect(() => {
    callbacks.current = { onReady, onChange };
  });
  const [, setTick] = useState(0);
  const editorRef = useRef<Editor | null>(null);

  const updateMenu = useCallback((editor: Editor) => {
    const query = slashQuery(editor.state);
    if (!query || dismissed.current === query.range.from) {
      if (!query) dismissed.current = null;
      menuRef.current = null;
      setMenu(null);
      return;
    }
    const items = filterSlashItems(query.query);
    const position = caretPosition(editor, query.range.from);
    const previous = menuRef.current;
    const active =
      previous && previous.query.range.from === query.range.from
        ? Math.min(previous.active, Math.max(items.length - 1, 0))
        : 0;
    const next = { query, items, active, position };
    menuRef.current = next;
    setMenu(next);
  }, []);

  const pick = useCallback((editor: Editor, item: SlashItem) => {
    const current = menuRef.current;
    if (!current) return;
    menuRef.current = null;
    setMenu(null);
    item.run(editor, current.query.range);
  }, []);

  const editor = useEditor({
    extensions: canvasExtensions(),
    content,
    immediatelyRender: true,
    // TipTap would inject a <style> element, which the CSP forbids (style-src 'self'); its rules are in editor.css.
    injectCSS: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        class: styles.prose ?? '',
      },
      handleKeyDown: (view, event) => {
        const current = menuRef.current;
        if (!current) return false;
        const count = current.items.length;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (!count) return true;
          const step = event.key === 'ArrowDown' ? 1 : -1;
          const next = { ...current, active: (current.active + step + count) % count };
          menuRef.current = next;
          setMenu(next);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = current.items[current.active];
          if (!item || !editorRef.current) return false;
          pick(editorRef.current, item);
          return true;
        }
        if (event.key === 'Escape') {
          dismissed.current = current.query.range.from;
          menuRef.current = null;
          setMenu(null);
          view.focus();
          return true;
        }
        return false;
      },
    },
    onTransaction: ({ editor: e, transaction }) => {
      updateMenu(e);
      setTick((n) => n + 1);
      if (transaction.docChanged) callbacks.current.onChange?.(e);
    },
  });
  useEffect(() => {
    editorRef.current = editor;
    if (editor) callbacks.current.onReady?.(editor);
  }, [editor]);

  const loaded = useRef<JSONContent>(content);
  useEffect(() => {
    if (!editor || editor.isDestroyed || loaded.current === content) return;
    loaded.current = content;
    // A loaded document is the saved state: its blocks keep their source until edited, and loading is not undoable.
    editor
      .chain()
      .setMeta(dirtyKey, LOAD_META)
      .setMeta('addToHistory', false)
      .setContent(content, { emitUpdate: false })
      .run();
    callbacks.current.onReady?.(editor);
  }, [editor, content]);

  if (!editor) return null;
  const inTable = tableAt(editor) !== null;
  const mark = (name: string) => () => editor.chain().focus().toggleMark(name).run();
  const toggleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetMark('link').run();
      return;
    }
    const href = window.prompt('Link URL (https://…, doc:slug, ref:slug or /path)');
    if (href) editor.chain().focus().setMark('link', { href, kind: 'inline' }).run();
  };

  return (
    <div className={styles.canvas}>
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        <button type="button" aria-pressed={editor.isActive('bold')} onClick={mark('bold')}>
          Bold
        </button>
        <button type="button" aria-pressed={editor.isActive('italic')} onClick={mark('italic')}>
          Italic
        </button>
        <button type="button" aria-pressed={editor.isActive('strike')} onClick={mark('strike')}>
          Strike
        </button>
        <button type="button" aria-pressed={editor.isActive('code')} onClick={mark('code')}>
          Code
        </button>
        <button type="button" aria-pressed={editor.isActive('link')} onClick={toggleLink}>
          Link
        </button>
        {inTable && (
          <span className={styles.tableTools} role="group" aria-label="Table">
            <button type="button" onClick={() => addRow(editor)}>
              Add row
            </button>
            <button type="button" onClick={() => addColumn(editor)}>
              Add column
            </button>
            <button type="button" onClick={() => deleteRow(editor)}>
              Delete row
            </button>
            <button type="button" onClick={() => deleteColumn(editor)}>
              Delete column
            </button>
          </span>
        )}
        <span className={styles.hint}>Type / to insert a block</span>
      </div>
      <div className={`dp-markdown ${styles.surface}`}>
        <EditorContent editor={editor} />
        {menu && (
          <SlashMenu
            id={menuId}
            items={menu.items}
            active={menu.active}
            position={menu.position}
            onPick={(item) => pick(editor, item)}
            onHover={(index) => {
              const next = { ...menu, active: index };
              menuRef.current = next;
              setMenu(next);
            }}
          />
        )}
      </div>
    </div>
  );
}
