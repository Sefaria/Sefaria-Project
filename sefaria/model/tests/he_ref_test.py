# -*- coding: utf-8 -*-

import django
django.setup()
import pytest
from sefaria.system.exceptions import InputError

import sefaria.model as m

#todo: simplify this file

def setup_module(module):
    global texts
    global refs
    texts = {}
    refs = {}
    texts['false_pos'] = "תלמוד לומר (דברים טז, יח) שופטים תתן שוטרים"
    texts['bible_ref'] = "אם נביא הוא נבואתו מסתלקת ממנו מדבורה דכתיב (שופטים ה, ז) חדלו פרזון בישראל"
    texts['bible_begin'] = "(שמות כא, ד) אם אדוניו יתן לו אשה"  # These work, even though the presentation of the parens may be confusing.
    texts['bible_mid'] = "בד (שמות כא, ד) אם אדוניו יתן לו"
    texts['bible_end'] = "אמר קרא (שמות כא, ד)"
    texts['2ref'] = "עמי הארץ (דברי הימים ב לב יט), וכתיב (הושע ט ג): לא ישבו בארץ"
    texts['neg327'] = 'שלא לעשות מלאכה ביום הכיפורים, שנאמר בו "כל מלאכה, לא תעשו" (ויקרא טז,כט; ויקרא כג,כח; ויקרא כג,לא; במדבר כט,ז).'
    texts['2talmud'] = "ודין גזל קורה ובנאה בבירה מה יהא עליה (גיטין נה א). ודין גזל בישוב ורצה להחזיר במדבר (ב''ק קיח א). ודין גזל והקדיש"
    texts['bk-abbrev'] = "ודין גזל קורה ובנאה בבירה מה יהא עליה (גיטין נה א). ודין גזל בישוב ורצה להחזיר במדבר (ב\"ק קיח א). ודין גזל והקדיש"
    texts['dq_talmud'] = '(יבמות ס"ה)'
    texts['sq_talmud'] = ""  # Need to find one in the wild
    texts['3dig'] = '(תהילים קי"ט)'
    texts['2with_lead'] = '(ראה דברים ד,ז; דברים ד,ח)'
    texts['ignored_middle'] = '(תהלים לז, א) אל תתחר במרעים ולא עוד אלא שדרכיו מצליחין שנא תהלים י, ה יחילו דרכיו בכל עת ולא עוד אלא שזוכה בדין שנאמר מרום משפטיך מנגדו ולא עוד אלא שרואה בשונאיו שנאמר כל צורריו יפיח בהם איני והאמר ר יוחנן משום רש בן יוחי מותר להתגרות ברשעים בעולם הזה שנא (משלי כח, ד)'


