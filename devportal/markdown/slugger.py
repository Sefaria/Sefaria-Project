"""Heading ids, exactly as live developers.sefaria.org computes them.

Live (ReadMe) uses `github-slugger`. Its `slug()` lower-cases the heading's text content, removes every character that
is not a letter, a mark, a number, a connector punctuation (`_`), a hyphen or a space, and turns each space into a
hyphen. Repeated slugs on one page get `-1`, `-2`, ... appended. See DIALECT.md "Heading ids".
"""

import unicodedata

_KEEP_CATEGORIES = ("L", "M", "N")


def _keep(ch):
    if ch in ("-", " ", "_"):
        return True
    cat = unicodedata.category(ch)
    return cat[0] in _KEEP_CATEGORIES or cat == "Pc"


def slugify(text):
    """The slug of one heading text, without de-duplication."""
    return "".join(ch for ch in text.lower() if _keep(ch)).replace(" ", "-")


class Slugger:
    """De-duplicating slugger; one instance per rendered page (github-slugger's algorithm)."""

    def __init__(self):
        self.occurrences = {}

    def slug(self, text):
        base = slugify(text)
        result = base
        while result in self.occurrences:
            self.occurrences[base] += 1
            result = f"{base}-{self.occurrences[base]}"
        self.occurrences[result] = 0
        return result
