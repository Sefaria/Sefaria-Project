# -*- coding: utf-8 -*-
import pytest

from .. import texts as t

#todo: simplify this file

def setup_module(module):
    global texts
    global refs
    texts = {}
    refs = {}
    texts['false_pos'] = u"תלמוד לומר (דברים טז, יח) שופטים תתן שוטרים"
    texts['bible_ref'] = u"אם נביא הוא נבואתו מסתלקת ממנו מדבורה דכתיב (שופטים ה, ז) חדלו פרזון בישראל"
    texts['bible_begin'] = u"(שמות כא, ד) אם אדוניו יתן לו אשה"  # These work, even though the presentation of the parens may be confusing.
    texts['bible_mid'] = u"בד (שמות כא, ד) אם אדוניו יתן לו"
    texts['bible_end'] = u"אמר קרא (שמות כא, ד)"
    texts['2ref'] = u"עמי הארץ (דברי הימים ב לב יט), וכתיב (הושע ט ג): לא ישבו בארץ"
    texts['neg327'] = u'שלא לעשות מלאכה ביום הכיפורים, שנאמר בו "כל מלאכה, לא תעשו" (ויקרא טז,כט; ויקרא כג,כח; ויקרא כג,לא; במדבר כט,ז).'
    texts['2talmud'] = u"ודין גזל קורה ובנאה בבירה מה יהא עליה (גיטין נה א). ודין גזל בישוב ורצה להחזיר במדבר (ב''ק קיח א). ודין גזל והקדיש"
    texts['bk-abbrev'] = u"ודין גזל קורה ובנאה בבירה מה יהא עליה (גיטין נה א). ודין גזל בישוב ורצה להחזיר במדבר (ב\"ק קיח א). ודין גזל והקדיש"
    texts['dq_talmud'] = u'(יבמות ס"ה)'
    texts['sq_talmud'] = u""  # Need to find one in the wild
    texts['3dig'] = u'(תהילים קי"ט)'
    texts['2with_lead'] = u'(ראה דברים ד,ז; דברים ד,ח)'
    texts['ignored_middle'] = u'(תהלים לז, א) אל תתחר במרעים ולא עוד אלא שדרכיו מצליחין שנא תהלים י, ה יחילו דרכיו בכל עת ולא עוד אלא שזוכה בדין שנאמר מרום משפטיך מנגדו ולא עוד אלא שרואה בשונאיו שנאמר כל צורריו יפיח בהם איני והאמר ר יוחנן משום רש בן יוחי מותר להתגרות ברשעים בעולם הזה שנא (משלי כח, ד)'


