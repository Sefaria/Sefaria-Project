import type { QueryClient } from "@tanstack/react-query";
import { parseHumanRef } from "~/lib/ref/url";
import { commentaryTitleOf, commentaryToBase, indexMetaQueryOptions } from "~/lib/text/commentary";
import type { NewPanel } from "~/lib/workspace/ops";

/**
 * The panel the app opens for a ref (a citation, a link, a search result). A comment on a single base text opens
 * as that text with the commentator in the sidebar; anything else opens as itself. The book's index record is
 * fetched only for refs deep enough to qualify, and is cached; if it cannot be had, the ref opens as itself.
 *
 * Not used for "Open" in the connections list or for direct page loads, which show the commentary itself
 * (old handleTextListClick; verified on sefaria.org).
 *
 * @feature TXT-015 @feature SHL-045
 */
export async function panelForRef(qc: QueryClient, ref: string, opts: { force?: boolean } = {}): Promise<NewPanel> {
  const plain: NewPanel = { kind: "text", ref, versions: {} };
  if (!opts.force && parseHumanRef(ref).sections.length < 3) return plain;
  try {
    const meta = await qc.fetchQuery(indexMetaQueryOptions(commentaryTitleOf(ref)));
    const base = commentaryToBase(ref, meta, opts);
    if (!base) return plain;
    return { kind: "text", ref: base.ref, versions: {}, asides: [{ kind: "connections", view: base.filter || "all" }] };
  } catch {
    return plain;
  }
}
