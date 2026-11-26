import { axe } from 'vitest-axe';
import { CLOSE_LABEL, enhanceLightbox } from './lightbox';
import { golden, mountArticle } from './test-utils';

afterEach(() => {
  document.body.innerHTML = '';
});

function dialog(): HTMLDialogElement | null {
  return document.querySelector('dialog.dp-lightbox');
}

describe('enhanceLightbox', () => {
  it('opens a modal dialog with the full image on click and returns focus on close', async () => {
    const root = mountArticle(golden('10-image-component'));
    enhanceLightbox(root);
    const trigger = root.querySelector<HTMLElement>('.dp-img-lightbox')!;
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    trigger.click();
    const d = dialog()!;
    expect(d).toHaveAttribute('open');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const img = d.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(trigger.querySelector('img')!.getAttribute('src'));
    const close = d.querySelector<HTMLButtonElement>('.dp-lightbox-close')!;
    expect(close).toHaveAccessibleName(CLOSE_LABEL);
    expect(document.activeElement).toBe(close);
    expect(await axe(document.body)).toHaveNoViolations();
    close.click();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens from the keyboard (Enter and Space) and closes by clicking the image', () => {
    const root = mountArticle(golden('11-image-markdown'));
    enhanceLightbox(root);
    const trigger = root.querySelector<HTMLElement>('.dp-img-lightbox')!;
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(dialog()).not.toBeNull();
    dialog()!.querySelector<HTMLButtonElement>('.dp-lightbox-inner')!.click();
    expect(dialog()).toBeNull();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(dialog()).not.toBeNull();
    dialog()!.close(); // what Escape does to a modal dialog
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('names the dialog after the image', () => {
    const root = mountArticle(
      '<span class="dp-img-lightbox" role="button" tabindex="0" aria-label="A chart"><span class="dp-img-lightbox-inner"><img alt="A chart" src="https://x/a.png"></span></span>'
    );
    enhanceLightbox(root);
    root.querySelector<HTMLElement>('.dp-img-lightbox')!.click();
    expect(dialog()).toHaveAccessibleName('A chart');
  });

  it('cleans up its listeners', () => {
    const root = mountArticle(golden('10-image-component'));
    const cleanup = enhanceLightbox(root);
    cleanup();
    root.querySelector<HTMLElement>('.dp-img-lightbox')!.click();
    expect(dialog()).toBeNull();
  });
});
