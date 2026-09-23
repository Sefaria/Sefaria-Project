# autospell
> Source: `sefaria/model/autospell.py`

## Purpose
Provides autocomplete and spell-correction for the Sefaria search bar. Combines a character trie (prefix matching), an n-gram matcher (fuzzy token matching with TF-IDF scoring), and a Norvig-style spell checker to return ranked completion suggestions across multiple object types (refs, topics, users, collections, categories, lexicon entries, parasha names).

## Key Classes

### AutoCompleter
- **Inherits**: `object`
- **Collection**: N/A (in-memory, built at startup by `Library`)
- **Role**: Top-level facade that wires together `TitleTrie`, `SpellChecker`, and `NGramMatcher`. Holds all the data for one language and delegates search to a `Completions` object.
- **Key fields**: `lang`, `title_trie`, `spell_checker`, `ngram_matcher`, `other_lang_ac` (cross-language fallback via keyboard-swap)
- **Key methods**:
  - `complete(instring, limit, types, topic_pool, ...)` -- Main entry point. Returns `(completion_strings, completion_objects)`. On zero results, automatically tries Hebrew/English keyboard swap via `other_lang_ac`.
  - `get_object(instring)` / `get_data(instring)` -- Direct trie lookup for an exact normalized match.
- **Non-obvious**: The constructor accepts boolean flags (`include_titles`, `include_topics`, `include_users`, etc.) to control which data sources populate the trie. Each source type gets a `PAD` multiplier (1M, 2M, ...) for ordering so types sort in fixed bands, with internal ordering within each band.

### Completions
- **Inherits**: `object`
- **Collection**: N/A (ephemeral per-query)
- **Role**: Executes a single completion search. Aggregates results from prefix matches, spell-corrected prefix matches, and n-gram guesses, then deduplicates and trims to limit.
- **Key fields**: `_type_limit` (max 3 results per type before penalty), `types` (optional type filter), `topic_pool` (optional pool filter for topics)
- **Key methods**:
  - `process()` -- Runs the full pipeline: `_collect_candidates()` then `_trim_results()`.
  - `_candidate_order(c)` -- Applies a 100x penalty to results after the first 3 of any single type, preventing one type from dominating.
- **Non-obvious**: The search is progressive -- it short-circuits as soon as enough unique results are found. The order of strategies matters: exact prefix > later-in-string match > single-edit prefix > corrected later-in-string match.

### TitleTrie
- **Inherits**: `datrie.Trie`
- **Collection**: N/A (in-memory)
- **Role**: Character trie over normalized titles. Each key maps to a **list** of dicts (multiple objects can share the same normalized title).
- **Key fields**: Each stored dict has `title`, `key`, `type`, `is_primary`, `order`, and optionally `topic_pools`, `pic`.
- **Key methods**:
  - `__setitem__` -- Overridden to **append** to the list rather than replace, so multiple objects coexist under one key.
  - `add_titles_from_set(recordset, all_names_method, primary_name_method, keyattr, base_order, sub_order_fn)` -- Generic loader that works for any `AbstractMongoSet` by calling named methods via `getattr`.

### LexiconTrie
- **Inherits**: `datrie.Trie`
- **Collection**: N/A (in-memory, one per lexicon)
- **Role**: Stripped-down trie specifically for dictionary headword completion. Maps nikkud-stripped headwords to lists of original headwords (including alternates).

### SpellChecker
- **Inherits**: `object`
- **Collection**: N/A
- **Role**: Norvig-style spell corrector. Trained on word frequencies from titles. Generates single-edit candidates (delete, transpose, replace, insert) and picks the highest-frequency known word.
- **Key methods**:
  - `single_edits(word)` -- Returns all strings 1 edit away. By default holds the first letter fixed (`hold_first_letter=True`).
  - `correct_phrase(text)` -- Tokenizes and corrects each token independently.
- **Non-obvious**: Only single-edit correction is used in practice (the `_known_edits2` double-edit method exists but is commented out of `correct_token`).

