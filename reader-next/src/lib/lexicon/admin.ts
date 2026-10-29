/**
 * Moderators editing a dictionary entry from the reader sidebar (Advanced → "Change Lexicon Headword" / "Edit Lexicon
 * Content"), as the old LexiconHeadwordEditBox / LexiconContentEditBox (#3730) do: which entry the reader is on, its
 * stored content, and the two PATCHes. The server checks `is_staff` (api/lexicon_admin_views.py) and answers errors with
 * a real status and `{error}`, which is shown as is.
 *
 * @feature CON-072 Edit a dictionary entry (moderator)
 */
import { queryOptions } from "@tanstack/react-query";
import { patchJson } from "~/lib/auth/http";
import { SEFARIA_API_ORIGIN } from "~/lib/api/client";
import type { IndexDetails } from "~/lib/catalog/index-details";

export interface LexiconIdentity {
  lexiconName: string;
  headword: string;
}

export interface LexiconEntryResponse {
  entry: Record<string, unknown>;
  content_attr_names: string[];
}

/** The index's lexicon: on the index itself, or on the first DictionaryNode in its schema. */
export function lexiconNameOf(details: Pick<IndexDetails, "lexiconName" | "schema"> | undefined): string | undefined {
  if (!details) return undefined;
  if (details.lexiconName) return details.lexiconName;
  const walk = (node: unknown): string | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const n = node as { lexiconName?: string; nodes?: unknown[] };
    if (n.lexiconName) return n.lexiconName;
    for (const child of n.nodes ?? []) {
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(details.schema);
}

/**
 * The old resolveLexiconEntryRef: the entry a dictionary section ref names ("Jastrow, אב" → headword "אב"). Null when the
 * book is not a dictionary or the section ref does not start with "<index title>, " (a shape this tool can't edit safely).
 */
export function lexiconIdentity(
  section: { indexTitle: string; sectionRef: string; categories: readonly string[] } | undefined,
  lexiconName: string | undefined,
): LexiconIdentity | null {
  if (!section || !section.categories.includes("Dictionary") || !lexiconName) return null;
  const prefix = `${section.indexTitle}, `;
  if (!section.sectionRef.startsWith(prefix)) return null;
  const headword = section.sectionRef.slice(prefix.length);
  return headword ? { lexiconName, headword } : null;
}

const entryPath = (id: LexiconIdentity) => `${encodeURIComponent(id.lexiconName)}/${encodeURIComponent(id.headword)}`;

/** The stored entry (public GET), never cached: the moderator edits what is there now. */
export const lexiconEntryQueryOptions = (id: LexiconIdentity) =>
  queryOptions<LexiconEntryResponse>({
    queryKey: ["user", "lexicon-entry", id.lexiconName, id.headword] as const,
    queryFn: async ({ signal }) => {
      const r = await fetch(`${SEFARIA_API_ORIGIN}/api/lexicon-entry/${entryPath(id)}`, { signal, credentials: "include" });
      const data = (await r.json().catch(() => ({}))) as LexiconEntryResponse & { error?: string };
      if (!r.ok || data.error) throw new Error(data.error ?? `Could not load the entry (HTTP ${r.status})`);
      return data;
    },
    staleTime: 0,
    gcTime: 0,
  });

/** The editable part of an entry: its content attributes (the old ContentEditor's draft). */
export function contentDraft(res: LexiconEntryResponse): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const attr of res.content_attr_names) if (attr in res.entry) draft[attr] = res.entry[attr];
  return draft;
}

async function patch<T>(url: string, body: unknown): Promise<T> {
  const res = await patchJson(url, body);
  const data = res.data as T & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? (res.networkError ? "Something went wrong. Sorry!" : `HTTP ${res.status}`));
  return data;
}

export const saveLexiconContent = (id: LexiconIdentity, content: Record<string, unknown>) =>
  patch<{ status: string; entry: Record<string, unknown> }>(`/api/lexicon-entry/${entryPath(id)}`, { content });

/** Answers the headword as saved (the server may add a disambiguating mark or normalize it). */
export const renameLexiconHeadword = (id: LexiconIdentity, newHeadword: string) =>
  patch<{ status: string; headword: string }>(`/api/lexicon-entry/headword/${entryPath(id)}`, { new_headword: newHeadword });

/** Sets the string at `path` inside a nested draft (json-edit-react's assign), returning a new draft. */
export function assignAt<T>(draft: T, path: readonly (string | number)[], value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  const copy = (Array.isArray(draft) ? [...draft] : { ...(draft as object) }) as Record<string | number, unknown>;
  copy[head!] = assignAt(copy[head!], rest, value);
  return copy as T;
}
