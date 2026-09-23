# Sefaria Data Types -- JaggedArray
> Sources: `sefaria/datatype/jagged_array.py`

## Purpose

Provides the core `JaggedArray` data structure and its subclasses (`JaggedTextArray`, `JaggedIntArray`) for representing and manipulating multidimensional sparse arrays. This is the fundamental data structure underlying Sefaria's text storage: a book's text is a nested list of lists (chapters containing verses containing text), and this class provides the operations to navigate, slice, count, compare, and transform that structure.

## Key Components

### `JaggedArray` (base class)

The base class wraps a nested Python list (`self._store`) and provides structural operations.

**Construction & access:**
- `__init__(ja)` -- takes a nested list. WARNING: stores a *reference*, not a copy. Mutations to the JA may affect the original list.
- `array()` -- returns the underlying `_store` list
- `get_element(indx_list)` -- retrieve element at a multi-level index path
- `set_element(indx_list, value, pad=None)` -- set element, auto-padding with empty lists/pad value if the array is not large enough

**Structural queries:**
- `depth()` / `get_depth()` -- nesting depth (1 for `[n]`, 2 for `[[n]]`, 0 for `[]`)
- `shape()` -- returns a structure mirroring the array but with lengths instead of content (e.g. for depth 2, returns list of chapter lengths)
- `sub_array_length(indexes, until_last_nonempty)` -- length of array at a given index path; `until_last_nonempty=True` trims trailing empty sections
- `element_count()` -- total number of terminal elements
- `sections()` -- list of all valid index paths to depth-1 (i.e. section-level indices)
- `non_empty_sections()` -- sections that actually contain content
- `is_full()` -- True if every terminal position is truthy
- `is_empty()` -- True if all terminal positions are falsy
- `length()` / `__len__()` -- top-level length

**Navigation:**
- `next_index(starting_points)` -- DFS traversal to find next populated address
- `prev_index(starting_points)` -- reverse DFS to find previous populated address
- `last_index(depth)` -- indices of the last populated element
- `is_first(indexes1, indexes2)` -- ordering comparison between two index paths
- `distance(indexes1, indexes2)` -- count of elements between two index paths (recursive)

**Slicing & transformation:**
- `subarray(start_indexes, end_indexes)` -- extract a sub-section; handles both point and range refs
- `subarray_with_ref(ref)` -- convenience wrapper that converts 1-based Ref sections to 0-based indices
- `resize(factor)` -- add or remove nesting levels (positive = upsize, negative = downsize)
- `normalize(terminal_depth)` -- ensure consistent depth throughout: replace bare strings at non-terminal levels with single-element lists
- `flatten_to_array()` -- collapse to a 1D list of terminal elements
- `flatten_to_array_with_indices()` -- same but each element is `[[1-based indices...], value]`

**Masks:**
- `mask()` -- returns a `JaggedIntArray` of same shape with 1 where content exists, 0 where not
- `zero_mask()` -- same shape, all zeros
- `constant_mask(constant)` -- same shape, all set to `constant`

**Static helpers:**
- `get_offset_sections(relative_sections, start_sections)` -- compute absolute section indices from relative ones, used when a JA represents a sub-range of a larger text

### `JaggedTextArray(JaggedArray)`

Extends JaggedArray for string content (the actual text segments of books).

- `verse_count()` -- alias for `element_count()`
- `word_count()` -- total words across all segments (splits on whitespace and maqaf `\u05be`)
- `char_count()` -- total characters
- `modify_by_function(func, start_sections)` -- apply a function to every terminal string, with section indices passed as the second argument. Used for transformations like adding links or formatting.
- `flatten_to_string(joiner)` -- flatten and join all text with a separator
- `trim_ending_whitespace()` -- recursively remove trailing empty/whitespace-only elements
- `overlaps(other)` -- True if both JTAs have non-empty strings at any shared position

### `JaggedIntArray(JaggedArray)`

Extends JaggedArray for integer content (used for text availability counts, completion tracking).

