import { axe } from 'vitest-axe';
import { ANALYTICS_EVENT, CONTACT_FORM_TITLE, enhanceContactForm } from './contactForm';
import { mountArticle } from './test-utils';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

// The contact page body as the renderer produces it (see devportal/tests/pure/markdown_corpus_test.py).
const CONTACT =
  '<div>Use this form…</div><hr><iframe src="https://sefaria.formstack.com/forms/developer_contact" height="1000"></iframe>';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('enhanceContactForm', () => {
  it('names the Formstack frame and reports contact_form_start once, when focus enters it', async () => {
    const root = mountArticle(CONTACT);
    const onStart = vi.fn();
    const cleanup = enhanceContactForm(root, onStart);
    const frame = root.querySelector('iframe')!;
    expect(frame).toHaveAttribute('title', CONTACT_FORM_TITLE);
    expect(frame).toHaveAttribute('height', '1000');
    expect(frame).not.toHaveAttribute('style');
    expect(await axe(root, { iframes: false })).toHaveNoViolations();
    window.dispatchEvent(new Event('blur'));
    await tick();
    expect(onStart).not.toHaveBeenCalled();
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(frame);
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('blur'));
    await tick();
    expect(onStart).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('dispatches the dp-analytics event by default and leaves other frames alone', async () => {
    const root = mountArticle(CONTACT + '<iframe src="https://www.youtube-nocookie.com/embed/x" title="v"></iframe>');
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(ANALYTICS_EVENT, listener);
    const cleanup = enhanceContactForm(root);
    expect(root.querySelectorAll('iframe')[1]).toHaveAttribute('title', 'v');
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(root.querySelector('iframe'));
    window.dispatchEvent(new Event('blur'));
    await tick();
    expect(seen).toEqual([{ name: 'contact_form_start' }]);
    window.removeEventListener(ANALYTICS_EVENT, listener);
    cleanup();
  });

  it('does nothing on pages without the form', () => {
    const root = mountArticle('<p>No form</p>');
    expect(() => enhanceContactForm(root)()).not.toThrow();
  });
});
