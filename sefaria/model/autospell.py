# -*- coding: utf-8 -*-

"""
http://norvig.com/spell-correct.html
http://scottlobdell.me/2015/02/writing-autocomplete-engine-scratch-python/
"""
from collections import defaultdict
from typing import List, Iterable
import math
import datrie
from unidecode import unidecode
from django.contrib.auth.models import User
from sefaria.model import *
from sefaria.model.schema import SheetLibraryNode
from sefaria.utils import hebrew
from sefaria.model.following import aggregate_profiles

import structlog
logger = structlog.get_logger(__name__)

try:
    import re2 as re
    re.set_fallback_notification(re.FALLBACK_WARNING)
except ImportError:
    logger.warning("Failed to load 're2'.  Falling back to 're' for regular expression parsing. See https://github.com/sefaria/Sefaria-Project/wiki/Regular-Expression-Engines")
    import re

letter_scope = "\u05b0\u05b1\u05b2\u05b3\u05b4\u05b5\u05b6\u05b7\u05b8\u05b9\u05ba\u05bb\u05bc\u05bd" \
            + "\u05c1\u05c2" \
            + "\u05d0\u05d1\u05d2\u05d3\u05d4\u05d5\u05d6\u05d7\u05d8\u05d9\u05da\u05db\u05dc\u05dd\u05de\u05df" \
            + "\u05e0\u05e1\u05e2\u05e3\u05e4\u05e5\u05e6\u05e7\u05e8\u05e9\u05ea" \
            + "\u200e\u200f\u2013\u201c\u201d\ufeff" \
            + " Iabcdefghijklmnopqrstuvwxyz1234567890[]`:;.-,*$()'&?/\""


def normalizer(lang):
    if lang == "he":
        return lambda x: "".join([c if c in letter_scope else unidecode(c) for c in hebrew.normalize_final_letters_in_str(x)])
    return lambda x: "".join([c if c in letter_scope else unidecode(c) for c in str.lower(x)])


splitter = re.compile(r"[\s,]+")


