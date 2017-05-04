# -*- coding: utf-8 -*-

"""
http://norvig.com/spell-correct.html
http://scottlobdell.me/2015/02/writing-autocomplete-engine-scratch-python/
"""
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


class SpellChecker(object):

    def __init__(self, lang):
        assert lang in ["en", "he"]
        if lang == "en":
            self.letters = u'abcdefghijklmnopqrstuvwxyz'
        else:
            self.letters = hebrew.ALPHABET_22
        self.WORDS = defaultdict(int)

    @staticmethod
    def words(text):
        return re.findall(r'\w+', text.lower())

    def train_phrases(self, phrases):
        for p in phrases:
            for w in self.words(p):
                self.WORDS[w] += 1

    def train_words(self, words):
        for w in words:
            self.WORDS[w] += 1

    def _edits1(self, word):
        """All edits that are one edit away from `word`."""
        splits     = [(word[:i], word[i:])    for i in range(len(word) + 1)]
        deletes    = [L + R[1:]               for L, R in splits if R]
        transposes = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R)>1]
        replaces   = [L + c + R[1:]           for L, R in splits if R for c in self.letters]
        inserts    = [L + c + R               for L, R in splits for c in self.letters]
        return set(deletes + transposes + replaces + inserts)

    def _known_edits2(self, word):
        """All edits that are two edits away from `word`."""
        return (e2 for e1 in self._edits1(word) for e2 in self._edits1(e1) if e2 in self.WORDS)

    def _known(self, words):
        "The subset of `words` that appear in the dictionary of WORDS."
        return set(w for w in words if w in self.WORDS)


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


