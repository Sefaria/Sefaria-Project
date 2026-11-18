import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetProjectsCache } from '../../../hooks/useProjects';
import { ChartsPage } from '../ChartsPage';
import { fixtureRaw } from '../../../test/factories';

beforeEach(() => {
  resetProjectsCache();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: fixtureRaw }))));
});
afterEach(() => vi.unstubAllGlobals());

const TITLES = [
  'Submissions by year',
  'Projects over time',
  'Submissions by experience level',
  'Vibe-coded vs. not, tracked since July 2026',
  'Projects by Tag',
  'Sefaria resources used',
  'Built with',
  'Reported reach',
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/powered-by/charts']}>
      <ChartsPage />
    </MemoryRouter>
  );
}

describe('ChartsPage', () => {
  it('renders the eight charts in order, each with a table alternative', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Powered by Sefaria in numbers' })).toBeInTheDocument();
    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(TITLES);
    expect(screen.getAllByText('Show as table')).toHaveLength(8);
  });

  it('is noindex, titled, and links back to all projects but not to /charts from the footer', async () => {
    renderPage();
    await screen.findAllByRole('heading', { level: 2 });
    expect(document.title).toBe('Powered by Sefaria in numbers');
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    expect(screen.getAllByRole('link', { name: /All projects/ })[0]).toHaveAttribute('href', '/powered-by');
    expect(within(screen.getByRole('contentinfo')).queryByRole('link', { name: /chart|numbers/i })).toBeNull();
  });

  it('shows the headline figures and footnotes from the fixture', async () => {
    renderPage();
    await screen.findAllByRole('heading', { level: 2 });
    expect(screen.getByText('134')).toBeInTheDocument();
    expect(
      screen.getByText("Total is the all-time count. 24 projects have no submission date and aren't plotted.")
    ).toBeInTheDocument();
    expect(screen.getByText('Self-reported by 11 of 134 projects; the rest left it blank.')).toBeInTheDocument();
    expect(screen.getByText(/Tracking began March 2024/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderPage();
    await screen.findAllByRole('heading', { level: 2 });
    expect(await axe(container)).toHaveNoViolations();
  });
});