class Test_parse_he_ref():
    def test_simple_bible(self):
        r = t.parse_ref(u"שמות כא, ד")
        assert "error" not in r
        assert r['book'] == 'Exodus'
        assert r['sections'][0] == 21
        assert r['sections'][1] == 4

        r = t.parse_ref(u"דברים טז, יח")
        assert "error" not in r
        assert r['book'] == 'Deuteronomy'
        assert r['sections'][0] == 16
        assert r['sections'][1] == 18

        r = t.parse_ref(u'תהילים קי"ט')
        assert "error" not in r
        assert r['book'] == 'Psalms'
        assert r['sections'][0] == 119
        assert len(r['sections']) == 1

        r = t.parse_ref(u'בראשית כז.ג')
        assert "error" not in r
        assert r['book'] == 'Genesis'
        assert r['sections'][0] == 27
        assert r['sections'][1] == 3

    def test_divrei_hayamim(self):
        r = t.parse_ref(u'דברי הימים ב לב יט')
        assert "error" not in r
        assert r['book'] == 'II Chronicles'
        assert r['sections'][0] == 32
        assert r['sections'][1] == 19

        r = t.parse_ref(u'דברי הימים ב לב')
        assert "error" not in r
        assert r['book'] == 'II Chronicles'
        assert r['sections'][0] == 32
        assert len(r['sections']) == 1


    def test_talmud(self):
        r = t.parse_ref(u'יבמות ס"ה')
        assert "error" not in r
        assert r['book'] == 'Yevamot'
        assert r['sections'][0] == 129
        assert len(r['sections']) == 1

        r = t.parse_ref(u"שבת ד' כב.")
        assert "error" not in r
        assert r['book'] == 'Shabbat'
        assert r['sections'][0] == 43
        assert len(r['sections']) == 1

        r = t.parse_ref(u"פסחים ד' נח:")
        assert "error" not in r
        assert r['book'] == 'Pesachim'
        assert r['sections'][0] == 116
        assert len(r['sections']) == 1

        r = t.parse_ref(u"מנחות ד' מט.")
        assert "error" not in r
        assert r['book'] == 'Menachot'
        assert r['sections'][0] == 97
        assert len(r['sections']) == 1

        r = t.parse_ref(u"מנחות כט א")
        assert "error" not in r
        assert r['book'] == 'Menachot'
        assert r['sections'][0] == 57
        assert len(r['sections']) == 1

        r = t.parse_ref(u"מנחות כט ב")
        assert "error" not in r
        assert r['book'] == 'Menachot'
        assert r['sections'][0] == 58
        assert len(r['sections']) == 1


    def test_bible_word_end(self):
        r = t.parse_ref(u'דברים לברק')
        assert "error" in r

        r = t.parse_ref(u'דברים א לברק')
        assert "error" not in r
        assert r['sections'][0] == 1
        assert len(r['sections']) == 1


    def test_talmud_word_end(self):
        r = t.parse_ref(u"מנחות כט בג")
        assert "error" not in r
        assert r['book'] == 'Menachot'
        assert r['sections'][0] == 57  # 57 = daf a, not 58 = daf b
        assert len(r['sections']) == 1

        r = t.parse_ref(u"מנחות כטר")
        assert "error" in r


    def test_pehmem_form(self):
        r = t.parse_ref(u'פרה פ"ח מ"ז')
        assert "error" not in r
        assert r['book'] == 'Mishnah Parah'
        assert r['sections'][0] == 8
        assert r['sections'][1] == 7
        assert len(r['sections']) == 2

        r = t.parse_ref(u'מנחות פ"ח')
        assert "error" not in r
        assert r['book'] == 'Menachot'
        assert r['sections'][0] == 175
        assert len(r['sections']) == 1

        r = t.parse_ref(u'מנחות פ"ח מ"ז')
        assert "error" not in r
        assert r['book'] == 'Mishnah Menachot'
        assert r['sections'][0] == 8
        assert r['sections'][1] == 7
        assert len(r['sections']) == 2


    def test_perek_form(self):
        r = t.parse_ref(u'אבות פרק ד')
        assert "error" not in r
        assert r['book'] == 'Pirkei Avot'
        assert r['sections'][0] == 4
        assert len(r['sections']) == 1

    def test_peh_form(self):
        r = t.parse_ref(u'אבות פ"ד')
        assert "error" not in r
        assert r['book'] == 'Pirkei Avot'
        assert r['sections'][0] == 4
        assert len(r['sections']) == 1

    def test_two_single_quotes(self):
        r = t.parse_ref(u"שמות כ''ב")
        assert "error" not in r
        assert r['book'] == 'Exodus'
        assert len(r['sections']) == 1
        assert r['sections'][0] == 22

        r = t.parse_ref(u"במדבר ל''ה")
        assert "error" not in r
        assert r['book'] == 'Numbers'
        assert len(r['sections']) == 1
        assert r['sections'][0] == 35

        r = t.parse_ref(u"שופטים כ י''א")
        assert "error" not in r
        assert r['book'] == 'Judges'
        assert len(r['sections']) == 2
        assert r['sections'][0] == 20
        assert r['sections'][1] == 11


    def test_peh_and_spelled_mishnah(self):
        r = t.parse_ref(u'טהרות פ"ג משנה ב')
        assert "error" not in r
        assert r['book'] == 'Mishnah Tahorot'
        assert len(r['sections']) == 2
        assert r['sections'][0] == 3
        assert r['sections'][1] == 2

    def test_spelled_perek_and_mem(self):
        r = t.parse_ref(u'טהרות פרק ג מ״ב')
        assert "error" not in r
        assert r['book'] == 'Mishnah Tahorot'
        assert len(r['sections']) == 2
        assert r['sections'][0] == 3
        assert r['sections'][1] == 2

    def test_spelled_perek_and_mishnah(self):
        r = t.parse_ref(u'טהרות פרק ג משנה ב')
        assert "error" not in r
        assert r['book'] == 'Mishnah Tahorot'
        assert len(r['sections']) == 2
        assert r['sections'][0] == 3
        assert r['sections'][1] == 2

