# Lexicon Module
> Source: `sefaria/model/lexicon.py`

## Purpose
Provides the data model for dictionary/lexicon word lookups. Maps Hebrew/Aramaic word forms to dictionary headwords across multiple lexicons (Jastrow, Klein, BDB, Strongs, Rashi foreign words, etc.), and renders entries as HTML strings. The lookup pipeline goes: input word -> `WordForm` (maps surface forms to headwords) -> `LexiconEntry` subclass (the actual dictionary article).

## Key Classes

### WordForm
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `word_form`
- **Role**: Maps a surface word form to one or more dictionary headwords via its `lookups` field. Acts as the bridge between raw text words and dictionary entries.
- **Key fields**: `form` (the surface form), `c_form` (consonantal form, no vowels), `lookups` (list of dicts with `headword`, `parent_lexicon`, and optional `primary` flag), `refs` (list of Ref strings this form appears in)
- **Key methods**: `load()` — overridden to make `form` queries case-insensitive via `$regex`

### WordFormSet
- **Inherits**: `AbstractMongoSet`
- **Collection**: `word_form`
- **Role**: Standard set class for `WordForm`.

### Lexicon
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `lexicon`
- **Role**: Metadata record for a specific lexicon/dictionary (e.g. "Jastrow Dictionary", "Klein Dictionary"). Contains publication info, language info, and links to corresponding Index/Version records.
- **Key fields**: `name` (unique identifier, used as FK in entries), `language`, `to_language`, `index_title`, `version_title`, `should_autocomplete`
- **Key methods**: `entry_set()` — returns all `LexiconEntry` records for this lexicon; `word_count()` — sums word counts of all entries

### Dictionary
- **Inherits**: `Lexicon`
- **Role**: Empty subclass of `Lexicon`. Exists for type distinction but adds no behavior.

### LexiconEntry
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `lexicon_entry`
- **Role**: Base class for all dictionary entries. Stores headword, parent lexicon name, and optional fields like morphology, citations, related words. Not used directly for most real entries; subclasses handle specific dictionary formats.
- **Key fields**: `headword`, `parent_lexicon` (FK to `Lexicon.name`), `content` (dict with senses), `rid` (record ID for some dictionaries), `alt_headwords`, `strong_number`
- **Key methods**: `contents()` — enriches the base `contents()` output by loading and embedding the full `parent_lexicon_details` object

### DictionaryEntry
- **Inherits**: `LexiconEntry`
- **Role**: Base class for all dictionary-specific entry types. Provides shared rendering logic for converting structured sense data into HTML strings.
- **Key methods**:
  - `as_strings()` — renders the full entry as a list containing one HTML string, handling headword, morphology, senses (including nested grammar/binyan forms), notes, and derivatives
  - `get_sense(sense)` — renders a single sense dict to an HTML fragment (number + definition + alternative + notes)
  - `headword_string()` — renders headword + alt_headwords as bold RTL HTML
  - `word_count()` — delegates to `JaggedTextArray` on the rendered strings
  - `get_alt_headwords()` — returns list of alt headword strings

### StrongsDictionaryEntry
- **Inherits**: `DictionaryEntry`
- **Role**: Entry for "BDB Augmented Strong" lexicon. Requires `content` and `strong_number`.

### RashiDictionaryEntry
- **Inherits**: `DictionaryEntry`
- **Role**: Entry for "Rashi Foreign Lexicon". Requires `content`, `orig_word`, `orig_ref`, `catane_number`.

### HebrewDictionaryEntry
- **Inherits**: `DictionaryEntry`
- **Role**: Entry for "Sefer HaShorashim" and Levita's "Animadversions". Requires `rid`. Overrides `headword_string()` to use `<big>` tags.

### JastrowDictionaryEntry
- **Inherits**: `DictionaryEntry`
- **Role**: Entry for "Jastrow Dictionary" and "Jastrow Unabbreviated".
- **Key methods**:
  - `headword_string()` — complex regex-based rendering that separates Hebrew/Aramaic characters from Latin, strips superscript numerals
  - `get_sense()` — simplified version that only uses `definition` field (ignores `alternative` and `notes`)

