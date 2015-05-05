"""
translation_request.py
Writes to MongoDB Collection:
"""

from . import abstract as abst
from . import text
from . import history
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

class Lookup(object):
    pass


class WordForm(abst.AbstractMongoRecord):
    collection = 'word_form'
    required_attrs = [
        "form",
        "lookups",
        "lang"
    ]


class Lexicon(abst.AbstractMongoRecord):
    collection = 'lexicon'
    required_attrs = [
        "name",
    ]

    optional_attrs = [
        'language',
        'to_language',
        'pub_location',
        'pub_date',
        'editor',
        'year',
        'source'
    ]


class Dictionary(Lexicon):
    pass

class LexiconEntry(abst.AbstractMongoRecord):
    collection   = 'lexicon_entry'

    required_attrs = [
        "headword",
        "parent_lexicon",
        "content"
    ]


class DictionaryEntry(LexiconEntry):
    optional_attrs = [
        "transliteration",
        "pronunciation",
        'refs',
    ]


class LexiconEntrySet(abst.AbstractMongoSet):
    recordClass = LexiconEntry


