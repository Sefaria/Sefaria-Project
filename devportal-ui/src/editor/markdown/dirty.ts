// The dirty-tracking plugin of the source-preserving round trip (PLAN §2.11). A top-level node keeps its `mdSrc`
// only while it is the very node the parser produced: ProseMirror shares unchanged nodes between documents, so a
// top-level node of the new document that is not one of the old document's top-level nodes was edited (or
// created), and loses its `mdSrc`. The serializer then writes it from its content. Moving a block keeps its
// identity, and its source, which is still exactly what it means.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

export const dirtyKey = new PluginKey('dpDirty');
export const LOAD_META = 'load';

export function markDirty(oldDoc: PMNode, state: EditorState): Transaction | null {
  const before = new Set<PMNode>();
  oldDoc.forEach((node) => before.add(node));
  const tr = state.tr;
  state.doc.forEach((node, offset) => {
    if (node.attrs.mdSrc !== null && node.attrs.mdSrc !== undefined && !before.has(node)) {
      tr.setNodeAttribute(offset, 'mdSrc', null);
    }
  });
  return tr.steps.length ? tr.setMeta(dirtyKey, 'mark') : null;
}

export function dirtyPlugin(): Plugin {
  return new Plugin({
    key: dirtyKey,
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      // Loading a saved document (`LOAD_META`) is not an edit.
      if (transactions.some((tr) => tr.getMeta(dirtyKey) === LOAD_META)) return null;
      return markDirty(oldState.doc, newState);
    },
  });
}

/** Whether the top-level node at `index` would be written from its content. */
export function isDirty(doc: PMNode, index: number): boolean {
  return doc.child(index).attrs.mdSrc === null;
}

export const DirtyTracking = Extension.create({
  name: 'dpDirtyTracking',
  addProseMirrorPlugins: () => [dirtyPlugin()],
});
