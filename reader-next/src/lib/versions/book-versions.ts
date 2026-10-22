import { queryOptions } from "@tanstack/react-query";
import { text } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import type { VersionMeta } from "~/lib/text/model";

/**
 * The versions that have text for a ref (`/api/texts/versions/<ref>`): for a book title, every version of the
 * book (what the download form offers); for a verse, only those that cover it (what the Translations count shows:
 * Berakhot 2a:1 has 5 translations although the amud has 6).
 */
export const versionsQueryOptions = (ref: string) =>
  queryOptions<VersionMeta[]>({
    ...withPolicy("catalog", {
      queryKey: ["versions", ref] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<VersionMeta[]> => {
        const r = await text.getTextVersions({ client: getSefariaClient(), path: { tref: ref }, signal });
        const body = unwrap(r, `Versions of ${ref}`) as unknown;
        return Array.isArray(body) ? (body as VersionMeta[]) : Object.values(body as Record<string, VersionMeta[]>).flat();
      },
    }),
  });

/** Kept for the About box's download form, which asks for the whole book. */
export const bookVersionsQueryOptions = versionsQueryOptions;
