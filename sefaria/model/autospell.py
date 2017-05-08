# -*- coding: utf-8 -*-

"""
http://norvig.com/spell-correct.html
http://scottlobdell.me/2015/02/writing-autocomplete-engine-scratch-python/
"""
import pygtrie as trie
from collections import Counter, defaultdict
from sefaria.utils import hebrew
import logging
logger = logging.getLogger(__name__)

try:
    import re2 as re
    re.set_fallback_notification(re.FALLBACK_WARNING)
except ImportError:
    logging.warning("Failed to load 're2'.  Falling back to 're' for regular expression parsing. See https://github.com/blockspeiser/Sefaria-Project/wiki/Regular-Expression-Engines")
    import re


H2E_KEYBOARD_MAP = {u"/": u"q", u"׳": u"w", u"ק": u"e", u"ר": u"r", u"א": u"t", u"ט": u"y", u"ו": u"u", u"ן": u"i", u"ם": u"o", u"פ": u"p", u"ש": u"a", u"ד": u"s", u"ג": u"d", u"כ": u"f", u"ע": u"g", u"י": u"h", u"ח": u"j", u"ל": u"k", u"ך": u"l", u"ף": u";", u",": u"'", u"ז": u"z", u"ס": u"x", u"ב": u"c", u"ה": u"v", u"נ": u"b", u"מ": u"n", u"צ": u"m", u"ת": u",", u"ץ": u".", u".": u"/"}
E3H_KEYBOARD_MAP = {u"'": u',', u',': u'\u05ea', u'.': u'\u05e5', u'/': u'.', u';': u'\u05e3', u'A': u'\u05e9', u'B': u'\u05e0', u'C': u'\u05d1', u'D': u'\u05d2', u'E': u'\u05e7', u'F': u'\u05db', u'G': u'\u05e2', u'H': u'\u05d9', u'I': u'\u05df', u'J': u'\u05d7', u'K': u'\u05dc', u'L': u'\u05da', u'M': u'\u05e6', u'N': u'\u05de', u'O': u'\u05dd', u'P': u'\u05e4', u'Q': u'/', u'R': u'\u05e8', u'S': u'\u05d3', u'T': u'\u05d0', u'U': u'\u05d5', u'V': u'\u05d4', u'W': u'\u05f3', u'X': u'\u05e1', u'Y': u'\u05d8', u'Z': u'\u05d6', u'a': u'\u05e9', u'b': u'\u05e0', u'c': u'\u05d1', u'd': u'\u05d2', u'e': u'\u05e7', u'f': u'\u05db', u'g': u'\u05e2', u'h': u'\u05d9', u'i': u'\u05df', u'j': u'\u05d7', u'k': u'\u05dc', u'l': u'\u05da', u'm': u'\u05e6', u'n': u'\u05de', u'o': u'\u05dd', u'p': u'\u05e4', u'q': u'/', u'r': u'\u05e8', u's': u'\u05d3', u't': u'\u05d0', u'u': u'\u05d5', u'v': u'\u05d4', u'w': u'\u05f3', u'x': u'\u05e1', u'y': u'\u05d8', u'z': u'\u05d6'}


class AutoCompleter(object):
    def __init__(self, lang, library, titles, *args, **kwargs):
        assert lang in ["en", "he"]
        self.lang = lang
        self.library = library
        self.title_trie = TitleTrie(lang, library, *args, **kwargs)
        self.spell_checker = SpellChecker(lang, titles)
        self.ngram_matcher = NGramMatcher(lang, library)

    def complete(self, instring, limit=0):
        return Completions(self, self.lang, instring, limit).process()

    def next_steps_from_node(self, instring):
        # Assume that instring is the name of a node.  Extend with a comma, and get next nodes in the Trie
        if self.lang == "he":
            normal_string = hebrew.normalize_final_letters_in_str(instring)
        else:
            normal_string = instring.lower()

        try:
            return [v["title"] for k, v in self.title_trie.items(normal_string + u",", shallow=True)]
        except KeyError:
            return []


class Completions(object):
    def __init__(self, auto_completer, lang, instring, limit=0):
        assert lang in ["en", "he"]

        self.auto_completer = auto_completer
        self.lang = lang
        self.instring = instring
        self.limit = limit
        if lang == "he":
            self.normal_string = hebrew.normalize_final_letters_in_str(instring)
        else:
            self.normal_string = instring.lower()

        self.nodes_covered = set()
        self.completions = []  # titles to return
        self.duplicate_matches = []  # (key, {}) pairs, as constructed in TitleTrie

    def process(self):
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
        :param str: String of beginning characters
        Adds titles to self.completions, noting covered nodes in self.nodes_covered
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
            if v["is_primary"] and v["node"] not in self.nodes_covered:
                self.completions += [v["title"]]
                self.nodes_covered.add(v["node"])
            else:
                non_primary_matches += [(k, v)]

        # Iterate through non primary ones, until we cover the whole node-space
        for k, v in non_primary_matches:
            if v["node"] not in self.nodes_covered:
                self.completions += [v["title"]]
                self.nodes_covered.add(v["node"])
            else:
                # todo: Check if this is in there already?
                self.duplicate_matches += [(k, v)]


class TitleTrie(trie.CharTrie):
    def __init__(self, lang, library, *args, **kwargs):
        assert lang in ["en", "he"]
        super(TitleTrie, self).__init__(*args, **kwargs)
        self.lang = lang
        self.library = library

        title_node_dict = self.library.get_title_node_dict(self.lang)
        for title, snode in title_node_dict.iteritems():
            if self.lang == "he":
                norm_title = hebrew.normalize_final_letters_in_str(title)
            else:
                norm_title = title.lower()
            self[norm_title] = {
                "title": title,
                "node": snode,
                "is_primary": title == snode.primary_title(lang)
            }


class SpellChecker(object):

    def __init__(self, lang, phrases=None):
        assert lang in ["en", "he"]
        self.lang = lang
        if lang == "en":
            self.letters = u'abcdefghijklmnopqrstuvwxyz'
        else:
            self.letters = hebrew.ALPHABET_22
        self.WORDS = defaultdict(int)
        if phrases:
            self.train_phrases(phrases)

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
    MIN_N_GRAM_SIZE = 3

    def __init__(self, lang, library):
        assert lang in ["en", "he"]
        self.lang = lang
        self.library = library
        self.token_to_titles = defaultdict(list)
        self.n_gram_to_tokens = defaultdict(set)

        title_node_dict = self.library.get_title_node_dict(self.lang)
        for title in title_node_dict.keys():
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
