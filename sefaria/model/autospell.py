# -*- coding: utf-8 -*-

"""
http://norvig.com/spell-correct.html
http://scottlobdell.me/2015/02/writing-autocomplete-engine-scratch-python/
"""
import string
from collections import Counter, defaultdict

import datrie

from sefaria.model import *
from sefaria.utils import hebrew

import logging
logger = logging.getLogger(__name__)

try:
    import re2 as re
    re.set_fallback_notification(re.FALLBACK_WARNING)
except ImportError:
    logging.warning("Failed to load 're2'.  Falling back to 're' for regular expression parsing. See https://github.com/blockspeiser/Sefaria-Project/wiki/Regular-Expression-Engines")
    import re

letter_scope = u"\u05b0\u05b4\u05b5\u05b6\u05b7\u05b8\u05b9\u05bc\u05c1\u05d0\u05d1\u05d2\u05d3\u05d4\u05d5\u05d6\u05d7\u05d8\u05d9\u05da\u05db\u05dc\u05dd\u05de\u05df\u05e0\u05e1\u05e2\u05e3\u05e4\u05e5\u05e6\u05e7\u05e8\u05e9\u05ea\u05f3\u05f4\u200e\u200f\u2013\u201d\ufeffabcdefghijklmnopqrstuvwxyz1234567890[]`:;.-,*()'& \""


def normalizer(lang):
    if lang == "he":
        return hebrew.normalize_final_letters_in_str
    return string.lower

splitter = re.compile(ur"[\s,]+")


