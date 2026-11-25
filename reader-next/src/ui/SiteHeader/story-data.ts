import type { HeaderSearchProps } from "./HeaderSearch";
import type { Suggestion } from "~/lib/search/autocomplete";

const BOOKS: Suggestion[] = [
  { type: "Topic", label: "Genesis", url: "https://www.sefaria.org/topics/genesis" },
  { type: "ref", label: "Genesis", url: "/Genesis" },
  { type: "ref", label: "Gen. R.", url: "/Bereshit_Rabbah" },
];
/** A search box with canned suggestions, for stories and tests. */
export const STUB_SEARCH: Omit<HeaderSearchProps, "mobile"> = {
  getSuggestions: async (q) => (q.toLowerCase().startsWith("gen") ? [{ type: "search", label: q }, ...BOOKS] : []),
  onSearch: () => {},
  onChoose: () => {},
  onSmartSubmit: () => {},
};
