# -*- coding: utf-8 -*-
import pytest
from sefaria.model import *
from sefaria.system.exceptions import InputError

class Test_Ref(object):

    def test_short_names(self):
        ref = Ref(u"Exo. 3:1")
        assert ref.book == u"Exodus"

    def test_normal_form_is_identifcal(self):
        assert Ref("Genesis 2:5").normal() == "Genesis 2:5"
        assert Ref("Shabbat 32b").normal() == "Shabbat 32b"
        assert Ref("Mishnah Peah 4:2-4").normal() == "Mishnah Peah 4:2-4"

    def test_bible_range(self):
        ref = Ref(u"Job.2:3-3:1")
        assert ref.toSections == [3, 1]

    def test_short_bible_refs(self):  # this behavior is changed from earlier
        assert Ref(u"Exodus") != Ref(u"Exodus 1")
        assert Ref(u"Exodus").padded_ref() == Ref(u"Exodus 1")

    def test_short_talmud_refs(self):  # this behavior is changed from earlier
        assert Ref(u"Sanhedrin 2a") != Ref(u"Sanhedrin")
        assert Ref(u"Sanhedrin 2a") == Ref(u"Sanhedrin 2")

    def test_each_title(object):
        for lang in ["en", "he"]:
            for t in library.full_title_list(lang, False):
                assert library.all_titles_regex(lang).match(t), u"'{}' doesn't resolve".format(t)
    '''
    def test_map(self):
        assert Ref("Me'or Einayim 16") == Ref("Me'or Einayim, Yitro")
    '''

    def test_comma(self):
        assert Ref("Me'or Einayim 24") == Ref("Me'or Einayim, 24")
        assert Ref("Genesis 18:24") == Ref("Genesis, 18:24")

    def test_padded_ref(self):
        assert Ref("Exodus").padded_ref().normal() == "Exodus 1"
        assert Ref("Exodus 1").padded_ref().normal() == "Exodus 1"
        assert Ref("Exodus 1:1").padded_ref().normal() == "Exodus 1:1"
        assert Ref("Rashi on Genesis 2:3:1").padded_ref().normal() == "Rashi on Genesis 2:3:1"
        assert Ref("Shabbat").padded_ref().normal() == "Shabbat 2a"
        assert Ref("Shabbat 2a").padded_ref().normal() == "Shabbat 2a"
        assert Ref("Shabbat 2a:1").padded_ref().normal() == "Shabbat 2a:1"
        assert Ref("Rashi on Shabbat 2a:1:1").padded_ref().normal() == "Rashi on Shabbat 2a:1:1"

    def test_starting_and_ending(self):
        assert Ref("Leviticus 15:3 - 17:12").starting_ref() == Ref("Leviticus 15:3")
        assert Ref("Leviticus 15:3 - 17:12").ending_ref() == Ref("Leviticus 17:12")
        assert Ref("Leviticus 15-17").starting_ref() == Ref("Leviticus 15")
        assert Ref("Leviticus 15-17").ending_ref() == Ref("Leviticus 17")
        assert Ref("Leviticus 15:17-21").starting_ref() == Ref("Leviticus 15:17")
        assert Ref("Leviticus 15:17-21").ending_ref() == Ref("Leviticus 15:21")

        assert Ref("Leviticus 15:17").starting_ref() == Ref("Leviticus 15:17")
        assert Ref("Leviticus 15:17").ending_ref() == Ref("Leviticus 15:17")

        assert Ref("Leviticus 15").starting_ref() == Ref("Leviticus 15")
        assert Ref("Leviticus 15").ending_ref() == Ref("Leviticus 15")

        assert Ref("Leviticus").starting_ref() == Ref("Leviticus")
        assert Ref("Leviticus").ending_ref() == Ref("Leviticus")

        assert Ref("Shabbat 15a-16b").starting_ref() == Ref("Shabbat 15a")
        assert Ref("Shabbat 15a-16b").ending_ref() == Ref("Shabbat 16b")
        assert Ref("Shabbat 15a").starting_ref() == Ref("Shabbat 15a")
        assert Ref("Shabbat 15a").ending_ref() == Ref("Shabbat 15a")
        assert Ref("Shabbat 15a:15-15b:13").starting_ref() == Ref("Shabbat 15a:15")
        assert Ref("Shabbat 15a:15-15b:13").ending_ref() == Ref("Shabbat 15b:13")

        assert Ref("Rashi on Leviticus 15:3-17:12").starting_ref() == Ref("Rashi on Leviticus 15:3")
        assert Ref("Rashi on Leviticus 15:3-17:12").ending_ref() == Ref("Rashi on Leviticus 17:12")

        assert Ref("Rashi on Leviticus 15-17").starting_ref() == Ref("Rashi on Leviticus 15")
        assert Ref("Rashi on Leviticus 15-17").ending_ref() == Ref("Rashi on Leviticus 17")

        assert Ref("Rashi on Leviticus 15:17-21").starting_ref() == Ref("Rashi on Leviticus 15:17")
        assert Ref("Rashi on Leviticus 15:17-21").ending_ref() == Ref("Rashi on Leviticus 15:21")

        assert Ref("Rashi on Leviticus 15:17").starting_ref() == Ref("Rashi on Leviticus 15:17")
        assert Ref("Rashi on Leviticus 15:17").ending_ref() == Ref("Rashi on Leviticus 15:17")

        assert Ref("Rashi on Shabbat 15a-16b").starting_ref() == Ref("Rashi on Shabbat 15a")
        assert Ref("Rashi on Shabbat 15a-16b").ending_ref() == Ref("Rashi on Shabbat 16b")

        assert Ref("Rashi on Shabbat 15a").starting_ref() == Ref("Rashi on Shabbat 15a")
        assert Ref("Rashi on Shabbat 15a").ending_ref() == Ref("Rashi on Shabbat 15a")

        assert Ref("Rashi on Shabbat 15a:15-15b:13").starting_ref() == Ref("Rashi on Shabbat 15a:15")
        assert Ref("Rashi on Shabbat 15a:15-15b:13").ending_ref() == Ref("Rashi on Shabbat 15b:13")

        assert Ref("Rashi on Exodus 3:1-4:1").starting_ref() == Ref("Rashi on Exodus 3:1")
        assert Ref("Rashi on Exodus 3:1-4:1").ending_ref() == Ref("Rashi on Exodus 4:1")

        assert Ref("Rashi on Exodus 3:1-4:10").starting_ref() == Ref("Rashi on Exodus 3:1")
        assert Ref("Rashi on Exodus 3:1-4:10").ending_ref() == Ref("Rashi on Exodus 4:10")

        assert Ref("Rashi on Exodus 3:1-3:10").starting_ref() == Ref("Rashi on Exodus 3:1")
        assert Ref("Rashi on Exodus 3:1-3:10").ending_ref() == Ref("Rashi on Exodus 3:10")

        assert Ref("Rashi on Exodus 3:1:1-3:1:3").starting_ref() == Ref("Rashi on Exodus 3:1:1")
        assert Ref("Rashi on Exodus 3:1:1-3:1:3").ending_ref() == Ref("Rashi on Exodus 3:1:3")


    def test_is_talmud(self):
        assert not Ref("Exodus").is_talmud()
        assert not Ref("Exodus 1:3").is_talmud()
        assert not Ref("Rashi on Genesis 2:3:1").is_talmud()
        assert Ref("Shabbat").is_talmud()
        assert Ref("Shabbat 7b").is_talmud()
        assert Ref("Rashi on Shabbat 2a:1:1").is_talmud()

    def test_context_ref(self):
        assert Ref("Genesis 2:3").context_ref().normal() == "Genesis 2"
        assert Ref("Rashi on Genesis 2:3:1").context_ref().normal() == "Rashi on Genesis 2:3"
        assert Ref("Rashi on Genesis 2:3:1").context_ref(2).normal() == "Rashi on Genesis 2"

    def test_section_ref(self):
        assert Ref("Rashi on Genesis 2:3:1").section_ref().normal() == "Rashi on Genesis 2:3"
        assert Ref("Genesis 2:3").section_ref().normal() == "Genesis 2"
        assert Ref("Shabbat 4a").section_ref().normal() == "Shabbat 4a"

    def test_top_section_ref(self):
        assert Ref("Job 4:5").top_section_ref().normal() == "Job 4"
        assert Ref("Rashi on Genesis 1:2:3").top_section_ref().normal() == "Rashi on Genesis 1"
        assert Ref("Genesis").top_section_ref().normal() == "Genesis 1"

    def test_next_ref(self):
        assert Ref("Job 4:5").next_section_ref().normal() == "Job 5"
        assert Ref("Shabbat 4b").next_section_ref().normal() == "Shabbat 5a"
        assert Ref("Shabbat 5a").next_section_ref().normal() == "Shabbat 5b"
        assert Ref("Rashi on Genesis 5:32:2").next_section_ref().normal() == "Rashi on Genesis 6:2"
        assert Ref("Mekhilta 35.3").next_section_ref() is None
        # This will start to fail when we fill in this text
        assert Ref("Mekhilta 23:19").next_section_ref().normal() == "Mekhilta 31:12"

    def test_complex_next_ref(self): #at time of test we only had complex commentaries stable to test with
        assert Ref("Naftali Seva Ratzon on Pesach Haggadah, Kadesh 2").next_section_ref().normal() == "Naftali Seva Ratzon on Pesach Haggadah, Karpas 1"
        assert Ref("Naftali Seva Ratzon on Pesach Haggadah, Magid, Ha Lachma Anya 1").next_section_ref().normal() == "Naftali Seva Ratzon on Pesach Haggadah, Magid, Four Questions 2"
        assert Ref("Ephod Bad on Pesach Haggadah, Magid, First Half of Hallel 4").next_section_ref().normal() == "Ephod Bad on Pesach Haggadah, Hallel, Second Half of Hallel 2"
        assert Ref("Kos Shel Eliyahu on Pesach Haggadah, Magid, Second Cup of Wine 2").next_section_ref() is None


    def test_prev_ref(self):
        assert Ref("Job 4:5").prev_section_ref().normal() == "Job 3"
        assert Ref("Shabbat 4b").prev_section_ref().normal() == "Shabbat 4a"
        assert Ref("Shabbat 5a").prev_section_ref().normal() == "Shabbat 4b"
        assert Ref("Rashi on Genesis 6:2:1").prev_section_ref().normal() == "Rashi on Genesis 5:32"
        assert Ref("Mekhilta 12:1").prev_section_ref() is None
        # This will start to fail when we fill in this text
        assert Ref("Mekhilta 31:12").prev_section_ref().normal() == "Mekhilta 23:19"

    def test_complex_prev_ref(self):
        assert Ref("Naftali Seva Ratzon on Pesach Haggadah, Karpas 1").prev_section_ref().normal() == "Naftali Seva Ratzon on Pesach Haggadah, Kadesh 2"
        assert Ref("Naftali Seva Ratzon on Pesach Haggadah, Magid, Four Questions 2").prev_section_ref().normal() == "Naftali Seva Ratzon on Pesach Haggadah, Magid, Ha Lachma Anya 1"
        assert Ref("Ephod Bad on Pesach Haggadah, Hallel, Second Half of Hallel 2").prev_section_ref().normal() == "Ephod Bad on Pesach Haggadah, Magid, First Half of Hallel 4"
        assert Ref("Kos Shel Eliyahu on Pesach Haggadah, Magid, Ha Lachma Anya 3").prev_section_ref() is None

    def test_range_depth(self):
        assert Ref("Leviticus 15:3 - 17:12").range_depth() == 2
        assert Ref("Leviticus 15-17").range_depth() == 2
        assert Ref("Leviticus 15:17-21").range_depth() == 1
        assert Ref("Leviticus 15:17").range_depth() == 0
        assert Ref("Shabbat 15a-16b").range_depth() == 2
        assert Ref("Shabbat 15a").range_depth() == 0
        assert Ref("Shabbat 15a:15-15b:13").range_depth() == 2

        assert Ref("Rashi on Leviticus 15:3-17:12").range_depth() == 3
        assert Ref("Rashi on Leviticus 15-17").range_depth() == 3
        assert Ref("Rashi on Leviticus 15:17-21").range_depth() == 2
        assert Ref("Rashi on Leviticus 15:17").range_depth() == 0
        assert Ref("Rashi on Shabbat 15a-16b").range_depth() == 3
        assert Ref("Rashi on Shabbat 15a").range_depth() == 0
        assert Ref("Rashi on Shabbat 15a:15-15b:13").range_depth() == 3
        assert Ref("Rashi on Exodus 3:1-4:1").range_depth() == 3
        assert Ref("Rashi on Exodus 3:1-4:10").range_depth() == 3
        assert Ref("Rashi on Exodus 3:1-3:10").range_depth() == 2
        assert Ref("Rashi on Exodus 3:1:1-3:1:3").range_depth() == 1

    def test_range_index(self):
        assert Ref("Leviticus 15:3 - 17:12").range_index() == 0
        assert Ref("Leviticus 15-17").range_index() == 0
        assert Ref("Leviticus 15:17-21").range_index() == 1
        assert Ref("Leviticus 15:17").range_index() == 2
        assert Ref("Shabbat 15a-16b").range_index() == 0
        assert Ref("Shabbat 15a").range_index() == 2
        assert Ref("Shabbat 15a:15-15b:13").range_index() == 0

        assert Ref("Rashi on Leviticus 15:3-17:12").range_index() == 0
        assert Ref("Rashi on Leviticus 15-17").range_index() == 0
        assert Ref("Rashi on Leviticus 15:17-21").range_index() == 1
        assert Ref("Rashi on Leviticus 15:17").range_index() == 3
        assert Ref("Rashi on Shabbat 15a-16b").range_index() == 0
        assert Ref("Rashi on Shabbat 15a").range_index() == 3
        assert Ref("Rashi on Shabbat 15a:15-15b:13").range_index() == 0
        assert Ref("Rashi on Exodus 3:1-4:1").range_index() == 0
        assert Ref("Rashi on Exodus 3:1-4:10").range_index() == 0
        assert Ref("Rashi on Exodus 3:1-3:10").range_index() == 1
        assert Ref("Rashi on Exodus 3:1:1-3:1:3").range_index() == 2

    def test_span_size(self):
        assert Ref("Leviticus 15:3 - 17:12").span_size() == 3
        assert Ref("Leviticus 15-17").span_size() == 3
        assert Ref("Leviticus 15:17-21").span_size() == 1
        assert Ref("Leviticus 15:17").span_size() == 1
        assert Ref("Shabbat 15a-16b").span_size() == 4
        assert Ref("Shabbat 15a").span_size() == 1
        assert Ref("Shabbat 15a:15-15b:13").span_size() == 2

        assert Ref("Rashi on Leviticus 15:3-17:12").span_size() == 3
        assert Ref("Rashi on Leviticus 15-17").span_size() == 3
        assert Ref("Rashi on Leviticus 15:17-21").span_size() == 5
        assert Ref("Rashi on Leviticus 15:17").span_size() == 1
        assert Ref("Rashi on Shabbat 15a-16b").span_size() == 4
        assert Ref("Rashi on Shabbat 15a").span_size() == 1
        assert Ref("Rashi on Shabbat 15a:15-15b:13").span_size() == 2
        assert Ref("Rashi on Exodus 3:1-4:1").span_size() == 2
        assert Ref("Rashi on Exodus 3:1-4:10").span_size() == 2

    def test_split_spanning_ref(self):
        assert Ref("Leviticus 15:3 - 17:12").split_spanning_ref() == [Ref('Leviticus 15:3-33'), Ref('Leviticus 16:1-34'), Ref('Leviticus 17:1-12')]
        assert Ref("Leviticus 15-17").split_spanning_ref() == [Ref('Leviticus 15'), Ref('Leviticus 16'), Ref('Leviticus 17')]
        assert Ref("Leviticus 15:17-21").split_spanning_ref() == [Ref('Leviticus 15:17-21')]
        assert Ref("Leviticus 15:17").split_spanning_ref() == [Ref('Leviticus 15:17')]
        assert Ref("Shabbat 15a-16b").split_spanning_ref() == [Ref('Shabbat 15a'), Ref('Shabbat 15b'), Ref('Shabbat 16a'), Ref('Shabbat 16b')]
        assert Ref("Shabbat 15a").split_spanning_ref() == [Ref('Shabbat 15a')]
        assert Ref("Shabbat 15a:15-15b:13").split_spanning_ref() == [Ref('Shabbat 15a:15-55'), Ref('Shabbat 15b:1-13')]
        assert Ref("Rashi on Exodus 5:3-6:7").split_spanning_ref() == [Ref('Rashi on Exodus 5:3'), Ref('Rashi on Exodus 5:4'), Ref('Rashi on Exodus 5:5'), Ref('Rashi on Exodus 5:6'), Ref('Rashi on Exodus 5:7'), Ref('Rashi on Exodus 5:8'), Ref('Rashi on Exodus 5:9'), Ref('Rashi on Exodus 5:10'), Ref('Rashi on Exodus 5:11'), Ref('Rashi on Exodus 5:12'), Ref('Rashi on Exodus 5:13'), Ref('Rashi on Exodus 5:14'), Ref('Rashi on Exodus 5:15'), Ref('Rashi on Exodus 5:16'), Ref('Rashi on Exodus 5:17'), Ref('Rashi on Exodus 5:18'), Ref('Rashi on Exodus 5:19'), Ref('Rashi on Exodus 5:20'), Ref('Rashi on Exodus 5:21'), Ref('Rashi on Exodus 5:22'), Ref('Rashi on Exodus 5:23'), Ref('Rashi on Exodus 6:1'), Ref('Rashi on Exodus 6:2'), Ref('Rashi on Exodus 6:3'), Ref('Rashi on Exodus 6:4'), Ref('Rashi on Exodus 6:5'), Ref('Rashi on Exodus 6:6'), Ref('Rashi on Exodus 6:7')]
        assert Ref('Targum Neofiti 5-7').split_spanning_ref() == [Ref('Targum Neofiti 5'), Ref('Targum Neofiti 6'), Ref('Targum Neofiti 7')]

    def test_range_refs(self):
        assert Ref("Leviticus 15:12-17").range_list() ==  [Ref('Leviticus 15:12'), Ref('Leviticus 15:13'), Ref('Leviticus 15:14'), Ref('Leviticus 15:15'), Ref('Leviticus 15:16'), Ref('Leviticus 15:17')]
        assert Ref("Shabbat 15b:5-8").range_list() ==  [Ref('Shabbat 15b:5'), Ref('Shabbat 15b:6'), Ref('Shabbat 15b:7'), Ref('Shabbat 15b:8')]

        with pytest.raises(InputError):
            Ref("Shabbat 15a:13-15b:2").range_list()
        with pytest.raises(InputError):
            Ref("Exodus 15:12-16:1").range_list()

    def test_ref_regex(self):
        assert Ref("Exodus 15").regex() == u'^Exodus( 15$| 15:| 15 \\d)'
        assert Ref("Exodus 15:15-17").regex() == u'^Exodus( 15:15$| 15:15:| 15:15 \\d| 15:16$| 15:16:| 15:16 \\d| 15:17$| 15:17:| 15:17 \\d)'
        assert Ref("Yoma 14a").regex() == u'^Yoma( 14a$| 14a:| 14a \\d)'
        assert Ref("Yoma 14a:12-15").regex() == u'^Yoma( 14a:12$| 14a:12:| 14a:12 \\d| 14a:13$| 14a:13:| 14a:13 \\d| 14a:14$| 14a:14:| 14a:14 \\d| 14a:15$| 14a:15:| 14a:15 \\d)'
        assert Ref("Yoma").regex() == u'^Yoma($|:| \\d)'  # This is as legacy had it

    #todo: devise a better test of version_list()
    def test_version_list(self):
        assert len(Ref("Exodus").version_list()) > 3
        assert len(Ref("Exodus").version_list()) > len(Ref("Exodus 5").version_list())
        assert len(Ref("Shabbat").version_list()) > 5
        assert len(Ref("Shabbat").version_list()) > len(Ref("Shabbat 5b").version_list())


    def test_in_terms_of(self):
        Ref("Genesis 6:3").in_terms_of(Ref("Genesis 6")) == [3]
        Ref("Genesis 6:3").in_terms_of(Ref("Genesis")) == [6, 3]
        Ref("Genesis 6:3").in_terms_of(Ref("Genesis 6-7")) == [1, 3]
        Ref("Genesis 6").in_terms_of(Ref("Genesis 6-7")) == [1]
        Ref("Genesis 6").in_terms_of(Ref("Genesis 6")) == []

        Ref("Genesis 6:8").in_terms_of(Ref("Genesis 6:3-7:3")) == [1, 6]
        Ref("Genesis 7").in_terms_of(Ref("Genesis 6-8")) == [2]
        Ref("Genesis 7").in_terms_of(Ref("Genesis 6:5-8:5")) == [2]

        Ref("Genesis 21:5").in_terms_of(Ref("Genesis 19-21")) == [3, 5]
        Ref("Numbers 14:8").in_terms_of(Ref("Numbers 14")) == [8]

    def test_out_of_range(self):
        """
        Test exactly on the cut-off line, for each type of text that has a different algorithmic path
        """
        Ref("Genesis 50")
        Ref("Zevachim 120b")
        Ref("Jerusalem Talmud Nazir 47b")

        with pytest.raises(InputError):
            Ref("Genesis 51")
        with pytest.raises(InputError):
            Ref("Zevachim 121a")
        with pytest.raises(InputError):
            Ref("Jerusalem Talmud Nazir 48a")

    def test_tamid(self):
        Ref("Tamid 25b")  # First amud
        Ref("Tamid 33b")  # Last amud


