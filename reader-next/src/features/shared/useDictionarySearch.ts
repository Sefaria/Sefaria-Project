import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { entryRef, lexiconCompletionQueryOptions } from "~/lib/lexicon/completion";
import { textQueryOptions } from "~/lib/text/queries";

/**
 * What a dictionary box needs: completions through the library cache (all dictionaries, or one), and opening an entry —
 * "<Title>, <word>" — only when the entry exists (the old box checked first and did nothing otherwise).
 */
export function useDictionarySearch(opts: { lexiconName?: string; title?: string; open?: (ref: string) => void }) {
  const qc = useQueryClient();
  const { lexiconName, title, open } = opts;
  const getCompletions = useCallback((term: string) => qc.fetchQuery(lexiconCompletionQueryOptions(term, lexiconName)), [qc, lexiconName]);
  const openEntry = useCallback(
    async (word: string) => {
      if (!title || !open) return;
      const ref = entryRef(title, word);
      try {
        await qc.fetchQuery(textQueryOptions(ref));
      } catch {
        return;
      }
      open(ref);
    },
    [qc, title, open],
  );
  return { getCompletions, openEntry };
}
