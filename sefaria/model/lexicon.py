"""
translation_request.py
Writes to MongoDB Collection:
"""
import re
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
    ]

    optional_attrs = [
        "c_form",
        "refs",
        "language_code"
    ]

    def load(self, query, proj=None):
        if 'form' in query and isinstance(query['form'], basestring):
            query['form'] = {"$regex" : "^"+query['form']+"$", "$options": "i"}
        return super(WordForm, self).load(query, proj=None)


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

    def factory(self, lexicon_name):
        pass


class DictionaryEntry(LexiconEntry):

    optional_attrs = [
        "transliteration",
        "pronunciation",
        "morphology",
        "language_code",
        'refs',
    ]

class StrongsDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["strong_number"]


class LexiconEntrySet(abst.AbstractMongoSet):
    recordClass = LexiconEntry


