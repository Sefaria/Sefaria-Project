import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initAnalytics, resetAnalytics } from '../../../lib/analytics';
import { resetProjectsCache } from '../../../hooks/useProjects';
import { BrowsePage } from '../BrowsePage';
import { fixtureRaw, makeRaw } from '../../../test/factories';

function stubApi(projects: unknown[]) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ projects }))));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function ProjectStub() {
  const navigate = useNavigate();
  return (
    <>
      <p>On a project page</p>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

function renderPage(url = '/powered-by') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/powered-by" element={<BrowsePage />} />
        <Route path="/powered-by/projects/:slug" element={<ProjectStub />} />
      </Routes>
    </MemoryRouter>
  );
}

// The data hook caches its response, so each test starts from an empty cache.
beforeEach(() => resetProjectsCache());
afterEach(() => vi.unstubAllGlobals());

describe('BrowsePage', () => {
  it('fetches once and shows the first page of cards with the live count', async () => {
    const fetchMock = stubApi(fixtureRaw);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Explore 122 projects' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Showing 24 of 122 projects · newest first')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(24);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows 24 more with Show more, then hides the button when all are shown', async () => {
    stubApi(Array.from({ length: 30 }, (_, i) => makeRaw({ id: i + 1, project_name: `P${i + 1}` })));
    renderPage();
    await screen.findByText(/Showing 24 of 30/);
    await userEvent.click(screen.getByRole('button', { name: 'Show more projects' }));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(30);
    expect(screen.queryByRole('button', { name: 'Show more projects' })).toBeNull();
    // focus moved to the first newly shown card (index 24)
    expect(document.activeElement).toHaveAttribute('data-result-index', '24');
  });

  it('keeps "Show more" depth when coming Back from a project page', async () => {
    stubApi(Array.from({ length: 60 }, (_, i) => makeRaw({ id: i + 1, project_name: `P${i + 1}` })));
    renderPage();
    await screen.findByText(/Showing 24 of 60/);
    await userEvent.click(screen.getByRole('button', { name: 'Show more projects' }));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(48);
    await userEvent.click(screen.getByRole('link', { name: 'P40' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await screen.findByText(/Showing 48 of 60/);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(48);
    expect(screen.getByRole('link', { name: 'P40' })).toBeInTheDocument();
  });

  it('keeps the depth when the history entry is replaced under it (header home link)', async () => {
    stubApi(Array.from({ length: 60 }, (_, i) => makeRaw({ id: i + 1, project_name: `P${i + 1}` })));
    renderPage();
    await screen.findByText(/Showing 24 of 60/);
    await userEvent.click(screen.getByRole('button', { name: 'Show more projects' }));
    await userEvent.click(screen.getByRole('link', { name: 'Powered by Sefaria' }));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(48);
    await userEvent.click(screen.getByRole('link', { name: 'P40' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await screen.findByText(/Showing 48 of 60/);
    expect(screen.getByRole('link', { name: 'P40' })).toBeInTheDocument();
  });

  it('does not restore a saved depth once the filters have changed', async () => {
    stubApi(Array.from({ length: 60 }, (_, i) => makeRaw({ id: i + 1, project_name: `P${i + 1}` })));
    renderPage();
    await screen.findByText(/Showing 24 of 60/);
    await userEvent.click(screen.getByRole('button', { name: 'Show more projects' }));
    await userEvent.type(screen.getByRole('searchbox'), 'P5');
    expect(await screen.findByText('11 projects match')).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    await screen.findByText(/Showing 24 of 60/);
  });

  describe('search analytics', () => {
    const plausible = vi.fn();
    beforeEach(() => {
      vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'powered-by.sefaria.org');
      resetAnalytics();
      plausible.mockReset();
      window.plausible = plausible;
      initAnalytics();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      resetAnalytics();
      delete window.plausible;
      document.head.querySelectorAll('script[data-domain]').forEach((s) => s.remove());
    });
    const searches = () => plausible.mock.calls.filter(([event]) => event === 'search');

    it('waits for the projects to load, so a slow response is not counted as 0 results', async () => {
      let respond!: (r: Response) => void;
      vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => (respond = resolve))));
      renderPage('/powered-by?q=alp');
      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(searches()).toHaveLength(0);
      await act(async () => {
        respond(new Response(JSON.stringify({ projects: [makeRaw({ id: 1, project_name: 'Alpha' })] })));
      });
      expect(screen.getByText('1 project matches')).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(searches()).toHaveLength(1);
      expect(searches()[0]?.[1]).toMatchObject({ props: { has_query: true, results: '1-5' } });
    });
  });

  it('filters by search after the debounce and updates the summary', async () => {
    stubApi([makeRaw({ id: 1, project_name: 'Alpha' }), makeRaw({ id: 2, project_name: 'Beta' })]);
    renderPage();
    await screen.findByText(/Showing 2 of 2/);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'alp');
    expect(await screen.findByText('1 project matches')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Alpha']);
  });

  it('shows the empty state and clears filters from it', async () => {
    stubApi([makeRaw({ id: 1, project_name: 'Alpha' })]);
    renderPage();
    await screen.findByText(/Showing 1 of 1/);
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(await screen.findByText('No projects match that search.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('shows an error state with Try again that refetches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValue(new Response(JSON.stringify({ projects: [makeRaw({ id: 1 })] })));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    expect(await screen.findByText("We couldn't load projects right now.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Showing 1 of 1/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends an old ?project=<id> link to the project page, and ignores an unknown id', async () => {
    stubApi([makeRaw({ id: 7, project_name: 'Seven' })]);
    const { unmount } = renderPage('/powered-by?project=7');
    expect(await screen.findByText('On a project page')).toBeInTheDocument();
    unmount();
    stubApi([makeRaw({ id: 7, project_name: 'Seven' })]);
    renderPage('/powered-by?project=999');
    await screen.findByText(/Showing 1 of 1/);
    expect(screen.queryByText('On a project page')).toBeNull();
  });

  it('has no axe violations (loaded)', async () => {
    stubApi(fixtureRaw);
    const { container } = renderPage();
    await screen.findByText(/Showing 24 of 122/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has the landmarks and a skip link as the first focusable element', async () => {
    stubApi(fixtureRaw);
    renderPage();
    await screen.findByText(/Showing 24 of 122/);
    // The banner is the portal header, passed in as a slot (routes.test.tsx); the gallery's own bar is a nav.
    expect(screen.getByRole('navigation', { name: 'Powered by Sefaria' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Skip to projects' })).toHaveFocus();
    const main = screen.getByRole('main');
    expect(within(main).getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('Browse projects');
  });

  describe('known issues', () => {
    const projects = () => [
      makeRaw({ id: 1, project_name: 'Alpha' }),
      makeRaw({ id: 2, project_name: 'Buggy One', is_buggy: true }),
      makeRaw({ id: 3, project_name: 'Gamma' }),
    ];
    const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

    it('hides them everywhere by default: grid, hero count, summary, filter counts', async () => {
      stubApi(projects());
      renderPage();
      expect(await screen.findByRole('button', { name: 'Explore 2 projects' })).toBeInTheDocument();
      expect(screen.getByText('Showing 2 of 2 projects · newest first')).toBeInTheDocument();
      expect(titles()).toEqual(['Alpha', 'Gamma']);
      expect(screen.getByRole('radio', { name: /^All projects 2$/ })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Show projects with known issues' })).not.toBeChecked();
      expect(screen.queryByRole('img', { name: 'Known issues' })).toBeNull();
    });

    it('shows them without a badge when the switch is turned on, and hides them again when off', async () => {
      stubApi(projects());
      renderPage();
      const toggle = await screen.findByRole('switch');
      await userEvent.click(toggle);
      expect(await screen.findByText('Showing 3 of 3 projects · newest first')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Explore 3 projects' })).toBeInTheDocument();
      expect(titles()).toContain('Buggy One');
      expect(screen.queryByRole('img', { name: 'Known issues' })).toBeNull();
      expect(document.querySelector('.lucide-bug')).toBeNull();
      await userEvent.click(toggle);
      expect(await screen.findByText('Showing 2 of 2 projects · newest first')).toBeInTheDocument();
    });

    it('reads bugs=1 from the URL', async () => {
      stubApi(projects());
      renderPage('/powered-by?bugs=1');
      expect(await screen.findByText('Showing 3 of 3 projects · newest first')).toBeInTheDocument();
      expect(screen.getByRole('switch')).toBeChecked();
    });

    it('opens the project page, not the site, from a known-issues card arrow', async () => {
      stubApi(projects());
      renderPage('/powered-by?bugs=1');
      await userEvent.click(await screen.findByRole('link', { name: 'About Buggy One' }));
      expect(await screen.findByText('On a project page')).toBeInTheDocument();
    });

    it('never features a buggy project, even when the switch is on', async () => {
      stubApi([
        makeRaw({ id: 1, project_name: 'Alpha', featured: true }),
        makeRaw({ id: 2, project_name: 'Buggy One', featured: true, is_buggy: true }),
      ]);
      renderPage();
      await screen.findByText(/Showing 1 of 1/);
      const band = document.querySelector('section[aria-labelledby="featured-heading"]') as HTMLElement;
      expect(within(band).getByRole('heading', { level: 3, name: 'Alpha' })).toBeInTheDocument();
      expect(within(band).queryByText('Buggy One')).toBeNull();
      await userEvent.click(screen.getByRole('switch'));
      await screen.findByText(/Showing 2 of 2/);
      expect(within(band).queryByText('Buggy One')).toBeNull();
    });
  });

  describe('featured band', () => {
    it('is absent when no project is featured, even though projects exist', async () => {
      stubApi([makeRaw({ id: 1 }), makeRaw({ id: 2 })]);
      renderPage();
      await screen.findByText(/Showing 2 of 2/);
      expect(screen.queryByRole('heading', { name: 'Featured Projects' })).toBeNull();
    });

    it('shows at most 3 featured projects, newest first, and links to the project page', async () => {
      stubApi(
        [1, 2, 3, 4].map((id) =>
          makeRaw({
            id,
            project_name: `F${id}`,
            featured: true,
            submission_date: `2026-0${id}-01T00:00:00Z`,
          })
        )
      );
      renderPage();
      const heading = await screen.findByRole('heading', { name: 'Featured Projects' });
      const band = heading.closest('section') as HTMLElement;
      expect(
        within(band)
          .getAllByRole('heading', { level: 3 })
          .map((h) => h.textContent)
      ).toEqual(['F4', 'F3', 'F2']);
      await userEvent.click(within(band).getByRole('link', { name: 'F3' }));
      expect(await screen.findByText('On a project page')).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    const projects = () => [
      makeRaw({ id: 1, project_name: 'Alpha', tags: ['Gemara', 'Hebrew'], tech_used_raw: 'React' }),
      makeRaw({
        id: 2,
        project_name: 'Beta',
        tags: ['Gemara', 'English'],
        tech_used_raw: 'Python',
      }),
      makeRaw({ id: 3, project_name: 'Gamma', tags: ['Tanakh', 'Hebrew'], tech_used_raw: 'React' }),
    ];
    const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

    it('combines topic, language and tech, shows chips, and removes one at a time', async () => {
      stubApi(projects());
      renderPage();
      await screen.findByText(/Showing 3 of 3/);
      await userEvent.click(screen.getByRole('button', { name: 'Topics' }));
      await userEvent.click(screen.getByRole('checkbox', { name: /^Gemara/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Language' }));
      await userEvent.click(screen.getByRole('checkbox', { name: /^Hebrew/ }));
      expect(await screen.findByText('1 project matches')).toBeInTheDocument();
      expect(titles()).toEqual(['Alpha']);
      expect(screen.getByRole('button', { name: 'Remove filter: Gemara' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove filter: Language: Hebrew' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Gemara' }));
      expect(await screen.findByText('2 projects match')).toBeInTheDocument();
      expect(titles()).toEqual(['Alpha', 'Gamma']);
    });

    it('Clear all in the chips row clears the search box and the filters, not the switch', async () => {
      stubApi(projects());
      renderPage('/powered-by?q=Alpha&topic=Gemara&bugs=1');
      await screen.findByText('1 project matches');
      await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
      expect(await screen.findByText(/Showing 3 of 3/)).toBeInTheDocument();
      expect(screen.getByRole('searchbox')).toHaveValue('');
      expect(screen.getByRole('switch')).toBeChecked();
    });

    it('shows "Clear filters" on empty results and it clears the filter values', async () => {
      stubApi(projects());
      renderPage('/powered-by?topic=Tanakh&lang=English');
      expect(await screen.findByText('No projects match that search.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(await screen.findByText(/Showing 3 of 3/)).toBeInTheDocument();
    });
  });
});
