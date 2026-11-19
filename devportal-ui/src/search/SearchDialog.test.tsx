import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { SearchIndex } from './engine';
import { OPEN_SEARCH_EVENT, openSearch } from './events';
import { SearchLauncher } from './SearchLauncher';
import { TEST_DOCUMENTS } from './testDocs';

const URL = '/_portal/search-docs.0123456789abcdef.json';

// The modal is a lazy chunk; load it once up front so the first test does not time out compiling it.
beforeAll(async () => {
  await import('./SearchDialog');
});

function setup() {
  const onNavigate = vi.fn();
  const loadIndex = vi.fn(async () => new SearchIndex(TEST_DOCUMENTS));
  const user = userEvent.setup();
  render(
    <>
      <button type="button" onClick={() => openSearch()}>
        Search
      </button>
      <SearchLauncher docsUrl={URL} onNavigate={onNavigate} loadIndex={loadIndex} />
    </>
  );
  return { user, onNavigate, loadIndex };
}

async function openWithKeys(user: ReturnType<typeof userEvent.setup>, keys = '{Control>}k{/Control}') {
  await user.keyboard(keys);
  return screen.findByRole('dialog', { name: 'Search' });
}

async function typeQuery(user: ReturnType<typeof userEvent.setup>, text: string) {
  const input = screen.getByRole('searchbox', { name: 'Search' });
  await user.type(input, text);
  await screen.findByRole('list', { name: 'Search results' });
  return input;
}

function tabs() {
  return screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'));
}

