import { axe } from 'vitest-axe';
import { COPIED_LABEL, COPIED_MS, COPY_LABEL, codeText, enhanceCopyButtons } from './copy';
import { golden, mountArticle } from './test-utils';

let written: string[] = [];

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (t: string) => void written.push(t)) },
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('enhanceCopyButtons', () => {
  it('adds one "Copy to clipboard" button to every code block', async () => {
    const root = mountArticle(golden('09-code'));
    enhanceCopyButtons(root);
    const pres = root.querySelectorAll('pre');
    const buttons = root.querySelectorAll('pre > button.dp-code-copy');
    expect(buttons).toHaveLength(pres.length);
    for (const b of buttons) expect(b).toHaveAccessibleName(COPY_LABEL);
    // Inline code gets no button.
    expect(root.querySelectorAll('p code + button')).toHaveLength(0);
    enhanceCopyButtons(root);
    expect(root.querySelectorAll('pre > button.dp-code-copy')).toHaveLength(pres.length);
    expect(await axe(root)).toHaveNoViolations();
  });

  it('copies the code text and says "Copied!" for a while', async () => {
    vi.useFakeTimers();
    const root = mountArticle(
      '<pre class="dp-pre"><code class="dp-code" data-lang="python">import django\n</code></pre>'
    );
    enhanceCopyButtons(root);
    const button = root.querySelector<HTMLButtonElement>('.dp-code-copy')!;
    button.click();
    await vi.waitFor(() => expect(button).toHaveAccessibleName(COPIED_LABEL));
    expect(written).toEqual(['import django']);
    expect(button).toHaveClass('dp-copied');
    vi.advanceTimersByTime(COPIED_MS);
    expect(button).toHaveAccessibleName(COPY_LABEL);
    expect(button).not.toHaveClass('dp-copied');
  });

  it('stays "Copy to clipboard" when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    const root = mountArticle('<pre><code>x</code></pre>');
    enhanceCopyButtons(root);
    const button = root.querySelector<HTMLButtonElement>('.dp-code-copy')!;
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(button).toHaveAccessibleName(COPY_LABEL);
  });

  it('cleans up its buttons', () => {
    const root = mountArticle('<pre><code>x</code></pre>');
    const cleanup = enhanceCopyButtons(root);
    cleanup();
    expect(root.querySelector('.dp-code-copy')).toBeNull();
    expect(codeText(root.querySelector('pre')!)).toBe('x');
  });
});
