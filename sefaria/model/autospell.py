# -*- coding: utf-8 -*-

"""
http://norvig.com/spell-correct.html
http://scottlobdell.me/2015/02/writing-autocomplete-engine-scratch-python/
"""
import pygtrie as trie
from collections import Counter, defaultdict
from sefaria.model import *
from sefaria.utils import hebrew
from sefaria.summaries import toc_serial_to_objects

import logging
logger = logging.getLogger(__name__)

try:
    import re2 as re
    re.set_fallback_notification(re.FALLBACK_WARNING)
except ImportError:
    logging.warning("Failed to load 're2'.  Falling back to 're' for regular expression parsing. See https://github.com/blockspeiser/Sefaria-Project/wiki/Regular-Expression-Engines")
    import re


def normalize_input(instring, lang):
    if lang == "he":
        return hebrew.normalize_final_letters_in_str(instring)
    return instring.lower()


class AutoCompleter(object):
    """
    An AutoCompleter object provides completion services - it is the object in this module designed to be used by the Library.
    It instanciates objects that provide string completion according to different algorithms.
    """
    def __init__(self, lang, lib, include_people=False, include_categories=False, *args, **kwargs):
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

        self.title_trie = TitleTrie(lang, *args, **kwargs)
        self.spell_checker = SpellChecker(lang)
        self.ngram_matcher = NGramMatcher(lang)

        # Titles in library
        title_node_dict = self.library.get_title_node_dict(lang)
        titles = title_node_dict.keys()
        self.title_trie.add_titles_from_title_node_dict(title_node_dict)
        self.spell_checker.train_phrases(titles)
        self.ngram_matcher.train_phrases(titles)

        if include_categories:
            oo_toc = toc_serial_to_objects(library.get_toc())
            categories = self._get_main_categories(oo_toc)
            category_names = [c.primary_title(lang) for c in categories]
            self.title_trie.add_titles_from_set(categories, "all_node_titles", "primary_title", "full_path")
            self.spell_checker.train_phrases(category_names)
            self.ngram_matcher.train_phrases(category_names)
        if include_people:
            eras = ["GN", "RI", "AH", "CO"]
            ps = PersonSet({"era": {"$in": eras}})
            person_names = [n for p in ps for n in p.all_names(lang)]
            self.title_trie.add_titles_from_set(ps, "all_names", "primary_name", "key")
            self.spell_checker.train_phrases(person_names)
            self.ngram_matcher.train_phrases(person_names)

    def _get_main_categories(self, otoc):
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
        normal = normalize_input(instring, self.lang)
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
        completions = Completions(self, self.lang, instring, limit).process()
        if len(completions):
            return completions

        # No results. Try letter swap
        if not redirected:
            other_language = "he" if self.lang == "en" else "en"
            swapped_string = hebrew.swap_keyboards_for_string(instring)
            return self.library.auto_completer(other_language).complete(swapped_string, limit, redirected=True)

    def next_steps_from_node(self, instring):
        """
        Used in the case when the instring matches a node.  Provides the continuations of that string for its children nodes.
        :param instring:
        :return:
        """
        # Assume that instring is the name of a node.  Extend with a comma, and get next nodes in the Trie
        normal_string = normalize_input(instring, self.lang)
        try:
            return [v["title"] for k, v in self.title_trie.items(normal_string + u",", shallow=True)]
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
        self.normal_string = normalize_input(instring, lang)
        self.limit = limit
        self.objs_covered = set()
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
        double_edits = (e2 for e1 in single_edits for e2 in self.auto_completer.spell_checker.single_edits(e1))
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
            if v["is_primary"] and v["obj"] not in self.objs_covered:
                self.completions += [v["title"]]
                self.objs_covered.add(v["obj"])
            else:
                non_primary_matches += [(k, v)]

        # Iterate through non primary ones, until we cover the whole node-space
        for k, v in non_primary_matches:
            if v["obj"] not in self.objs_covered:
                self.completions += [v["title"]]
                self.objs_covered.add(v["obj"])
            else:
                # todo: Check if this is in there already?
                self.duplicate_matches += [(k, v)]