class AutoCompleter(object):
    """
    An AutoCompleter object provides completion services - it is the object in this module designed to be used by the Library.
    It instantiates objects that provide string completion according to different algorithms.
    """
    def __init__(self, lang, lib, include_titles=True, include_categories=False,
                 include_parasha=False, include_lexicons=False, include_users=False, include_collections=False,
                 include_topics=False, min_topics=0, *args, **kwargs):
        """

        :param lang:
        :param library:
        :param titles: List of all titles in this language
        :param args:
        :param kwargs:
        """
        assert lang in ["en", "he"]

        self.lang = lang
        self.library = lib
        self.normalizer = normalizer(lang)
        self.title_trie = TitleTrie(lang, *args, **kwargs)
        self.spell_checker = SpellChecker(lang)
        self.ngram_matcher = NGramMatcher(lang)
        self.other_lang_ac = None
        self.max_completion_length = 200   # Max # of chars of input string, beyond which no completion search is done
        self.max_autocorrect_length = 20   # Max # of chars of input string, beyond which no autocorrect search is done
        # self.prefer_longest = True  # True for titles, False for dictionary entries.  AC w/ combo of two may be tricky.

        PAD = 1000000 # padding for object type ordering.  Allows for internal ordering within type.

        # Titles in library
        if include_titles:
            title_node_dict = self.library.get_title_node_dict(lang)
            tnd_items = [(t, d) for t, d in list(title_node_dict.items()) if not isinstance(d, SheetLibraryNode)]
            titles = [t for t, d in tnd_items]
            normal_titles = [self.normalizer(t) for t, d in tnd_items]
            self.title_trie.add_titles_from_title_node_dict(tnd_items, normal_titles, 1 * PAD)
            self.spell_checker.train_phrases(normal_titles)
            self.ngram_matcher.train_phrases(titles, normal_titles)
        if include_categories:
            categories = self._get_main_categories(library.get_toc_tree().get_root())
            category_names = [c.primary_title(lang) for c in categories]
            normal_category_names = [self.normalizer(c) for c in category_names]
            self.title_trie.add_titles_from_set(categories, "all_node_titles", "primary_title", "full_path", 2 * PAD)
            self.spell_checker.train_phrases(category_names)
            self.ngram_matcher.train_phrases(category_names, normal_category_names)
        if include_parasha:
            parashot = TermSet({"scheme": "Parasha"})
            parasha_names = [n for p in parashot for n in p.get_titles(lang)]
            normal_parasha_names = [self.normalizer(p) for p in parasha_names]
            self.title_trie.add_titles_from_set(parashot, "get_titles", "get_primary_title", "name", 3 * PAD)
            self.spell_checker.train_phrases(parasha_names)
            self.ngram_matcher.train_phrases(parasha_names, normal_parasha_names)
        if include_topics:
            ts_gte10 = TopicSet({"shouldDisplay":{"$ne":False}, "numSources":{"$gte":min_topics}, "subclass": {"$ne": "author"}})
            authors = AuthorTopicSet()  # include all authors
            ts = ts_gte10.array() + authors.array()
            tnames = [name for t in ts for name in t.get_titles(lang)]
            normal_topics_names = [self.normalizer(n) for n in tnames]

            def sub_order_fn(t: Topic) -> int:
                sub_order = PAD - getattr(t, 'numSources', 0) - 1
                if isinstance(t, AuthorTopic):
                    # give a bonus to authors so they don't get drowned out by topics
                    sub_order -= 100
                return sub_order
            self.title_trie.add_titles_from_set(ts, "get_titles", "get_primary_title", "slug", 4 * PAD, sub_order_fn)
            self.spell_checker.train_phrases(tnames)
            self.ngram_matcher.train_phrases(tnames, normal_topics_names)
        if include_users:
            profiles = aggregate_profiles()
            users = User.objects.in_bulk(profiles.keys())
            unames = []
            normal_user_names = []
            for id, u in users.items():
                fullname = u.first_name + " " + u.last_name
                normal_name = self.normalizer(fullname)
                self.title_trie[normal_name] = {
                    "title": fullname,
                    "type": "User",
                    "key": profiles[id]["user"]["slug"],
                    "pic": profiles[id]["user"]["profile_pic_url_small"],
                    "order": (7 * PAD) - profiles[id]["count"],  # lower is earlier
                    "is_primary": True,
                }
                unames += [fullname]
                normal_user_names += [normal_name]
            self.spell_checker.train_phrases(unames)
            self.ngram_matcher.train_phrases(unames, normal_user_names)
        if include_collections:
            cs = CollectionSet({"listed": True, "moderationStatus": {"$ne": "nolist"}})
            cnames = [name for c in cs for name in c.all_names(lang)]
            normal_collection_names = [self.normalizer(n) for n in cnames]
            self.title_trie.add_titles_from_set(cs, "all_names", "primary_name", "slug", 6 * PAD)
            self.spell_checker.train_phrases(cnames)
            self.ngram_matcher.train_phrases(cnames, normal_collection_names)
        if include_lexicons:
            # languages get muddy for lexicons
            # self.prefer_longest = False
            wfs = WordFormSet({"generated_by": {"$ne": "replace_shorthand"}})

            for wf in wfs:
                self.title_trie[self.normalizer(wf.form)] = {
                    "title": wf.form,
                    "key": wf.form,
                    "type": "word_form",
                    "is_primary": True,
                    "order": (2 * PAD),
                }
                if not hasattr(wf, "c_form"):
                    continue
                self.title_trie[self.normalizer(wf.c_form)] = {
                    "title": wf.c_form,
                    "key": wf.form,
                    "type": "word_form",
                    "is_primary": True,
                    "order": (2 * PAD),
                }

            forms = [getattr(wf, "c_form", wf.form) for wf in wfs]
            normal_forms = [self.normalizer(wf) for wf in forms]
            self.spell_checker.train_phrases(forms)
            self.ngram_matcher.train_phrases(forms, normal_forms)

    def set_other_lang_ac(self, ac):
        self.other_lang_ac = ac

    @staticmethod
    def _get_main_categories(otoc):
        cats = []
        for child in otoc.children:
            if child.children and child.primary_title("en") != "Commentary":
                cats += [child]
            for grandchild in child.children:
                if grandchild.children and grandchild.primary_title("en") != "Commentary":
                    cats += [grandchild]
        return cats

    def get_object(self, instring):
        """
        If there is a string matching instring in the title trie, return the data for default object stored for that string.
        Otherwise, return None
        :param instring:
        :return:
        """
        normal = self.normalizer(instring)
        try:
            return self.title_trie[normal][0]
        except KeyError:
            return None

    def get_data(self, instring):
        """
        If there is a string matching instring in the title trie, return the data stored for that string.
        Otherwise, return None
        :param instring:
        :return:
        """
        normal = self.normalizer(instring)
        try:
            return self.title_trie[normal]
        except KeyError:
            return None

    def complete(self, instring, limit=0, redirected=False):
        """
        Wrapper for Completions object - prioritizes and aggregates completion results.
        In the case where there are no results, tries to swap keyboards and get completion results from the other language.
        :param instring:
        :param limit: Number of results.  0 is unlimited.
        :param redirected: Is this request redirected from the other language?  Prevents infinite loops.
        :return: completions list, completion objects list
        """
        instring = instring.strip()  # A terminal space causes some kind of awful "include everything" behavior
        instring = self.normalizer(instring)
        if len(instring) >= self.max_completion_length:
            return [], []
        cm = Completions(self, self.lang, instring, limit,
                         do_autocorrect=len(instring) < self.max_autocorrect_length)
        cm.process()
        if cm.has_results():
            return cm.get_completion_strings(), cm.get_completion_objects()

        # No results. Try letter swap
        if not redirected and self.other_lang_ac:
            swapped_string = hebrew.swap_keyboards_for_string(instring)
            return self.other_lang_ac.complete(swapped_string, limit, redirected=True)

        return [], []

    '''
    def next_steps_from_node(self, instring):
        """
        Used in the case when the instring matches a node.  Provides the continuations of that string for its children nodes.
        :param instring:
        :return:
        """
        # Assume that instring is the name of a node.  Extend with a comma, and get next nodes in the Trie
        normal_string = self.normalizer(instring)
        try:
            titles_and_objects = [(v["title"], v) for k, all_v in self.title_trie.items(normal_string + ",") for v in all_v]
            titles_and_objects.sort(key=lambda v: len(v[0]))   # better than sort would be the shallow option of pygtrie, but datrie doesn't have
            return [t for t,o in titles_and_objects], [o for t,o in titles_and_objects]
        except KeyError:
            return []
    '''



