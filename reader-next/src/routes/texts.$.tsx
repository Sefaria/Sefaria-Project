import { createFileRoute, redirect } from "@tanstack/react-router";
import { LibraryRoute } from "~/features/library/LibraryRoute";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { calendarsQueryOptions } from "~/lib/library/calendars";

const pathOf = (splat: string | undefined) => (splat ?? "").split("/").filter(Boolean).map(decodeURIComponent);

/** /texts/Tanakh/Torah …: a category's page. */
export const Route = createFileRoute("/texts/$")({
  loader: async ({ context, params }) => {
    const path = pathOf(params._splat);
    // the old site's spelling
    if (path[0] === "Tanach") throw redirect({ to: "/texts/$", params: { _splat: ["Tanakh", ...path.slice(1)].map(encodeURIComponent).join("/") }, statusCode: 301 });
    await Promise.all([context.queryClient.ensureQueryData(tocQueryOptions()), context.queryClient.ensureQueryData(calendarsQueryOptions()).catch(() => undefined)]);
    return { path };
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.path.at(-1) ?? "Texts"} | Sefaria Reader` }] }),
  component: function CategoryRoute() {
    const { path } = Route.useLoaderData();
    return <LibraryRoute path={path} />;
  },
});
