// The contact page's Formstack frame (SITE_ATLAS §5; contract C6 `ContactForm`). The source iframe has
// no title and an inline style; the sanitizer keeps `src` and `height` and drops the style (article.css
// sets its width). This gives the frame its accessible name and reports `contact_form_start` (contract
// C8) once, when focus first moves into the frame. The frame is cross-origin, so "focus moved into it"
// is seen as the window losing focus while the frame is the active element.
import type { Cleanup } from './types';

export const FORMSTACK_ORIGIN = 'https://sefaria.formstack.com/';
export const CONTACT_FORM_TITLE = 'Developer contact form';
/** The DOM event the analytics module listens for (detail: { name }). */
export const ANALYTICS_EVENT = 'dp-analytics';

function defaultStart(): void {
  window.dispatchEvent(new CustomEvent(ANALYTICS_EVENT, { detail: { name: 'contact_form_start' } }));
}

export function enhanceContactForm(root: ParentNode, onStart: () => void = defaultStart): Cleanup {
  const frames = [...root.querySelectorAll<HTMLIFrameElement>('iframe')].filter((f) =>
    (f.getAttribute('src') ?? '').startsWith(FORMSTACK_ORIGIN)
  );
  if (frames.length === 0) return () => {};
  for (const frame of frames) {
    if (!frame.title.trim()) frame.title = CONTACT_FORM_TITLE;
  }
  let started = false;
  const onBlur = () => {
    // The active element is updated after blur fires.
    setTimeout(() => {
      if (started || !frames.includes(document.activeElement as HTMLIFrameElement)) return;
      started = true;
      onStart();
    }, 0);
  };
  window.addEventListener('blur', onBlur);
  return () => window.removeEventListener('blur', onBlur);
}
