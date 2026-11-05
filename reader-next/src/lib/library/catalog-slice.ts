/**
 * The catalog slice a library page renders (R-14), as a query of its own: the server puts it in the page instead of the whole catalog,
 * and both sides render from it, so the first render on the client matches the server's. Derived from the full catalog, which the
 * client keeps on disk and the server keeps once for all requests (toc.ts).
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { POLICIES } from "~/lib/cache/policies";
import { tocQueryOptions, type TocNode } from "~/lib/catalog/toc";
import { catalogSlice } from "./category-model";

export const catalogSliceQueryOptions = (queryClient: QueryClient, path: readonly string[]) =>
  queryOptions({
    queryKey: ["catalog", "slice", path.join("/")] as const,
    queryFn: async (): Promise<TocNode[]> => catalogSlice(await queryClient.ensureQueryData(tocQueryOptions()), path),
    staleTime: POLICIES.catalog.staleTime,
    gcTime: POLICIES.catalog.gcTime,
  });

/** The whole catalog stays out of the page's HTML (pages that need all of it fetch it on the client). */
export const isFullCatalogQuery = (queryKey: readonly unknown[]) => queryKey[0] === "catalog" && queryKey[1] === "toc";
