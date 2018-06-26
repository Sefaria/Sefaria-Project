"""
translation_request.py
Writes to MongoDB Collection:
"""
import re
from . import abstract as abst
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
        "language_code",
        "generated_by"
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
        'language',
        'to_language',
        'text_categories'
    ]

    optional_attrs = [
        'title',
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
        "refs",
        "related_words",
        "number",
        "language_reference", 
        "number",
        "content",
        "citations",
        "plural_form",
        "binyan_form",
        "alt_headwords",
        "derivatives",
        "quotes"
    ]

class StrongsDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "strong_number"]

class RashiDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "orig_word", "orig_ref", "catane_number"]

class JastrowDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["rid"]

class KleinDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "rid"]

class LexiconEntrySubClassMapping(object):
    lexicon_class_map = {
        'BDB Augmented Strong': StrongsDictionaryEntry,
        'Rashi Foreign Lexicon': RashiDictionaryEntry,
        'Jastrow Dictionary': JastrowDictionaryEntry,
        'Klein Dictionary': KleinDictionaryEntry,
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


class LexiconLookupAggregator(object):

    @classmethod
    def _split_input(cls, input_str):
        input_str = re.sub(ur"[:\u05c3\u05be\u05c0.]", " ", input_str)
        return [s.strip() for s in input_str.split()]

    @classmethod
    def _create_ngrams(cls, input_words, n):
        gram_list = []
        for k in range(1, n + 1):
            gram_list += [" ".join(input_words[i:i + k]) for i in xrange(len(input_words) - k + 1)]
        return gram_list

    @classmethod
    def _single_lookup(cls, input_word, lookup_key='form', **kwargs):
        from sefaria.utils.hebrew import is_hebrew, strip_cantillation, has_cantillation
        from sefaria.model import Ref

        lookup_ref = kwargs.get("lookup_ref", None)
        wform_pkey = lookup_key
        if is_hebrew(input_word):
            input_word = strip_cantillation(input_word)
            """if not has_cantillation(input_word, detect_vowels=True):
                wform_pkey = 'c_form'"""
        query_obj = {wform_pkey: input_word}
        if lookup_ref:
            nref = Ref(lookup_ref).normal()
            query_obj["refs"] = {'$regex': '^{}'.format(nref)}
        form = WordForm().load(query_obj)
        if not form and lookup_ref:
            del query_obj["refs"]
            form = WordForm().load(query_obj)
        if form:
            result = []
            headword_query = []
            for lookup in form.lookups:
                headword_query.append({'headword': lookup['headword']})
                # TODO: if we want the 'lookups' in wf to be a dict we can pass as is to the lexiconentry, we need to change the key 'lexicon' to 'parent_lexicon' in word forms
            return headword_query
        else:
            return []


    @classmethod
    def _ngram_lookup(cls, input_str, **kwargs):
        words = cls._split_input(input_str)
        input_length = len(words)
        queries = []
        for i in reversed(range(input_length)):
            ngrams = cls._create_ngrams(words, i)
            for ng in ngrams:
                res = cls._single_lookup(ng, **kwargs)
                if res:
                    queries += res
        return queries

    @classmethod
    def lexicon_lookup(cls, input_str, **kwargs):
        results = cls._single_lookup(input_str, **kwargs)
        if not results:
            results = cls._single_lookup(input_str, lookup_key='c_form', **kwargs)
        if not kwargs.get('never_split', None) and (len(results) == 0 or kwargs.get("always_split", None)):
            ngram_results = cls._ngram_lookup(input_str, **kwargs)
            results += ngram_results
        if len(results):
            return LexiconEntrySet({"$or": results})
        else:
            return None