class Test_Cache(object):
    def test_cache_identity(self):
        assert Ref("Ramban on Genesis 1") is Ref("Ramban on Genesis 1")
        assert Ref(u"שבת ד' כב.") is Ref(u"שבת ד' כב.")

    def test_obj_created_cache_identity(self):
        assert Ref("Job 4") is Ref("Job 4:5").top_section_ref()
        assert Ref("Rashi on Genesis 2:3:1").context_ref() is Ref("Rashi on Genesis 2:3")

    def test_different_tref_cache_identity(self):
        assert Ref("Genesis 27:3") is Ref("Gen. 27:3")
        assert Ref("Gen. 27:3") is Ref(u"בראשית כז.ג")

    def test_cache_clearing(self):
        r1 = Ref("Ramban on Genesis 1")
        Ref.clear_cache()
        r2 = Ref("Ramban on Genesis 1")
        assert r1 is not r2


class Test_normal_forms(object):
    def test_normal(self):
        assert Ref("Genesis 2:5").normal() == "Genesis 2:5"
        assert Ref("Shabbat 32b").normal() == "Shabbat 32b"
        assert Ref("Mishnah Peah 4:2-4").normal() == "Mishnah Peah 4:2-4"

    def test_url_form(self):
        assert Ref("Genesis 2:5").url() == "Genesis.2.5"
        assert Ref("Genesis 2:5-10").url() == "Genesis.2.5-10"
        assert Ref("Rashi on Shabbat 12a.10").url() == "Rashi_on_Shabbat.12a.10"


