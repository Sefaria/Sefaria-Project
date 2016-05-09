# -*- coding: utf-8 -*-
import pytest
from sefaria.model import *

class Test_Lexicon_Lookup(object):

    def test_bible_lookup(self):
        word = u"תִּשְׁמֹ֑רוּ"
        lookup_ref = "Leviticus 19.3"
        #["lookup_ref", "never_split", "always_split"]
        results = LexiconLookupAggregator.lexicon_lookup(word)
        results2 = LexiconLookupAggregator.lexicon_lookup(word, **{"lookup_ref": lookup_ref})
        results3 = LexiconLookupAggregator.lexicon_lookup(word, **{"always_split": 1})
        assert results.count() == 1
        assert results[0].headword == u"שָׁמַר"
        assert results2.count() == 1
        assert results3.count() == 1

        word2 = u"עִוֵּ֔ר"
        results = LexiconLookupAggregator.lexicon_lookup(word2)
        assert results.count() == 2


    def test_hts_lookup(self):
        word = "Ma'aser Sheni"
        word2 = "Am Ha'aretz"
        lookup_ref = "Mishnah Maaser Sheni 3"
        # ["lookup_ref", "never_split", "always_split"]
        results = LexiconLookupAggregator.lexicon_lookup(word)
        results2 = LexiconLookupAggregator.lexicon_lookup(word, **{"lookup_ref": lookup_ref})
        results3 = LexiconLookupAggregator.lexicon_lookup(word, **{"always_split": 1})
        assert results.count() == 1
        assert results[0].headword == u"מעשר שני"
        assert results2.count() == 1
        assert results3.count() == 1

        results = LexiconLookupAggregator.lexicon_lookup(word2)
        assert results.count() == 1
