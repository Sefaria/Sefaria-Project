import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TOC_LABEL, TableOfContents, type TocItem } from './TableOfContents';
import { attachScrollSpy, currentIndex } from './toc';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const ENTRIES: TocItem[] = [
  { level: 1, id: 'intro', text: 'Intro' },
  { level: 2, id: 'bookmarklet', text: 'Bookmarklet' },
  { level: 3, id: 'mode', text: 'mode' },
  { level: 3, id: '', text: '' },
  { level: 2, id: 'איך-ליצור', text: 'איך ליצור' },
];

function headings(tops: number[]): void {
  ENTRIES.filter((e) => e.id).forEach((e, i) => {
    const h = document.createElement('h2');
    h.id = e.id;
    vi.spyOn(h, 'getBoundingClientRect').mockReturnValue({ top: tops[i] } as DOMRect);
    document.body.appendChild(h);
  });
}

describe('currentIndex', () => {
  it('is the last heading above the offset, or the first heading before any has passed', () => {
    expect(currentIndex([500, 900], 80)).toBe(0);
    expect(currentIndex([-200, 40, 300], 80)).toBe(1);
    expect(currentIndex([-900, -500, -20], 80)).toBe(2);
    expect(currentIndex([null, 500], 80)).toBe(1);
  });
});

describe('TableOfContents', () => {
  it('renders one entry per heading, indented by level, keeping empty headings as empty slots', async () => {
    headings([100, 200, 300, 400]);
    render(<TableOfContents entries={ENTRIES} />);
    const nav = screen.getByRole('navigation', { name: TOC_LABEL });
    const items = nav.querySelectorAll('li');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveClass('dp-toc-item--h1');
    expect(items[2]).toHaveClass('dp-toc-item--h3');
    expect(items[3]!.querySelector('a')).toBeNull();
    expect(screen.getByRole('link', { name: 'Bookmarklet' })).toHaveAttribute('href', '#bookmarklet');
    expect(await axe(nav)).toHaveNoViolations();
  });

  it('renders nothing without headings', () => {
    const { container } = render(<TableOfContents entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the current section and follows the scroll', async () => {
    const tops = [-300, -100, 50, 600];
    headings(tops);
    render(<TableOfContents entries={ENTRIES} />);
    const current = () => screen.getByRole('navigation').querySelector('[aria-current="location"]');
    expect(current()).toHaveTextContent('mode');
    expect(current()).toHaveClass('dp-active');
    // Scroll back to the top: the spy re-reads the headings on the next frame.
    const hs = [...document.querySelectorAll('h2')];
    [100, 300, 500, 800].forEach((top, i) =>
      vi.spyOn(hs[i]!, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect)
    );
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(current()).toHaveTextContent('Intro');
  });

  it('marks a clicked entry at once', () => {
    headings([100, 200, 300, 400]);
    render(<TableOfContents entries={ENTRIES} />);
    screen.getByRole('link', { name: 'איך ליצור' }).click();
    expect(screen.getByRole('link', { name: 'איך ליצור' })).toHaveAttribute('aria-current', 'location');
  });
});

describe('attachScrollSpy on server markup', () => {
  it('works on the template’s TOC and detaches cleanly', () => {
    document.body.innerHTML = `<nav class="dp-toc" aria-label="Table of Contents"><ul class="dp-toc-list">
      <li class="dp-toc-item dp-toc-item--h2"><a class="dp-toc-link" href="#a">A</a></li>
      <li class="dp-toc-item dp-toc-item--h2"><a class="dp-toc-link" href="#b">B</a></li></ul></nav>
      <h2 id="a">A</h2><h2 id="b">B</h2>`;
    const [a, b] = [...document.querySelectorAll('h2')];
    vi.spyOn(a!, 'getBoundingClientRect').mockReturnValue({ top: -50 } as DOMRect);
    vi.spyOn(b!, 'getBoundingClientRect').mockReturnValue({ top: 10 } as DOMRect);
    const cleanup = attachScrollSpy(document.querySelector('nav')!);
    expect(document.querySelector('a[href="#b"]')).toHaveAttribute('aria-current', 'location');
    cleanup();
  });
});
