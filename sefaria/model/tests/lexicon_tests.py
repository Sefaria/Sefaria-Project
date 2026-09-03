# -*- coding: utf-8 -*-
import types
from unittest.mock import patch
import pytest
from sefaria.model import *
from sefaria.model.schema import DictionaryNode
from sefaria.model.lexicon import LexiconEntrySet


class Test_Lexicon_Lookup(object):

    def test_bible_lookup(self):
        word = "תִּשְׁמֹ֑רוּ"
        lookup_ref = "Leviticus 19.3"
        #["lookup_ref", "never_split", "always_split"]
        results = LexiconLookupAggregator.lexicon_lookup(word)
        results2 = LexiconLookupAggregator.lexicon_lookup(word, **{"lookup_ref": lookup_ref})
        results3 = LexiconLookupAggregator.lexicon_lookup(word, **{"always_split": 1})
        assert results.count() == 1
        assert results[0].headword == "שָׁמַר"
        assert results2.count() == 1
        assert results3.count() == 1

        word2 = "עִוֵּ֔ר"
        results = LexiconLookupAggregator.lexicon_lookup(word2)
        assert results.count() == 2

    def test_hts_lookup(self):
        word = "Ma'aser Sheni"
        word2 = "Am Ha'aretz"
        word3 = "Bikurim"
        lookup_ref = "Mishnah Maaser Sheni 3"
        # ["lookup_ref", "never_split", "always_split"]
        results = LexiconLookupAggregator.lexicon_lookup(word)
        results2 = LexiconLookupAggregator.lexicon_lookup(word, **{"lookup_ref": lookup_ref})
        results3 = LexiconLookupAggregator.lexicon_lookup(word, **{"always_split": 1})
        assert results.count() == 1
        assert results[0].headword == "מעשר שני"
        assert results2.count() == 1
        assert results3.count() == 1

        results = LexiconLookupAggregator.lexicon_lookup(word2)
        assert results.count() == 1

        results = LexiconLookupAggregator.lexicon_lookup(word3)
        assert results.count() == 1


class Test_Lexicon_Save(object):

    def test_sanitize(self):
        entry = {
            "plural_form": [

            ],
            "prev_hw": "א ⁶",
            "alt_headwords": [

            ],
            "next_hw": "אִ־",
            "parent_lexicon": "Jastrow Dictionary",
            "refs": [
                "Shabbat 104a"
            ],
            "content": {
                "senses": [
                    {
                        "definition": " as numeral letter, <i>one</i>, as <span dir=\"rtl\">אות א׳</span> = <span dir=\"rtl\">אות אחת</span> one letter. <a class=\"refLink\" href=\"/Shabbat.104a\" data-ref=\"Shabbat 104a\">Sabb. 104ᵃ</a>; a. fr. [Editions and Mss. vary, according to space, between the full numeral and the numeral letter, <a dir=\"rtl\" class=\"refLink\" href=\"/Jastrow,_א׳.1\" data-ref=\"Jastrow, א׳ 1\">א׳</a> for <span dir=\"rtl\">אחד</span>, <span dir=\"rtl\">אחת</span>; <a dir=\"rtl\" class=\"refLink\" href=\"/Jastrow,_ב׳.1\" data-ref=\"Jastrow, ב׳ 1\">ב׳</a> for <a dir=\"rtl\" class=\"refLink\" href=\"/Jastrow,_שְׁנַיִם.1\" data-ref=\"Jastrow, שְׁנַיִם 1\">שנים</a>, <span dir=\"rtl\">שתים</span>, <a dir=\"rtl\" class=\"refLink\" href=\"/Jastrow,_שתי.1\" data-ref=\"Jastrow, שתי 1\">שתי</a> &c.]"
                    },
                    {
                        "definition": 'Seemingly ok definition... <a href="javascript:alert(8007)">Click me</a>'
                    }
                ]
            },
            "quotes": [

            ],
            "headword": "א׳",
            "rid": "A00006"
        }
        l = JastrowDictionaryEntry(entry)
        l.save()
        print(l.content["senses"][0]["definition"])
        assert l.content["senses"][0]["definition"] == """ as numeral letter, <i>one</i>, as <span dir="rtl">אות א׳</span> = <span dir="rtl">אות אחת</span> one letter. <a class="refLink" data-ref="Shabbat 104a" href="/Shabbat.104a">Sabb. 104ᵃ</a>; a. fr. [Editions and Mss. vary, according to space, between the full numeral and the numeral letter, <a class="refLink" data-ref="Jastrow, א׳ 1" dir="rtl" href="/Jastrow,_א׳.1">א׳</a> for <span dir="rtl">אחד</span>, <span dir="rtl">אחת</span>; <a class="refLink" data-ref="Jastrow, ב׳ 1" dir="rtl" href="/Jastrow,_ב׳.1">ב׳</a> for <a class="refLink" data-ref="Jastrow, שְׁנַיִם 1" dir="rtl" href="/Jastrow,_שְׁנַיִם.1">שנים</a>, <span dir="rtl">שתים</span>, <a class="refLink" data-ref="Jastrow, שתי 1" dir="rtl" href="/Jastrow,_שתי.1">שתי</a> &amp;c.]"""
        assert l.content["senses"][1]["definition"] == 'Seemingly ok definition... <a>Click me</a>'
        l.delete()


