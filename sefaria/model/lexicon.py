# -*- coding: utf-8 -*-
"""
Writes to MongoDB Collection: word_form, lexicon_entry
"""
import re
import unicodedata
from . import abstract as abst
from sefaria.datatype.jagged_array import JaggedTextArray
from sefaria.system.exceptions import InputError
from sefaria.utils.hebrew import strip_cantillation, has_cantillation
from sefaria.utils.tibetan import has_tibetan


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
        if 'form' in query and isinstance(query['form'], str):
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
        'version_lang',         # The language of the Version record that corresponds to this Lexicon
        'should_autocomplete'   # enables search box
    ]

    def word_count(self):
        return sum([e.word_count() for e in self.entry_set()])

    def entry_set(self):
        return LexiconEntrySet({"parent_lexicon": self.name})


class LexiconSet(abst.AbstractMongoSet):
    recordClass = Lexicon


class Dictionary(Lexicon):
    pass


class LexiconEntry(abst.AbstractMongoRecord):
    collection   = 'lexicon_entry'

    required_attrs = [
        "headword",
        "parent_lexicon",
    ]
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
        "alternative",
        "strong_number",
        "orig_word",
        "orig_ref",
        "catane_number",
        "rid",
        "strong_numbers",
        "GK",
        "TWOT",
        'peculiar',
        'all_cited',
        'ordinal',
        'brackets',
        'headword_suffix',
        'root',
        'occurrences'
    ]
    ALLOWED_TAGS    = ("i", "b", "br", "u", "strong", "em", "big", "small", "img", "sup", "sub", "span", "a")
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

    def get_sense(self, sense):
        text = ''
        text += sense.get('number', '')
        if text:
            text = "<b>{}</b> ".format(text)
        for field in ['definition', 'alternative', 'notes']:
            text += sense.get(field, '')
        return text

    def headword_string(self):
        headwords = [self.headword] + getattr(self, 'alt_headwords', [])
        string = ', '.join(
            ['<strong dir="rtl">{}</strong>'.format(hw) for hw in headwords])
        return string

    def word_count(self):
        return JaggedTextArray(self.as_strings()).word_count()

    def as_strings(self, with_headword=True):
        new_content = ""
        next_line = ""

        if with_headword:
            next_line = self.headword_string()

        for field in ['morphology']:
            if field in self.content:
                next_line += " " + self.content[field]

        lang = ''
        if hasattr(self, 'language_code'):
            lang += " " + self.language_code
        if hasattr(self, 'language_reference'):
            if lang:
                lang += ' '
            lang += self.language_reference
        if lang:
            next_line += lang

        for sense in self.content['senses']:
            if 'grammar' in sense:
                # This is where we would start a new segment for the new form
                new_content += next_line
                next_line = '<br/>&nbsp;&nbsp;&nbsp;&nbsp;<strong>{}</strong> - '.format(sense['grammar']['verbal_stem'])
                next_line += ', '.join(
                    ['<strong dir="rtl">{}</strong>'.format(b) for b in sense['grammar']['binyan_form']])
                try:
                    for binyan_sense in sense['senses']:
                        next_line += " " + self.get_sense(binyan_sense)
                except KeyError:
                    pass
            else:
                next_line += " " + self.get_sense(sense)
        
        if hasattr(self, 'notes'):
            next_line += " " + self.notes
        if hasattr(self, 'derivatives'):
            next_line += " " + self.derivatives

        if next_line:
            new_content += next_line
        return [new_content]

    def get_alt_headwords(self):
        return getattr(self, "alt_headwords", [])


class StrongsDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "strong_number"]


class RashiDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "orig_word", "orig_ref", "catane_number"]


class HebrewDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["rid"]

    def headword_string(self):
        headwords = [self.headword] + getattr(self, 'alt_headwords', [])
        string = ', '.join([f'<strong><big>{hw}</big></strong>' for hw in headwords]) + '\xa0\xa0'
        return string


class JastrowDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["rid"]
    
    def get_sense(self, sense):
        text = ''
        text += sense.get('number', '')
        if text:
            text = "<b>{}</b> ".format(text)
        for field in ['definition']:
            text += sense.get(field, '')
        return text

    def headword_string(self):
        line = ""
        for hw in [self.headword] + getattr(self, 'alt_headwords', []):
            hw = re.sub(r' [\u00B2\u00B3\u2074\u2075\u2076]', '', hw)  # Drop superscripts from presentation
            for txt in re.split(r'([^ IV\u0590-\u05fe\'\-\"̇̇…̇̇])', hw):
                if re.search(r'[IV\u0590-\u05fe\'\-\"̇̇…̇̇]', txt):
                    line += '<strong dir="rtl">{}</strong>'.format(txt)
                else:
                    line += txt
            line += ', '
        line = line[:-2]
        return line


class KleinDictionaryEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "rid"]
    
    def get_sense(self, sense):
        text = ''
        for field in ['plural_form', 'language_code', 'alternative']:
            text += sense.get(field, '') + ' '
        num = sense.get('number', '')
        if num:
            text += "<b>{}</b> ".format(num)
        for field in ['definition', 'notes']:
            text += sense.get(field, '') + ' '
        return text[:-1]

class BDBEntry(DictionaryEntry):
    required_attrs = DictionaryEntry.required_attrs + ["content", "rid"]
    optional_attrs = ['strong_numbers', 'next_hw', 'prev_hw', 'peculiar', 'all_cited', 'ordinal', 'brackets', 'headword_suffix', 'alt_headwords', 'root', 'occurrences', 'quotes', 'GK', 'TWOT']

    def headword_string(self):
        hw = f'<span dir="rtl">{re.sub("[⁰¹²³⁴⁵⁶⁷⁸⁹]*", "", self.headword)}</span>'
        if hasattr(self, 'occurrences') and not hasattr(self, 'headword_suffix'):
            hw += f'</big><sub>{self.occurrences}</sub><big>' #the sub shouldn't be in big
        alts = []
        if hasattr(self, 'alt_headwords'):
            for alt in self.alt_headwords:
                a = f'<span dir="rtl">{alt["word"]}</span>'
                if 'occurrences' in alt:
                    a += f'</big><sub>{alt["occurrences"]}</sub><big>' #the sub shouldn't be in big
                alts.append(a)
        if getattr(self, 'brackets', '') == 'all':
            if hasattr(self, 'headword_suffix'):
                hw = f'[{hw}{self.headword_suffix}]' #if there's a space, it'll be part of headword_suffix
                if hasattr(self, 'occurrences'):
                    hw += f'</big><sub>{self.occurrences}</sub><big>'
            else:
                hw = f'[{", ".join([hw] + alts)}]'
        else:
            if hasattr(self, 'brackets') and self.brackets == 'first_word':
                hw = f'[{hw}]'
            if hasattr(self, 'alt_headwords'):
                hw = ", ".join([hw] + alts)
        hw = f'<big>{hw}</big>'
        if hasattr(self, 'root'):
            hw = re.sub('(</?big>)', r'\1\1', hw)
        if hasattr(self, 'ordinal'):
            hw = f'{self.ordinal} {hw}'
        if hasattr(self, 'all_cited'):
            hw = f'† {hw}'
        if hasattr(self, 'peculiar'):
            hw = f'‡ {hw}'
        hw = re.sub('<big></big>', '', hw)
        return hw

    def get_alt_headwords(self):
        alts = getattr(self, "alt_headwords", [])
        return [a['word'] for a in alts]

    def get_sense(self, sense):
        string = ''
        if 'note' in sense:
            string = '<em>Note.</em>'
        if 'pre_num' in sense:
            string += f"{sense['pre_num']} "
        if 'all_cited' in sense:
            string += '†'
        if 'form' in sense:
            if 'note' in sense:
                string += f' {sense["num"]}'
            else:
                string += f'<strong>{sense["form"]}</strong>'
        elif 'num' in sense:
            string += f'<strong>{sense["num"]}</strong>'
        if 'occurrences' in sense:
            string += f'<sub>{sense["occurrences"]}</sub>'
        string += ' '
        if 'definition' in sense:
            return string + sense['definition']
        else:
            senses = []
            for s in sense['senses']:
                subsenses = self.get_sense(s)
                if type(subsenses) == list:
                    senses += subsenses
                else:
                    senses.append(subsenses)
            senses[0] = string + senses[0]
            return senses

    def as_strings(self, with_headword=True):
        strings = []
        for sense in self.content['senses']:
            sense = self.get_sense(sense)
            if type(sense) == list:
                strings.append(' '.join(sense))
            else:
                strings.append(sense)
        if with_headword:
            strings[0] = self.headword_string() + ' ' + strings[0]
        return ['<br>'.join(strings)]


