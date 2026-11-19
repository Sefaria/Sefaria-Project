import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { useReaderState, type ReaderStateContextValue } from "./context";
import { ReaderStateProvider, readerStateFor } from "./ReaderStateProvider";

// The core is another task's (A); a stand-in keeps this test about the provider: what it builds, provides and exposes.
vi.mock("~/lib/reader-state/core/registry", () => ({
  createSliceRegistry: () => ({ register: () => () => {}, get: () => undefined, list: () => [], onChange: () => () => {} }),
}));
vi.mock("~/lib/reader-state/core/api", () => ({
  createReaderStateApi: (host: { getLocation: () => { url: string; nav: unknown } }) => ({
    getSnapshot: () => ({ v: 1, ...host.getLocation(), slices: {} }),
    applySnapshot: async () => ({ warnings: [] }),
    subscribe: () => () => {},
    onLocalInput: () => () => {},
    applying: false,
  }),
}));

/** `remote`: the remote config in the query cache (none: no query client at all). */
function setup(remote?: Record<string, unknown>) {
  let seen: ReaderStateContextValue | null = null;
  function Probe() {
    seen = useReaderState();
    return <p>page</p>;
  }
  const root = createRootRoute({
    component: () => (
      <ReaderStateProvider>
        <Outlet />
      </ReaderStateProvider>
    ),
  });
  const splat = createRoute({ getParentRoute: () => root, path: "$", component: Probe });
  const router = createRouter({ routeTree: root.addChildren([splat]), history: createMemoryHistory({ initialEntries: ["/Genesis.1?lang=bi"] }) });
  const qc = new QueryClient();
  if (remote) qc.setQueryData(["remote-config"], remote);
  const view = render(remote ? <QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider> : <RouterProvider router={router} />);
  return { router, view, seen: () => seen };
}

describe("ReaderStateProvider", () => {
  it("renders its children and provides the registry and API", async () => {
    const { seen } = setup();
    expect(await screen.findByText("page")).toBeInTheDocument();
    const ctx = seen();
    expect(ctx).not.toBeNull();
    expect(ctx!.registry.list()).toEqual([]);
    expect(ctx!.api.getSnapshot().url).toBe("/Genesis.1?lang=bi");
  });

  it("exposes the API as window.sefariaReaderState, and removes it on unmount", async () => {
    const { seen, view } = setup();
    await screen.findByText("page");
    await waitFor(() => expect(window.sefariaReaderState).toBe(seen()!.api));
    view.unmount();
    expect(window.sefariaReaderState).toBeUndefined();
  });

  it("keeps the labs' UIs off by default, but still exposes the API", async () => {
    setup({});
    await screen.findByText("page");
    await waitFor(() => expect(window.sefariaReaderState).toBeDefined());
    expect(screen.queryByTestId("recording-file-input")).toBeNull();
  });

  it("mounts the recording UI when its lab is switched on in remote config", async () => {
    setup({ "feature.reader.labs.recording": true });
    await screen.findByText("page");
    expect(screen.getByTestId("recording-file-input")).toBeInTheDocument();
  });

  it("builds one registry and API per router", async () => {
    const { router, seen } = setup();
    await screen.findByText("page");
    expect(readerStateFor(router)).toBe(seen());
  });
});