class Test_parse_he_ref(object):
    def test_simple_bible(self):
        r = m.Ref("שמות כא, ד")
        assert r.book == 'Exodus'
        assert r.sections[0] == 21
        assert r.sections[1] == 4

        r = m.Ref("דברים טז, יח")
        assert r.book == 'Deuteronomy'
        assert r.sections[0] == 16
        assert r.sections[1] == 18

        r = m.Ref('תהילים קי"ט')
        assert r.book == 'Psalms'
        assert r.sections[0] == 119
        assert len(r.sections) == 1

        r = m.Ref('בראשית כז.ג')
        assert r.book == 'Genesis'
        assert r.sections[0] == 27
        assert r.sections[1] == 3

    def test_divrei_hayamim(self):
        r = m.Ref('דברי הימים ב לב יט')
        assert r.book == 'II Chronicles'
        assert r.sections[0] == 32
        assert r.sections[1] == 19

        r = m.Ref('דברי הימים ב לב')
        assert r.book == 'II Chronicles'
        assert r.sections[0] == 32
        assert len(r.sections) == 1


    def test_talmud(self):
        r = m.Ref('יבמות ס"ה')
        assert r.book == 'Yevamot'
        assert r.sections[0] == 129
        assert len(r.sections) == 1

        r = m.Ref("שבת ד' כב.")
        assert r.book == 'Shabbat'
        assert r.sections[0] == 43
        assert len(r.sections) == 1

        r = m.Ref("בבא מציעא נח:")
        assert r.book == 'Bava Metzia'
        assert r.sections[0] == 116
        assert len(r.sections) == 1

        r = m.Ref("פסחים ד' נח:")
        assert r.book == 'Pesachim'
        assert r.sections[0] == 116
        assert len(r.sections) == 1

        r = m.Ref("מנחות ד' מט.")
        assert r.book == 'Menachot'
        assert r.sections[0] == 97
        assert len(r.sections) == 1

        r = m.Ref("מנחות כט א")
        assert r.book == 'Menachot'
        assert r.sections[0] == 57
        assert len(r.sections) == 1

        r = m.Ref("מנחות כט ב")
        assert r.book == 'Menachot'
        assert r.sections[0] == 58
        assert len(r.sections) == 1

        r = m.Ref("סוטה לה א:יא")
        assert r.book == 'Sotah'
        assert r.sections == [69, 11]

    def test_length_catching(self):
        with pytest.raises(InputError):
            r = m.Ref('דברים שם')

        with pytest.raises(InputError):
            r = m.Ref('דברים שם, שם')

    def test_talmud_ayin_amud_form(self):
        r = m.Ref('סוטה דף מ"ה ע"ב')
        assert r.sections[0] == 90
        assert len(r.sections) == 1
        r = m.Ref("סוטה דף מ''ה ע''ב")
        assert r.sections[0] == 90
        assert len(r.sections) == 1


    def test_talmud_refs_with_amud(self):
        assert m.Ref("ברכות ח.") == m.Ref("Berakhot 8a")
        assert m.Ref("ברכות ח:") == m.Ref("Berakhot 8b")
        assert m.Ref("ברכות ח, א") == m.Ref("Berakhot 8a")
        assert m.Ref("""ברכות ח ע"ב""") == m.Ref("Berakhot 8b")
        assert m.Ref("""ברכות י"א עמוד ב'""") == m.Ref("Berakhot 11b")
        assert m.Ref("""ברכות דף י"א עמוד ב'""") == m.Ref("Berakhot 11b")


    def test_talmud_refs_without_amud(self):
        assert m.Ref("ברכות ח") == m.Ref("Berakhot 8a-8b")
        assert m.Ref("ברכות ב") == m.Ref("Berakhot 2a-2b")

    def test_talmud_range(self):
        assert m.Ref("שבת לג, א–ב") == m.Ref("Shabbat 33")
        assert m.Ref('עירובין פב-פג') == m.Ref("Eruvin 82-83")
        assert m.Ref("""ברכות י"א עמוד א–עמוד ב'""") == m.Ref("Berakhot 11")

    def test_bible_word_end(self):
        with pytest.raises(InputError):
            r = m.Ref('דברים לברק')

        with pytest.raises(InputError):
            r = m.Ref('דברים א לברק')

        with pytest.raises(InputError):
            r = m.Ref("אסתר א, סי")

    def test_talmud_word_end(self):
        with pytest.raises(InputError):
            r = m.Ref("מנחות כט בג")

        with pytest.raises(InputError):
            r = m.Ref("מנחות כטר")

    def test_midrash_word_end(self):
        # Assumes that Esther Rabbah Petichta
        with pytest.raises(InputError):
            r = m.Ref("אסתר רבה פתיחתא")

    def test_pehmem_form(self):
        r = m.Ref('פרה פ"ח מ"ז')
        assert r.book == 'Mishnah Parah'
        assert r.sections[0] == 8
        assert r.sections[1] == 7
        assert len(r.sections) == 2

        r = m.Ref('מנחות פ"ח')
        assert r.book == 'Menachot'
        assert r.sections[0] == 175
        assert len(r.sections) == 1

        r = m.Ref('מנחות פ"ח מ"ז')
        assert r.book == 'Mishnah Menachot'
        assert r.sections[0] == 8
        assert r.sections[1] == 7
        assert len(r.sections) == 2


    def test_perek_form(self):
        r = m.Ref('אבות פרק ד')
        assert r.book == 'Pirkei Avot'
        assert r.sections[0] == 4
        assert len(r.sections) == 1

    def test_peh_form(self):
        r = m.Ref('אבות פ"ד')

        assert r.book == 'Pirkei Avot'
        assert r.sections[0] == 4
        assert len(r.sections) == 1

        assert m.Ref('תהלים פד:ג') == m.Ref("Psalms 84:3")  # dont strip peh when no quotation

    def test_volume_address(self):
        assert m.Ref("אורות הקודש, ח״א, א, א") == m.Ref("Orot HaKodesh 1:1:1")
        assert m.Ref("אורות הקודש, א, א, א") == m.Ref("Orot HaKodesh 1:1:1")
        assert m.Ref("אורות הקודש א א א") == m.Ref("Orot HaKodesh 1:1:1")
        assert m.Ref("אורות הקודש ח״א, א, א") == m.Ref("Orot HaKodesh 1:1:1")
        assert m.Ref("אורות הקודש חלק א, א, א") == m.Ref("Orot HaKodesh 1:1:1")
        assert m.Ref('אורות הקודש ח"ג, א, א') == m.Ref("Orot HaKodesh 3:1:1")

        assert m.Ref("Orot HaKodesh, Volume 1, 1 1") == m.Ref("Orot HaKodesh 1:1:1")

    def test_two_single_quotes(self):
        r = m.Ref("שמות כ''ב")
        assert r.book == 'Exodus'
        assert len(r.sections) == 1
        assert r.sections[0] == 22

        r = m.Ref("במדבר ל''ה")
        assert r.book == 'Numbers'
        assert len(r.sections) == 1
        assert r.sections[0] == 35

        r = m.Ref("שופטים כ י''א")
        assert r.book == 'Judges'
        assert len(r.sections) == 2
        assert r.sections[0] == 20
        assert r.sections[1] == 11


    def test_peh_and_spelled_mishnah(self):
        r = m.Ref('טהרות פ"ג משנה ב')
        assert r.book == 'Mishnah Tahorot'
        assert len(r.sections) == 2
        assert r.sections[0] == 3
        assert r.sections[1] == 2

    def test_spelled_perek_and_mem(self):
        r = m.Ref('טהרות פרק ג מ״ב')
        assert r.book == 'Mishnah Tahorot'
        assert len(r.sections) == 2
        assert r.sections[0] == 3
        assert r.sections[1] == 2

    def test_spelled_perek_and_mishnah(self):
        r = m.Ref('טהרות פרק ג משנה ב')
        assert r.book == 'Mishnah Tahorot'
        assert len(r.sections) == 2
        assert r.sections[0] == 3
        assert r.sections[1] == 2

    def test_mishnah_form_equality(self):
        assert m.Ref('טהרות פרק ג משנה ב') == m.Ref('טהרות פרק ג מ״ב')
        assert m.Ref('טהרות פרק ג מ״ב') == m.Ref('טהרות פ"ג משנה ב')
        assert m.Ref('טהרות ג ב') == m.Ref('טהרות פ"ג משנה ב')

    def test_hebrew_english_equality(self):
        assert m.Ref('טהרות פרק ג משנה ב') == m.Ref("Mishnah Tahorot 3:2")
        assert m.Ref("שופטים כ י''א") == m.Ref("Judges 20:11")
        assert m.Ref("פסחים ד' נח:") == m.Ref("Pesachim 58b")
        assert m.Ref('יבמות ס"ה') == m.Ref("Yevamot 65a-65b")
        assert m.Ref('תהילים קי"ט') == m.Ref("Psalms 119")
        assert m.Ref("שמות כא, ד") == m.Ref("Exodus 21:4")
        assert m.Ref("שבת ד' כב.") == m.Ref("Shabbat 22a")

    def test_repr_on_hebrew(self):
        repr(m.Ref('טהרות פרק ג משנה ב'))