class Completions(object):
    def __init__(self, auto_completer, lang, instring, limit=0, do_autocorrect = True):
        """
        An object that contains a single search, delegates to different methods of completions, and aggregates results.
        :param auto_completer:
        :param lang:
        :param instring:
        :param limit: Number of results.  0 is unlimited.
        :param do_autocorrect: Defaults to true.  Set to false to prevent resource burn on long strings.
        """
        assert lang in ["en", "he"]

        self.auto_completer = auto_completer
        self.lang = lang
        self.instring = instring
        self.normal_string = normalizer(lang)(instring)
        self.limit = limit
        self.keys_covered = set()
        self.completions = []  # titles to return
        self.completion_objects = []
        self.do_autocorrect = do_autocorrect
        self._completion_strings = []
        self._raw_completion_strings = []  # May have dupes
        self._completion_objects = []
        self._candidate_type_counters = defaultdict(int)
        self._type_limit = 3

    def has_results(self):
        return len(self._completion_objects) > 0

    def get_completion_objects(self):
        return self._completion_objects

    def get_completion_strings(self):
        return self._completion_strings

    def process(self):
        """
        Execute the completion search
        :return:
        """
        self._collect_candidates()
        self._trim_results()

    def _trim_results(self):
        seen = set()

        if self.limit == 0:
            self._completion_strings = [x for x in self._raw_completion_strings if x not in seen and not seen.add(x)]
            return

        obj_count = 0
        for x in self._raw_completion_strings:
            obj_count += 1
            if x in seen:
                continue
            else:
                seen.add(x)
                self._completion_strings += [x]
            if len(seen) >= self.limit:
                break

        self._completion_objects = self._completion_objects[:obj_count]

        return

    def _candidate_order(self, c):
        self._candidate_type_counters[c[1]["type"]] += 1
        if self._candidate_type_counters[c[1]["type"]] <= self._type_limit:
            return c[1]["order"]
        else:
            return c[1]["order"] * 100

    def _collect_candidates(self):
        # Match titles that begin exactly this way
        [cs, co] = self.get_new_continuations_from_string(self.normal_string)

        joined = list(zip(cs, co))
        if len(joined):
            # joined.sort(key=lambda w: w[1]["order"])
            joined.sort(key=self._candidate_order)
            self._raw_completion_strings, self._completion_objects = [list(_) for _ in zip(*joined)]
        else:
            self._raw_completion_strings, self._completion_objects = [], []

        if self.limit and len(set(self._raw_completion_strings)) >= self.limit:
            return

        # This string of characters deeper in the string
        self._collect_candidates_later_in_string(do_autocorrect=False)

        if not self.do_autocorrect:
            return 

        # single misspellings
        single_edits = self.auto_completer.spell_checker.single_edits(self.normal_string)
        for edit in single_edits:
            [cs, co] = self.get_new_continuations_from_string(edit)
            self._raw_completion_strings += cs
            self._completion_objects += co
            if self._is_past_limit():
                return

        # A minor variations of this string of characters deeper in the string
        self._collect_candidates_later_in_string(do_autocorrect=True)

        return

    def _is_past_limit(self):
        return self.limit and len(set(self._raw_completion_strings)) >= self.limit

    def _collect_candidates_later_in_string(self, do_autocorrect=True):
        if do_autocorrect:
            tokens = self.auto_completer.spell_checker.correct_phrase(self.normal_string)
        else:
            tokens = splitter.split(self.normal_string)

        try:
            for suggestion in self.auto_completer.ngram_matcher.guess_titles(tokens):
                k = normalizer(self.lang)(suggestion)
                try:
                    all_v = self.auto_completer.title_trie[k]
                except KeyError:
                    all_v = []
                for v in all_v:
                    if (v["type"], v["key"]) not in self.keys_covered:
                        self._completion_objects += [v]
                        self._raw_completion_strings += [v["title"]]
                        self.keys_covered.add((v["type"], v["key"]))
                        if self._is_past_limit():
                            return
        except ValueError:
            pass

    def get_new_continuations_from_string(self, str):
        """
        Find titles beginning with this string.
        Adds titles to self.completions, noting covered nodes in self.nodes_covered
        :param str: String of beginning characters
        :return:
        """

        try:
            # skip = -1 if self.auto_completer.prefer_longest else 1
            all_continuations = self.auto_completer.title_trie.items(str)
            all_continuations.sort(key=lambda i: len(i[0]))
        except KeyError:
            return []

        # Use one title for each book before any duplicate match titles
        # Prefer primary titles
        # todo: don't list all subtree titles, if string doesn't cover base title
        completions = []
        completion_objects = []
        non_primary_matches = []
        for k, all_v in all_continuations:
            for v in all_v:
                if v["is_primary"] and (v["type"], v["key"]) not in self.keys_covered:
                    if v["type"] == "ref" or v["type"] == "word_form" or v["type"] == "Topic":
                        completion_objects += [v]
                        completions += [v["title"]]
                    else:
                        completion_objects.insert(0, v)
                        completions.insert(0, v["title"])
                    self.keys_covered.add((v["type"], v["key"]))
                else:
                    non_primary_matches += [(k, v)]

        # Iterate through non primary ones, until we cover the whole node-space
        for k, v in non_primary_matches:
            if (v["type"], v["key"]) not in self.keys_covered:
                if v["type"] == "ref" and len(v["title"]) <= 4:  # The > 4 looks to get rid of "Gen" "Exod" and the like.
                    continue
                completions += [v["title"]]
                completion_objects += [v]
                self.keys_covered.add((v["type"], v["key"]))

        return [completions, completion_objects]


