import { normalizeTopicSlug } from "~/lib/topics/topic-page";
import { topicTocPage, type TopicTocNode } from "~/lib/topics/topic-toc";
import { serverListedTopicSlugs, serverTopicToc } from "~/lib/topics/toc-source";

/**
 * Which /topics pages this client renders, decided before rendering (TOP-036). The new reader renders the A–Z list's topics and the
 * TOC's categories; every other Library topics address Django still renders: a topic outside the A–Z list (live answers 200 for many),
 * `/topics/category/<a topic that is not a category>`, and the moderators' `?editor=1`. Sending those to Django here saves the full
 * topic fetch (seconds for a big topic) that rendering a 404 first would cost.
 *
 * "unknown" when the path is not a single topic or category page, or the lists cannot be had (the route decides then, as before).
 */
export function topicsOwnerFrom(pathname: string, search: URLSearchParams, lists: { toc?: readonly TopicTocNode[]; listed?: ReadonlySet<string> }): "client" | "django" | "unknown" {
  const m = /^\/topics\/(?:(category|b)\/)?([^/]+)$/.exec(pathname);
  if (!m || (!m[1] && (m[2] === "all" || m[2] === "category"))) return "unknown";
  let slug: string;
  try {
    slug = decodeURIComponent(m[2]!);
  } catch {
    return "unknown";
  }
  if (m[1] === "category") {
    if (!lists.toc?.length) return "unknown";
    return topicTocPage(lists.toc, slug) ? "client" : "django";
  }
  if (search.get("editor") === "1") return "django";
  if (!lists.listed?.size) return "unknown";
  return lists.listed.has(normalizeTopicSlug(slug)) ? "client" : "django";
}

/** The same, with the lists this server keeps (an hour). */
export async function topicsOwner(url: URL): Promise<"client" | "django" | "unknown"> {
  if (!url.pathname.startsWith("/topics/")) return "unknown";
  const [toc, listed] = await Promise.all([serverTopicToc().catch(() => undefined), serverListedTopicSlugs().catch(() => undefined)]);
  return topicsOwnerFrom(url.pathname, url.searchParams, { toc, listed });
}