class Test_Hebrew_Quoting_Styles(object):
    def test_leading_geresh(self):
        assert m.Ref("שמות י׳ י״ב") == m.Ref('Exodus 10:12')
        assert m.Ref("שמות י׳ יב") == m.Ref('Exodus 10:12')
        assert m.Ref("שמות י׳ יב") == m.Ref('Exodus 10:12')

    def test_no_punctuation(self):
        assert m.Ref("שמות י יב") == m.Ref('Exodus 10:12')
        assert m.Ref("שמות יב י") == m.Ref('Exodus 12:10')

    def test_leading_gershaim(self):
        assert m.Ref("שמות י״ב י") == m.Ref('Exodus 12:10')
        assert m.Ref("שמות י״ב י׳") == m.Ref('Exodus 12:10')

    def test_trailing_geresh(self):
        assert m.Ref("שמות יב י׳") == m.Ref('Exodus 12:10')
        assert m.Ref("שמות י״ב י׳") == m.Ref('Exodus 12:10')

    def test_trailing_gershaim(self):
        assert m.Ref("שמות י י״ב") == m.Ref('Exodus 10:12')
        assert m.Ref("שמות י׳ י״ב") == m.Ref('Exodus 10:12')


#todo: surprised this works. Had been marked as failing.  What's the coverage of these kinds of refs?
class Test_parse_he_commentary(object):
    def test_hebrew_commentary(self):
        assert m.Ref('רש"י על ויקרא ט״ו:ג׳') == m.Ref("Rashi on Leviticus 15:3")


