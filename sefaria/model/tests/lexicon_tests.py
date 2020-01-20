# -*- coding: utf-8 -*-
import pytest
from sefaria.model import *


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