describe('opening and closing', () => {
  it('opens on Ctrl-K with the input focused and the empty state', async () => {
    const { user, loadIndex } = setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    const dialog = await openWithKeys(user);
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByRole('searchbox', { name: 'Search' })).toHaveFocus();
    expect(within(dialog).getByText('Start typing to search…')).toBeInTheDocument();
    expect(tabs()).toEqual(['All', 'Docs', 'API Reference', 'Pages']);
    expect(loadIndex).toHaveBeenCalledWith(URL);
  });

  it('opens on Cmd-K', async () => {
    const { user } = setup();
    expect(await openWithKeys(user, '{Meta>}k{/Meta}')).toHaveAttribute('open');
  });

  it('opens on the dp:open-search event the header dispatches, and returns focus on Escape', async () => {
    const { user } = setup();
    const trigger = screen.getByRole('button', { name: 'Search' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    expect(OPEN_SEARCH_EVENT).toBe('dp:open-search');
    await user.keyboard('{Escape}');
    expect(dialog).not.toHaveAttribute('open');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes from the Close button and clears the query', async () => {
    const { user } = setup();
    const dialog = await openWithKeys(user);
    await typeQuery(user, 'ref');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(dialog).not.toHaveAttribute('open');
    await openWithKeys(user);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
  });

  it('has no Ask AI control', async () => {
    const { user } = setup();
    const dialog = await openWithKeys(user);
    await typeQuery(user, 'ref');
    expect(within(dialog).queryByText(/ask ai/i)).toBeNull();
  });
});

describe('results', () => {
  it('shows tabs with counts and filters by tab; an empty tab is disabled', async () => {
    const { user } = setup();
    await openWithKeys(user);
    await typeQuery(user, 'ref');
    expect(tabs()).toEqual(['All', 'Docs 2', 'API Reference 21', 'Pages 0']);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    const pages = screen.getByRole('tab', { name: 'Pages 0' });
    expect(pages).toHaveAttribute('aria-disabled', 'true');
    await user.click(pages);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Docs 2' }));
    const links = within(screen.getByRole('list', { name: 'Search results' })).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('aria-label')).sort()).toEqual(['Text References', 'The Sefaria Linker']);
    expect(screen.queryByRole('navigation', { name: 'Search results pages' })).toBeNull();
  });

  it('moves between tabs with the arrow keys, skipping empty ones', async () => {
    const { user } = setup();
    await openWithKeys(user);
    await typeQuery(user, 'ref');
    screen.getByRole('tab', { name: 'All' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Docs 2' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });

  it('labels endpoints with their method badge and highlights the match', async () => {
    const { user } = setup();
    await openWithKeys(user);
    await typeQuery(user, 'refs');
    const row = screen.getByRole('link', { name: 'Find Refs' });
    expect(row).toHaveAttribute('href', '/reference/post-find-refs');
    const badge = row.querySelector('[data-method]');
    expect(badge).toHaveAttribute('data-method', 'post');
    expect(badge).toHaveTextContent(/^post$/i);
    expect([...row.querySelectorAll('mark')].map((m) => m.textContent)).toContain('Refs');
    await user.clear(screen.getByRole('searchbox'));
    await typeQuery(user, 'canonical');
    const name = screen.getByRole('link', { name: 'Name' });
    expect(name.querySelector('[data-method]')).toHaveAttribute('data-method', 'get');
    expect(name).toHaveTextContent('Response Body•200•If type=ref, this returns the canonical ref');
  });

  it('pages 15 results at a time with Back · 1 of N · Next', async () => {
    const { user } = setup();
    await openWithKeys(user);
    await typeQuery(user, 'ref');
    const list = () => screen.getByRole('list', { name: 'Search results' });
    const pager = screen.getByRole('navigation', { name: 'Search results pages' });
    expect(within(list()).getAllByRole('link')).toHaveLength(15);
    expect(pager).toHaveTextContent('Back1 of 2Next');
    expect(within(pager).getByRole('button', { name: 'Back' })).toBeDisabled();
    await user.click(within(pager).getByRole('button', { name: 'Next' }));
    expect(within(list()).getAllByRole('link')).toHaveLength(8);
    expect(pager).toHaveTextContent('2 of 2');
    expect(within(pager).getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(within(pager).getByRole('button', { name: 'Back' }));
    expect(pager).toHaveTextContent('1 of 2');
  });

  it('shows the no-results state', async () => {
    const { user } = setup();
    await openWithKeys(user);
    await user.type(screen.getByRole('searchbox'), 'zzzzqqq');
    expect(await screen.findByText("No search results for 'zzzzqqq'")).toBeInTheDocument();
  });
});

describe('keyboard', () => {
  it('moves through results with the arrows and opens one with Enter', async () => {
    const { user, onNavigate } = setup();
    const dialog = await openWithKeys(user);
    const input = await typeQuery(user, 'ref');
    const links = within(screen.getByRole('list', { name: 'Search results' })).getAllByRole('link');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', links[1]!.id);
    expect(links[1]).toHaveAttribute('data-active', 'true');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', links[14]!.id);
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith(links[14]!.getAttribute('href'));
    expect(dialog).not.toHaveAttribute('open');
  });

  it('keeps Tab inside the modal', async () => {
    const { user } = setup();
    const dialog = await openWithKeys(user);
    await typeQuery(user, 'welcome');
    const input = within(dialog).getByRole('searchbox');
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex="0"]'),
    ];
    focusable[focusable.length - 1]!.focus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(focusable[focusable.length - 1]).toHaveFocus();
  });
});

describe('accessibility', () => {
  it('has no axe violations, empty and with results', async () => {
    const { user } = setup();
    const dialog = await openWithKeys(user);
    expect(await axe(dialog)).toHaveNoViolations();
    await typeQuery(user, 'ref');
    await act(async () => {});
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('shows a loading state until the index is built', async () => {
    let resolve: (index: SearchIndex) => void = () => {};
    const loadIndex = vi.fn(() => new Promise<SearchIndex>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<SearchLauncher docsUrl={URL} loadIndex={loadIndex} />);
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('searchbox'), 'ref');
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    await act(async () => resolve(new SearchIndex(TEST_DOCUMENTS)));
    expect(await screen.findByRole('list', { name: 'Search results' })).toBeInTheDocument();
  });
});
