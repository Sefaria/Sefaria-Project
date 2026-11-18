// Copies text to the clipboard: the async Clipboard API when the page may use it, else the old
// `document.execCommand('copy')` on a hidden textarea (older browsers, non-secure contexts, denied permission).
// Resolves when the text was copied; rejects when neither way worked.
import './ui.css';

export async function copyText(text: string, doc: Document = document): Promise<void> {
  const clipboard = doc.defaultView?.navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea copy.
    }
  }
  if (!copyWithTextarea(text, doc)) throw new Error('copy failed');
}

function copyWithTextarea(text: string, doc: Document): boolean {
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.className = 'dp-visually-hidden';
  doc.body.append(area);
  const selection = doc.getSelection();
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  area.select();
  const ok = execCopy(doc);
  area.remove();
  if (previous && selection) {
    selection.removeAllRanges();
    selection.addRange(previous);
  }
  return ok;
}

function execCopy(doc: Document): boolean {
  try {
    return typeof doc.execCommand === 'function' && doc.execCommand('copy');
  } catch {
    return false;
  }
}
