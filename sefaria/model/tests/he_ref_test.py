# -*- coding: utf-8 -*-
import pytest
from sefaria.system.exceptions import InputError

import sefaria.model as m

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


class Test_parse_he_ref(object):
    def test_simple_bible(self):
        r = m.Ref(u"שמות כא, ד")
        assert r.book == 'Exodus'
        assert r.sections[0] == 21
        assert r.sections[1] == 4

        r = m.Ref(u"דברים טז, יח")
        assert r.book == 'Deuteronomy'
        assert r.sections[0] == 16
        assert r.sections[1] == 18

        r = m.Ref(u'תהילים קי"ט')
        assert r.book == 'Psalms'
        assert r.sections[0] == 119
        assert len(r.sections) == 1

        r = m.Ref(u'בראשית כז.ג')
        assert r.book == 'Genesis'
        assert r.sections[0] == 27
        assert r.sections[1] == 3

    def test_divrei_hayamim(self):
        r = m.Ref(u'דברי הימים ב לב יט')
        assert r.book == 'II Chronicles'
        assert r.sections[0] == 32
        assert r.sections[1] == 19

        r = m.Ref(u'דברי הימים ב לב')
        assert r.book == 'II Chronicles'
        assert r.sections[0] == 32
        assert len(r.sections) == 1


    def test_talmud(self):
        r = m.Ref(u'יבמות ס"ה')
        assert r.book == 'Yevamot'
        assert r.sections[0] == 129
        assert len(r.sections) == 1

        r = m.Ref(u"שבת ד' כב.")
        assert r.book == 'Shabbat'
        assert r.sections[0] == 43
        assert len(r.sections) == 1

        r = m.Ref(u"פסחים ד' נח:")
        assert r.book == 'Pesachim'
        assert r.sections[0] == 116
        assert len(r.sections) == 1

        r = m.Ref(u"מנחות ד' מט.")
        assert r.book == 'Menachot'
        assert r.sections[0] == 97
        assert len(r.sections) == 1

        r = m.Ref(u"מנחות כט א")
        assert r.book == 'Menachot'
        assert r.sections[0] == 57
        assert len(r.sections) == 1

        r = m.Ref(u"מנחות כט ב")
        assert r.book == 'Menachot'
        assert r.sections[0] == 58
        assert len(r.sections) == 1

    def test_length_catching(self):
        with pytest.raises(InputError):
            r = m.Ref(u'דברים שם')

        with pytest.raises(InputError):
            r = m.Ref(u'דברים שם, שם')

    def test_talmud_ayin_amud_form(self):
        r = m.Ref(u'סוטה דף מ"ה ע"ב')
        assert r.sections[0] == 90
        assert len(r.sections) == 1
        r = m.Ref(u"סוטה דף מ''ה ע''ב")
        assert r.sections[0] == 90
        assert len(r.sections) == 1

    def test_bible_word_end(self):
        with pytest.raises(InputError):
            r = m.Ref(u'דברים לברק')

        with pytest.raises(InputError):
            r = m.Ref(u'דברים א לברק')

        with pytest.raises(InputError):
            r = m.Ref(u"אסתר א, סי")

    def test_talmud_word_end(self):
        with pytest.raises(InputError):
            r = m.Ref(u"מנחות כט בג")

        with pytest.raises(InputError):
            r = m.Ref(u"מנחות כטר")

    def test_midrash_word_end(self):
        # Assumes that Esther Rabbah Petichta
        with pytest.raises(InputError):
            r = m.Ref(u"אסתר רבה פתיחתא")

    def test_pehmem_form(self):
        r = m.Ref(u'פרה פ"ח מ"ז')
        assert r.book == 'Mishnah Parah'
        assert r.sections[0] == 8
        assert r.sections[1] == 7
        assert len(r.sections) == 2

        r = m.Ref(u'מנחות פ"ח')
        assert r.book == 'Menachot'
        assert r.sections[0] == 175
        assert len(r.sections) == 1

        r = m.Ref(u'מנחות פ"ח מ"ז')
        assert r.book == 'Mishnah Menachot'
        assert r.sections[0] == 8
        assert r.sections[1] == 7
        assert len(r.sections) == 2


    def test_perek_form(self):
        r = m.Ref(u'אבות פרק ד')
        assert r.book == 'Pirkei Avot'
        assert r.sections[0] == 4
        assert len(r.sections) == 1

    def test_peh_form(self):
        r = m.Ref(u'אבות פ"ד')

        assert r.book == 'Pirkei Avot'
        assert r.sections[0] == 4
        assert len(r.sections) == 1

    def test_volume_address(self):
        assert m.Ref(u"זוהר, ח״א, נד, ב") == m.Ref("Zohar 1:54b")
        assert m.Ref(u"זוהר, א, נד, ב") == m.Ref("Zohar 1:54b")
        assert m.Ref(u"זוהר א נד ב") == m.Ref("Zohar 1:54b")
        assert m.Ref(u"זוהר א נד ע״ב") == m.Ref("Zohar 1:54b")
        assert m.Ref(u"זוהר ח״א, נד, ב") == m.Ref("Zohar 1:54b")
        assert m.Ref(u"זוהר ח״א, נד, ב") == m.Ref("Zohar 1:54b")
        assert m.Ref(u"זוהר חלק א, נד, ב") == m.Ref("Zohar 1:54b")
        assert m.Ref(u"זוהר חלק א׳, נד, ב") == m.Ref("Zohar 1:54b")
        assert m.Ref(u'זוהר ח"א, נד, ב') == m.Ref("Zohar 1:54b")
        assert m.Ref(u'זוהר ח"ב, נד, ב') == m.Ref("Zohar 2:54b")
        assert m.Ref(u'זוהר ח"א, נד:') == m.Ref("Zohar 1:54b")
        assert m.Ref(u'זוהר ח"א נד:') == m.Ref("Zohar 1:54b")

        assert m.Ref("Zohar, Volume 2, 23b") == m.Ref("Zohar 2:23b")

    def test_two_single_quotes(self):
        r = m.Ref(u"שמות כ''ב")
        assert r.book == 'Exodus'
        assert len(r.sections) == 1
        assert r.sections[0] == 22

        r = m.Ref(u"במדבר ל''ה")
        assert r.book == 'Numbers'
        assert len(r.sections) == 1
        assert r.sections[0] == 35

        r = m.Ref(u"שופטים כ י''א")
        assert r.book == 'Judges'
        assert len(r.sections) == 2
        assert r.sections[0] == 20
        assert r.sections[1] == 11


    def test_peh_and_spelled_mishnah(self):
        r = m.Ref(u'טהרות פ"ג משנה ב')
        assert r.book == 'Mishnah Tahorot'
        assert len(r.sections) == 2
        assert r.sections[0] == 3
        assert r.sections[1] == 2

    def test_spelled_perek_and_mem(self):
        r = m.Ref(u'טהרות פרק ג מ״ב')
        assert r.book == 'Mishnah Tahorot'
        assert len(r.sections) == 2
        assert r.sections[0] == 3
        assert r.sections[1] == 2

    def test_spelled_perek_and_mishnah(self):
        r = m.Ref(u'טהרות פרק ג משנה ב')
        assert r.book == 'Mishnah Tahorot'
        assert len(r.sections) == 2
        assert r.sections[0] == 3
        assert r.sections[1] == 2

    def test_mishnah_form_equality(self):
        assert m.Ref(u'טהרות פרק ג משנה ב') == m.Ref(u'טהרות פרק ג מ״ב')
        assert m.Ref(u'טהרות פרק ג מ״ב') == m.Ref(u'טהרות פ"ג משנה ב')
        assert m.Ref(u'טהרות ג ב') == m.Ref(u'טהרות פ"ג משנה ב')

    def test_hebrew_english_equality(self):
        assert m.Ref(u'טהרות פרק ג משנה ב') == m.Ref("Mishnah Tahorot 3:2")
        assert m.Ref(u"שופטים כ י''א") == m.Ref("Judges 20:11")
        assert m.Ref(u"פסחים ד' נח:") == m.Ref("Pesachim 58b")
        assert m.Ref(u'יבמות ס"ה') == m.Ref("Yevamot 65a")
        assert m.Ref(u'תהילים קי"ט') == m.Ref("Psalms 119")
        assert m.Ref(u"שמות כא, ד") == m.Ref("Exodus 21:4")
        assert m.Ref(u"שבת ד' כב.") == m.Ref("Shabbat 22a")

    def test_repr_on_hebrew(self):
        repr(m.Ref(u'טהרות פרק ג משנה ב'))


