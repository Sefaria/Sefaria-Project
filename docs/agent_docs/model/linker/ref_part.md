# ref_part -- Parsed Reference Parts
> Source: `sefaria/model/linker/ref_part.py`

## Purpose
Defines the intermediate representation (IR) between raw text and resolved `Ref` objects. Text identified as a potential citation is broken into typed `RawRefPart` tokens (named section, numbered section, dibur hamatchil, range, etc.), which are then assembled into a `RawRef` for matching against the schema trie. Context parts inject ambient information (current daf, current tractate) into the matching pipeline.

## Key Classes

### TrieEntry
- **Inherits**: `object`
- **Role**: Base class for anything inserted into `MatchTemplateTrie`. Provides a `key()` method (defaults to `hash(self)`) and a `key_is_id` flag that tells the trie whether the key is an opaque ID (skip string manipulation) or a matchable string.

### LeafTrieEntry
- **Inherits**: `object`
- **Role**: Singleton marker (`LEAF_TRIE_ENTRY`) that signals "a complete match exists at this node" inside the trie.

### RawRefPart
- **Inherits**: `TrieEntry`, `abst.Cloneable`
- **Role**: One token of a parsed reference. Immutable-by-convention. Each part carries a `RefPartType` enum (`NAMED`, `NUMBERED`, `DH`, `RANGE_SYMBOL`, `IBID`, etc.) and an `NESpan` pointing back into the source text.
- **Key fields**:
  - `type` (`RefPartType`) -- semantic role of this part.
  - `span` (`NESpan`) -- character range in the source document.
  - `potential_dh_continuation` (`NESpan | None`) -- up to 4 extra tokens after a dibur hamatchil, used for fuzzy DH matching.
- **Key methods**:
  - `key()` -- returns `self.text`; used as the trie lookup key.
  - `get_dh_text_to_match(lang)` -- strips the DH prefix (`b"d"h` / `s.v.`) and yields `(candidate_string, num_continuation_tokens)` tuples, longest first, so the matcher can try progressively shorter DH strings.
  - `realign_to_new_raw_ref(old_span, new_span)` -- produces a clone with `span` offset-adjusted when the parent `RawRef` span changes.
  - `merge(other)` -- expands `self.span` to cover both parts (mutates in place).
  - `char_indices` -- `(start, end)` character offsets.

### RawRefPartPair
- **Inherits**: `RawRefPart`
- **Role**: Wraps two adjacent `RawRefPart`s of the same type into a single unit. Stores the originals in `self.part_pair`. Span covers both parts.

### ContextPart
- **Inherits**: `RawRefPart`
- **Role**: Abstract marker subclass. Any part whose `is_context` property returns `True` is a `ContextPart`. These are injected by the resolver, not extracted from text.

### TermContext
- **Inherits**: `ContextPart`
- **Role**: Represents a `NonUniqueTerm` (e.g., a tractate name) supplied by surrounding context rather than the citation text itself. `key_is_id = True` so the trie treats it as an opaque slug, not a string to manipulate.
- **Key fields**: `term` (`schema.NonUniqueTerm`).
- **Key method**: `key()` returns `"TermContext({slug})"`.

### SectionContext
- **Inherits**: `ContextPart`
- **Role**: Represents a numeric section (e.g., a daf number) from context. Used to fill in missing address levels -- for example, "Tosafot on Berakhot DH abcd" is missing a daf, so the resolver injects a `SectionContext` for the current daf.
- **Key fields**: `addr_type` (`schema.AddressType`), `section_name` (`str`), `address` (`int`), `to_address` (`int | None` for ranges).

### RangedRawRefParts
- **Inherits**: `RawRefPart`
- **Role**: Groups the `sections` and `toSections` lists of a ranged reference (e.g., "5a-7b") into one part with type `RefPartType.RANGE`. Created during `RawRef._group_ranged_parts()` preprocessing.
- **Key fields**: `sections` (`list[RawRefPart]`), `toSections` (`list[RawRefPart]`).