class Test_get_refs_in_text():
    def test_positions(self):
        for a in ['bible_mid', 'bible_begin', 'bible_end']:
            ref = t.get_refs_in_text(texts[a])
            assert 1 == len(ref)
            assert ref[0] == u"שמות כא, ד"

    def test_false_positive(self):
        ref = t.get_refs_in_text(texts['false_pos'])
        assert 1 == len(ref)
        assert ref[0] == u"דברים טז, יח"

    def test_double_ref(self):
        ref = t.get_refs_in_text(texts['2ref'])
        assert 2 == len(ref)
        assert {u'הושע ט ג', u'דברי הימים ב לב יט'} == set(ref)

    ''' includes  ב''ק '''

    def test_double_talmud(self):
        ref = t.get_refs_in_text(texts['2talmud'])
        assert 2 == len(ref)

    ''' includes  ב"ק '''

    def test_double_talmud(self):
        ref = t.get_refs_in_text(texts['bk-abbrev'])
        assert 2 == len(ref)

    def test_out_of_brackets(self):
        ref = t.get_refs_in_text(texts['ignored_middle'])
        assert 2 == len(ref)

    def test_double_quote_talmud(self):
        ref = t.get_refs_in_text(texts['dq_talmud'])
        assert 1 == len(ref)
        assert u'יבמות ס"ה' == ref[0]

    def test_sefer_mitzvot(self):
        ref = t.get_refs_in_text(texts['neg327'])
        assert 4 == len(ref)
        assert {u'ויקרא טז,כט', u'ויקרא כג,כח', u'ויקרא כג,לא', u'במדבר כט,ז'} == set(ref)

    def test_three_digit_chapter(self):
        ref = t.get_refs_in_text(texts['3dig'])
        assert 1 == len(ref)
        assert u'תהילים קי"ט' == ref[0]

    def test_with_lead(self):
        ref = t.get_refs_in_text(texts['2with_lead'])
        assert 2 == len(ref)
        assert {u'דברים ד,ח', u'דברים ד,ז'} == set(ref)

    def test_two_single_quotes(self):
        ref = t.get_refs_in_text(u"עין ממש דכתיב (במדבר ל''ה) ולא תקחו")
        assert 1 == len(ref)
        assert ref[0] == u"במדבר ל''ה"

        ref = t.get_refs_in_text(u"דאמר קרא (שופטים כ י''א) ויאסף כל איש")
        assert 1 == len(ref)
        assert ref[0] == u"שופטים כ י''א"

    def test_spelled_mishnah(self):
        ref = t.get_refs_in_text(u'דתנן (טהרות פ"ג משנה ב) רמ אומר')
        assert 1 == len(ref)
        assert ref[0] == u'טהרות פ"ג משנה ב'


class Test_get_titles_in_text():
    def test_bible_ref(self):
        res = t.get_titles_in_text(texts['bible_ref'], "he")
        assert set(res) >= set([u"שופטים"])

        res = t.get_titles_in_text(texts['false_pos'], "he")
        assert set(res) >= set([u"שופטים", u"דברים"])

    def test_positions(self):
        for a in ['bible_mid', 'bible_begin', 'bible_end']:
            assert set([u"שמות"]) <= set(t.get_titles_in_text(texts[a], "he"))
