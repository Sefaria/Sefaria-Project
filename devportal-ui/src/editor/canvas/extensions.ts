// The canvas's extensions: the schema (../schema/extensions.ts) plus node views, editing behaviour (history,
// lists, breaks, drop and gap cursors) and the dirty-tracking plugin of the round trip.
import { Extension, type AnyExtension, type Extensions } from '@tiptap/core';
import { dropCursor } from '@tiptap/pm/dropcursor';
import { gapCursor } from '@tiptap/pm/gapcursor';
import { history, redo, undo } from '@tiptap/pm/history';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ComponentType } from 'react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { DirtyTracking } from '../markdown/dirty';
import { schemaExtensions } from '../schema/extensions';
import {
  CalloutView,
  CodeBlockView,
  EmbedView,
  HtmlBlockView,
  ImageView,
  RawHtmlView,
  RawMarkdownView,
} from './NodeViews';

const REACT_VIEWS: Record<string, ComponentType<ReactNodeViewProps>> = {
  callout: CalloutView,
  codeBlock: CodeBlockView,
  dpImage: ImageView,
  embed: EmbedView,
  dpHtmlBlock: HtmlBlockView,
  rawHtml: RawHtmlView,
  rawMarkdown: RawMarkdownView,
};

/** Inline atoms as small DOM views: a raw tag shows its source, an emoji or entity its character. */
function inlineAtomView(name: string) {
  return () =>
    ({ node }: { node: { attrs: Record<string, unknown> } }) => {
      const dom = document.createElement('span');
      if (name === 'htmlInline') {
        dom.className = 'dp-editor-html-tag';
        dom.textContent = String(node.attrs.html ?? '');
        dom.title = 'Raw HTML';
      } else if (name === 'emoji') {
        dom.textContent = String(node.attrs.char ?? '');
        dom.title = `:${String(node.attrs.name ?? '')}:`;
      } else {
        dom.textContent = String(node.attrs.text ?? '');
      }
      return { dom };
    };
}

const INLINE_VIEWS = new Set(['htmlInline', 'emoji', 'literal']);

const Behaviour = Extension.create({
  name: 'dpBehaviour',
  addProseMirrorPlugins() {
    return [history(), dropCursor({ color: 'var(--dp-color-primary, #3b82f6)' }), gapCursor()];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-z': () => undo(this.editor.state, this.editor.view.dispatch),
      'Mod-Shift-z': () => redo(this.editor.state, this.editor.view.dispatch),
      'Mod-y': () => redo(this.editor.state, this.editor.view.dispatch),
      Enter: () => this.editor.isActive('listItem') && this.editor.commands.splitListItem('listItem'),
      Tab: () => this.editor.isActive('listItem') && this.editor.commands.sinkListItem('listItem'),
      'Shift-Tab': () => this.editor.isActive('listItem') && this.editor.commands.liftListItem('listItem'),
    };
  },
});

export function canvasExtensions(): Extensions {
  const base = schemaExtensions().map((ext): AnyExtension => {
    const view = REACT_VIEWS[ext.name];
    if (view) return ext.extend({ addNodeView: () => ReactNodeViewRenderer(view) });
    if (INLINE_VIEWS.has(ext.name)) return ext.extend({ addNodeView: inlineAtomView(ext.name) });
    return ext;
  });
  return [...base, Behaviour, DirtyTracking];
}
