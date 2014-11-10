# -*- coding: utf-8 -*-

from sefaria.model.text import Library, Ref



def setup_module(module):
    global texts
    global refs
    global lib
    lib = Library()
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



class Test_get_refs_in_text(object):

    def test_bare_digits(self):
        assert set() == set(lib.get_refs_in_string(texts['barenum'])) # Fixed in 5a4b813819ef652def8360da2ac1b7539896c732

    def test_positions(self):
        for a in ['bible_mid','bible_begin', 'bible_end']:
            ref = lib.get_refs_in_string(texts[a])
            assert 1 == len(ref)
            assert ref[0] == Ref("Genesis 3:5")

    def test_multiple(self):
        ref = lib.get_refs_in_string(texts['2ref'])
        assert 2 == len(ref)
        assert set([Ref('Brachot 7b'), Ref('Isaiah 12:13')]) == set(lib.get_refs_in_string(texts['2ref']))


class Test_he_get_refs_in_text(object):
    def test_positions(self):
        for a in ['he_bible_mid', 'he_bible_begin', 'he_bible_end']:
            ref = lib.get_refs_in_string(texts[a])
            assert 1 == len(ref)
            assert ref[0] == Ref(u"שמות כא, ד")

    def test_false_positive(self):
        ref = lib.get_refs_in_string(texts['false_pos'])
        assert 1 == len(ref)
        assert ref[0] == Ref(u"דברים טז, יח")

    def test_divrei_hayamim(self):
        ref = lib.get_refs_in_string(u"(דברי הימים ב לב, יט)")
        assert 1 == len(ref)

    def test_double_ref_alt(self):
        ref = lib.get_refs_in_string(u"עמי הארץ (דברי הימים ב לב,יט), וכתיב (הושע ט ג): לא ישבו בארץ")
        assert 2 == len(ref)

    def test_double_ref(self):
        ref = lib.get_refs_in_string(texts['he_2ref'])
        assert 2 == len(ref)
        assert {Ref(u'הושע ט ג'), Ref(u'דברי הימים ב לב יט')} == set(ref)


    def test_double_talmud(self):
        """

        """
        ''' includes  ב''ק - why would that work?'''
        #ref = lib.get_refs_in_string(texts['2talmud'])
        #assert 2 == len(ref)
        ''' includes  ב"ק '''
        ref = lib.get_refs_in_string(texts['bk-abbrev'])
        assert 2 == len(ref)

    def test_out_of_brackets(self):
        ref = lib.get_refs_in_string(texts['ignored_middle'])
        assert 2 == len(ref)

    def test_double_quote_talmud(self):
        ref = lib.get_refs_in_string(texts['dq_talmud'])
        assert 1 == len(ref)
        assert Ref(u'יבמות ס"ה') == ref[0]

    def test_sefer_mitzvot(self):
        ref = lib.get_refs_in_string(texts['neg327'])
        assert 4 == len(ref)
        assert {Ref(u'ויקרא טז,כט'), Ref(u'ויקרא כג,כח'), Ref(u'ויקרא כג,לא'), Ref(u'במדבר כט,ז')} == set(ref)

    def test_three_digit_chapter(self):
        ref = lib.get_refs_in_string(texts['3dig'])
        assert 1 == len(ref)
        assert Ref(u'תהילים קי"ט') == ref[0]

    def test_with_lead(self):
        ref = lib.get_refs_in_string(texts['2with_lead'])
        assert 2 == len(ref)
        assert {Ref(u'דברים ד,ח'), Ref(u'דברים ד,ז')} == set(ref)

    def test_two_single_quotes(self):
        ref = lib.get_refs_in_string(u"עין ממש דכתיב (במדבר ל''ה) ולא תקחו")
        assert 1 == len(ref)
        assert ref[0] == Ref(u"במדבר ל''ה")

        ref = lib.get_refs_in_string(u"דאמר קרא (שופטים כ י''א) ויאסף כל איש")
        assert 1 == len(ref)
        assert ref[0] == Ref(u"שופטים כ י''א")

    def test_spelled_mishnah(self):
        ref = lib.get_refs_in_string(u'דתנן (טהרות פ"ג משנה ב) רמ אומר')
        assert 1 == len(ref)
        assert ref[0] == Ref(u'טהרות פ"ג משנה ב')


class Test_Library(object):
    def test_get_title_node_dict(self):
        lib.get_title_node_dict("en")