class LexiconTrie(datrie.Trie):

    def __init__(self, lexicon_name):
        super(LexiconTrie, self).__init__(letter_scope)

        for entry in LexiconEntrySet({"parent_lexicon": lexicon_name}, sort=[("_id", -1)]):
            self[hebrew.strip_nikkud(entry.headword)] = self.get(hebrew.strip_nikkud(entry.headword), []) + [entry.headword]
            for ahw in entry.get_alt_headwords():
                self[hebrew.strip_nikkud(ahw)] = self.get(hebrew.strip_nikkud(ahw), []) + [entry.headword]


class TitleTrie(datrie.Trie):
    """
    Character Trie built up of the titles in the library.
    Stored items are lists of dicts, each dict having details about one system object.
    {
        "title": string
        "key": string
        "type": string
        "is_primary": bool
    }
    """

    def __init__(self, lang, *args, **kwargs):
        assert lang in ["en", "he"]
        super(TitleTrie, self).__init__(letter_scope)
        self.lang = lang
        self.normalizer = normalizer(lang)

    def __setitem__(self, key, value):
        try:
            item = self[key]
            assert isinstance(item, list)

            super(TitleTrie, self).__setitem__(key, item + [value])
        except KeyError:
            super(TitleTrie, self).__setitem__(key, [value])

    def add_titles_from_title_node_dict(self, tnd_items, normal_titles, order):
        for (title, snode), norm_title in zip(tnd_items, normal_titles):
            self[norm_title] = {
                "title": title,
                "key": snode.full_title("en"),
                "type": "ref",
                "is_primary": title == snode.full_title(self.lang),
                "order": order
            }

    def add_titles_from_set(self, recordset, all_names_method, primary_name_method, keyattr, base_order, sub_order_fn=None):
        """

        :param recordset: Instance of a subclass of AbstractMongoSet, or a List of objects
        :param all_names_method: Name of method that will return list of titles, when passed lang
        :param primary_name_method: Name of method that will return primary title, when passed lang
        :param keyattr: Name of attribute that will give key to object
        :param sub_order_fn: optional function which takes an AbstractMongoRecord as a parameter and returns an integer between 0 and PAD-1 inclusive. the lower the number, the higher ranked this object will be among objects of the same type.
        :return:
        """
        done = set()
        for obj in recordset:
            key = getattr(obj, keyattr, None)
            if not key:
                continue
            sub_order = 0 if sub_order_fn is None else sub_order_fn(obj)
            title = getattr(obj, primary_name_method)(self.lang)
            if title:
                norm_title = self.normalizer(title)
                done.add(norm_title)
                self[norm_title] = {
                    "title": title,
                    "type": obj.__class__.__name__,
                    "key": tuple(key) if isinstance(key, list) else key,
                    "is_primary": True,
                    "order": base_order + sub_order
                }

            titles = getattr(obj, all_names_method)(self.lang)
            for title in titles:
                norm_title = self.normalizer(title)
                if norm_title in done:
                    continue
                done.add(norm_title)
                self[norm_title] = {
                    "title": title,
                    "type": obj.__class__.__name__,
                    "key": tuple(key) if isinstance(key, list) else key,
                    "is_primary": False,
                    "order": base_order + sub_order
                }


