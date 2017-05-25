# -*- coding: utf-8 -*-

import pytest
from sefaria.model.text import library, Ref, Index



def setup_module(module):
    global texts
    global refs
    texts = {}
    refs = {}
    texts['bible_mid'] = u"Here we have Genesis 3:5 may it be blessed"
    texts['bible_begin'] = u"Genesis 3:5 in the house"
    texts['bible_end'] = u"Let there be Genesis 3:5"
    texts['2ref'] = u"This is a test of a Brachot 7b and also of an Isaiah 12:13."
    texts['barenum'] = u"In this text, there is no reference but there is 1 bare number."

    texts['false_pos'] = u"תלמוד לומר (דברים טז, יח) שופטים תתן שוטרים"
    texts['bible_ref'] = u"אם נביא הוא נבואתו מסתלקת ממנו מדבורה דכתיב (שופטים ה, ז) חדלו פרזון בישראל"
    texts['he_bible_begin'] = u"(שמות כא, ד) אם אדוניו יתן לו אשה"  # These work, even though the presentation of the parens may be confusing.
    texts['he_bible_mid'] = u"בד (שמות כא, ד) אם אדוניו יתן לו"
    texts['he_bible_end'] = u"אמר קרא (שמות כא, ד)"
    texts['he_2ref'] = u"עמי הארץ (דברי הימים ב לב יט), וכתיב (הושע ט ג): לא ישבו בארץ"
    texts['neg327'] = u'שלא לעשות מלאכה ביום הכיפורים, שנאמר בו "כל מלאכה, לא תעשו" (ויקרא טז,כט; ויקרא כג,כח; ויקרא כג,לא; במדבר כט,ז).'
    texts['2talmud'] = u"ודין גזל קורה ובנאה בבירה מה יהא עליה (גיטין נה א). ודין גזל בישוב ורצה להחזיר במדבר (ב''ק קיח א). ודין גזל והקדיש"
    texts['bk-abbrev'] = u"ודין גזל קורה ובנאה בבירה מה יהא עליה (גיטין נה א). ודין גזל בישוב ורצה להחזיר במדבר (ב\"ק קיח א). ודין גזל והקדיש"
    texts['dq_talmud'] = u'(יבמות ס"ה)'
    texts['sq_talmud'] = u""  # Need to find one in the wild
    texts['3dig'] = u'(תהילים קי"ט)'
    texts['2with_lead'] = u'(ראה דברים ד,ז; דברים ד,ח)'
    texts['ignored_middle'] = u'(תהלים לז, א) אל תתחר במרעים ולא עוד אלא שדרכיו מצליחין שנא תהלים י, ה יחילו דרכיו בכל עת ולא עוד אלא שזוכה בדין שנאמר מרום משפטיך מנגדו ולא עוד אלא שרואה בשונאיו שנאמר כל צורריו יפיח בהם איני והאמר ר יוחנן משום רש בן יוחי מותר להתגרות ברשעים בעולם הזה שנא (משלי כח, ד)'
    texts['weird_ref'] = u"In this string The Book of Maccabees I 1.2 should match the long regex only, but Leviticus 12.4 should match both of them"
    texts['weird_ref_he'] = u"המקור (ספר מקבים א א ב) אמור לעבוד רק בחיפוש המלא, אבל המקור (ויקרא יב ד) צריך לעבוד בשניהם"


class Test_get_refs_in_text(object):

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_bare_digits(self, citing_only):
        assert set() == set(library.get_refs_in_string(texts['barenum'], citing_only=citing_only)) # Fixed in 5a4b813819ef652def8360da2ac1b7539896c732

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_positions(self, citing_only):
        for a in ['bible_mid','bible_begin', 'bible_end']:
            ref = library.get_refs_in_string(texts[a], citing_only=citing_only)
            assert 1 == len(ref)
            assert ref[0] == Ref("Genesis 3:5")

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_multiple(self, citing_only):
        ref = library.get_refs_in_string(texts['2ref'], citing_only=citing_only)
        assert 2 == len(ref)
        assert {Ref('Brachot 7b'), Ref('Isaiah 12:13')} == set(library.get_refs_in_string(texts['2ref'], citing_only=True))

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_inner_parenthesis(self, citing_only):

        ref = library.get_refs_in_string(u"Bereishit Rabbah (55:7)", "en", citing_only=citing_only)
        assert 1 == len(ref)
        assert ref[0] == Ref(u'Bereshit Rabbah 55:7')

        ''' Ranges not yet supported
        ref = library.get_refs_in_string(u"Yishayahu (64:9-10)", "en")
        assert 1 == len(ref)
        assert ref[0] == Ref(u'Isiah 64:9-10')
        '''

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_commentary(self, citing_only):
        s = "Here's one with Rashi on Genesis 2:5:3"
        s2 = "Here's one with both Rashi on Genesis 3:4 and Exodus 5:2. yeah"
        s3 = "Here's one with Genesis 2:3"
        assert library.get_refs_in_string(s, "en", citing_only=citing_only) == [Ref("Rashi on Genesis 2:5:3")]
        assert library.get_refs_in_string(s2, "en", citing_only=citing_only) == [Ref("Rashi on Genesis 3:4"), Ref("Exodus 5:2")]
        assert library.get_refs_in_string(s3, "en", citing_only=citing_only) == [Ref("Genesis 2:3")]

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_citing_only(self, citing_only):
        matched_refs = library.get_refs_in_string(texts['weird_ref'], lang='en', citing_only=citing_only)
        if citing_only:
            assert matched_refs == [Ref("Leviticus 12.4")]
        else:
            assert matched_refs == [Ref("The Book of Maccabees I 1.2"), Ref("Leviticus 12.4")]


    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_supposed_ref_graceful_fail(self, citing_only):
        matched_refs = library.get_refs_in_string(u"What's important is that you get the Job done.", lang='en', citing_only=citing_only)
        assert matched_refs == []


