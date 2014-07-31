"""
text.py

Writes to MongoDB Collection: texts
"""

import sefaria.model.abstract as abst
import sefaria.datatype.jagged_array as ja


class AbstractMongoTextRecord(abst.AbstractMongoRecord):
    collection = "texts"

    required_attrs = [
        "chapter"
    ]

    def __init__(self, attrs=None):
        abst.AbstractMongoRecord.__init__(self, attrs)
        self._text_ja = None

    def count_words(self):
        """ Returns the number of words in this Version """
        return self._get_text_ja().count_words()

    def count_chars(self):
        """ Returns the number of characters in this Version """
        return self._get_text_ja().count_chars()

    def _get_text_ja(self):
        if not self._text_ja:
            self._text_ja = ja.JaggedTextArray(self.chapter)
        return self._text_ja


class Version(AbstractMongoTextRecord):
    """
    A version of a text.
    Relates to a complete single record from the texts collection
    """
    history_noun = 'text'

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


class Chunk(AbstractMongoTextRecord):
    readonly = True


class SimpleChunk(Chunk):
    pass


class MergedChunk(Chunk):
    pass


class VersionSet(abst.AbstractMongoSet):
    recordClass = Version

    def count_words(self):
        return sum([v.count_words() for v in self])

    def count_chars(self):
        return sum([v.count_chars() for v in self])
