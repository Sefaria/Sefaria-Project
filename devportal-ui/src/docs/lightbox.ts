// Image lightbox (contract C6 `ImageLightbox`). The renderer wraps each image in
// span.dp-img-lightbox[role=button][tabindex=0][aria-label]. Click, Enter or Space opens a modal
// <dialog> with the image at full size; a click anywhere, the Close button or Escape closes it and
// focus returns to the image's button. Live: span.lightbox toggles between .closed and .open.
import type { Cleanup } from './types';

export const CLOSE_LABEL = 'Close';

function dialogLabel(img: HTMLImageElement, trigger: HTMLElement): string {
  return img.alt.trim() || trigger.getAttribute('aria-label') || 'Image';
}

/** Opens the lightbox for a trigger; returns the dialog. Exported for tests. */
export function openLightbox(trigger: HTMLElement): HTMLDialogElement | null {
  const img = trigger.querySelector('img');
  if (!img) return null;
  const doc = trigger.ownerDocument;
  const dialog = doc.createElement('dialog');
  dialog.className = 'dp-lightbox';
  dialog.setAttribute('aria-label', dialogLabel(img, trigger));

  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'dp-lightbox-close';
  close.setAttribute('aria-label', CLOSE_LABEL);

  // The whole image area closes the lightbox too (live: click anywhere to zoom out).
  const inner = doc.createElement('button');
  inner.type = 'button';
  inner.className = 'dp-lightbox-inner';
  inner.setAttribute('aria-label', `${CLOSE_LABEL}: ${dialogLabel(img, trigger)}`);
  const big = doc.createElement('img');
  big.className = 'dp-lightbox-img';
  big.src = img.currentSrc || img.src;
  big.alt = img.alt;
  inner.appendChild(big);

  dialog.append(close, inner);
  doc.body.appendChild(dialog);

  const finish = () => {
    dialog.remove();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  };
  close.addEventListener('click', () => dialog.close());
  inner.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', finish, { once: true });
  trigger.setAttribute('aria-expanded', 'true');
  dialog.showModal();
  close.focus();
  return dialog;
}

export function enhanceLightbox(root: ParentNode): Cleanup {
  const triggers = [...root.querySelectorAll<HTMLElement>('.dp-img-lightbox')];
  const onClick = (event: Event) => {
    event.preventDefault();
    openLightbox(event.currentTarget as HTMLElement);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openLightbox(event.currentTarget as HTMLElement);
  };
  for (const trigger of triggers) {
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', onClick);
    trigger.addEventListener('keydown', onKey);
  }
  return () => {
    for (const trigger of triggers) {
      trigger.removeEventListener('click', onClick);
      trigger.removeEventListener('keydown', onKey);
    }
  };
}
