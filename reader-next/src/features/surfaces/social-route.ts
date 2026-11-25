/**
 * The /social routes (src/routes/social.index.tsx, social.$.tsx): the social surface's own pages. With the `social` lab on, the
 * server renders the shell with an empty, sized page mount and the surface mounts into it in the browser (SurfaceMount.tsx); every
 * path under /social is the surface's, which renders its own not-found page for one it does not know. With the lab off, /social is
 * the reader's not-found page, as any address nobody has.
 *
 * @feature SHL-076 Social lab and /social routes
 */
import { notFound } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { PUBLIC_CONFIG } from "~/lib/config";
import { labEnabled } from "~/lib/labs";
import { remoteConfigQueryOptions } from "~/lib/shell/remote-config";

/** The lab decides, from the remote config (the root loads it too; awaited here so the server and the client agree). */
export async function socialLoader({ context }: { context: { queryClient: QueryClient } }): Promise<{ lab: true }> {
  const remote = await context.queryClient.ensureQueryData(remoteConfigQueryOptions()).catch(() => undefined);
  if (!labEnabled("social", remote, PUBLIC_CONFIG.labs)) throw notFound();
  return { lab: true };
}