class Test_he_get_refs_in_text(object):
    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_positions(self, citing_only):
        for a in ['he_bible_mid', 'he_bible_begin', 'he_bible_end']:
            ref = library.get_refs_in_string(texts[a], citing_only=citing_only)
            assert 1 == len(ref)
            assert ref[0] == Ref(u"שמות כא, ד")

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_false_positive(self, citing_only):
        ref = library.get_refs_in_string(texts['false_pos'], citing_only=citing_only)
        assert 1 == len(ref)
        assert ref[0] == Ref(u"דברים טז, יח")

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_divrei_hayamim(self, citing_only):
        ref = library.get_refs_in_string(u"(דברי הימים ב לב, יט)", citing_only=citing_only)
        assert 1 == len(ref)

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_double_ref_alt(self, citing_only):
        ref = library.get_refs_in_string(u"עמי הארץ (דברי הימים ב לב,יט), וכתיב (הושע ט ג): לא ישבו בארץ", citing_only=citing_only)
        assert 2 == len(ref)

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_double_ref(self, citing_only):
        ref = library.get_refs_in_string(texts['he_2ref'], citing_only=citing_only)
        assert 2 == len(ref)
        assert {Ref(u'הושע ט ג'), Ref(u'דברי הימים ב לב יט')} == set(ref)

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_double_talmud(self, citing_only):
        ''' includes  ב''ק - why would that work?'''
        #ref = lib.get_refs_in_string(texts['2talmud'])
        #assert 2 == len(ref)
        ''' includes  ב"ק '''
        ref = library.get_refs_in_string(texts['bk-abbrev'], citing_only=citing_only)
        assert 2 == len(ref)

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_out_of_brackets(self, citing_only):
        ref = library.get_refs_in_string(texts['ignored_middle'], citing_only=citing_only)
        assert 2 == len(ref)

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_double_quote_talmud(self, citing_only):
        ref = library.get_refs_in_string(texts['dq_talmud'], citing_only=citing_only)
        assert 1 == len(ref)
        assert Ref(u'יבמות ס"ה') == ref[0]

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_sefer_mitzvot(self, citing_only):
        ref = library.get_refs_in_string(texts['neg327'], citing_only=citing_only)
        assert 4 == len(ref)
        assert {Ref(u'ויקרא טז,כט'), Ref(u'ויקרא כג,כח'), Ref(u'ויקרא כג,לא'), Ref(u'במדבר כט,ז')} == set(ref)

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_three_digit_chapter(self, citing_only):
        ref = library.get_refs_in_string(texts['3dig'], citing_only=citing_only)
        assert 1 == len(ref)
        assert Ref(u'תהילים קי"ט') == ref[0]

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_with_lead(self, citing_only):
        ref = library.get_refs_in_string(texts['2with_lead'], citing_only=citing_only)
        assert 2 == len(ref)
        assert {Ref(u'דברים ד,ח'), Ref(u'דברים ד,ז')} == set(ref)

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_two_single_quotes(self, citing_only):
        ref = library.get_refs_in_string(u"עין ממש דכתיב (במדבר ל''ה) ולא תקחו", citing_only=citing_only)
        assert 1 == len(ref)
        assert ref[0] == Ref(u"במדבר ל''ה")

        ref = library.get_refs_in_string(u"דאמר קרא (שופטים כ י''א) ויאסף כל איש", citing_only=True)
        assert 1 == len(ref)
        assert ref[0] == Ref(u"שופטים כ י''א")

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_spelled_mishnah(self, citing_only):
        ref = library.get_refs_in_string(u'דתנן (טהרות פ"ג משנה ב) רמ אומר', citing_only=citing_only)
        assert 1 == len(ref)
        assert ref[0] == Ref(u'טהרות פ"ג משנה ב')

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_beyond_length(self, citing_only):
        ref = library.get_refs_in_string(u'דתנן (דברים שם) דכל (דברים ל, א) צריך', citing_only=citing_only)
        assert 1 == len(ref)
        assert ref[0] == Ref(u'דברים ל, א')

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_word_boundary(self, citing_only):
        st = u' את הכל, ובאגדה (אסתר רבה פתיחתא, יא) שמעון בן זומא בשם'
        ref = library.get_refs_in_string(st, citing_only=citing_only)
        assert len(ref) == 0

        #Assumes that Yalkut Shimoni Esther is not a text
        st = u"""ובמדרש (ילקוט שמעוני אסתר א, סי' חתרמ"ו) מהיכן היה לו"""
        ref = library.get_refs_in_string(st, citing_only=True)
        assert len(ref) == 1
        assert ref[0].sections[0] == 1
        assert len(ref[0].sections) == 1

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_nikkud_stripping(self, citing_only):
        st = u' בִּשְׁמוֹ שֶׁאָמַר שֶׁזֶּה בְּחִינַת (יְשְׁעַיָה ל"ח): "וַיַּסֵּב חִזְקִיָּהוּ פָּנָיו'
        ref = library.get_refs_in_string(st, citing_only=citing_only)
        assert len(ref) == 1

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_citing_only_he(self, citing_only):
        matched_refs = library.get_refs_in_string(texts['weird_ref_he'], lang='he', citing_only=citing_only)
        if citing_only:
            assert matched_refs == [Ref("Leviticus 12.4")]
        else:
            assert matched_refs == [Ref("Leviticus 12.4"), Ref("The Book of Maccabees I 1.2")]

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_supposed_ref_graceful_fail(self, citing_only):
        matched_refs = library.get_refs_in_string(u"אלו דברים בני ישראל", lang='he', citing_only=citing_only)
        assert matched_refs == []

    @pytest.mark.failing
    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_huge_second_addr(self, citing_only):
        st = u"""וכן הוא בב"ר (ילקוט שמעוני אסתר א, תתרמו) א"ר לוי בגדי כהונה"""
        ref = library.get_refs_in_string(st, citing_only=citing_only)[0]
        assert ref.sections[0] == 1
        assert len(ref.sections) == 1

        ''' These only work in the js
        ref = library.get_refs_in_string(u'במסכת שבועות (ל, ע"א) - כיצד אפוא', "he")
        assert 1 == len(ref)
        assert ref[0] == Ref(u'Shavuot 30a')

        ref = library.get_refs_in_string(u"במשנה, מסכת נדה (פרק ו, משנה ד), נקבע", "he")
        assert 1 == len(ref)
        assert ref[0] == Ref(u'Mishnah Nidah 6:4')
        '''