### NGramMatcher
- **Inherits**: `object`
- **Collection**: N/A
- **Role**: Token-level fuzzy matcher. Maps each token to titles containing it, then scores candidates by TF-IDF weighted token overlap.
- **Key methods**:
  - `guess_titles(tokens)` -- Given corrected/raw tokens, returns ranked title suggestions above a score threshold (0.5).
- **Non-obvious**: Uses a `datrie.BaseTrie` (`token_trie`) for prefix-matching query tokens to known tokens, enabling partial-token matching (e.g., query token "gen" matches "genesis").

### TfidfScorer
- **Inherits**: `object`
- **Role**: Lightweight TF-IDF scorer for ranking n-gram matches. TF is approximated as `1/(1+len(doc_tokens))` without counting actual term frequency.
- **Non-obvious**: IDF values are computed incrementally during training and reflect the state at training time, not retroactively updated. The `_missing_idf_value` for unknown tokens equals `log(total_documents)` (maximum possible IDF).

## Non-Obvious Patterns
- **Normalization**: All strings are normalized before trie insertion and lookup. Hebrew normalization converts final letters; English is lowercased. Non-scope characters are transliterated via `unidecode`. Apostrophe-like characters (`'`, curly single quotes, Hebrew geresh) are stripped so queries match titles with or without them.
- **`letter_scope`**: A fixed string of allowed characters that defines the `datrie` alphabet. Includes Hebrew with nikkud, ASCII, digits, and a few punctuation/Unicode control characters. Any character outside this scope gets `unidecode`-transliterated during normalization.
- **Ordering via PAD multiplier**: Object types are ordered in bands of 1,000,000. Within a band, `sub_order_fn` provides fine-grained ranking (e.g., topics ordered by `numSources`, authors get a -100 bonus).
- **Type limiting**: `Completions._candidate_order` penalizes the 4th+ result of any type by 100x, ensuring diverse result types.
- **Keyboard swap fallback**: When no results are found, `complete()` swaps the input between Hebrew and English keyboard layouts and retries on the other language's AutoCompleter.
- **Progressive short-circuiting**: Candidate collection stops early once enough unique results accumulate, avoiding expensive spell-check and n-gram phases when prefix matching suffices.

## Relationships
- **Library** (`sefaria/model/text.py`): Builds and caches `AutoCompleter` instances via `build_full_auto_completer()`, `build_lexicon_auto_completers()`, and `build_cross_lexicon_auto_completer()`. Exposes them via `full_auto_completer(lang)`, `lexicon_auto_completer(lexicon)`, `cross_lexicon_auto_completer()`.
- **title_node_dict**: The title trie for refs is populated from `Library.get_title_node_dict()`, connecting it to the schema/index system.
- **TopicSet / AuthorTopicSet**: Topics and authors are loaded directly from Mongo.
- **WordFormSet / LexiconEntrySet**: Lexicon data comes from the lexicon model.
- **TermSet**: Parasha names come from the term scheme system.
- **CollectionSet**: Public listed collections are included.
- **User / aggregate_profiles**: Django auth users with follower counts for ranking.
- **hebrew utils** (`sefaria/utils/hebrew.py`): Used for normalization, nikkud stripping, keyboard swapping.

## Common Tasks

### Get autocomplete suggestions for user input
```python
library.full_auto_completer("en").complete("genes", limit=10)
# Returns: (["Genesis", "Genesis Rabbah", ...], [{...}, {...}, ...])
```

### Filter completions by type
```python
ac.complete("moses", limit=5, types=["Topic"])
```

### Filter topic completions by pool
```python
ac.complete("moses", limit=5, types=["Topic"], topic_pool="community")
```

### Look up exact match data
```python
ac.get_object("genesis")  # Returns first matching object dict or None
ac.get_data("genesis")    # Returns full list of matching object dicts or None
```

### Rebuild autocompleters after data changes
```python
library.build_full_auto_completer()
library.build_lexicon_auto_completers()
library.build_cross_lexicon_auto_completer()
```