- `__add__(other)` / `add(other)` -- element-wise addition of two JaggedIntArrays, with `zip_longest` for mismatched shapes. Treats None as 0 and mismatched int/list as int=empty-list.
- `depth_sum(depth)` -- sum counts at a given depth level. At depth 0, counts how many items are nonzero (used to count chapters with content). At deeper levels, aggregates recursively.

## Non-Obvious Patterns

- **Reference semantics**: `JaggedArray.__init__` stores a *reference* to the passed list, not a deep copy. Methods marked with `# warning, writes!` (like `set_element`, `trim_ending_whitespace`) mutate the underlying data. If the same list is held by a model object, the model's data changes too. This is intentional for performance but requires care.

- **`_reinit()` cache invalidation**: Cached values (`e_count`, `_depth`, `w_count`, `c_count`) are lazily computed and stored. Any method that modifies `_store` must call `_reinit()` to clear stale caches. Currently only `resize()` does this explicitly.

- **`normalize()` dual behavior**: Non-string content at non-terminal depths gets wrapped in lists to reach the target depth. But empty/whitespace strings at non-terminal depths get *replaced* with empty lists rather than wrapped. This prevents treating whitespace placeholders as real content.

- **`distance()` recursion**: The distance method handles empty sections gracefully (zero-length sections contribute 0 to distance). It auto-swaps arguments to ensure the earlier index comes first.

- **`subarray()` range handling**: Supports arbitrarily deep range refs. When start and end indices differ at some level, everything above that level is point-indexed and everything below gets the full start-to-end slice. Inner boundaries of spanning ranges are correctly trimmed.

- **Index conventions**: `JaggedArray` internally uses 0-based indexing. Sefaria Refs use 1-based indexing. The `subarray_with_ref()` method handles the conversion. `flatten_to_array_with_indices()` returns 1-based indices.

- **`modify_by_function` section offset**: When a JaggedTextArray represents a sub-range of a larger text (e.g. a single chapter), `start_sections` lets the callback receive absolute section indices rather than relative ones.

## Relationships

- **Text storage**: `Version.chapter` in the model layer stores text as a nested list. When accessed through `TextChunk`, it gets wrapped in a `JaggedTextArray` for manipulation.
- **Counts**: `VersionState` and text availability tracking use `JaggedIntArray` to represent which sections have content.
- **`sefaria/utils/util.py`**: Contains older standalone versions of some JA operations (`list_depth`, `flatten_jagged_array`, `is_text_empty`). These are gradually being replaced by JaggedArray methods.
- **`sefaria/client/wrapper.py`**: Uses `JaggedTextArray.flatten_to_array()` when formatting link text for the client.
- **Ref system**: `Ref.sections` and `Ref.toSections` define ranges that map directly to JaggedArray indices (after subtracting 1 for 0-basing).

## Common Tasks

**Wrap text in a JaggedTextArray and count words:**
```python
from sefaria.datatype.jagged_array import JaggedTextArray
jta = JaggedTextArray([["First verse", "Second verse"], ["Third verse"]])
jta.word_count()  # 6
jta.verse_count() # 3
```

**Extract a sub-range (e.g. chapter 2, verses 3-5):**
```python
ja = JaggedArray([["a","b","c"], ["d","e","f","g"], ["h","i"]])
sub = ja.subarray([1, 2], [1, 3])  # Chapter index 1, verses 2-3
sub.array()  # ["f", "g"]
```

**Check if two text versions overlap:**
```python
version_a = JaggedTextArray([["text", ""], ["more text"]])
version_b = JaggedTextArray([["", "other"], ["", ""]])
version_a.overlaps(version_b)  # False (no position has both non-empty)
```

**Create a completion mask:**
```python
jta = JaggedTextArray([["has content", ""], ["also content"]])
mask = jta.mask()  # JaggedIntArray([[1, 0], [1]])
```

**Apply a transformation to every segment:**
```python
jta = JaggedTextArray([["hello", "world"], ["foo"]])
result = jta.modify_by_function(lambda text, sections: text.upper())
# [["HELLO", "WORLD"], ["FOO"]]
```

**Navigate to next/previous content:**
```python
ja = JaggedArray([["", "content"], ["", "", "more"]])
ja.next_index([0, 0])  # [0, 1]
ja.next_index([0, 1])  # [1, 2]
```
