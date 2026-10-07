/**
 * Dictionary headword completion for the dictionary boxes (SRC-021, SRC-022). VERIFIED on sefaria.org 2026-10-05:
 * GET /api/words/completion/<word>[/<lexicon>] → [[headword, form], …], at most 10; across all dictionaries the form is
 * the headword itself, in one dictionary it is the vowelled form ("אור" → "אוֹר I"). Choosing a completion, or pressing Enter,
 * uses the FORM (the first completion's form when Enter is pressed on raw text).
 *
 * @feature SRC-021 Dictionary word search box with autocomplete
 * @feature SRC-022 Dictionary headword search box
 */
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export type Completion = readonly [headword: string, form: string];

/** The old box accepted Hebrew only: any Latin letter makes the entry invalid. */
export const containsEnglish = (s: string) => /[A-Za-z]/.test(s);

export async function fetchLexiconCompletion(term: string, lexicon?: string, signal?: AbortSignal): Promise<Completion[]> {
  const path = `/api/words/completion/${encodeURIComponent(term.normalize("NFC"))}${lexicon ? `/${encodeURIComponent(lexicon)}` : ""}`;
  const r = await fetch(`${SEFARIA_API_ORIGIN}${path}`, { signal });
  if (!r.ok) throw new SefariaApiError(`Completion: HTTP ${r.status}`, r.status);
  const d = (await r.json()) as unknown;
  return Array.isArray(d) ? (d as Completion[]) : [];
}

/** The ref of a dictionary entry: "Jastrow, אוֹר". */
export const entryRef = (title: string, word: string) => `${title}, ${word}`;

/** Completions through the library cache (typing the same letters again asks nothing). */
export const lexiconCompletionQueryOptions = (term: string, lexicon?: string) =>
  queryOptions<Completion[]>({
    ...withPolicy("search", {
      queryKey: ["lexicon-completion", lexicon ?? "", term.normalize("NFC")] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchLexiconCompletion(term, lexicon, signal),
    }),
  });
