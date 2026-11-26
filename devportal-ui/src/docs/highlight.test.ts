import {
  enhanceHighlighting,
  highlightElement,
  loadTokenizer,
  modeFor,
  tokenClasses,
  type Tokenizer,
} from './highlight';
import { golden, mountArticle } from './test-utils';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('modeFor', () => {
  it('maps the corpus languages to CodeMirror modes and leaves text unhighlighted', () => {
    expect(modeFor('python')).toBe('python');
    expect(modeFor('JavaScript')).toBe('javascript');
    expect(modeFor('json')).toEqual({ name: 'javascript', json: true });
    expect(modeFor('typescript')).toEqual({ name: 'javascript', typescript: true });
    expect(modeFor('bash')).toBe('shell');
    expect(modeFor('curl')).toBe('shell');
    expect(modeFor('html')).toBe('htmlmixed');
    expect(modeFor('text')).toBeNull();
    expect(modeFor('Text')).toBeNull();
    expect(modeFor('elixir')).toBeNull();
  });

  it('turns CodeMirror styles into dp- classes', () => {
    expect(tokenClasses('string property')).toBe('dp-tok-string dp-tok-property');
    expect(tokenClasses('variable-2')).toBe('dp-tok-variable-2');
  });
});

describe('highlighting with CodeMirror 5', () => {
  it('produces live’s token classes for Python, keeping the text intact', async () => {
    const cm = await loadTokenizer();
    const root = mountArticle(
      '<pre><code class="dp-code" data-lang="python">import django\ndjango.setup()  # go\n</code></pre>'
    );
    const code = root.querySelector('code')!;
    const before = code.textContent;
    expect(highlightElement(code, cm)).toBe(true);
    expect(code.textContent).toBe(before);
    expect(code.querySelector('.dp-tok-keyword')).toHaveTextContent('import');
    expect(code.querySelector('.dp-tok-variable')).toHaveTextContent('django');
    expect(code.querySelector('.dp-tok-property')).toHaveTextContent('setup');
    expect(code.querySelector('.dp-tok-comment')).toHaveTextContent('# go');
    expect(code).toHaveClass('dp-highlighted');
    // Every class in the DOM starts with dp- (contract C5).
    for (const el of code.querySelectorAll('[class]')) {
      for (const c of el.classList) expect(c.startsWith('dp-')).toBe(true);
    }
    expect(highlightElement(code, cm)).toBe(false);
  });

  it('highlights curl as shell and JSON keys as string properties', async () => {
    const cm = await loadTokenizer();
    const root = mountArticle(
      '<pre><code data-lang="curl">curl -X POST "https://x"</code></pre><pre><code data-lang="json">{"a": 1}</code></pre>'
    );
    const [curl, json] = [...root.querySelectorAll<HTMLElement>('code')];
    highlightElement(curl!, cm);
    highlightElement(json!, cm);
    expect(curl!.querySelector('.dp-tok-builtin')).toHaveTextContent('curl');
    expect(curl!.querySelector('.dp-tok-string')).toHaveTextContent('"https://x"');
    expect(json!.querySelector('.dp-tok-string.dp-tok-property')).toHaveTextContent('"a"');
    expect(json!.querySelector('.dp-tok-number')).toHaveTextContent('1');
  });

  it('highlights every golden block that has a known language, and nothing else', async () => {
    const root = mountArticle(golden('09-code'));
    const { done } = enhanceHighlighting(root);
    const count = await done;
    const expected = [...root.querySelectorAll<HTMLElement>('pre > code[data-lang]')].filter(
      (c) => modeFor(c.dataset.lang!) !== null
    );
    expect(count).toBe(expected.length);
    expect(root.querySelectorAll('code.dp-highlighted')).toHaveLength(expected.length);
    for (const code of root.querySelectorAll('pre > code:not([data-lang])')) {
      expect(code.children).toHaveLength(0);
    }
  });

  it('does not load CodeMirror when nothing needs highlighting, and survives a failed load', async () => {
    const load = vi.fn(async (): Promise<Tokenizer> => Promise.reject(new Error('offline')));
    const plain = mountArticle('<pre><code>x</code></pre>');
    expect(await enhanceHighlighting(plain, load).done).toBe(0);
    expect(load).not.toHaveBeenCalled();
    const root = mountArticle('<pre><code data-lang="python">x = 1</code></pre>');
    expect(await enhanceHighlighting(root, load).done).toBe(0);
    expect(root.querySelector('code')).toHaveTextContent('x = 1');
  });

  it('does nothing after cleanup', async () => {
    const root = mountArticle('<pre><code data-lang="python">x = 1</code></pre>');
    const { done, cleanup } = enhanceHighlighting(root);
    cleanup();
    expect(await done).toBe(0);
    expect(root.querySelector('code')!.children).toHaveLength(0);
  });
});
