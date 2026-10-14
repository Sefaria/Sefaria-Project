"""Compact, batched regexes preserving the hidden-book filter's prefix semantics."""
from functools import lru_cache

import re2 as re

# Keep both literal text and branch overhead well below MongoDB's compiled-regex
# limit. A single unusually long title is emitted on its own.
MAX_PATTERN_BYTES = 4096
MAX_PATTERN_ALTERNATIVES = 64
_PREFIX = "^(?:"
_SUFFIX = ")(?:[ ,]|$)"


@lru_cache(maxsize=1)
def hidden_book_ref_patterns(titles):
    """Return regex strings for the union of title + end/space/comma prefixes.

    `titles` is an immutable snapshot of admin_only_titles(). A changed snapshot
    invalidates this one-entry cache naturally. Exact-title filters must continue
    using the complete title list, not the prefix-minimal list constructed here.

    Like Ref.regex(), a book prefix covers its titled descendants. Retain aliases
    and standalone titles that do not share a covered prefix. Do not change the
    original space/comma boundaries (including its existing overlapping-name
    behavior) as part of this query-size optimization.
    """
    roots = set()
    for title in sorted(set(titles), key=lambda value: (len(value), value)):
        if not any(char in ' ,' and title[:position] in roots
                   for position, char in enumerate(title)):
            roots.add(title)

    patterns = []
    batch = []
    size = len((_PREFIX + _SUFFIX).encode('utf-8'))
    for title in sorted(roots):
        escaped = re.escape(title)
        addition = len(escaped.encode('utf-8')) + bool(batch)
        if batch and (size + addition > MAX_PATTERN_BYTES or
                      len(batch) >= MAX_PATTERN_ALTERNATIVES):
            patterns.append(_PREFIX + '|'.join(batch) + _SUFFIX)
            batch = []
            size = len((_PREFIX + _SUFFIX).encode('utf-8'))
            addition = len(escaped.encode('utf-8'))
        batch.append(escaped)
        size += addition
    if batch:
        patterns.append(_PREFIX + '|'.join(batch) + _SUFFIX)
    return tuple(patterns)