class Test_Hebrew_Quoting_Styles(object):
    def test_leading_geresh(self):
        assert m.Ref(u"שמות י׳ י״ב") == m.Ref('Exodus 10:12')
        assert m.Ref(u"שמות י׳ יב") == m.Ref('Exodus 10:12')
        assert m.Ref(u"שמות י׳ יב") == m.Ref('Exodus 10:12')

    def test_no_punctuation(self):
        assert m.Ref(u"שמות י יב") == m.Ref('Exodus 10:12')
        assert m.Ref(u"שמות יב י") == m.Ref('Exodus 12:10')

    def test_leading_gershaim(self):
        assert m.Ref(u"שמות י״ב י") == m.Ref('Exodus 12:10')
        assert m.Ref(u"שמות י״ב י׳") == m.Ref('Exodus 12:10')

    def test_trailing_geresh(self):
        assert m.Ref(u"שמות יב י׳") == m.Ref('Exodus 12:10')
        assert m.Ref(u"שמות י״ב י׳") == m.Ref('Exodus 12:10')

    def test_trailing_gershaim(self):
        assert m.Ref(u"שמות י י״ב") == m.Ref('Exodus 10:12')
        assert m.Ref(u"שמות י׳ י״ב") == m.Ref('Exodus 10:12')



#todo: surprised this works. Had been marked as failing.  What's the coverage of these kinds of refs?
class Test_parse_he_commentary(object):
    def test_hebrew_commentary(self):
        assert m.Ref(u'רש"י על ויקרא ט״ו:ג׳') == m.Ref("Rashi on Leviticus 15:3")