class Test_get_titles_in_text(object):

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_no_bare_number(self, citing_only):
        barenum = u"In this text, there is no reference but there is 1 bare number."
        res = library.get_titles_in_string(barenum, citing_only=citing_only)
        assert set(res) == set()

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_positions(self, citing_only):
        bible_mid = u"Here we have Genesis 3:5 may it be blessed"
        bible_begin = u"Genesis 3:5 in the house"
        bible_end = u"Let there be Genesis 3:5"
        for a in [bible_mid, bible_begin, bible_end]:
            assert {'Genesis'} <= set(library.get_titles_in_string(a, citing_only=citing_only))

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_multi_titles(self, citing_only):
        two_ref = u"This is a test of a Brachot 7b and also of an Isaiah 12:13."
        res = library.get_titles_in_string(two_ref, citing_only=citing_only)
        assert set(res) >= {'Brachot', 'Isaiah'}

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_he_bible_ref(self, citing_only):
        bible_ref = u"אם נביא הוא נבואתו מסתלקת ממנו מדבורה דכתיב (שופטים ה, ז) חדלו פרזון בישראל"
        false_pos = u"תלמוד לומר (דברים טז, יח) שופטים תתן שוטרים"

        res = library.get_titles_in_string(bible_ref, "he", citing_only=citing_only)
        assert set(res) >= {u"שופטים"}

        res = library.get_titles_in_string(false_pos, "he", citing_only=citing_only)
        assert set(res) >= {u"שופטים", u"דברים"}

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_he_positions(self, citing_only):
        bible_begin = u"(שמות כא, ד) אם אדוניו יתן לו אשה"  # These work, even though the presentation of the parens may be confusing.
        bible_mid = u"בד (שמות כא, ד) אם אדוניו יתן לו"
        bible_end = u"אמר קרא (שמות כא, ד)"
        for a in [bible_mid, bible_begin, bible_end]:
            assert {u"שמות"} <= set(library.get_titles_in_string(a, "he", citing_only=citing_only))

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_citing_only_en(self, citing_only):
        titles = library.get_titles_in_string(texts['weird_ref'], lang='en', citing_only=citing_only)
        if citing_only:
            assert set(titles) == {'Leviticus'}
        else:
            assert set(titles) == {'Leviticus', 'The Book of Maccabees I'}

    @pytest.mark.parametrize(('citing_only'), (True, False))
    def test_citing_only_he(self, citing_only):
        titles = library.get_titles_in_string(texts['weird_ref_he'], lang='he', citing_only=citing_only)
        if citing_only:
            assert set(titles) == {u'ויקרא'}
        else:
            assert set(titles) == {u'ויקרא', u'ספר מקבים א'}


