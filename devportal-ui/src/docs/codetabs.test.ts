import { axe } from 'vitest-axe';
import { enhanceCodeTabs } from './codetabs';
import { enhanceCodeBlocks, trimTrailingBlankLines } from './codeblocks';
import { golden, mountArticle } from './test-utils';

afterEach(() => {
  document.body.innerHTML = '';
});

const TWO_TABS = `<div class="dp-codetabs"><div class="dp-codetabs-toolbar">
<button type="button" class="dp-codetabs-tab dp-active" value="python">Python</button>
<button type="button" class="dp-codetabs-tab" value="javascript">JavaScript</button></div>
<div class="dp-codetabs-inner"><pre class="dp-pre"><code class="dp-code" data-lang="python">print(1)
</code></pre><pre class="dp-pre"><code class="dp-code" data-lang="javascript">log(1)
</code></pre></div></div>`;

describe('enhanceCodeTabs', () => {
  it('turns every golden code group into a tablist with labelled tab panels', async () => {
    const root = mountArticle(golden('09-code'));
    enhanceCodeTabs(root);
    const groups = root.querySelectorAll('.dp-codetabs');
    expect(groups.length).toBeGreaterThan(3);
    for (const group of groups) {
      const tablist = group.querySelector('[role="tablist"]')!;
      const tab = tablist.querySelector('[role="tab"]')!;
      const panel = group.querySelector('[role="tabpanel"]')!;
      expect(tab).toHaveAttribute('aria-selected', 'true');
      expect(tab.getAttribute('aria-controls')).toBe(panel.id);
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    }
    expect(root.querySelector('[role="tab"]')).toHaveAccessibleName('Python');
    // A fence without a language has no chrome and is left alone.
    expect(root.querySelector(':scope > pre')).not.toHaveAttribute('role');
    expect(await axe(root)).toHaveNoViolations();
  });

  it('switches tabs by click and by arrow keys, showing one panel at a time', () => {
    const root = mountArticle(TWO_TABS);
    const cleanup = enhanceCodeTabs(root);
    const [py, js] = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const [p1, p2] = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(p1!.hidden).toBe(false);
    expect(p2!.hidden).toBe(true);
    js!.click();
    expect(js).toHaveClass('dp-active');
    expect(py).not.toHaveClass('dp-active');
    expect(p1!.hidden).toBe(true);
    expect(p2!.hidden).toBe(false);
    js!.focus();
    js!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(py);
    expect(py).toHaveAttribute('aria-selected', 'true');
    expect(js!.tabIndex).toBe(-1);
    cleanup();
    js!.click();
    expect(py).toHaveAttribute('aria-selected', 'true');
  });

  it('is idempotent', () => {
    const root = mountArticle(TWO_TABS);
    enhanceCodeTabs(root);
    const id = root.querySelector('[role="tab"]')!.id;
    enhanceCodeTabs(root);
    expect(root.querySelector('[role="tab"]')!.id).toBe(id);
  });
});

describe('trimTrailingBlankLines', () => {
  it('drops blank lines at the end of a fence, as live shows it, and keeps the final newline', () => {
    const root = mountArticle('<pre><code>a\n\n\n</code></pre><pre><code>b\n</code></pre>');
    enhanceCodeBlocks(root);
    const [a, b] = [...root.querySelectorAll('code')];
    expect(a!.textContent).toBe('a\n');
    expect(b!.textContent).toBe('b\n');
    expect(trimTrailingBlankLines(b!)).toBe(false);
  });
});