class Test_parse_he_ref_range(object):
    def test_hebrew_range_simple(self):
        assert m.Ref('שמות, כ"ד, יג-יד') == m.Ref('Exodus 24:13-14')
        assert m.Ref('במדבר, כ"ז, טו - כג') == m.Ref("Numbers 27:15-23")
        assert m.Ref('במדבר, כ"ז, טו -כ״ט כג') == m.Ref("Numbers 27:15-29:23")
        assert m.Ref('דברי הימים א ט״ו:ט״ו - דברי הימים א ט״ז:י״ז') == m.Ref('I Chronicles 15:15-16:17')

    def test_hebrew_range_with_colons(self):
        assert m.Ref('רות ג:יח-ד:א') == m.Ref("Ruth 3:18-4:1")

    def test_hebrew_range_commentary(self):
        assert m.Ref('רש"י על ויקרא ט״ו:ג׳-י״ז:י״ב') == m.Ref("Rashi on Leviticus 15:3-17:12")
        assert m.Ref('רש"י על שמות ג׳:א׳:א׳-ג׳') == m.Ref("Rashi on Exodus 3:1:1-3")

    def test_hebrew_range_talmud(self):
        assert m.Ref('שבת טו. - טז:') == m.Ref("Shabbat 15a-16b")
        assert m.Ref('שבת טו א - טז ב') == m.Ref("Shabbat 15a-16b")
        assert m.Ref('יבמות סא ע"א-ע"ב') == m.Ref("Yevamot 61a-b")

    @pytest.mark.xfail(reason="unknown")
    def test_hebrew_range_talmud_commentary(self):
        assert m.Ref('') == m.Ref("Rashi on Shabbat 15a:15-15b:13")


