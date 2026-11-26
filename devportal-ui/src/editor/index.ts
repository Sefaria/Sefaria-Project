// src/editor (PLAN §2.1, §2.11): the staff editor (TipTap 3). A lazy chunk: the app entry loads it only on the
// editor shell page, e.g. `if (document.getElementById('dp-editor-root')) void import('../editor').then((m) =>
// m.mountEditor(document));`.
export { mountEditor, readEditorBoot, EDITOR_DATA_ID, EDITOR_ROOT_ID } from './mount';
export { EditorApp, type EditorBoot } from './EditorApp';
export { parseMarkdown } from './markdown/parse';
export { serializeMarkdown } from './markdown/serialize';
export { exportHtml } from './html/export';
