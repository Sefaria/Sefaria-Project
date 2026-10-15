/**
 * Looking words up in the dictionaries. Ported from the old LexiconBox / Sefaria.getLexiconWords and VERIFIED on
 * sefaria.org (2026-10-05, Genesis 1:1, select בְּרֵאשִׁ֖ית with the sidebar open).
 *
 *  - A selection of up to three words (split on whitespace, colon, sof pasuq, maqaf, paseq and period) that
 *    contains Hebrew is looked up; longer selections do nothing. (The old site also looked up any selection that
 *    merely contained a space — an English phrase, say; the rebuild does not.)
 *  - The request is `/api/words/<NFC words>?always_consonants=1&never_split=1&lookup_ref=<segment ref>`.
 *  - Entries from lexicons restricted to certain text categories are kept only when the selected text's
 *    categories, joined with ", " ("Tanakh, Torah"), are among them; unrestricted lexicons (Jastrow) always show.
 *    A search typed into the dictionary box skips that filter and sends no `lookup_ref`.
 *
 * @feature CON-043 Lexicon lookup and filtering
 * @feature TXD-059 Select words to look up in lexicon
 */
import { queryOptions } from "@tanstack/react-query";
import { lexicon } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export const LOOKUP_MAX_WORDS = 3;
const WORD_SPLIT = /[\s:\u05c3\u05be\u05c0.]+/;
/** The old test was /[\s:\u0590-\u05ff.]+/ — any space or period passed, so an English phrase was looked up too. */
const LOOKUPABLE = /[\u0590-\u05ff]/;

/** Sense of a dictionary entry (nested): the shapes differ between dictionaries, so every field is optional. */
export interface EntrySense {
  definition?: string;
  alternative?: string;
  notes?: string;
  grammar?: { verbal_stem?: string };
  senses?: EntrySense[];
  // BDB
  note?: boolean;
  pre_num?: string;
  all_cited?: boolean;
  num?: string;
  form?: string;
  occurrences?: string;
}

export interface AltHeadword {
  word: string;
  occurrences?: string;
}

export interface LexiconEntryData {
  headword: string;
  parent_lexicon: string;
  /** Other spellings: plain strings, or (BDB) words with their occurrence counts. */
  alt_headwords?: (string | AltHeadword)[];
  content: EntrySense & { morphology?: string };
  language_code?: string;
  language_reference?: string;
  notes?: string;
  derivatives?: string;
  // BDB
  peculiar?: boolean;
  all_cited?: boolean;
  ordinal?: string | number;
  occurrence?: boolean;
  occurrences?: string;
  brackets?: "all" | "first_word";
  headword_suffix?: string;
  parent_lexicon_details: {
    name?: string;
    to_language: string;
    text_categories?: string[];
    index_title?: string;
    source?: string;
    source_url?: string;
    attribution?: string;
    attribution_url?: string;
  };
}

/** Should these words be looked up? (Old LexiconBox.shouldActivate; an explicit search always is.) */
export function shouldActivateLookup(words: string | undefined, searched = false): boolean {
  if (searched) return true;
  if (!words || !LOOKUPABLE.test(words)) return false;
  return words.split(WORD_SPLIT).length <= LOOKUP_MAX_WORDS;
}

/** The text a selection yields: surrounding space dropped, runs of whitespace collapsed to one space. */
export const normalizeSelection = (raw: string): string => raw.replace(/\s+/g, " ").trim();

/** Keep the entries that apply to text in these categories (old LexiconBox filter). */
export function entriesForCategories(entries: readonly LexiconEntryData[], categories: readonly string[] | undefined): LexiconEntryData[] {
  if (!categories?.length) return [...entries];
  const joined = categories.join(", ");
  return entries.filter((e) => {
    const allowed = e.parent_lexicon_details.text_categories ?? [];
    return allowed.length === 0 || allowed.includes(joined);
  });
}

export const lexiconQueryOptions = (words: string, ref?: string) => {
  const w = words.normalize("NFC");
  return queryOptions<LexiconEntryData[]>({
    ...withPolicy("reference", {
      queryKey: ["lexicon", w, ref ?? ""] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<LexiconEntryData[]> => {
        const r = await lexicon.getWords({
          client: getSefariaClient(),
          path: { word: w },
          query: { always_consonants: "1", never_split: "1", ...(ref ? { lookup_ref: ref } : {}) },
          signal,
        });
        return unwrap(r, `Definitions of ${w}`) as unknown as LexiconEntryData[];
      },
    }),
  });
};
