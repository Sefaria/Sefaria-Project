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


class WordFormSet(abst.AbstractMongoSet):
    recordClass = WordForm


class Lexicon(abst.AbstractMongoRecord):
    collection = 'lexicon'
    required_attrs = [
        "name",
    ]

    optional_attrs = [
        'title',
        'language',
        'to_language',
        'pub_location',
        'pub_date',
        'editor',
        'year',
        'source',
        'source_url',
        'attribution',
        'attribution_url',
        'text_categories'
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

    def contents(self, **kwargs):
        cts = super(LexiconEntry, self).contents()
        parent_lexicon = Lexicon().load({'name': self.parent_lexicon})
        cts['parent_lexicon_details'] = parent_lexicon.contents()
        return cts


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

class RashiDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["orig_word", "orig_ref", "catane_number"]



class LexiconEntrySubClassMapping(object):
    lexicon_class_map = {
        'BDB Augmented Strong' : StrongsDictionaryEntry,
        'Rashi Foreign Lexicon' : RashiDictionaryEntry
    }

    @classmethod
    def class_factory(cls, name):
        if name in cls.lexicon_class_map:
            return cls.lexicon_class_map[name]
        else:
            return LexiconEntry

    @classmethod
    def instance_factory(cls, name, attrs=None):
        return cls.class_factory(name)(attrs)

    @classmethod
    def instance_from_record_factory(cls, record):
        return cls.instance_factory(record['parent_lexicon'], record)



class LexiconEntrySet(abst.AbstractMongoSet):
    recordClass = LexiconEntry

    def _read_records(self):
        if self.records is None:
            self.records = []
            for rec in self.raw_records:
                self.records.append(LexiconEntrySubClassMapping.instance_from_record_factory(rec))
            self.max = len(self.records)


