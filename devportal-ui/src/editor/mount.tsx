// Mounts the editor on the shell page devportal/templates/devportal/editor.html (#dp-editor-root, #dp-editor-data).
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorApp, type EditorBoot } from './EditorApp';
import './editor.css';

export const EDITOR_ROOT_ID = 'dp-editor-root';
export const EDITOR_DATA_ID = 'dp-editor-data';

export function readEditorBoot(doc: Document): EditorBoot | null {
  const element = doc.getElementById(EDITOR_DATA_ID);
  if (!element) return null;
  try {
    const data = JSON.parse(element.textContent ?? '') as Partial<EditorBoot>;
    if (data.contractVersion !== 1 || !data.initial) return null;
    return data as EditorBoot;
  } catch {
    return null;
  }
}

/** Returns null when the page is not the editor shell. */
export function mountEditor(doc: Document = document): Root | null {
  const container = doc.getElementById(EDITOR_ROOT_ID);
  const boot = readEditorBoot(doc);
  if (!container || !boot) return null;
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <EditorApp boot={boot} />
    </StrictMode>
  );
  return root;
}