class Test_term_refs(object):
    def test_ref_resolution(self):
        assert Ref("bo") ==  Ref('Exodus 10:1-13:16')
        assert Ref(u"משפטים") == Ref("Exodus 21:1-24:18")
        assert Ref("Shemot") == Ref("Exodus")  # This behavior may change, if we spec it more carefully



class Test_comparisons(object):
    def test_overlaps(self):
        assert Ref("Genesis 5:10-20").overlaps(Ref("Genesis 5:18-25"))
        assert Ref("Genesis 5:10-20").overlaps(Ref("Genesis 5:13-28"))
        assert Ref("Genesis 5:13-28").overlaps(Ref("Genesis 5:10-20"))
        assert not Ref("Genesis 5:10-20").overlaps(Ref("Genesis 5:21-25"))

        assert Ref("Genesis 5:10-6:20").overlaps(Ref("Genesis 6:18-25"))
        assert Ref("Genesis 5:10-6:20").overlaps(Ref("Genesis 5:18-25"))
        assert Ref("Genesis 5:18-25").overlaps(Ref("Genesis 5:10-6:20"))
        assert not Ref("Genesis 5:10-6:20").overlaps(Ref("Genesis 6:21-25"))

        assert Ref("Genesis 5").overlaps(Ref("Genesis"))
        assert Ref("Genesis").overlaps(Ref("Genesis 5"))

        assert Ref("Rashi on Genesis 5:10-20").overlaps(Ref("Rashi on Genesis 5:18-25"))
        assert not Ref("Rashi on Genesis 5:10-20").overlaps(Ref("Rashi on Genesis 5:21-25"))

        assert Ref("Rashi on Genesis 5:10-6:20").overlaps(Ref("Rashi on Genesis 6:18-25"))
        assert not Ref("Rashi on Genesis 5:10-6:20").overlaps(Ref("Rashi on Genesis 6:21-25"))

        assert not Ref("Genesis 5:10-6:20").overlaps(Ref("Rashi on Genesis 5:10-6:20"))

        assert Ref("Shabbat 5b-7a").overlaps(Ref("Shabbat 6b-9a"))
        assert not Ref("Shabbat 5b-7a").overlaps(Ref("Shabbat 15b-17a"))

        assert Ref("Shabbat 5b:10-20").overlaps(Ref("Shabbat 5b:18-20"))
        assert not Ref("Shabbat 5b:10-20").overlaps(Ref("Shabbat 5b:23-29"))


    def test_contains(self):
        assert Ref("Genesis 5:10-20").contains(Ref("Genesis 5:10-20"))
        assert Ref("Genesis 5:10-20").contains(Ref("Genesis 5:13-18"))
        assert not Ref("Genesis 5:10-20").contains(Ref("Genesis 5:21-25"))
        assert not Ref("Genesis 5:10-20").contains(Ref("Genesis 5:18-25"))

        assert Ref("Genesis 5:10-6:20").contains(Ref("Genesis 5:18-25"))
        assert Ref("Genesis 5:10-6:20").contains(Ref("Genesis 5:18-6:10"))
        assert not Ref("Genesis 5:10-6:20").contains(Ref("Genesis 6:21-25"))
        assert not Ref("Genesis 5:10-6:20").contains(Ref("Genesis 6:5-25"))

        assert Ref("Exodus 6").contains(Ref("Exodus 6:2"))
        assert Ref("Exodus 6").contains(Ref("Exodus 6:2-12"))

        assert Ref("Exodus").contains(Ref("Exodus 6"))
        assert Ref("Exodus").contains(Ref("Exodus 6:2"))
        assert Ref("Exodus").contains(Ref("Exodus 6:2-12"))

        assert Ref("Rashi on Genesis 5:10-20").contains(Ref("Rashi on Genesis 5:18-20"))
        assert not Ref("Rashi on Genesis 5:10-20").contains(Ref("Rashi on Genesis 5:21-25"))
        assert not Ref("Rashi on Genesis 5:10-20").contains(Ref("Rashi on Genesis 5:15-25"))

        assert Ref("Rashi on Genesis 5:10-6:20").contains(Ref("Rashi on Genesis 6:18-19"))
        assert not Ref("Rashi on Genesis 5:10-6:20").contains(Ref("Rashi on Genesis 6:21-25"))
        assert not Ref("Rashi on Genesis 5:10-6:20").contains(Ref("Rashi on Genesis 6:5-25"))

        assert not Ref("Genesis 5:10-6:20").contains(Ref("Rashi on Genesis 5:10-6:20"))
        assert not Ref("Rashi on Genesis 5:10-6:20").contains(Ref("Genesis 5:10-6:20"))

        assert Ref("Shabbat 5b-7a").contains(Ref("Shabbat 6b-7a"))
        assert not Ref("Shabbat 5b-7a").contains(Ref("Shabbat 15b-17a"))
        assert not Ref("Shabbat 5b-7a").contains(Ref("Shabbat 6b-17a"))

        assert Ref("Shabbat 5b:10-20").contains(Ref("Shabbat 5b:18-20"))
        assert not Ref("Shabbat 5b:10-20").contains(Ref("Shabbat 5b:23-29"))
        assert not Ref("Shabbat 5b:10-20").contains(Ref("Shabbat 5b:15-29"))

    def test_precedes(self):
        assert Ref("Genesis 5:10-20").precedes(Ref("Genesis 5:21-25"))
        assert Ref("Genesis 5:10-20").precedes(Ref("Genesis 7:21-25"))
        assert Ref("Genesis 5:10-20").precedes(Ref("Genesis 7"))
        assert Ref("Genesis 5:10-20").precedes(Ref("Genesis 7:21"))

        assert not Ref("Genesis").precedes(Ref("Genesis 5"))
        assert not Ref("Genesis").precedes(Ref("Genesis 5:16"))
        assert not Ref("Genesis").precedes(Ref("Genesis 5:16-25"))

        assert not Ref("Genesis 4").precedes(Ref("Genesis"))
        assert not Ref("Genesis 4:3").precedes(Ref("Genesis"))
        assert not Ref("Genesis 4:3-5").precedes(Ref("Genesis"))

        assert not Ref("Genesis 5:10-20").precedes(Ref("Genesis 5:16-25"))
        assert not Ref("Genesis 5:10-20").precedes(Ref("Genesis 4:18-25"))

        assert Ref("Genesis 5:10-6:20").precedes(Ref("Genesis 6:23-25"))
        assert Ref("Genesis 5:10-6:20").precedes(Ref("Genesis 6:21-8:10"))
        assert not Ref("Genesis 5:10-6:20").precedes(Ref("Genesis 6:5-25"))
        assert not Ref("Genesis 5:10-6:20").precedes(Ref("Genesis 6:5"))
        assert not Ref("Genesis 5:10-6:20").precedes(Ref("Genesis 4:12"))
        assert not Ref("Genesis 5:10-6:20").precedes(Ref("Genesis 5:5"))
        assert not Ref("Genesis 5:10-6:20").precedes(Ref("Genesis 5"))

        assert not Ref("Rashi on Genesis 5:10-20").precedes(Ref("Rashi on Genesis 5:18-20"))
        assert Ref("Rashi on Genesis 5:10-20").precedes(Ref("Rashi on Genesis 5:21-25"))
        assert not Ref("Rashi on Genesis 5:10-20").precedes(Ref("Rashi on Genesis 5:15-25"))

        assert not Ref("Rashi on Genesis 5:10-6:20").precedes(Ref("Rashi on Genesis 6:18-19"))
        assert Ref("Rashi on Genesis 5:10-6:20").precedes(Ref("Rashi on Genesis 6:21-25"))
        assert not Ref("Rashi on Genesis 5:10-6:20").precedes(Ref("Rashi on Genesis 6:5-25"))

        assert not Ref("Genesis 5:10-6:20").precedes(Ref("Rashi on Genesis 5:10-6:20"))
        assert not Ref("Rashi on Genesis 5:10-6:20").precedes(Ref("Genesis 5:10-6:20"))

        assert not Ref("Shabbat 5b-7a").precedes(Ref("Shabbat 6b-7a"))
        assert Ref("Shabbat 5b-7a").precedes(Ref("Shabbat 15b-17a"))
        assert not Ref("Shabbat 5b-7a").precedes(Ref("Shabbat 6b-17a"))

        assert not Ref("Shabbat 5b:10-20").precedes(Ref("Shabbat 5b:18-20"))
        assert Ref("Shabbat 5b:10-20").precedes(Ref("Shabbat 5b:23-29"))
        assert not Ref("Shabbat 5b:10-20").precedes(Ref("Shabbat 5b:15-29"))


    def test_follows(self):
        assert Ref("Genesis 5:21-25").follows(Ref("Genesis 5:10-20"))
        assert Ref("Genesis 7:21-25").follows(Ref("Genesis 5:10-20"))
        assert Ref("Genesis 7").follows(Ref("Genesis 5:10-20"))
        assert Ref("Genesis 7:21").follows(Ref("Genesis 5:10-20"))

        assert not Ref("Genesis").follows(Ref("Genesis 5"))
        assert not Ref("Genesis").follows(Ref("Genesis 5:16"))
        assert not Ref("Genesis").follows(Ref("Genesis 5:16-25"))

        assert not Ref("Genesis 4").follows(Ref("Genesis"))
        assert not Ref("Genesis 4:3").follows(Ref("Genesis"))
        assert not Ref("Genesis 4:3-5").follows(Ref("Genesis"))

        assert not Ref("Genesis 5:16-25").follows(Ref("Genesis 5:10-20"))
        assert not Ref("Genesis 4:18-25").follows(Ref("Genesis 5:10-20"))

        assert Ref("Genesis 6:23-25").follows(Ref("Genesis 5:10-6:20"))
        assert Ref("Genesis 6:21-8:10").follows(Ref("Genesis 5:10-6:20"))
        assert not Ref("Genesis 6:5-25").follows(Ref("Genesis 5:10-6:20"))
        assert not Ref("Genesis 6:5").follows(Ref("Genesis 5:10-6:20"))
        assert not Ref("Genesis 4:12").follows(Ref("Genesis 5:10-6:20"))
        assert not Ref("Genesis 5:5").follows(Ref("Genesis 5:10-6:20"))
        assert not Ref("Genesis 5").follows(Ref("Genesis 5:10-6:20"))

        assert not Ref("Rashi on Genesis 5:18-20").follows(Ref("Rashi on Genesis 5:10-20"))
        assert Ref("Rashi on Genesis 5:21-25").follows(Ref("Rashi on Genesis 5:10-20"))
        assert not Ref("Rashi on Genesis 5:15-25").follows(Ref("Rashi on Genesis 5:10-20"))

        assert not Ref("Rashi on Genesis 6:18-19").follows(Ref("Rashi on Genesis 5:10-6:20"))
        assert Ref("Rashi on Genesis 6:21-25").follows(Ref("Rashi on Genesis 5:10-6:20"))
        assert not Ref("Rashi on Genesis 6:5-25").follows(Ref("Rashi on Genesis 5:10-6:20"))

        assert not Ref("Rashi on Genesis 5:10-6:20").follows(Ref("Genesis 5:10-6:20"))
        assert not Ref("Genesis 5:10-6:20").follows(Ref("Rashi on Genesis 5:10-6:20"))

        assert not Ref("Shabbat 6b-7a").follows(Ref("Shabbat 5b-7a"))
        assert Ref("Shabbat 15b-17a").follows(Ref("Shabbat 5b-7a"))
        assert not Ref("Shabbat 6b-17a").follows(Ref("Shabbat 5b-7a"))

        assert not Ref("Shabbat 5b:18-20").follows(Ref("Shabbat 5b:10-20"))
        assert Ref("Shabbat 5b:23-29").follows(Ref("Shabbat 5b:10-20"))
        assert not Ref("Shabbat 5b:15-29").follows(Ref("Shabbat 5b:10-20"))


class Test_set_construction_from_ref(object):
    def test_ref_noteset(self):
        pass

    def test_ref_linkset(self):
        pass



'''
class Test_ref_manipulations():

    def test_section_level_ref(self):
        assert t.section_level_ref("Rashi on Genesis 2:3:1") == "Rashi on Genesis 2:3"
        assert t.section_level_ref("Genesis 2:3") == "Genesis 2"
        assert t.section_level_ref("Shabbat 4a") == "Shabbat 4a"

    def test_list_refs_in_range(self):
        assert t.list_refs_in_range("Job 4:5-9") == ["Job 4:5","Job 4:6","Job 4:7","Job 4:8","Job 4:9"]
        assert t.list_refs_in_range("Genesis 2:3") == ["Genesis 2:3"]
'''