### KleinDictionaryEntry
- **Inherits**: `DictionaryEntry`
- **Role**: Entry for "Klein Dictionary". Requires `content` and `rid`.
- **Key methods**: `get_sense()` — includes `plural_form`, `language_code`, `alternative` before the number and definition

### BDBEntry
- **Inherits**: `DictionaryEntry`
- **Role**: Entry for "BDB Dictionary" and "BDB Aramaic Dictionary". The most complex entry type.
- **Key fields**: `strong_numbers`, `occurrences`, `brackets`, `headword_suffix`, `root`, `ordinal`, `all_cited`, `peculiar`, `GK`, `TWOT`
- **Key methods**:
  - `headword_string()` — elaborate rendering with brackets, occurrence counts as subscripts, ordinals, daggers for cited/peculiar forms, nested `<big>` tags doubled for root entries
  - `get_sense()` — recursive: if a sense has no `definition`, it recurses into `sense['senses']` and returns a list of strings
  - `as_strings()` — joins senses with `<br>`, returns single-element list
  - `get_alt_headwords()` — returns `[a['word'] for a in alt_headwords]` (alt_headwords are dicts, not strings like in base class)

### KovetzYesodotEntry
- **Inherits**: `DictionaryEntry`
- **Role**: Entry for "Kovetz Yesodot VaChakirot" lexicon. Simple key-value content rendering.

### KrupnikEntry
- **Inherits**: `DictionaryEntry`
- **Role**: Entry for "Krupnik Dictionary". Most elaborate schema validation (`attr_schemas`). Supports verb binyans with complex nested content structures.
- **Key fields**: `biblical`, `no_binyan_kal`, `emendation`, `used_in`, `equals`, `pos_list`
- **Key methods**:
  - `format_headword()` — builds headword string with annotations for biblical, no-binyan-kal (parenthesized), emendation, used_in, equals
  - `get_binyan()` — renders a binyan (verb conjugation form) with its senses
  - `get_content()` — dispatches between string content, binyans content, and senses content

### LexiconEntrySubClassMapping
- **Inherits**: `object`
- **Role**: Factory that maps lexicon names to their entry subclasses. Central dispatch point for instantiating the correct entry type.
- **Key methods**:
  - `class_factory(name)` — returns the class for a lexicon name, falls back to `LexiconEntry`
  - `instance_factory(name, attrs)` — instantiates an entry of the correct subclass
  - `instance_from_record_factory(record)` — creates entry from a raw MongoDB record, using `parent_lexicon` to pick the class

### LexiconEntrySet
- **Inherits**: `AbstractMongoSet`
- **Collection**: `lexicon_entry`
- **Role**: Custom set that uses `LexiconEntrySubClassMapping` to instantiate heterogeneous entry types from the same collection.
- **Key methods**: `_read_records()` — overrides base to use the factory pattern for each record; sorts "primary" matches first if `primary_tuples` is provided

### LexiconLookupAggregator
- **Inherits**: `object`
- **Role**: The main lookup engine. Takes user input text and returns matching `LexiconEntrySet`.
- **Key methods**:
  - `lexicon_lookup(input_str, **kwargs)` — main entry point. Normalizes to NFC, tries exact match, then consonantal match (stripped vowels), then ngram splitting. Returns `LexiconEntrySet` or `None`. Kwargs: `lookup_ref`, `always_consonants`, `never_split`, `always_split`
  - `get_word_form_objects(input_word, lookup_key, **kwargs)` — finds `WordForm` records; auto-detects Hebrew and switches to `c_form` for unvocalized input; optionally filters by `lookup_ref` (falls back to unfiltered if no ref-specific results)
  - `_single_lookup()` — looks up one word, returns list of headword query dicts from matching `WordForm.lookups`
  - `_ngram_lookup()` — splits input on punctuation, generates all ngrams from length N down to 1, looks up each
  - `_split_input()` — splits on colons, maqaf, paseq, periods, and spaces
  - `_create_ngrams()` — generates ngrams of sizes 1 through n

