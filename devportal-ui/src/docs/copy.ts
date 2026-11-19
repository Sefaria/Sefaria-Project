// Copy buttons on code blocks (contract C6 `CodeCopyButton`). Each pre gets a button named
// "Copy to clipboard"; after a successful copy its name is "Copied!" for COPIED_MS, as the page objects
// expect (C7 `copyCodeBlock`). Live shows an icon-only button that appears on hover; so does ours.
import type { Cleanup } from './types';

export const COPY_LABEL = 'Copy to clipboard';
export const COPIED_LABEL = 'Copied!';
export const COPIED_MS = 2000;

/** The text a block copies: its code element's text, without the trailing newline fences end with. */
export function codeText(pre: HTMLElement): string {
  const code = pre.querySelector('code');
  return (code ?? pre).textContent?.replace(/\n$/, '') ?? '';
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function enhanceCopyButtons(root: ParentNode): Cleanup {
  const added: HTMLButtonElement[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  for (const pre of root.querySelectorAll<HTMLElement>('pre')) {
    if (pre.querySelector(':scope > .dp-code-copy')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dp-code-copy';
    button.setAttribute('aria-label', COPY_LABEL);
    button.title = COPY_LABEL;
    button.addEventListener('click', async () => {
      if (!(await writeClipboard(codeText(pre)))) return;
      button.classList.add('dp-copied');
      button.setAttribute('aria-label', COPIED_LABEL);
      button.title = COPIED_LABEL;
      const timer = setTimeout(() => {
        timers.delete(timer);
        button.classList.remove('dp-copied');
        button.setAttribute('aria-label', COPY_LABEL);
        button.title = COPY_LABEL;
      }, COPIED_MS);
      timers.add(timer);
    });
    pre.prepend(button);
    added.push(button);
  }
  return () => {
    timers.forEach((t) => clearTimeout(t));
    added.forEach((b) => b.remove());
  };
}
