import { tagVisualHooks } from './visual';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('tagVisualHooks', () => {
  it('tags every element of each kind with its mapped key and region, keeping hooks already set', () => {
    document.body.innerHTML = `<div id="body">
      <p>one</p><h2>A</h2><pre><code>x</code></pre>
      <blockquote class="dp-callout"><p>c</p></blockquote>
      <div class="dp-codetabs"></div><div class="dp-table"><table></table></div>
      <img alt="" src="a.png"><img alt="" src="b.png"><div class="dp-embed"></div><div class="dp-htmlblock"></div>
      <p data-visual="kept">two</p></div>`;
    const body = document.getElementById('body')!;
    tagVisualHooks(body);
    expect(body.querySelector(':scope > p')).toHaveAttribute('data-visual', 'docP');
    expect(body.querySelector('[data-visual="kept"]')).toBeInTheDocument();
    expect(body.querySelector('h2')).toHaveAttribute('data-visual', 'docH2');
    expect(body.querySelector('code')).toHaveAttribute('data-visual', 'docCode');
    expect(body.querySelector('.dp-callout')).toHaveAttribute('data-visual', 'docCallout');
    expect(body.querySelector('.dp-callout')).toHaveAttribute('data-visual-region', 'callout');
    expect(body.querySelector('table')).toHaveAttribute('data-visual', 'docTable');
    expect(body.querySelector('.dp-table')).toHaveAttribute('data-visual-region', 'table');
    expect(body.querySelector('.dp-codetabs')).toHaveAttribute('data-visual-region', 'codeTabs');
    // Every image: the harness takes the first one with a box (lazy images below the fold have none).
    expect(body.querySelectorAll('img[data-visual-region="lightboxImage"]')).toHaveLength(2);
    expect(body.querySelector('.dp-embed')).toHaveAttribute('data-visual-region', 'embed');
    expect(body.querySelector('.dp-htmlblock')).toHaveAttribute('data-visual-region', 'htmlBlock');
  });
});