### RawNamedEntity
- **Inherits**: `abst.Cloneable`
- **Role**: Base class for any named-entity span before DB resolution. Carries an `NESpan` and a `NamedEntityType`. Provides helpers for remapping spans to new documents (`map_new_char_indices`, `align_to_new_doc`).

### RawRef
- **Inherits**: `RawNamedEntity`
- **Role**: A complete raw citation: one span of text plus a list of `RawRefPart` tokens. This is the main input to the ref-matching pipeline.
- **Key fields**:
  - `raw_ref_parts` (`list[RawRefPart]`) -- all parts, after range-grouping.
  - `parts_to_match` (`list[RawRefPart]`) -- the parts actually used for matching (may differ from `raw_ref_parts` after context swaps).
  - `prev_num_parts_map` (`dict[RawRefPart, RawRefPart]`) -- maps each NUMBERED part to its immediately preceding NUMBERED part, enforcing in-order resolution of integer addresses.
  - `lang` (`str`) -- `"he"` or `"en"`.
- **Key methods**:
  - `_group_ranged_parts(parts)` -- (static) finds a `RANGE_SYMBOL` part and wraps surrounding NUMBERED parts into a `RangedRawRefParts`.
  - `split_part(part, str_end)` -- splits a part at a string boundary, returns a cloned `RawRef` with the two new parts spliced in. Used when a single token actually contains two logical pieces.
  - `subspan(part_slice)` -- returns the `NESpan` covering a slice of parts.
  - `map_new_part_char_indices(indices)` / `align_parts_to_new_doc(new_doc, offset)` -- bulk remapping of part spans.

## Non-Obvious Patterns
- **Cloneable everywhere**: `RawRefPart` and `RawRef` both extend `Cloneable`, so the resolver can fork alternative interpretations without mutating the original. `clone(**overrides)` copies `__dict__` and applies keyword overrides.
- **`parts_to_match` vs `raw_ref_parts`**: These start identical but diverge when context parts are swapped in. Always use `parts_to_match` for matching logic; use `raw_ref_parts` for span/text operations.
- **`key_is_id` flag**: When `True` (on `TermContext`), the trie skips normalization/string manipulation on the key. Regular `RawRefPart` keys are matchable text strings.
- **DH continuation**: A dibur hamatchil part can "reach forward" into up to 4 tokens of following text (`max_dh_continuation_len`). `get_dh_text_to_match` yields candidates from longest to shortest so the matcher prefers more specific matches.
- **Range grouping is eager**: `_group_ranged_parts` runs at `RawRef.__init__` time and only handles the first `RANGE_SYMBOL` found.

## Relationships
- **`ne_span.NESpan` / `NEDoc`**: All span tracking is delegated to the external `ne_span` library. Every part and raw ref holds an `NESpan`.
- **`schema.NonUniqueTerm`**: `TermContext` wraps one of these to inject term-based context.
- **`schema.AddressType`**: `SectionContext` uses this to interpret the numeric address (e.g., `AddressTalmud` for daf, `AddressInteger` for chapter).
- **`MatchTemplateTrie`** (in `match_template.py`): Consumes `TrieEntry.key()` values during lookup.
- **Ref resolver** (in `ref_resolver.py`): Receives `RawRef` objects and walks the trie to produce resolved `Ref`s.

## Common Tasks

**Create a RawRefPart from scratch (in tests)**:
```python
from ne_span import NESpan, NEDoc, RefPartType
doc = NEDoc("Genesis 1:1")
span = doc.subspan(slice(0, 7))  # "Genesis"
part = RawRefPart(RefPartType.NAMED, span)
```

**Inject context into matching**:
```python
term = NonUniqueTerm.init("berakhot")
ctx = TermContext(term)
raw_ref.parts_to_match = [ctx] + raw_ref.parts_to_match
```

**Check if a part is contextual vs textual**:
```python
if part.is_context:  # True for TermContext, SectionContext
    ...
```