class TitleTrie(trie.CharTrie):
    """
    Character Trie built up of the titles in the library
    """
    def __init__(self, lang, *args, **kwargs):
        assert lang in ["en", "he"]
        super(TitleTrie, self).__init__(*args, **kwargs)
        self.lang = lang

    def add_titles_from_title_node_dict(self, title_node_dict):
        for title, snode in title_node_dict.iteritems():
            norm_title = normalize_input(title, self.lang)
            self[norm_title] = {
                "title": title,
                "obj": snode,
                "type": "ref",
                "is_primary": title == snode.primary_title(self.lang)
            }

    def add_titles_from_set(self, recordset, all_names_method, primary_name_method, keyattr):
        """

        :param recordset: Instance of a subclass of AbstractMongoSet, or a List of objects
        :param namelistmethod: Name of method that will return list of titles, when passed lang
        :param keyattr: Name of attribute that kill give key to object
        :return:
        """
        for obj in recordset:
            titles = getattr(obj, all_names_method)(self.lang)
            key = getattr(obj, keyattr)
            for title in titles:
                norm_title = normalize_input(title, self.lang)
                self[norm_title] = {
                    "title": title,
                    "type": obj.__class__.__name__,
                    "obj": obj,
                    "key": key,
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
        if lang == "en":
            self.letters = u"abcdefghijklmnopqrstuvwxyz'."
        else:
            self.letters = hebrew.ALPHABET_22 + hebrew.GERESH + hebrew.GERSHAYIM + u'".' + u"'"
        self.WORDS = defaultdict(int)

    #todo: clean up normalization
    def words(self, text):
        if self.lang == "en":
            return re.findall(r'\w+', text.lower())
        return re.split(ur"\s+", text)

    def train_phrases(self, phrases):
        for p in phrases:
            if self.lang == "he":
                p = hebrew.normalize_final_letters_in_str(p)
            for w in self.words(p):
                self.WORDS[w] += 1

    def train_words(self, words):
        for w in words:
            if self.lang == "he":
                w = hebrew.normalize_final_letters_in_str(w)
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

    """
    Do we need this, as well as correct_token?
    def candidates(self, word):
        return self._known([word]) or self._known(self.single_edits(word)) or self._known_edits2(word) or [word]
    """

    def correct_token(self, token):
        candidates = self._known([token]) or self._known(self.single_edits(token)) or [token] #self._known_edits2(token) or [token]
        return max(candidates, key=self.WORDS.get)

    def correct_phrase(self, text):
        if self.lang == "he":
            text = hebrew.normalize_final_letters_in_str(text)
        tokens = self.words(text)
        return [self.correct_token(token) for token in tokens]

    """
    def P(word, N=sum(WORDS.values())):
        "Probability of `word`."

    def correction(word):
        "Most probable spelling correction for word."
        return max(candidates(word), key=P)

    def candidates(word):
        "Generate possible spelling corrections for word."
        return (known([word]) or known(edits1(word)) or known(edits2(word)) or [word])

    """


class NGramMatcher(object):
    """
    Utility to find titles in our list that roughly match a given string. 
    """

    MIN_N_GRAM_SIZE = 3

    def __init__(self, lang):
        assert lang in ["en", "he"]
        self.lang = lang
        self.token_to_titles = defaultdict(list)
        self.n_gram_to_tokens = defaultdict(set)

    def train_phrases(self, titles):
        for title in titles:
            if self.lang == "he":
                norm_title = hebrew.normalize_final_letters_in_str(title)
            else:
                #todo: check me
                norm_title = title.lower().replace(u"-", u" ").replace(u"(", u" ").replace(u")", u" ").replace(u"'", u" ")

            tokens = norm_title.split()
            for token in tokens:
                self.token_to_titles[token].append(title)
                for string_size in xrange(self.MIN_N_GRAM_SIZE, len(token) + 1):
                    n_gram = token[:string_size]
                    self.n_gram_to_tokens[n_gram].add(token)

    def _get_real_tokens_from_possible_n_grams(self, tokens):
        real_tokens = []
        for token in tokens:
            token_set = self.n_gram_to_tokens.get(token, set())
            real_tokens.extend(list(token_set))
        return real_tokens

    def _get_scored_titles_uncollapsed(self, real_tokens):
        possibilities__scores = []
        for token in real_tokens:
            possibilities = self.token_to_titles.get(token, [])
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
