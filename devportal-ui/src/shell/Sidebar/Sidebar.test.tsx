import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { SidebarTree } from '../../contracts';
import referenceTree from '../harness/reference-tree.json';
import { resetCollapsedForTests, SIDEBAR_COLLAPSED_KEY } from './collapse';
import { MOBILE_QUERY } from './constants';
import { Sidebar } from './Sidebar';
import { filterCategories, groupsContaining } from './tree';

const SHAPES = resolve(import.meta.dirname, '../../../../devportal/contracts/fixtures/shapes/sidebar-tree');
const docsTree = JSON.parse(readFileSync(resolve(SHAPES, 'docs.json'), 'utf8')) as SidebarTree;
const refTree = referenceTree as unknown as SidebarTree;
const V3 = '/reference/get-v3-texts';

function toggles(label: string) {
  return screen.getAllByRole('button', { name: new RegExp(`^(Show|Hide) subpages for ${label}$`) });
}

beforeEach(() => {
  window.localStorage.clear();
  resetCollapsedForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sidebar: reference', () => {
  it('is the "Secondary navigation" nav with live id, headings, method pills and deprecated markers', () => {
    render(<Sidebar tree={refTree} activePath={V3} />);
    const nav = screen.getByRole('navigation', { name: 'Secondary navigation' });
    expect(nav).toHaveAttribute('id', 'reference-sidebar');
    expect(screen.getByRole('heading', { level: 2, name: 'welcome' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Sefaria API' })).toBeInTheDocument();
    const current = screen.getByRole('link', { name: 'Texts (v3) get' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(within(current).getByText('get')).toHaveClass('dp-sidebar-method', 'dp-sidebar-method--get');
    // Texts (v1) and Topic (v1) are deprecated (REFERENCE_SPEC §1.2).
    expect(screen.getAllByRole('button', { name: 'Deprecated Endpoint', hidden: true })).toHaveLength(2);
    expect(screen.getAllByText('post', { ignore: false })).toHaveLength(2);
  });

  it('opens only the group containing the current page on load; others open and close on click', async () => {
    const user = userEvent.setup();
    render(<Sidebar tree={refTree} activePath={V3} />);
    expect(toggles('Text')[0]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles('Index')).toHaveLength(2);
    for (const t of [...toggles('Index'), ...toggles('Tutorials'), ...toggles('Misc')])
      expect(t).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Author Indexes get' })).toBeNull();

    await user.click(toggles('Index')[1]!);
    expect(toggles('Index')[1]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles('Index')[1]).toHaveAccessibleName('Hide subpages for Index');
    expect(screen.getByRole('link', { name: 'Author Indexes get' })).toBeVisible();
    expect(toggles('Index')[0]).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggles('Text')[0]!);
    expect(screen.queryByRole('link', { name: 'Versions get' })).toBeNull();
  });

  it('works from the keyboard: Tab reaches the toggles, Enter and Space open and close them', async () => {
    const user = userEvent.setup();
    render(<Sidebar tree={refTree} activePath={V3} />);
    const tutorials = toggles('Tutorials')[0]!;
    tutorials.focus();
    await user.keyboard('{Enter}');
    expect(tutorials).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' ');
    expect(tutorials).toHaveAttribute('aria-expanded', 'false');
    // Tab moves from the filter into the tree.
    screen.getByRole('searchbox', { name: 'Filter pages' }).focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Getting Started With the Sefaria API' }));
  });

  it('opens the new page group on navigation and keeps the groups the reader opened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Sidebar tree={refTree} activePath={V3} />);
    await user.click(toggles('Misc')[0]!);
    rerender(<Sidebar tree={refTree} activePath="/reference/get-calendars" />);
    expect(toggles('Calendars')[0]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles('Misc')[0]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Calendars get' })).toHaveAttribute('aria-current', 'page');
  });

  it('filters the tree as you type: matches keep their subtree, ancestors stay, empty sections go', async () => {
    const user = userEvent.setup();
    render(<Sidebar tree={refTree} activePath={V3} />);
    const filter = screen.getByRole('searchbox', { name: 'Filter pages' });
    expect(filter).toHaveAttribute('placeholder', 'Filter');
    expect(filter).toHaveAttribute('aria-keyshortcuts', 'Control+/ Meta+/');
    await user.type(filter, 'index');
    // live sidebar_filter_index: only "SEFARIA API" with both Index groups, open, with all their rows.
    expect(screen.queryByRole('heading', { name: 'welcome' })).toBeNull();
    expect(toggles('Index').map((t) => t.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
    expect(screen.getByRole('link', { name: 'Table of Contents get' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Counts get' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Texts (v3) get' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, 'zzzz');
    expect(screen.getByText('No matching pages')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(filter).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Texts (v3) get' })).toBeInTheDocument();
  });

  it.each([
    ['Control', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
  ])('focuses the filter on %s-/ from anywhere', (_name, modifiers) => {
    render(<Sidebar tree={refTree} activePath={V3} />);
    document.body.focus();
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true, ...modifiers });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Filter pages' }));
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores "/" without the modifier', () => {
    render(<Sidebar tree={refTree} activePath={V3} />);
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).not.toBe(screen.getByRole('searchbox', { name: 'Filter pages' }));
  });

  it('collapses the whole sidebar and remembers it across reloads, per browser', async () => {
    const user = userEvent.setup();
    const first = render(<Sidebar tree={refTree} activePath={V3} />);
    await user.click(screen.getByRole('button', { name: 'Hide sidebar navigation' }));
    expect(screen.getByRole('navigation', { name: 'Secondary navigation' })).toHaveAttribute('data-collapsed', 'true');
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    first.unmount();

    // "Reload": a fresh mount reads the stored choice.
    resetCollapsedForTests();
    render(<Sidebar tree={refTree} activePath={V3} />);
    const show = screen.getByRole('button', { name: 'Show sidebar navigation' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    await user.click(show);
    expect(screen.getByRole('navigation', { name: 'Secondary navigation' })).not.toHaveAttribute('data-collapsed');
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
  });

  it('still collapses when storage throws (private mode), for this page view', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<Sidebar tree={refTree} activePath={V3} />);
    await user.click(screen.getByRole('button', { name: 'Hide sidebar navigation' }));
    expect(screen.getByRole('navigation', { name: 'Secondary navigation' })).toHaveAttribute('data-collapsed', 'true');
  });

  it('shows the footer (the Discord button, D-2) under the tree', () => {
    render(<Sidebar tree={refTree} activePath={V3} footer={<a href="https://example.org/discord">Join</a>} />);
    const footer = screen.getByRole('link', { name: 'Join' }).closest('.dp-sidebar-footer');
    expect(footer).toHaveAttribute('data-visual-deviation', 'D-2');
  });

  it('opens every group in the ≤768 panel, as live', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === MOBILE_QUERY,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
    render(<Sidebar tree={refTree} activePath={V3} />);
    for (const t of [...toggles('Index'), ...toggles('Misc'), ...toggles('Tutorials')])
      expect(t).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation', { name: 'Secondary navigation' })).toHaveAttribute(
      'data-visual-region',
      'mobileSubnavPanel'
    );
  });

  it('has no axe violations, open or filtered', async () => {
    const user = userEvent.setup();
    const { container } = render(<Sidebar tree={refTree} activePath={V3} footer={<a href="/x">Join</a>} />);
    expect(await axe(container)).toHaveNoViolations();
    await user.type(screen.getByRole('searchbox', { name: 'Filter pages' }), 'index');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Sidebar: docs', () => {
  it('has no filter, marks deprecated docs and opens link items in a new tab with the arrow', () => {
    const { container } = render(<Sidebar tree={docsTree} activePath="/docs/linker-v3" />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Secondary navigation' })).not.toHaveAttribute('id');
    expect(screen.getByRole('button', { name: 'Deprecated Doc' })).toBeInTheDocument();
    const link = container.querySelector('a[target="_blank"]')!;
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link.querySelector('svg.dp-sidebar-external')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: 'Embed Linker v3 on Your Site' })).toHaveAttribute('aria-current', 'page');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Sidebar tree={docsTree} activePath="/docs/linker-v3" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens a group that is itself the current page, as live', () => {
    render(<Sidebar tree={docsTree} activePath="/docs/linker" />);
    expect(toggles('The Sefaria Linker')[0]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Embed Linker v3 on Your Site' })).toBeVisible();
  });

  it('keeps a closed group laid out but inert and hidden from assistive technology (visual parity)', () => {
    const { container } = render(<Sidebar tree={docsTree} activePath="/docs/welcome" />);
    const list = container.querySelector('.dp-sidebar-list--collapsed')!;
    expect(list).toHaveAttribute('inert');
    expect(list).toHaveAttribute('aria-hidden', 'true');
    expect(list.querySelectorAll('a[data-visual="sbLink"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Embed Linker v3 on Your Site' })).toBeNull();
  });
});

describe('tree helpers', () => {
  it('lists the groups on the current page branch', () => {
    const ids = groupsContaining(refTree.categories, V3);
    expect(ids).toHaveLength(1);
    expect(groupsContaining(refTree.categories, '/reference/nowhere')).toEqual([]);
  });

  it('filters case-insensitively and keeps the whole subtree of a matching row', () => {
    const out = filterCategories(refTree.categories, 'INDEX');
    expect(out.map((c) => c.title)).toEqual(['Sefaria API']);
    expect(out[0]!.items.map((i) => [i.title, i.children.length])).toEqual([
      ['Index', 3],
      ['Index', 7],
    ]);
    expect(filterCategories(refTree.categories, '  ')).toHaveLength(refTree.categories.length);
  });
});
