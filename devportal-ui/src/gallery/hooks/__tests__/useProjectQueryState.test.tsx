import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectQueryState } from '../useProjectQueryState';

function Controls() {
  const { state, update } = useProjectQueryState();
  return (
    <>
      <p>sort: {state.sort}</p>
      <button onClick={() => update({ sort: 'az' })}>Sort A-Z</button>
    </>
  );
}

function renderApp() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <ScrollRestoration />
          </>
        ),
        children: [
          { path: '/powered-by', element: <Controls /> },
          { path: '/elsewhere', element: <p>Elsewhere</p> },
        ],
      },
    ],
    { initialEntries: ['/powered-by'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

const scrollTo = vi.fn();
beforeEach(() => {
  scrollTo.mockReset();
  vi.stubGlobal('scrollTo', scrollTo);
});
afterEach(() => vi.unstubAllGlobals());

describe('useProjectQueryState scroll behaviour', () => {
  it('does not scroll back to the top when a filter, sort or search changes', async () => {
    renderApp();
    scrollTo.mockClear(); // the initial restore on mount isn't what is under test
    await userEvent.click(screen.getByRole('button', { name: 'Sort A-Z' }));
    expect(await screen.findByText('sort: az')).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('still resets the scroll for a real page change (the control for the test above)', async () => {
    const router = renderApp();
    scrollTo.mockClear();
    await act(() => router.navigate('/elsewhere'));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
