// The route object the portal mounts (PLAN §2.14 items 1 and 5). Not one of the 32 ported files.
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetProjectsCache } from '../hooks/useProjects';
import { resetAnalytics } from '../lib/analytics';
import { createGalleryRoutes } from '../routes';
import { makeRaw } from '../test/factories';

function renderAt(path: string, header = <header aria-label="Portal header">Portal header</header>) {
  const router = createMemoryRouter([createGalleryRoutes({ header, scrollRestoration: false })], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  resetProjectsCache();
  resetAnalytics();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            projects: url === '/api/powered-by' ? [makeRaw({ id: 141, project_name: 'Torah MCP' })] : [],
          })
        )
      )
    )
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('createGalleryRoutes', () => {
  it('mounts the browse page at /powered-by under the portal header, with the gallery actions', async () => {
    renderAt('/powered-by');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('banner', { name: 'Portal header' })).toBeInTheDocument();
    const bar = within(screen.getByRole('navigation', { name: 'Powered by Sefaria' }));
    expect(bar.getByRole('link', { name: 'Submit a project (opens in a new tab)' })).toBeInTheDocument();
    expect(bar.getByRole('link', { name: /^Donate/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Torah MCP' })).toHaveAttribute(
      'href',
      '/powered-by/projects/141-torah-mcp'
    );
  });

  it('mounts the project page at /powered-by/projects/:slug', async () => {
    renderAt('/powered-by/projects/141-torah-mcp');
    expect(await screen.findByRole('heading', { level: 1, name: 'Torah MCP' })).toBeInTheDocument();
  });

  it('answers an unknown gallery path with the gallery not-found page', async () => {
    renderAt('/powered-by/nope');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse all projects' })).toHaveAttribute('href', '/powered-by');
  });

  it('wraps the gallery, but not the portal header, in its style scope', async () => {
    const { container } = renderAt('/powered-by');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('banner', { name: 'Portal header' }).closest('.dp-gallery')).toBeNull();
    expect(screen.getByRole('main').closest('.dp-gallery')).not.toBeNull();
    expect(container.querySelectorAll('.dp-gallery').length).toBeGreaterThan(0);
  });
});