class Test_DictionaryNode_AllChildren(object):
    """
    Tests for DictionaryNode.all_children(), which is memoized on self._all_children_cache
    to avoid re-querying Mongo (LexiconEntrySet + per-entry entry_class construction) on
    every call. See sefaria.model.schema.DictionaryNode.all_children.
    """

    # A small, real lexicon present in the test DB and mapped in
    # LexiconEntrySubClassMapping.lexicon_class_map, so DictionaryNode.__init__ can
    # resolve a dictionaryClass without falling back to the generic LexiconEntry.
    LEXICON_NAME = "Animadversions by Elias Levita on Sefer HaShorashim"

    def _make_dictionary_node(self):
        serial = {
            "lexiconName": self.LEXICON_NAME,
            "firstWord": "א",
            "lastWord": "ת",
            "nodeType": "DictionaryNode",
            "titles": [
                {"lang": "en", "text": "Animadversions", "primary": True},
                {"lang": "he", "text": "Animadversions", "primary": True},
            ],
        }
        return DictionaryNode(serial)

    def test_all_children_caches_lexicon_entry_set_query(self):
        """all_children() must only construct/query LexiconEntrySet once across multiple calls,
        even though it fully iterates each returned iterator every time."""
        dn = self._make_dictionary_node()

        call_count = 0
        real_lexicon_entry_set = LexiconEntrySet

        def spy(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return real_lexicon_entry_set(*args, **kwargs)

        with patch("sefaria.model.schema.LexiconEntrySet", side_effect=spy) as mock_les:
            for _ in range(3):
                children = list(dn.all_children())
                assert len(children) > 0
            assert mock_les.call_count == 1
            assert call_count == 1

    def test_all_children_matches_uncached_direct_query(self):
        """The sequence of children yielded by all_children() (by .word) must match a fresh,
        independent LexiconEntrySet enumeration (by .headword), in order."""
        dn = self._make_dictionary_node()

        cached_words = [child.word for child in dn.all_children()]

        fresh_entry_set = LexiconEntrySet({"parent_lexicon": self.LEXICON_NAME})
        fresh_headwords = [entry.headword for entry in fresh_entry_set]

        assert len(cached_words) > 0
        assert cached_words == fresh_headwords

    def test_all_children_returns_independent_iterators(self):
        """Calling all_children() twice on the same node instance must yield two independent
        iterators - fully consuming one must not exhaust the other."""
        dn = self._make_dictionary_node()

        iter_a = dn.all_children()
        iter_b = dn.all_children()

        words_a = [child.word for child in iter_a]
        words_b = [child.word for child in iter_b]

        assert len(words_a) > 0
        assert len(words_b) > 0
        assert words_a == words_b

    def test_all_children_caching_logic_without_mongo(self):
        """Safety-net test that proves out the caching behavior in isolation, without touching
        Mongo at all. Builds a bare test double (not a real DictionaryNode, since __init__
        requires Mongo via Lexicon().load) with just the attributes all_children() needs, and
        monkeypatches sefaria.model.schema.LexiconEntrySet with a fake in-memory implementation."""

        fake_entries = [
            types.SimpleNamespace(headword="alpha"),
            types.SimpleNamespace(headword="beta"),
            types.SimpleNamespace(headword="gamma"),
        ]

        call_count = 0

        class FakeLexiconEntrySet(object):
            def __init__(self, query=None):
                nonlocal call_count
                call_count += 1
                self._query = query

            def __iter__(self):
                return iter(fake_entries)

        class FakeEntryNode(object):
            def __init__(self, parent, lexicon_entry=None):
                self.word = lexicon_entry.headword

        class FakeDictionaryNode(object):
            lexiconName = "Fake Lexicon"
            entry_class = FakeEntryNode

            def __init__(self):
                self._all_children_cache = None

        fake_node = FakeDictionaryNode()

        with patch("sefaria.model.schema.LexiconEntrySet", FakeLexiconEntrySet):
            for _ in range(3):
                words = [child.word for child in DictionaryNode.all_children(fake_node)]
                assert words == ["alpha", "beta", "gamma"]
            assert call_count == 1

            iter_a = DictionaryNode.all_children(fake_node)
            iter_b = DictionaryNode.all_children(fake_node)
            words_a = [child.word for child in iter_a]
            words_b = [child.word for child in iter_b]
            assert words_a == ["alpha", "beta", "gamma"]
            assert words_b == ["alpha", "beta", "gamma"]
            assert call_count == 1