class LexiconEntrySubClassMapping(object):
    lexicon_class_map = {
        'BDB Augmented Strong': StrongsDictionaryEntry,
        'Rashi Foreign Lexicon': RashiDictionaryEntry,
        'Jastrow Dictionary': JastrowDictionaryEntry,
        "Jastrow Unabbreviated" : JastrowDictionaryEntry,
        'Klein Dictionary': KleinDictionaryEntry,
        'Sefer HaShorashim': HebrewDictionaryEntry,
        'Animadversions by Elias Levita on Sefer HaShorashim': HebrewDictionaryEntry,
        'BDB Dictionary': BDBEntry,
        'BDB Aramaic Dictionary': BDBEntry
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

    def __init__(self, query=None, page=0, limit=0, sort=[("_id", 1)], proj=None, hint=None, primary_tuples=None):
        super(LexiconEntrySet, self).__init__(query, page, limit, sort, proj, hint)
        self._primary_tuples = primary_tuples

    def _read_records(self):
        def is_primary(entry):
            return not (entry.headword, entry.parent_lexicon) in self._primary_tuples

        if self.records is None:
            self.records = []
            for rec in self.raw_records:
                self.records.append(LexiconEntrySubClassMapping.instance_from_record_factory(rec))
            self.max = len(self.records)
            if self._primary_tuples:
                self.records.sort(key=is_primary)


class LexiconLookupAggregator(object):

    @classmethod
    def _split_input(cls, input_str):
        input_str = re.sub(r"[:\u05c3\u05be\u05c0.]", " ", input_str)
        return [s.strip() for s in input_str.split()]

    @classmethod
    def _create_ngrams(cls, input_words, n):
        gram_list = []
        for k in range(1, n + 1):
            gram_list += [" ".join(input_words[i:i + k]) for i in range(len(input_words) - k + 1)]
        return gram_list

    @classmethod
    def get_word_form_objects(cls, input_word, lookup_key='form', **kwargs):
        from sefaria.model import Ref

        lookup_ref = kwargs.get("lookup_ref", None)
        wform_pkey = lookup_key
        if has_tibetan(input_word):
            # This step technically used to happen in the lookup main method `lexicon_lookup` if there were no initial results, but in case where a
            # consonantal form was supplied in the first place, this optimizes queries.
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
        for i in reversed(list(range(input_length))):
            ngrams = cls._create_ngrams(words, i)
            for ng in ngrams:
                res = cls._single_lookup(ng, **kwargs)
                if res:
                    queries += res
        return queries

    @classmethod
    def lexicon_lookup(cls, input_str, **kwargs):
        input_str = unicodedata.normalize("NFC", input_str)
        results = cls._single_lookup(input_str, **kwargs)
        if not results or kwargs.get('always_consonants', False):
            results += cls._single_lookup(strip_cantillation(input_str, True), lookup_key='c_form', **kwargs)
        if not kwargs.get('never_split', None) and (len(results) == 0 or kwargs.get("always_split", None)):
            ngram_results = cls._ngram_lookup(input_str, **kwargs)
            results += ngram_results
        if len(results):
            primary_tuples = set()
            query = set() #TODO: optimize number of word form lookups? there can be a lot of duplicates... is it needed?
            for r in results:
                # extract the lookups with "primary" field so it can be used for sorting lookup in the LexiconEntrySet,
                # but also delete it, because its not part of the query obj
                if "primary" in r:
                    if r["primary"] is True:
                        primary_tuples.add((r["headword"], r["parent_lexicon"]))
                    del r["primary"]
            return LexiconEntrySet({"$or": results}, primary_tuples=primary_tuples)
        else:
            return None