class Test_parse_he_ref_range(object):
    # Most hebrew ranges are not yet supported
    def test_hebrew_range_simple(self):
        assert m.Ref(u'שמות, כ"ד, יג-יד') == m.Ref('Exodus 24:13-14')
        assert m.Ref(u'במדבר, כ"ז, טו - כג') == m.Ref("Numbers 27:15-23")
        assert m.Ref(u'במדבר, כ"ז, טו -כ״ט כג') == m.Ref("Numbers 27:15-29:23")

    @pytest.mark.failing
    def test_hebrew_range_with_colons(self):
        assert m.Ref(u'רות יט:יח-כ:יח') == m.Ref("Ruth 19:18-20:18")

    @pytest.mark.failing
    def test_hebrew_range_commentary(self):
        assert m.Ref(u'רש"י על ויקרא ט״ו:ג׳-י״ז:י״ב') == m.Ref("Rashi on Leviticus 15:3-17:12")
        assert m.Ref(u'רש"י על שמות ג׳:א׳:א׳-ג׳') == m.Ref("Rashi on Exodus 3:1:1-3")

    @pytest.mark.failing
    def test_hebrew_range_talmud(self):
        assert m.Ref(u'שבת טו. - טז:') == m.Ref("Shabbat 15a-16b")
        assert m.Ref(u'שבת טו א - טז ב') == m.Ref("Shabbat 15a-16b")
        # assert m.Ref(u'') == m.Ref("Shabbat 15a:15-15b:13")

    @pytest.mark.failing
    def test_hebrew_range_talmud_commentary(self):
        assert m.Ref(u'') == m.Ref("Rashi on Shabbat 15a:15-15b:13")


class Test_Hebrew_Normal(object):

    def test_simple(self):
        assert m.Ref("Exodus").he_normal() == u'שמות'
        assert m.Ref("Exodus 4").he_normal() == u'שמות ד׳'
        assert m.Ref("Exodus 4:3").he_normal() == u'שמות ד׳:ג׳'

    def test_talmud(self):
        assert m.Ref("Shabbat").he_normal() == u'שבת'
        assert m.Ref("Shabbat 3b").he_normal() == u'שבת ג׳ ב'
        # assert m.Ref("Shabbat 3b:23").he_normal() == u'שבת ג׳ ב 23'
        assert m.Ref("Shabbat 3b:23").he_normal() == u'שבת ג׳ ב:כ״ג'

    def test_simple_range(self):
        assert m.Ref("Exodus 4-5").he_normal() == u'שמות ד׳-ה׳'
        assert m.Ref("Exodus 4:3-8").he_normal() == u'שמות ד׳:ג׳-ח׳'
        assert m.Ref("Exodus 4:3-5:8").he_normal() == u'שמות ד׳:ג׳-ה׳:ח׳'

    def test_talmud_range(self):
        assert m.Ref("Shabbat 3b-5a").he_normal() == u'שבת ג׳ ב-ה׳ א'
        # assert m.Ref("Shabbat 3b:3-24").he_normal() == u'שבת ג׳ ב 3-24'
        assert m.Ref("Shabbat 3b:3-24").he_normal() == u'שבת ג׳ ב:ג׳-כ״ד'
        # assert m.Ref("Shabbat 3b:3-5a:24").he_normal() == u'שבת ג: 3-ה. 24'

    def test_complex(self):
        pass





#todo: convert to all_titles_regex
class Test_get_titles_in_string(object):
    def test_bible_ref(self):
        res = m.library.get_titles_in_string(texts['bible_ref'], "he")
        assert set(res) >= set([u"שופטים"])

        res = m.library.get_titles_in_string(texts['false_pos'], "he")
        assert set(res) >= set([u"שופטים", u"דברים"])

    def test_positions(self):
        for a in ['bible_mid', 'bible_begin', 'bible_end']:
            assert set([u"שמות"]) <= set(m.library.get_titles_in_string(texts[a], "he"))


    def test_abbreviations(self):
        t = u"ודין גזל קורה ובנאה בבירה מה יהא עליה (גיטין נה א). ודין גזל בישוב ורצה להחזיר במדבר (ב\"ק קיח א). ודין גזל והקדיש"
        res = m.library.get_refs_in_string(t)
        assert len(res) == 2

        t = u'ולמועדים ולימים ושנים זיל ליקרי צדיקי בשמך (עמוס ז ב) יעקב הקטן שמואל הקטן (ש״א יז יד) דוד הקטן חזייה דלא קא מיתבא דעתה אמר הקב״ה הביאו כפרה עלי שמעטתי'
        res = m.library.get_refs_in_string(t)
        assert len(res) == 2

        t = u'דכתיב, ויצא איש הבינים (ש"א יז ד), ויגש הפלשתי השכם'
        res = m.library.get_refs_in_string(t)
        assert len(res) == 1




