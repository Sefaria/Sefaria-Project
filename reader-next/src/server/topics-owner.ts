/**
 * Which /topics pages Django still renders, decided before rendering (TOP-036): only the moderators' editors (`/topics/<slug>
 * ?editor=1`, Add a source, Edit, Reorder sources), which are the old page's until the editors are ported. Every other topic page
 * is this client's: a Library topic outside the A–Z list is rendered (topic-page-source.ts readTopicPage), and
 * `/topics/category/<a topic>` goes on to the topic page (topics.category.$slug.tsx), so an opted-in reader stays in the new reader.
 *
 * "unknown" when the routes decide.
 */
export function topicsOwnerFrom(pathname: string, search: URLSearchParams): "django" | "unknown" {
  if (search.get("editor") !== "1") return "unknown";
  const m = /^\/topics\/(?:b\/)?([^/]+)$/.exec(pathname);
  return m && m[1] !== "all" && m[1] !== "category" ? "django" : "unknown";
}

export async function topicsOwner(url: URL): Promise<"django" | "unknown"> {
  return topicsOwnerFrom(url.pathname, url.searchParams);
}