class SpellChecker(object):
    """
    Utilities to find small edits of a given string,
    and also to find edits of a given string that result in words in our title list.
    """
    def __init__(self, lang):
        assert lang in ["en", "he"]
        self.lang = lang
        self.normalizer = normalizer(lang)
        if lang == "en":
            self.letters = "abcdefghijklmnopqrstuvwxyz'."
        else:
            self.letters = hebrew.ALPHABET_22 + hebrew.GERESH + hebrew.GERSHAYIM + '".' + "'"
        self.WORDS = defaultdict(int)

    def train_phrases(self, phrases):
        """
        :param phrases: A list of normalized (lowercased, etc) strings
        :return:
        """
        for p in phrases:
            for w in splitter.split(p):
                if not w:
                    continue
                self.WORDS[w] += 1

    def single_edits(self, word, hold_first_letter=True):
        """All edits that are one edit away from `word`."""
        start      = 1 if hold_first_letter else 0
        splits     = [(word[:i], word[i:])    for i in range(start, len(word) + 1)]
        deletes    = [L + R[1:]               for L, R in splits if R]
        transposes = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R) > 1]
        replaces   = [L + c + R[1:]           for L, R in splits if R for c in self.letters]
        inserts    = [L + c + R               for L, R in splits for c in self.letters]
        return set(deletes + transposes + replaces + inserts)

    def _known_edits2(self, word):
        """All edits that are two edits away from `word`."""
        return (e2 for e1 in self.single_edits(word) for e2 in self.single_edits(e1) if e2 in self.WORDS)

    def _known(self, words):
        """The subset of `words` that appear in the dictionary of WORDS."""
        return set(w for w in words if w in self.WORDS)

    def correct_token(self, token):
        candidates = self._known([token]) or self._known(self.single_edits(token)) or [token] #self._known_edits2(token) or [token]
        return max(candidates, key=self.WORDS.get)

    def correct_phrase(self, text):
        normal_text = self.normalizer(text)
        tokens = splitter.split(normal_text)
        return [self.correct_token(token) for token in tokens if token]