class Test_Hebrew_Normal(object):

    def test_simple(self):
        assert m.Ref("Exodus").he_normal() == 'שמות'
        assert m.Ref("Exodus 4").he_normal() == 'שמות ד׳'
        assert m.Ref("Exodus 4:3").he_normal() == 'שמות ד׳:ג׳'

    def test_talmud(self):
        assert m.Ref("Shabbat").he_normal() == 'שבת'
        assert m.Ref("Shabbat 3b").he_normal() == 'שבת ג׳ ב'
        # assert m.Ref("Shabbat 3b:23").he_normal() == u'שבת ג׳ ב 23'
        assert m.Ref("Shabbat 3b:23").he_normal() == 'שבת ג׳ ב:כ״ג'

    def test_simple_range(self):
        assert m.Ref("Exodus 4-5").he_normal() == 'שמות ד׳-ה׳'
        assert m.Ref("Exodus 4:3-8").he_normal() == 'שמות ד׳:ג׳-ח׳'
        assert m.Ref("Exodus 4:3-5:8").he_normal() == 'שמות ד׳:ג׳-ה׳:ח׳'

    def test_talmud_normal_range(self):
        assert m.Ref("Shabbat 3b-5a").he_normal() == 'שבת ג׳ ב-ה׳ א'
        # assert m.Ref("Shabbat 3b:3-24").he_normal() == u'שבת ג׳ ב 3-24'
        assert m.Ref("Shabbat 3b:3-24").he_normal() == 'שבת ג׳ ב:ג׳-כ״ד'
        # assert m.Ref("Shabbat 3b:3-5a:24").he_normal() == u'שבת ג: 3-ה. 24'

    def test_complex(self):
        pass


class Test_parse_he_Data_Types(object):

    def test_perek_pasuk(self):
        pass
        # assert m.Ref(u'בראשית פרק א פסוק ג') == m.Ref('Genesis 1:3')
        # assert m.Ref(u'שמות ד פסוקים ג-ו') == m.Ref('Exodus 4:3-6')

        ## this test fails since 2015 because Perek looks for פ"
        # assert m.Ref(u'תהילים פ"ו') == m.Ref('Psalms 86')
        ## these tests fail because ranges doesn't use DataTypes after the hyphen

        # assert m.Ref(u'שמות ד פסוק ג - פרק ו פסוק ב') == m.Ref('Exodus 4:3-6:2')
        # assert m.Ref(u'שמות ד פסוק ג - פרק ו') == m.Ref('Exodus 4:3-6:30')
        # assert m.Ref(u'שמות ד פסוק ג - פסוק ו') == m.Ref('Exodus 4:3-6')
        # assert m.Ref(u'שמות פרק ד - פרק ה פסוק ו') == m.Ref('Exodus 4:1-5:6')


#todo: convert to all_titles_regex
class Test_get_titles_in_string(object):
    def test_bible_ref(self):
        res = m.library.get_titles_in_string(texts['bible_ref'], "he")
        assert set(res) >= set(["שופטים"])

        res = m.library.get_titles_in_string(texts['false_pos'], "he")
        assert set(res) >= set(["שופטים", "דברים"])

    def test_positions(self):
        for a in ['bible_mid', 'bible_begin', 'bible_end']:
            assert set(["שמות"]) <= set(m.library.get_titles_in_string(texts[a], "he"))


    def test_abbreviations(self):
        t = "ודין גזל קורה ובנאה בבירה מה יהא עליה (גיטין נה א). ודין גזל בישוב ורצה להחזיר במדבר (ב\"ק קיח א). ודין גזל והקדיש"
        res = m.library.get_refs_in_string(t)
        assert len(res) == 2

        t = 'ולמועדים ולימים ושנים זיל ליקרי צדיקי בשמך (עמוס ז ב) יעקב הקטן שמואל הקטן (ש״א יז יד) דוד הקטן חזייה דלא קא מיתבא דעתה אמר הקב״ה הביאו כפרה עלי שמעטתי'
        res = m.library.get_refs_in_string(t)
        assert len(res) == 2

        t = 'דכתיב, ויצא איש הבינים (ש"א יז ד), ויגש הפלשתי השכם'
        res = m.library.get_refs_in_string(t)
        assert len(res) == 1




