import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetProjectsCache } from '../../hooks/useProjects';
import { initAnalytics, resetAnalytics } from '../../lib/analytics';
import { makeRaw } from '../../test/factories';
import { ProjectPage } from '../../features/project-page/ProjectPage';
import { RouteEffects } from '../RouteEffects';

const plausible = vi.fn();
const pageviews = () => plausible.mock.calls.filter(([event]) => event === 'pageview');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/powered-by" element={<p>Browse page</p>} />
        <Route path="/powered-by/charts" element={<p>Charts page</p>} />
        <Route path="/powered-by/projects/:slug" element={<ProjectPage />} />
      </Routes>
      <RouteEffects />
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetProjectsCache();
  vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'powered-by.sefaria.org');
  resetAnalytics();
  plausible.mockReset();
  window.plausible = plausible;
  initAnalytics();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ projects: [makeRaw({ id: 141, project_name: 'Torah MCP' })] })))
      )
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetAnalytics();
  delete window.plausible;
  document.head.querySelectorAll('script[data-domain]').forEach((s) => s.remove());
});

describe('page views', () => {
  it('counts the browse page once, and never the charts page, whatever its case', async () => {
    renderAt('/powered-by');
    expect(await screen.findByText('Browse page')).toBeInTheDocument();
    expect(pageviews()).toHaveLength(1);
    plausible.mockReset();
    renderAt('/powered-by/charts');
    await screen.findByText('Charts page');
    expect(pageviews()).toHaveLength(0);
  });

  it('counts a project page once, not before its slug is canonical', async () => {
    renderAt('/powered-by/projects/141');
    expect(await screen.findByRole('heading', { level: 1, name: 'Torah MCP' })).toBeInTheDocument();
    expect(pageviews()).toHaveLength(1);
  });

  it('counts a project page once whatever the case of the path (the router matches any)', async () => {
    renderAt('/powered-by/Projects/141-an-old-name');
    expect(await screen.findByRole('heading', { level: 1, name: 'Torah MCP' })).toBeInTheDocument();
    expect(pageviews()).toHaveLength(1);
  });

  it('counts a stale slug once, only after it has been replaced', async () => {
    renderAt('/powered-by/projects/141-an-old-name');
    expect(await screen.findByRole('heading', { level: 1, name: 'Torah MCP' })).toBeInTheDocument();
    expect(pageviews()).toHaveLength(1);
  });
});