class Test_Library(object):
    def test_cache_populated_on_instanciation(self):
        assert library._index_map
        assert "en" in library.langs
        assert "he" in library.langs
        for lang in library.langs:
            assert library._index_title_maps[lang]
            with pytest.raises(Exception):
                assert library._index_title_commentary_maps[lang] #should not exist anymore
            assert library._title_node_maps[lang]
            with pytest.raises(Exception):
                assert library._title_node_with_commentary_maps[lang]

    def test_all_index_caches_removed_and_added_simple(self):

        assert "Genesis" in library._index_map
        assert "Bereishit" in library._index_title_maps["en"]["Genesis"]
        assert "Bereishit" in library._title_node_maps["en"]
        assert u"בראשית" in library._index_title_maps["he"]["Genesis"]
        assert u"בראשית" in library._title_node_maps["he"]

        library.remove_index_record_from_cache(library.get_index("Genesis"))

        assert "Genesis" not in library._index_map
        assert "Genesis" not in  library._index_title_maps["en"]
        assert "Bereishit" not in library._title_node_maps["en"]
        assert "Genesis" not in library._index_title_maps["he"]
        assert u"בראשית" not in library._title_node_maps["he"]

        library.add_index_record_to_cache(Index().load({"title": "Genesis"}))

        assert "Genesis" in library._index_map
        assert "Bereishit" in library._index_title_maps["en"]["Genesis"]
        assert "Bereishit" in library._title_node_maps["en"]
        assert u"בראשית" in library._index_title_maps["he"]["Genesis"]
        assert u"בראשית" in library._title_node_maps["he"]


    def test_all_index_caches_removed_and_added_commentary(self):
        assert "Rashi on Genesis" in library._index_map
        assert "Rashi on Bereishit" in library._title_node_maps["en"]
        assert "Rashi on Bereishit" in library._index_title_maps["en"]["Rashi on Genesis"]
        assert u'רש"י על בראשית' in library._index_title_maps["he"]["Rashi on Genesis"]
        assert u'רש"י על בראשית' in library._title_node_maps["he"]

        library.remove_index_record_from_cache(library.get_index("Rashi on Genesis"))

        assert "Rashi on Genesis" not in library._index_map
        assert "Rashi on Bereishit" not in library._title_node_maps["en"]
        assert "Rashi on Genesis" not in library._index_title_maps["en"]
        assert "Rashi on Genesis" not in library._index_title_maps["he"]
        assert u'רש"י על בראשית' not in library._title_node_maps["he"]

        library.add_index_record_to_cache(Index().load({"title": "Rashi on Genesis"}))

        assert "Rashi on Genesis" in library._index_map
        assert "Rashi on Bereishit" in library._title_node_maps["en"]
        assert "Rashi on Bereishit" in library._index_title_maps["en"]["Rashi on Genesis"]
        assert u'רש"י על בראשית' in library._index_title_maps["he"]["Rashi on Genesis"]
        assert u'רש"י על בראשית' in library._title_node_maps["he"]


    def test_get_title_node(self):
        node = library.get_schema_node("Exodus")
        assert node.is_flat()
        assert node.primary_title() == "Exodus"
        assert node.primary_title("he") == u"שמות"
        n2 = library.get_schema_node(u"שמות", "he")
        assert node == n2


def test_get_en_text_titles():
    txts = [u'Avot', u'Avoth', u'Daniel', u'Dan', u'Dan.'] # u"Me'or Einayim, Vayera"
    ctxts = [u'Rashi on Exodus', u'Ramban on Genesis', u'Tosafot on Shabbat', u'Rashi on Gen.', u'Nachmanides on Exodus', u'Nachmanides on Ex.']
    titles = library.full_title_list()
    for txt in txts:
        assert txt in titles
    for txt in ctxts:
        assert txt in titles



def test_get_he_text_titles():
    txts = [u'\u05d1\u05e8\u05d0\u05e9\u05d9\u05ea', u'\u05e9\u05de\u05d5\u05ea', u'\u05d5\u05d9\u05e7\u05e8\u05d0', u'רש"י על בראשית']
    titles = library.full_title_list(lang="he")
    for txt in txts:
        assert txt in titles

