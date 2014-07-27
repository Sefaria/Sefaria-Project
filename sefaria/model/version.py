"""
version.py - handle user event notifications

Writes to MongoDB Collection: texts
"""

import sefaria.model.abstract as abst
import sefaria.datatype.jagged_array as ja


class Version(abst.AbstractMongoRecord):
    """
    A version of a text.
    Relates to a single record from the texts collection
    """
    collection = "texts"
    required_attrs = [
        "chapter",
        "language",
        "title",
        "versionSource",
        "versionTitle"
    ]
    optional_attrs = [
        "status"
    ]

    def __init__(self, attrs=None):
        abst.AbstractMongoRecord.__init__(self, attrs)
        self._chapter_ja = None

    def count_words(self):
        """ Returns the number of words in this Version """
        return self._get_chapter_ja().count_words()

    def count_chars(self):
        """ Returns the number of characters in this Version """
        return self._get_chapter_ja().count_chars()

    def _get_chapter_ja(self):
        if not self._chapter_ja:
            self._chapter_ja = ja.JaggedTextArray(self.chapter)
        return self._chapter_ja


class VersionSet(abst.AbstractMongoSet):
    recordClass = Version

    def count_words(self):
        return sum([v.count_words() for v in self])

    def count_chars(self):
        return sum([v.count_chars() for v in self])
