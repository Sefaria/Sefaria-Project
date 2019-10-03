# -*- coding: utf-8 -*-
"""
translation_request.py
Writes to MongoDB Collection:
"""
import re
from . import abstract as abst
from sefaria.datatype.jagged_array import JaggedTextArray
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
            query['form'] = {"$regex": "^"+query['form']+"$", "$options": "i"}
        return super(WordForm, self).load(query, proj=None)

    def _sanitize(self):
        pass


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
        'text_categories',
        'index_title',          # The title of the Index record that corresponds to this Lexicon
        'version_title',        # The title of the Version record that corresponds to this Lexicon
        'version_lang'          # The language of the Version record that corresponds to this Lexicon
    ]

    def word_count(self):
        return sum([e.word_count() for e in self.entry_set()])

    def entry_set(self):
        return LexiconEntrySet({"parent_lexicon": self.name})


class Dictionary(Lexicon):
    pass


class LexiconEntry(abst.AbstractMongoRecord):
    collection   = 'lexicon_entry'

    required_attrs = [
        "headword",
        "parent_lexicon",
    ]
    optional_attrs = ["content"]

    ALLOWED_TAGS    = ("i", "b", "br", "u", "strong", "em", "big", "small", "img", "sup", "span", "a")
    ALLOWED_ATTRS   = {
        'span':['class', 'dir'],
        'i': ['data-commentator', 'data-order', 'class', 'data-label', 'dir'],
        'img': lambda name, value: name == 'src' and value.startswith("data:image/"),
        'a': ['dir', 'class', 'href', 'data-ref'],
    }

    def _sanitize(self):
        pass

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
        "quotes",
        "prev_hw",
        "next_hw",
        "notes",
        "alternative"
    ]

    def get_sense(self, sense):
        text = u''
        text += sense.get('number', u'')
        if text:
            text = u"<b>{}</b> ".format(text)
        for field in ['definition', 'alternative', 'notes']:
            text += sense.get(field, u'')
        return text

    def headword_string(self):
        return u', '.join(
            [u'<strong dir="rtl">{}</strong>'.format(hw) for hw in [self.headword] + getattr(self, 'alt_headwords', [])])

    def word_count(self):
        return JaggedTextArray(self.as_strings()).word_count()

    def as_strings(self, with_headword=True):
        new_content = u""
        next_line = u""

        if with_headword:
            next_line = self.headword_string()

        for field in ['morphology']:
            if field in self.content:
                next_line += u" " + self.content[field]

        lang = u''
        if hasattr(self, 'language_code'):
            lang += u" " + self.language_code
        if hasattr(self, 'language_reference'):
            if lang:
                lang += u' '
            lang += self.language_reference
        if lang:
            next_line += lang

        for sense in self.content['senses']:
            if 'grammar' in sense:
                # This is where we would start a new segment for the new form
                new_content += next_line
                next_line = u'<br/>&nbsp;&nbsp;&nbsp;&nbsp;<strong>{}</strong> - '.format(sense['grammar']['verbal_stem'])
                next_line += u', '.join(
                    [u'<strong dir="rtl">{}</strong>'.format(b) for b in sense['grammar']['binyan_form']])
                try:
                    for binyan_sense in sense['senses']:
                        next_line += u" " + self.get_sense(binyan_sense)
                except KeyError:
                    pass
            else:
                next_line += u" " + self.get_sense(sense)
        
        if hasattr(self, 'notes'):
            next_line += u" " + self.notes
        if hasattr(self, 'derivatives'):
            next_line += u" " + self.derivatives

        if next_line:
            new_content += next_line
        return [new_content]


class StrongsDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "strong_number"]


class RashiDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "orig_word", "orig_ref", "catane_number"]


class JastrowDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["rid"]
    
    def get_sense(self, sense):
        text = u''
        text += sense.get('number', u'')
        if text:
            text = u"<b>{}</b> ".format(text)
        for field in ['definition']:
            text += sense.get(field, u'')
        return text

    def headword_string(self):
        line = u""
        for hw in [self.headword] + getattr(self, 'alt_headwords', []):
            hw = re.sub(ur' [\u00B2\u00B3\u2074\u2075\u2076]', '', hw)  # Drop superscripts from presentation
            for txt in re.split(ur'([^ IV\u0590-\u05fe\'\-\"̇̇…̇̇])', hw):
                if re.search(ur'[IV\u0590-\u05fe\'\-\"̇̇…̇̇]', txt):
                    line += u'<strong dir="rtl">{}</strong>'.format(txt)
                else:
                    line += txt
            line += u', '
        line = line[:-2]
        return line


class KleinDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "rid"]
    
    def get_sense(self, sense):
        text = u''
        for field in ['plural_form', 'language_code', 'alternative']:
            text += sense.get(field, u'') + u' '
        num = sense.get('number', u'')
        if num:
            text += u"<b>{}</b> ".format(num)
        for field in ['definition', 'notes']:
            text += sense.get(field, u'') + u' '
        return text[:-1]


class LexiconEntrySubClassMapping(object):
    lexicon_class_map = {
        'BDB Augmented Strong': StrongsDictionaryEntry,
        'Rashi Foreign Lexicon': RashiDictionaryEntry,
        'Jastrow Dictionary': JastrowDictionaryEntry,
        "Jastrow Unabbreviated" : JastrowDictionaryEntry,
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
    def get_word_form_objects(cls, input_word, lookup_key='form', **kwargs):
        from sefaria.utils.hebrew import is_hebrew, strip_cantillation, has_cantillation
        from sefaria.model import Ref

        lookup_ref = kwargs.get("lookup_ref", None)
        wform_pkey = lookup_key
        if is_hebrew(input_word):
            input_word = strip_cantillation(input_word)
            if not has_cantillation(input_word, detect_vowels=True):
                wform_pkey = 'c_form'
        query_obj = {wform_pkey: input_word}
        if lookup_ref:
            nref = Ref(lookup_ref).normal()
            query_obj["refs"] = {'$regex': '^{}'.format(nref)}
        forms = WordFormSet(query_obj)
        if lookup_ref and len(forms) == 0:
            del query_obj["refs"]
            forms = WordFormSet(query_obj)
        return forms


    @classmethod
    def _single_lookup(cls, input_word, lookup_key='form', **kwargs):
        forms = cls.get_word_form_objects(input_word, lookup_key=lookup_key, **kwargs)
        if len(forms) > 0:
            headword_query = []
            for form in forms:
                for lookup in form.lookups:
                    headword_query.append(lookup)
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