class NGramMatcher(object):
    """
    Utility to find titles in our list that roughly match a given string. 
    """

    # MIN_N_GRAM_SIZE = 3

    def __init__(self, lang):
        assert lang in ["en", "he"]
        self.lang = lang
        self.normalizer = normalizer(lang)
        self.token_to_titles = defaultdict(list)
        self.token_trie = datrie.BaseTrie(letter_scope)
        self._tfidf_scorer = TfidfScorer()

    def train_phrases(self, titles, normal_titles):
        for title, normal_title in zip(titles, normal_titles):
            tokens = tuple(splitter.split(normal_title))
            self._tfidf_scorer.train_tokens(tokens)
            for token in tokens:
                if not token:
                    continue
                self.token_to_titles[token].append((title, tokens))
        for k in self.token_to_titles.keys():
            self.token_trie[k] = 1

    def _get_real_tokens_from_possible_n_grams(self, tokens):
        return {token: self.token_trie.keys(token) for token in tokens}

    def _get_scored_titles(self, real_token_map):
        total_ngrams = len(real_token_map)
        possibilities__scores = []
        possibilties_score_map = defaultdict(int)
        title_ngram_map = defaultdict(set)  # map of ngram inputs that matched this title (through mapping of ngrams to real tokens)
        for ngram_token, real_tokens in real_token_map.items():
            for real_token in real_tokens:
                possibilities = self.token_to_titles.get(real_token, [])
                for (title, title_tokens) in possibilities:
                    possibilties_score_map[title] += self._tfidf_scorer.score_token(real_token, title_tokens)
                    title_ngram_map[title].add(ngram_token)

        for title, matched_token_score in possibilties_score_map.items():
            matched_ngrams = title_ngram_map[title]
            score = matched_token_score - (total_ngrams - len(matched_ngrams))
            possibilities__scores.append((title, score))
        return possibilities__scores

    def _filtered_results(self, titles__scores):
        score_threshold = 0.5  # NOTE: score is no longer between 0 and 1. This threshold is somewhat arbitrary and may need adjusting.
        return [tuple_obj[0] for tuple_obj in titles__scores if tuple_obj[1] >= score_threshold]

    def guess_titles(self, tokens):
        real_token_map = self._get_real_tokens_from_possible_n_grams(tokens)
        titles__scores = self._get_scored_titles(real_token_map)
        titles__scores.sort(key=lambda t: t[1], reverse=True)
        return self._filtered_results(titles__scores)


class TfidfScorer:

    def __init__(self):
        self._token_idf_map = {}
        self._missing_idf_value = 0
        self._total_documents = 0

    def train_tokens(self, tokens: Iterable[str]) -> None:
        self._total_documents += 1
        token_document_count_map = defaultdict(int)
        for token in set(tokens):
            token_document_count_map[token] += 1
        for token, count in token_document_count_map.items():
            idf = math.log(self._total_documents / (1 + token_document_count_map[token]))
            self._token_idf_map[token] = idf
        self._missing_idf_value = math.log(self._total_documents)

    def score_token(self, query_token: str, doc_tokens):
        tf = 1 / (1 + len(doc_tokens))  # approximation of tf excluding # of times token appears in document. this seems like a small factor for AC and adds function calls.
        idf = self._token_idf_map.get(query_token, self._missing_idf_value)
        return tf * idf