## Non-Obvious Patterns
- **Factory via collection**: All entry types share the single `lexicon_entry` MongoDB collection. `LexiconEntrySubClassMapping` dispatches to the correct Python class based on the `parent_lexicon` field, not a type discriminator.
- **Consonantal fallback**: `get_word_form_objects()` automatically strips cantillation and vowels from Hebrew input, switching the query key from `form` to `c_form`. This happens before any lookup attempt for unvocalized input, as an optimization.
- **Three-tier lookup cascade**: `lexicon_lookup` tries (1) exact form match, (2) consonantal-only match, (3) ngram splitting. Steps 2 and 3 are controlled by kwargs `always_consonants`, `never_split`, `always_split`.
- **Ref-scoped lookup with fallback**: When `lookup_ref` is provided, `get_word_form_objects()` first queries with a ref regex filter, then falls back to unfiltered if nothing matches.
- **Primary sorting**: `WordForm.lookups` entries can have a `primary` boolean flag. This propagates through to `LexiconEntrySet`, which sorts primary matches first. The `primary` key is deleted from the query dict before the `$or` query is issued.
- **BDB alt_headwords are dicts**: Unlike other entry types where `alt_headwords` is a list of strings, `BDBEntry` and `KrupnikEntry` use `alt_headwords` as a list of dicts with a `word` key (and other metadata). Their `get_alt_headwords()` methods extract just the word strings.
- **WordForm.load() is case-insensitive**: The `load()` override wraps `form` in a case-insensitive regex, but this only applies to single-record loads, not `WordFormSet` queries.
- **`_sanitize()` is a no-op**: Both `WordForm` and `LexiconEntry` override `_sanitize()` to do nothing, bypassing the base class HTML sanitization despite defining `ALLOWED_TAGS` and `ALLOWED_ATTRS` on `LexiconEntry`.
- **`number` appears twice** in `LexiconEntry.optional_attrs` (duplicate at lines 98-99).
- **`contents()` does an extra DB load**: `LexiconEntry.contents()` loads the parent `Lexicon` object every time it is called, embedding `parent_lexicon_details` into the returned dict. This is an N+1 concern if serializing many entries.

## Relationships
- **Depends on**: `abstract` (AbstractMongoRecord, AbstractMongoSet), `sefaria.datatype.jagged_array` (JaggedTextArray for word_count), `sefaria.system.exceptions` (InputError, imported but unused), `sefaria.utils.hebrew` (has_hebrew, strip_cantillation, has_cantillation), `sefaria.model.text` (Ref, imported lazily inside `get_word_form_objects`)
- **Depended on by**: `reader/views.py` (the `/api/words/` endpoint calls `LexiconLookupAggregator.lexicon_lookup`), `sefaria/model/text.py`, `sefaria/model/schema.py`, `sefaria/helper/schema.py`, `sefaria/recommendation_engine.py`
- **Dependency subscriptions**: None. No `notify`/`subscribe` hooks are registered.

## Common Tasks

### Look up a word programmatically
```python
from sefaria.model.lexicon import LexiconLookupAggregator
results = LexiconLookupAggregator.lexicon_lookup("כתב", lookup_ref="Genesis 1:1")
if results:
    for entry in results:
        print(entry.headword, entry.parent_lexicon)
```

### Get a specific dictionary entry
```python
from sefaria.model.lexicon import LexiconEntrySubClassMapping
entry = LexiconEntrySubClassMapping.instance_factory("Jastrow Dictionary", {"headword": "כתב", "parent_lexicon": "Jastrow Dictionary"})
entry.load({"headword": "כתב", "parent_lexicon": "Jastrow Dictionary"})
html = entry.as_strings()
```

### Add a new dictionary type
1. Create a subclass of `DictionaryEntry` with appropriate `required_attrs`
2. Override `headword_string()`, `get_sense()`, and/or `as_strings()` as needed
3. Add the mapping in `LexiconEntrySubClassMapping.lexicon_class_map`