class AutoCompleter(object):
    """
    An AutoCompleter object provides completion services - it is the object in this module designed to be used by the Library.
    It instanciates objects that provide string completion according to different algorithms.
    """
    def __init__(self, lang, lib, include_people=False, include_categories=False, include_parasha=False, *args, **kwargs):
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

        # Titles in library
        title_node_dict = self.library.get_title_node_dict(lang)
        tnd_items = title_node_dict.items()
        titles = [t for t, d in tnd_items]
        normal_titles = [self.normalizer(t) for t, d in tnd_items]
        self.title_trie.add_titles_from_title_node_dict(tnd_items, normal_titles)
        self.spell_checker.train_phrases(normal_titles)
        self.ngram_matcher.train_phrases(titles, normal_titles)

        if include_categories:
            categories = self._get_main_categories(library.get_toc_tree().get_root())
            category_names = [c.primary_title(lang) for c in categories]
            normal_category_names = [self.normalizer(c) for c in category_names]
            self.title_trie.add_titles_from_set(categories, "all_node_titles", "primary_title", "full_path")
            self.spell_checker.train_phrases(category_names)
            self.ngram_matcher.train_phrases(category_names, normal_category_names)
        if include_parasha:
            parashot = TermSet({"scheme": "Parasha"})
            parasha_names = [n for p in parashot for n in p.get_titles(lang)]
            normal_parasha_names = [self.normalizer(p) for p in parasha_names]
            self.title_trie.add_titles_from_set(parashot, "get_titles", "get_primary_title", "name")
            self.spell_checker.train_phrases(parasha_names)
            self.ngram_matcher.train_phrases(parasha_names, normal_parasha_names)
        if include_people:
            eras = ["GN", "RI", "AH", "CO"]
            ps = PersonSet({"era": {"$in": eras}})
            person_names = [n for p in ps for n in p.all_names(lang)]
            normal_person_names = [self.normalizer(n) for n in person_names]
            self.title_trie.add_titles_from_set(ps, "all_names", "primary_name", "key")
            self.spell_checker.train_phrases(person_names)
            self.ngram_matcher.train_phrases(person_names, normal_person_names)


    @staticmethod
    def _get_main_categories(otoc):
        cats = []
        for child in otoc.children:
            if child.children and child.primary_title("en") != "Commentary" and child.primary_title("en") != "Other":
                cats += [child]
            for grandchild in child.children:
                if grandchild.children and grandchild.primary_title("en") != "Commentary":
                    cats += [grandchild]
        return cats

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
        :return:
        """
        instring = instring.strip()  # A terminal space causes some kind of awful "include everything" behavior
        completions = Completions(self, self.lang, instring, limit).process()
        if len(completions):
            return completions

        # No results. Try letter swap
        if not redirected:
            other_language = "he" if self.lang == "en" else "en"
            swapped_string = hebrew.swap_keyboards_for_string(instring)
            return self.library.full_auto_completer(other_language).complete(swapped_string, limit, redirected=True)

        return []

    def next_steps_from_node(self, instring):
        """
        Used in the case when the instring matches a node.  Provides the continuations of that string for its children nodes.
        :param instring:
        :return:
        """
        # Assume that instring is the name of a node.  Extend with a comma, and get next nodes in the Trie
        normal_string = self.normalizer(instring)
        try:
            ret = [v["title"] for k, v in self.title_trie.items(normal_string + u",")].sort(key=len)  # better than sort would be the shallow option of pygtrie, but datrie doesn't have
            return ret or []
        except KeyError:
            return []


class Completions(object):
    def __init__(self, auto_completer, lang, instring, limit=0):
        """
        An object that contains a single search, delegates to different methods of completions, and aggregates results.
        :param auto_completer:
        :param lang:
        :param instring:
        :param limit:
        """
        assert lang in ["en", "he"]

        self.auto_completer = auto_completer
        self.lang = lang
        self.instring = instring
        self.normal_string = normalizer(lang)(instring)
        self.limit = limit
        self.keys_covered = set()
        self.completions = []  # titles to return
        self.duplicate_matches = []  # (key, {}) pairs, as constructed in TitleTrie

    def process(self):
        """
        Execute the completion search
        :return:
        """
        # Match titles that begin exactly this way
        self.add_new_continuations_from_string(self.normal_string)
        if self.limit and len(self.completions) >= self.limit:
            return self.completions[:self.limit or None]

        # single misspellings
        single_edits = self.auto_completer.spell_checker.single_edits(self.normal_string)
        for edit in single_edits:
            self.add_new_continuations_from_string(edit)
            if self.limit and len(self.completions) >= self.limit:
                return self.completions[:self.limit or None]

        # double misspellings
        """
        double_edits = (e2 for e1 in single_edits for e2 in self.full_auto_completer.spell_checker.single_edits(e1))
        for edit in double_edits:
            self.add_new_continuations_from_string(edit)
            if self.limit and len(self.completions) >= self.limit:
                return self.completions
        """
        # This string of characters, or a minor variations thereof, deeper in the string
        try:
            for suggestion in self.auto_completer.ngram_matcher.guess_titles(
                self.auto_completer.spell_checker.correct_phrase(self.normal_string)
            ):
                completion_set = set(self.completions)
                if suggestion not in completion_set:
                    self.completions += [suggestion]
        except ValueError:
            pass

        return self.completions[:self.limit or None]

    def add_new_continuations_from_string(self, str):
        """
        Find titles beginning with this string.
        Adds titles to self.completions, noting covered nodes in self.nodes_covered
        :param str: String of beginning characters
        :return:
        """

        try:
            all_continuations = self.auto_completer.title_trie.items(str)[::-1]
        except KeyError:
            return []

        # Use one title for each book before any duplicate match titles
        # Prefer primary titles
        # todo: don't list all subtree titles, if string doesn't cover base title
        non_primary_matches = []
        for k, v in all_continuations:
            if v["is_primary"] and v["key"] not in self.keys_covered:
                if v["type"] == "ref":
                    self.completions += [v["title"]]
                else:
                    self.completions.insert(0, v["title"])
                self.keys_covered.add(v["key"])
            else:
                non_primary_matches += [(k, v)]

        # Iterate through non primary ones, until we cover the whole node-space
        for k, v in non_primary_matches:
            if v["key"] not in self.keys_covered:
                self.completions += [v["title"]]
                self.keys_covered.add(v["key"])
            else:
                # todo: Check if this is in there already?
                self.duplicate_matches += [(k, v)]


class TitleTrie(datrie.Trie):
    """
    Character Trie built up of the titles in the library
    """

    def __init__(self, lang, *args, **kwargs):
        assert lang in ["en", "he"]
        super(TitleTrie, self).__init__(letter_scope)
        self.lang = lang
        self.normalizer = normalizer(lang)

    def add_titles_from_title_node_dict(self, tnd_items, normal_titles):
        for (title, snode), norm_title in zip(tnd_items, normal_titles):
            self[norm_title] = {
                "title": title,
                "key": title,
                "type": "ref",
                "is_primary": title == snode.primary_title(self.lang)
            }

    def add_titles_from_set(self, recordset, all_names_method, primary_name_method, keyattr):
        """

        :param recordset: Instance of a subclass of AbstractMongoSet, or a List of objects
        :param all_names_method: Name of method that will return list of titles, when passed lang
        :param primary_name_method: Name of method that will return primary title, when passed lang
        :param keyattr: Name of attribute that will give key to object
        :return:
        """
        for obj in recordset:
            titles = getattr(obj, all_names_method)(self.lang)
            key = getattr(obj, keyattr)
            for title in titles:
                norm_title = self.normalizer(title)
                self[norm_title] = {
                    "title": title,
                    "type": obj.__class__.__name__,
                    "key": tuple(key) if isinstance(key, list) else key,
                    "is_primary": title == getattr(obj, primary_name_method)(self.lang)
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
            self.letters = u"abcdefghijklmnopqrstuvwxyz'."
        else:
            self.letters = hebrew.ALPHABET_22 + hebrew.GERESH + hebrew.GERSHAYIM + u'".' + u"'"
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

    def single_edits(self, word):
        """All edits that are one edit away from `word`."""
        splits     = [(word[:i], word[i:])    for i in range(len(word) + 1)]
        deletes    = [L + R[1:]               for L, R in splits if R]
        transposes = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R)>1]
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

    MIN_N_GRAM_SIZE = 3

    def __init__(self, lang):
        assert lang in ["en", "he"]
        self.lang = lang
        self.normalizer = normalizer(lang)
        self.token_to_titles = defaultdict(list)
        self.token_trie = datrie.BaseTrie(letter_scope)

    def train_phrases(self, titles, normal_titles):
        for title, normal_title in zip(titles, normal_titles):
            tokens = splitter.split(normal_title)
            for token in tokens:
                if not token:
                    continue
                self.token_to_titles[token].append(title)
        for k in self.token_to_titles.keys():
            self.token_trie[k] = 1

    def _get_real_tokens_from_possible_n_grams(self, tokens):
        return list({k for token in tokens for k in self.token_trie.keys(token)})

    def _get_scored_titles_uncollapsed(self, real_tokens):
        possibilities__scores = []
        for token in real_tokens:
            try:
                possibilities = self.token_to_titles[token]
            except KeyError:
                possibilities = []
            for title in possibilities:
                score = float(len(token)) / len(title.replace(" ", ""))
                possibilities__scores.append((title, score))
        return possibilities__scores

    def _combined_title_scores(self, titles__scores, num_tokens):
        collapsed_title_to_score = defaultdict(int)
        collapsed_title_to_occurence = defaultdict(int)
        for title, score in titles__scores:
            collapsed_title_to_score[title] += score
            collapsed_title_to_occurence[title] += 1
        for title in collapsed_title_to_score.keys():
            collapsed_title_to_score[title] *= collapsed_title_to_occurence[title] / float(num_tokens)
        return collapsed_title_to_score

    def _filtered_results(self, titles__scores):
        min_results = 3
        max_results = 10
        score_threshold = 0.4
        max_possibles = titles__scores[:max_results]
        if titles__scores and titles__scores[0][1] == 1.0:
            return [titles__scores[0][0]]

        possibles_within_thresh = [tuple_obj for tuple_obj in titles__scores if tuple_obj[1] >= score_threshold]
        min_possibles = possibles_within_thresh if len(possibles_within_thresh) > min_results else max_possibles[:min_results]
        return [tuple_obj[0] for tuple_obj in min_possibles]

    def guess_titles(self, tokens):
        real_tokens = self._get_real_tokens_from_possible_n_grams(tokens)
        titles__scores = self._get_scored_titles_uncollapsed(real_tokens)
        collapsed_titles_to_score = self._combined_title_scores(titles__scores, len(tokens))
        titles__scores = collapsed_titles_to_score.items()
        titles__scores.sort(key=lambda t: t[1], reverse=True)
        return self._filtered_results(titles__scores)
