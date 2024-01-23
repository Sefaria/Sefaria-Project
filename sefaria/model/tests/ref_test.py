# -*- coding: utf-8 -*-
import pytest
from sefaria.model import *
from sefaria.system.exceptions import InputError

class Test_Ref(object):

    def test_short_names(self):
        ref = Ref("Exo. 3:1")
        assert ref.book == "Exodus"
        assert Ref("Prov. 3.19") == Ref("Proverbs 3:19")
        assert Ref("Exo. 3.19")
        assert Ref("Prov 3.20")
        assert Ref("Exo 3.20")
        assert Ref("Prov.3.21")
        assert Ref("Exo.3.21")
        assert Ref("1Ch.") == Ref("1 Chronicles")

    def test_normal_form_is_identifcal(self):
        assert Ref("Genesis 2:5").normal() == "Genesis 2:5"
        assert Ref("Shabbat 32b").normal() == "Shabbat 32b"
        assert Ref("Mishnah Peah 4:2-4").normal() == "Mishnah Peah 4:2-4"

    def test_bible_range(self):
        ref = Ref("Job.2:3-3:1")
        assert ref.toSections == [3, 1]
        ref = Ref("Jeremiah 7:17\u201318")  # test with unicode dash
        assert ref.toSections == [7, 18]
        ref = Ref("Jeremiah 7:17\u201118")  # test with unicode dash
        assert ref.toSections == [7, 18]
        ref = Ref("I Chronicles 1:2 - I Chronicles 1:3")  # test with unicode dash
        assert ref.toSections == [1, 3]

    def test_short_bible_refs(self):
        assert Ref("Exodus") != Ref("Exodus 1")
        assert Ref("Exodus").padded_ref() == Ref("Exodus 1")

    def test_short_talmud_refs(self):
        assert Ref("Sanhedrin 2a") != Ref("Sanhedrin")

    def test_talmud_refs_without_amud(self):
        assert Ref("Sanhedrin 2") == Ref("Sanhedrin 2a-2b")
        assert Ref("Shabbat 7") == Ref("Shabbat 7a-7b")

    def test_talmud_refs_short_range(self):
        assert Ref("Shabbat 7a-b") == Ref("Shabbat 7a-7b")

    def test_refs_beyond_end_of_book(self):
        assert Ref("Yoma 88") == Ref("Yoma 88a")
        assert Ref("Yoma 87-90") == Ref("Yoma 87a-88a")

    # This test runs for 90% of this suite's time, and passes.  Seems pretty trivial.  Can we trim it?
    @pytest.mark.deep
    def test_each_title(object):
        for lang in ["en", "he"]:
            for t in library.full_title_list(lang, False):
                assert library.all_titles_regex(lang).match(t), "'{}' doesn't resolve".format(t)

    def test_comma(self):
        assert Ref("Me'or Einayim, Chayei Sara 24") == Ref("Me'or Einayim, Chayei Sara, 24")
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

    def test_all_context_refs(self):
        assert Ref('Rashi on Genesis 2:3:4').all_context_refs() == [Ref('Rashi on Genesis 2:3:4'), Ref('Rashi on Genesis 2:3'), Ref('Rashi on Genesis 2')]
        assert Ref('Rashi on Genesis 2:3:4').all_context_refs(include_self = False, include_book = True) == [Ref('Rashi on Genesis 2:3'), Ref('Rashi on Genesis 2'), Ref('Rashi on Genesis')]
        assert Ref('Rashi on Genesis 2:3:4').all_context_refs(include_self = False, include_book = False) == [Ref('Rashi on Genesis 2:3'), Ref('Rashi on Genesis 2')]
        assert Ref('Rashi on Genesis 2:3:4').all_context_refs(include_self = True, include_book = True) == [Ref('Rashi on Genesis 2:3:4'), Ref('Rashi on Genesis 2:3'), Ref('Rashi on Genesis 2'), Ref('Rashi on Genesis')]

        assert Ref("Pesach Haggadah, Magid, First Fruits Declaration 2") .all_context_refs() == [Ref('Pesach Haggadah, Magid, First Fruits Declaration 2'), Ref('Pesach Haggadah, Magid, First Fruits Declaration'), Ref('Pesach Haggadah, Magid')]
        assert Ref("Pesach Haggadah, Magid, First Fruits Declaration 2") .all_context_refs(include_self = True, include_book = True) == [Ref('Pesach Haggadah, Magid, First Fruits Declaration 2'), Ref('Pesach Haggadah, Magid, First Fruits Declaration'), Ref('Pesach Haggadah, Magid'), Ref('Pesach Haggadah')]
        assert Ref("Pesach Haggadah, Magid, First Fruits Declaration 2") .all_context_refs(include_self = False, include_book = True) == [Ref('Pesach Haggadah, Magid, First Fruits Declaration'), Ref('Pesach Haggadah, Magid'), Ref('Pesach Haggadah')]
        assert Ref("Pesach Haggadah, Magid, First Fruits Declaration 2") .all_context_refs(include_self = False, include_book = False) == [Ref('Pesach Haggadah, Magid, First Fruits Declaration'), Ref('Pesach Haggadah, Magid')]

        # Don't choke on Schema nodes.
        assert Ref("Pesach Haggadah, Magid").all_context_refs() == [Ref("Pesach Haggadah, Magid")]

        # Don't choke on Virtual nodes
        assert Ref("Jastrow, ג").all_context_refs() == [Ref("Jastrow, ג"), Ref('Jastrow<d>')]

    # These won't work unless the sheet is present in the db
    @pytest.mark.deep
    def test_sheet_refs(self):
        assert Ref("Sheet 4:3").all_context_refs() == [Ref('Sheet 4:3'), Ref('Sheet 4')]

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
        assert Ref("Berakhot 64a").next_section_ref() is None
        assert Ref("Rif Chullin 43a").next_section_ref().normal() == "Rif Chullin 44b"

    def test_complex_next_ref(self): #at time of test we only had complex commentaries stable to test with
        assert Ref('Pesach Haggadah, Kadesh').next_section_ref().normal() == 'Pesach Haggadah, Urchatz'
        assert Ref('Orot, Lights from Darkness, Lights of Rebirth 72').next_section_ref().normal() == 'Orot, Lights from Darkness, Great Calling'
        assert Ref('Orot, Lights from Darkness, Great Calling').next_section_ref().normal() == 'Orot, The Process of Ideals in Israel, The Godly and the National Ideal in the Individual'
        assert Ref('Ephod Bad on Pesach Haggadah, Magid, The Four Sons 1').next_section_ref().normal() == 'Ephod Bad on Pesach Haggadah, Magid, The Four Sons 2'
        assert Ref('Ephod Bad on Pesach Haggadah, Magid, In the Beginning Our Fathers Were Idol Worshipers 5').next_section_ref().normal() == 'Ephod Bad on Pesach Haggadah, Magid, First Fruits Declaration 2'
        assert Ref("Naftali Seva Ratzon on Pesach Haggadah, Kadesh 2").next_section_ref().normal() == "Naftali Seva Ratzon on Pesach Haggadah, Karpas 1"
        assert Ref("Naftali Seva Ratzon on Pesach Haggadah, Magid, Ha Lachma Anya 2").next_section_ref().normal() == "Naftali Seva Ratzon on Pesach Haggadah, Magid, We Were Slaves in Egypt 2"
        assert Ref("Ephod Bad on Pesach Haggadah, Magid, First Half of Hallel 4").next_section_ref().normal() == "Ephod Bad on Pesach Haggadah, Barech, Pour Out Thy Wrath 2"
        assert Ref("Kos Shel Eliyahu on Pesach Haggadah, Magid, Second Cup of Wine 2").next_section_ref() is Ref('Kos Eliyahu on Pesach Haggadah, Barech, Pour Out Thy Wrath 2')

    def test_prev_ref(self):
        assert Ref("Job 4:5").prev_section_ref().normal() == "Job 3"
        assert Ref("Shabbat 4b").prev_section_ref().normal() == "Shabbat 4a"
        assert Ref("Shabbat 5a").prev_section_ref().normal() == "Shabbat 4b"
        assert Ref("Rashi on Genesis 6:2:1").prev_section_ref().normal() == "Rashi on Genesis 5:32"
        assert Ref("Berakhot 2a").prev_section_ref() is None
        assert Ref("Rif Chullin 44b").prev_section_ref().normal() == "Rif Chullin 43a"

    def test_complex_prev_ref(self):
        assert Ref('Pesach Haggadah, Urchatz').prev_section_ref().normal() == 'Pesach Haggadah, Kadesh'
        assert Ref('Orot, Lights from Darkness, Great Calling').prev_section_ref().normal() == 'Orot, Lights from Darkness, Lights of Rebirth 72'
        assert Ref('Orot, The Process of Ideals in Israel, The Godly and the National Ideal in the Individual').prev_section_ref().normal() == 'Orot, Lights from Darkness, Great Calling'
        assert Ref('Ephod Bad on Pesach Haggadah, Magid, The Four Sons 2').prev_section_ref().normal() == 'Ephod Bad on Pesach Haggadah, Magid, The Four Sons 1'
        assert Ref('Ephod Bad on Pesach Haggadah, Magid, First Fruits Declaration 2').prev_section_ref().normal() == 'Ephod Bad on Pesach Haggadah, Magid, In the Beginning Our Fathers Were Idol Worshipers 5'
        assert Ref("Naftali Seva Ratzon on Pesach Haggadah, Karpas 1").prev_section_ref().normal() == "Naftali Seva Ratzon on Pesach Haggadah, Kadesh 2"
        assert Ref("Naftali Seva Ratzon on Pesach Haggadah, Magid, We Were Slaves in Egypt 2").prev_section_ref().normal() == "Naftali Seva Ratzon on Pesach Haggadah, Magid, Ha Lachma Anya 2"
        assert Ref("Ephod Bad on Pesach Haggadah, Hallel, Second Half of Hallel 2").prev_section_ref().normal() == "Ephod Bad on Pesach Haggadah, Barech, Pour Out Thy Wrath 2"
        assert Ref("Kos Shel Eliyahu on Pesach Haggadah, Magid, Ha Lachma Anya 3").prev_section_ref() is None

    def test_next_segment_ref(self):
        assert Ref("Exodus 4:1").next_segment_ref() == Ref("Exodus 4:2")
        assert Ref("Exodus 3:22").next_segment_ref() == Ref("Exodus 4:1")
        assert Ref("Rashi on Exodus 3:1:1").next_segment_ref() == Ref("Rashi on Exodus 3:1:2")
        assert Ref("Rashi on Exodus 2:25:1").next_segment_ref() == Ref("Rashi on Exodus 3:1:1")
        assert Ref("Rashi on Exodus 3:19:2").next_segment_ref() == Ref("Rashi on Exodus 3:22:1")
        assert Ref("Shabbat 5b:9").next_segment_ref() == Ref("Shabbat 5b:10")
        assert Ref("Shabbat 5b:11").next_segment_ref() == Ref("Shabbat 6a:1")
        assert Ref("Rashi on Shabbat 5b:5:4").next_segment_ref() == Ref("Rashi on Shabbat 5b:5:5")
        assert Ref("Rashi on Shabbat 6a:1:1").next_segment_ref() == Ref("Rashi on Shabbat 6a:3:1")
        assert Ref("Rashi on Shabbat 5b:10:1").next_segment_ref() == Ref("Rashi on Shabbat 6a:1:1")

    def test_prev_segment_ref(self):
        assert Ref("Exodus 4:3").prev_segment_ref() == Ref("Exodus 4:2")
        assert Ref("Exodus 4:1").prev_segment_ref() == Ref("Exodus 3:22")
        assert Ref("Rashi on Exodus 3:1:2").prev_segment_ref() == Ref("Rashi on Exodus 3:1:1")
        assert Ref("Rashi on Exodus 3:1:1").prev_segment_ref() == Ref("Rashi on Exodus 2:25:1")
        assert Ref("Rashi on Exodus 3:22:1").prev_segment_ref() == Ref("Rashi on Exodus 3:19:2")
        assert Ref("Shabbat 5b:10").prev_segment_ref() == Ref("Shabbat 5b:9")
        assert Ref("Shabbat 6a:1").prev_segment_ref() == Ref("Shabbat 5b:11")
        assert Ref("Rashi on Shabbat 5b:5:5").prev_segment_ref() == Ref("Rashi on Shabbat 5b:5:4")
        assert Ref("Rashi on Shabbat 6a:3:1").prev_segment_ref() == Ref("Rashi on Shabbat 6a:1:1")
        assert Ref("Rashi on Shabbat 6a:1:1").prev_segment_ref() == Ref("Rashi on Shabbat 5b:10:1")

    def test_last_segment_ref(self):
        assert Ref("Exodus").last_segment_ref() == Ref('Exodus 40:38')
        assert Ref("Rashi on Exodus").last_segment_ref() == Ref('Rashi on Exodus 40:38:1')
        assert Ref("Shabbat").last_segment_ref() == Ref('Shabbat 157b:3')
        assert Ref("Rashi on Shabbat").last_segment_ref() == Ref("Rashi on Shabbat 157b:2:2")

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

    def test_out_of_order_range(self):
        with pytest.raises(InputError):
            r = Ref("Leviticus 15 - 13")
        with pytest.raises(InputError):
            r = Ref("Leviticus 15:3 - 15:1")

    def test_to_section_segment(self):
        r = Ref("Leviticus 15")
        s = Ref("Leviticus 16:3")
        t = r.to(s)
        assert t.sections == [15,1]
        assert t.toSections == [16,3]

        r = Ref("Leviticus 15:3")
        s = Ref("Leviticus 16")
        t = r.to(s)
        assert t.sections == [15,3]
        assert t.toSections == [16, 34]

    def test_pad_to_last_segment_ref(self):
        r = Ref("Leviticus 16")
        assert r.pad_to_last_segment_ref().sections == [16,34]

        r = Ref("Leviticus")
        assert r.pad_to_last_segment_ref() == r.last_segment_ref()

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
        assert Ref("Leviticus 15:3 - 17:12").split_spanning_ref() == [Ref('Leviticus 15:3-33'), Ref('Leviticus 16'), Ref('Leviticus 17:1-12')]
        assert Ref("Leviticus 15-17").split_spanning_ref() == [Ref('Leviticus 15'), Ref('Leviticus 16'), Ref('Leviticus 17')]
        assert Ref("Leviticus 15:17-21").split_spanning_ref() == [Ref('Leviticus 15:17-21')]
        assert Ref("Leviticus 15:17").split_spanning_ref() == [Ref('Leviticus 15:17')]
        assert Ref("Shabbat 15a-16b").split_spanning_ref() == [Ref('Shabbat 15a'), Ref('Shabbat 15b'), Ref('Shabbat 16a'), Ref('Shabbat 16b')]
        assert Ref("Shabbat 15a").split_spanning_ref() == [Ref('Shabbat 15a')]
        assert Ref("Shabbat 15a:8-15b:8").split_spanning_ref() == [Ref('Shabbat 15a:8-10'), Ref('Shabbat 15b:1-8')]
        assert Ref("Rashi on Exodus 5:3-6:7").split_spanning_ref() == [Ref('Rashi on Exodus 5:3'), Ref('Rashi on Exodus 5:4'), Ref('Rashi on Exodus 5:5'), Ref('Rashi on Exodus 5:6'), Ref('Rashi on Exodus 5:7'), Ref('Rashi on Exodus 5:8'), Ref('Rashi on Exodus 5:9'), Ref('Rashi on Exodus 5:10'), Ref('Rashi on Exodus 5:11'), Ref('Rashi on Exodus 5:12'), Ref('Rashi on Exodus 5:13'), Ref('Rashi on Exodus 5:14'), Ref('Rashi on Exodus 5:15'), Ref('Rashi on Exodus 5:16'), Ref('Rashi on Exodus 5:17'), Ref('Rashi on Exodus 5:18'), Ref('Rashi on Exodus 5:19'), Ref('Rashi on Exodus 5:20'), Ref('Rashi on Exodus 5:21'), Ref('Rashi on Exodus 5:22'), Ref('Rashi on Exodus 5:23'), Ref('Rashi on Exodus 6:1'), Ref('Rashi on Exodus 6:2'), Ref('Rashi on Exodus 6:3'), Ref('Rashi on Exodus 6:4'), Ref('Rashi on Exodus 6:5'), Ref('Rashi on Exodus 6:6'), Ref('Rashi on Exodus 6:7')]

    def test_spanning_with_empty_first_ref(self):
        r = Ref("Rashi on Genesis 21:2:3-7:3")
        refs = r.split_spanning_ref()
        assert refs[0] == Ref("Rashi on Genesis 21:3")

    def test_first_spanned_ref(self):
        tests = [
            Ref("Exodus 15:3 - 17:12"),
            Ref("Rashi on Genesis 5:3-6:7"),
            Ref("Gittin 15a:8-15b:8"),
            Ref("Rashi on Gittin 2b:1-7a:3"),
            Ref("Shabbat 6b-9a")
        ]
        for ref in tests:
            first = ref.first_spanned_ref()
            assert first == ref.split_spanning_ref()[0]

    @pytest.mark.xfail(reason="cause")
    def test_split_spanning_ref_expanded(self):
        assert Ref("Leviticus 15:3 - 17:12").split_spanning_ref() == [Ref('Leviticus 15:3-33'), Ref('Leviticus 16:1-34'), Ref('Leviticus 17:1-12')]

    def test_range_list(self):
        assert Ref("Leviticus 15:12-17").range_list() ==  [Ref('Leviticus 15:12'), Ref('Leviticus 15:13'), Ref('Leviticus 15:14'), Ref('Leviticus 15:15'), Ref('Leviticus 15:16'), Ref('Leviticus 15:17')]
        assert Ref("Shabbat 15b:5-8").range_list() ==  [Ref('Shabbat 15b:5'), Ref('Shabbat 15b:6'), Ref('Shabbat 15b:7'), Ref('Shabbat 15b:8')]

        assert Ref("Exodus 15:25-16:2").range_list() == [
                             Ref('Exodus 15:25'),
                             Ref('Exodus 15:26'),
                             Ref('Exodus 15:27'),
                             Ref('Exodus 16:1'),
                             Ref('Exodus 16:2')]

        assert Ref("Shabbat 15a:9-15b:2").range_list() == [Ref('Shabbat 15a:9'),
                                                        Ref('Shabbat 15a:10'),
                                                        Ref('Shabbat 15b:1'),
                                                        Ref('Shabbat 15b:2')]

    def test_range_list_first_and_last_segment(self):
        assert Ref("Shabbat 15a:9-15b:1").range_list() == [Ref('Shabbat 15a:9'),
                                                            Ref('Shabbat 15a:10'),
                                                            Ref('Shabbat 15b:1')]
        assert Ref("Shabbat 15a:10-15b:1").range_list() == [Ref('Shabbat 15a:10'),
                                                            Ref('Shabbat 15b:1')]
        assert Ref("Shabbat 15a:10-15b:2").range_list() == [Ref('Shabbat 15a:10'),
                                                            Ref('Shabbat 15b:1'), Ref('Shabbat 15b:2')]
        assert Ref("Exodus 15:25-16:1").range_list() == [Ref('Exodus 15:25'), Ref('Exodus 15:26'), Ref('Exodus 15:27'),
                                                         Ref('Exodus 16:1')]

    def test_stating_refs_of_span(self):
        assert Ref("Rashi on Berakhot 3a:2:1-4a:3:1").starting_refs_of_span() == [Ref("Rashi on Berakhot 3a:2:1"), Ref("Rashi on Berakhot 3b"), Ref("Rashi on Berakhot 4a")]
        assert Ref("Genesis 12:1-14:3").starting_refs_of_span() == [Ref("Genesis 12:1"), Ref("Genesis 13"), Ref("Genesis 14")]
        assert Ref("Rashi on Berakhot 3a:2:1-5:1").starting_refs_of_span() == [Ref("Rashi on Berakhot 3a:2:1")]
        assert Ref("Rashi on Berakhot 3a:4:1-6:1").starting_refs_of_span(True) == [Ref("Rashi on Berakhot 3a:4:1"), Ref("Rashi on Berakhot 3a:5"), Ref("Rashi on Berakhot 3a:6")]

    def test_as_ranged_segment_ref(self):
        assert Ref("Rashi on Berakhot").as_ranged_segment_ref() == Ref("Rashi on Berakhot 2a:1:1-64a:15:1")
        assert Ref("Berakhot").as_ranged_segment_ref() == Ref("Berakhot 2a:1-64a:15")
        assert Ref('Genesis').as_ranged_segment_ref() == Ref('Genesis.1.1-50.26')
        assert Ref('Shabbat.3a.1').as_ranged_segment_ref() == Ref('Shabbat.3a.1')
        assert Ref('Rashi on Shabbat.3b').as_ranged_segment_ref() == Ref('Rashi on Shabbat.3b.1.1-3b.13.1')
        assert Ref('Tur, Orach Chaim.57-59').as_ranged_segment_ref() == Ref('Tur, Orach Chaim.57.1-59.1')
        # empty at the end
        assert Ref('Tosafot on Bava Metzia.2a').as_ranged_segment_ref() == Ref('Tosafot on Bava Metzia.2a.1.1-2a.12.1')
        # empty at the beginning
        assert Ref('Tosafot on Bava Metzia.3a').as_ranged_segment_ref() == Ref('Tosafot on Bava Metzia.3a.1.1-3a.18.1')
        assert Ref('Genesis.1-14').as_ranged_segment_ref() == Ref('Genesis.1.1-14.24')
        #assert Ref('Pesach Haggadah, Karpas').as_ranged_segment_ref() == Ref('Pesach Haggadah, Karpas.1-4')

        # This begins at 2.1, but as_ranged_segment_ref returns 1.1
        #assert Ref('Marbeh_Lesaper_on_Pesach_Haggadah,_Kadesh').as_ranged_segment_ref() == Ref('Marbeh_Lesaper_on_Pesach_Haggadah,_Kadesh.2.1-12.1')

    def test_subref(self):
        assert Ref("Exodus").subref(5) == Ref("Exodus 5")
        assert Ref("Exodus 5").subref(5) == Ref("Exodus 5:5")
        assert Ref("Rashi on Exodus").subref(5) == Ref("Rashi on Exodus 5")
        assert Ref("Rashi on Exodus 5").subref(5) == Ref("Rashi on Exodus 5:5")
        assert Ref("Rashi on Exodus 5:5").subref(5) == Ref("Rashi on Exodus 5:5:5")
        assert Ref("Shabbat").subref(10) == Ref("Shabbat 5b")
        assert Ref("Shabbat 5b").subref(10) == Ref("Shabbat 5b:10")
        assert Ref("Rashi on Shabbat").subref(10) == Ref("Rashi on Shabbat 5b")
        assert Ref("Rashi on Shabbat 5b").subref(10) == Ref("Rashi on Shabbat 5b:10")

        assert Ref("Exodus").subref([5, 8]) == Ref("Exodus 5:8")
        assert Ref("Rashi on Exodus 5").subref([5,5]) == Ref("Rashi on Exodus 5:5:5")
        assert Ref("Rashi on Exodus").subref([5,5,5]) == Ref("Rashi on Exodus 5:5:5")

    def test_negative_subref(self):
        assert Ref("Exodus").subref(-1) == Ref("Exodus 40")
        assert Ref("Exodus").subref(-3).subref(-4) == Ref("Exodus 38:28")
        assert Ref("Rashi on Exodus").subref(-5) == Ref("Rashi on Exodus 36")
        assert Ref("Rashi on Exodus 5").subref(-1) == Ref("Rashi on Exodus 5:23")
        assert Ref("Rashi on Exodus 5:7").subref(-2) == Ref("Rashi on Exodus 5:7:3")

        assert Ref("Exodus").subref([5, -1]) == Ref("Exodus 5:23")
        assert Ref("Rashi on Exodus 5").subref([5, -1]) == Ref("Rashi on Exodus 5:5:1")

    def test_all_subrefs(self):
        assert Ref("Genesis").all_subrefs()[49] == Ref("Genesis 50")
        assert Ref("Genesis 40").all_subrefs()[22] == Ref("Genesis 40:23")

    def test_ref_regex(self):
        assert Ref("Exodus 15").regex() == '^Exodus( 15$| 15:| 15 \\d)'
        assert Ref("Exodus 15:15-17").regex() == '^Exodus( 15:15$| 15:15:| 15:15 \\d| 15:16$| 15:16:| 15:16 \\d| 15:17$| 15:17:| 15:17 \\d)'
        assert Ref("Yoma 14a").regex() == '^Yoma( 14a$| 14a:| 14a \\d)'
        assert Ref("Yoma 14a:12-15").regex() == '^Yoma( 14a:12$| 14a:12:| 14a:12 \\d| 14a:13$| 14a:13:| 14a:13 \\d| 14a:14$| 14a:14:| 14a:14 \\d| 14a:15$| 14a:15:| 14a:15 \\d)'
        assert Ref("Yoma").regex() == '^Yoma($|:| \\d)'  # This is as legacy had it

    def test_spanning_ref_regex(self):
        assert Ref("Exodus 4:30-6:2").regex() == '^Exodus( 4:30$| 4:30:| 4:30 \\d| 4:31$| 4:31:| 4:31 \\d| 5$| 5:| 5 \\d| 6:1$| 6:1:| 6:1 \\d| 6:2$| 6:2:| 6:2 \\d)'

    #todo: devise a better test of version_list()
    def test_version_list(self):
        assert len(Ref("Exodus").version_list()) > 3
        assert len(Ref("Exodus").version_list()) > len(Ref("Exodus 5").version_list())
        assert len(Ref("Shabbat").version_list()) > 3
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
        Ref("Jerusalem Talmud Nazir 9:6")

        with pytest.raises(InputError):
            Ref("Genesis 51")
        with pytest.raises(InputError):
            Ref("Zevachim 121a")
        # TODO currently doesn't raise error because new Yerushalmi doesn't have lengths on Index record
        # with pytest.raises(InputError):
        #     Ref("Jerusalem Talmud Nazir 10:1")

    def test_tamid(self):
        Ref("Tamid 25b")  # First amud
        Ref("Tamid 33b")  # Last amud

    def test_surrounding_ref(self):
        assert Ref("Genesis 3.3").surrounding_ref() == Ref("Genesis 3.2-4")
        assert Ref("Genesis 3.3").surrounding_ref(2) == Ref("Genesis 3.1-5")
        assert Ref("Genesis 3.3").surrounding_ref(3) == Ref("Genesis 3.1-6")

        assert Ref('Genesis 1:3-2:23').surrounding_ref() == Ref("Genesis 1:2-2:24")
        assert Ref('Genesis 1:3-2:23').surrounding_ref(2) == Ref("Genesis 1:1-2:25")
        assert Ref('Genesis 1:3-2:23').surrounding_ref(3) == Ref("Genesis 1:1-2:25")  # Chapter ends on both sides

    def test_malbim(self):
        # Used to short circuit, fail to resolve to Malachi, and fail
        assert Ref("Malbim Beur Hamilot on Ezekiel")

    def test_distance(self):
        r1 = Ref("Genesis 1:3")
        r2 = Ref("Genesis 3:4")
        assert r1.distance(r2) == 57

        r1 = Ref("Shir HaShirim Rabbah 2:12:1")
        r2 = Ref("Shir HaShirim Rabbah 2:9:5")
        assert r1.distance(r2) == 2

    def test_is_segment_level(self):
        assert Ref("Leviticus 15:3").is_segment_level()
        assert not Ref("Leviticus 15").is_segment_level()
        assert not Ref("Rashi on Leviticus 15:3").is_segment_level()
        assert Ref("Rashi on Leviticus 15:3:1").is_segment_level()
        assert not Ref("Leviticus").is_segment_level() # JA root
        assert not Ref("Orot").is_segment_level() # schema node
        assert not Ref("Orot,_Lights_from_Darkness,_Land_of_Israel").is_segment_level() # JA root in complex text
        assert not Ref("Orot,_Lights_from_Darkness,_Land_of_Israel.4").is_segment_level()
        assert Ref("Orot,_Lights_from_Darkness,_Land_of_Israel.4.1").is_segment_level()

    def test_is_section_level(self):
        assert not Ref("Leviticus 15:3").is_section_level()
        assert Ref("Leviticus 15").is_section_level()
        assert Ref("Rashi on Leviticus 15:3").is_section_level()
        assert not Ref("Rashi on Leviticus 15:3:1").is_section_level()
        assert not Ref("Leviticus").is_section_level()  # JA root
        assert not Ref("Orot").is_section_level()  # schema node
        assert not Ref("Orot,_Lights_from_Darkness,_Land_of_Israel").is_section_level()  # JA root in complex text
        assert Ref("Orot,_Lights_from_Darkness,_Land_of_Israel.4").is_section_level()
        assert not Ref("Orot,_Lights_from_Darkness,_Land_of_Israel.4.1").is_section_level()

    def test_word_to(self):
        assert Ref("Kohelet Rabbah to 6:9") is Ref("Kohelet Rabbah 6.9")

class Test_Cache(object):
    def test_index_flush_from_cache(self):
        r1 = Ref("Genesis 1")
        r2 = Ref("Exodus 3")
        Ref.remove_index_from_cache("Genesis")
        assert r1 is not Ref("Genesis 1")
        assert r2 is Ref("Exodus 3")
        Ref.remove_index_from_cache("Genesis")

        r1 = Ref("Rashi on Genesis 1")
        r2 = Ref("Rashi on Exodus 3")
        Ref.remove_index_from_cache("Rashi on Genesis")
        assert r1 is not Ref("Rashi on Genesis 1")
        assert r2 is Ref("Rashi on Exodus 3")

    def test_flush_index_not_found(self):
        Ref("Genesis 1")
        Ref.remove_index_from_cache("Genesis")
        Ref.remove_index_from_cache("Genesis")

    def test_cache_identity(self):
        assert Ref("Ramban on Genesis 1") is Ref("Ramban on Genesis 1")
        assert Ref("שבת ד' כב.") is Ref("שבת ד' כב.")

    def test_obj_created_cache_identity(self):
        assert Ref("Job 4") is Ref("Job 4:5").top_section_ref()
        assert Ref("Rashi on Genesis 2:3:1").context_ref() is Ref("Rashi on Genesis 2:3")

    def test_different_tref_cache_identity(self):
        assert Ref("Genesis 27:3") is Ref("Gen. 27:3")
        assert Ref("Gen. 27:3") is Ref("בראשית כז.ג")

    def test_cache_clearing(self):
        r1 = Ref("Ramban on Genesis 1")
        Ref.clear_cache()
        r2 = Ref("Ramban on Genesis 1")
        assert r1 is not r2

    '''
    # Retired.  Since we're dealing with objects, tref will either bleed one way or the other.
    # Removed last dependencies on tref outside of object init. 
    def test_tref_bleed(self):
        # Insure that instanciating trefs are correct for this instance, and don't bleed through the cache.
        Ref(u'שבת לא')
        r = Ref("Shabbat 31a")
        assert r.tref == "Shabbat 31a"
    '''

class Test_normal_forms(object):
    def test_normal(self):
        assert Ref("Genesis 2:5").normal() == "Genesis 2:5"
        assert Ref("Shabbat 32b").normal() == "Shabbat 32b"
        assert Ref("Mishnah Peah 4:2-4").normal() == "Mishnah Peah 4:2-4"

    def test_url_form(self):
        assert Ref("Genesis 2:5").url() == "Genesis.2.5"
        assert Ref("Genesis 2:5-10").url() == "Genesis.2.5-10"
        assert Ref("Rashi on Shabbat 12a.10").url() == "Rashi_on_Shabbat.12a.10"


    def test_talmud_range_short(self):
        oref = Ref("Berakhot 2a-2b")
        assert oref.normal() == "Berakhot 2"
        assert oref.he_normal() == "ברכות ב׳"

    def test_talmud_range_long(self):
        oref = Ref("Berakhot 2a-3b")
        assert oref.normal() == "Berakhot 2-3"
        assert oref.he_normal() == "ברכות ב׳-ג׳"

    def test_talmud_range_a_to_a(self):
        oref = Ref("Berakhot 2a-3a")
        assert oref.normal() == "Berakhot 2a-3a"
        assert oref.he_normal() == "ברכות ב׳ א-ג׳ א"

    def test_talmud_range_b_to_b(self):
        oref = Ref("Bava Metzia 20b-21b")
        oref_capitalized = Ref("Bava Metzia 20B-21B")
        assert oref.normal() == "Bava Metzia 20b-21b" == oref_capitalized.normal()
        assert oref.he_normal() == "בבא מציעא כ׳ ב-כ״א ב" == oref_capitalized.he_normal()

    def test_talmud_segment_range(self):
        oref = Ref("Bava Metzia 20a:1-20b:1")
        assert oref.normal() == "Bava Metzia 20a:1-20b:1"
        assert oref.he_normal() == "בבא מציעא כ׳ א:א׳-כ׳ ב:א׳"

    def test_talmud_aA_bB(self):
        assert Ref("Berakhot 2a") == Ref("Berakhot 2A")
        assert Ref("Berakhot 2B") == Ref("Berakhot 2B")

    @pytest.mark.skip(reason='Zohar structure has been changed. We currently have no index with talmud at second place')
    def test_zohar_volume_range(self):
        oref = Ref("Zohar 1-2")
        assert oref.normal() == "Zohar 1-2"
        assert oref.he_normal() == "ספר הזהר א׳-ב׳"

    @pytest.mark.skip(reason='Zohar structure has been changed. We currently have no index with talmud at second place')
    def test_zohar_daf_range(self):
        oref = Ref("Zohar 1:25a-27b")
        assert oref.normal() == "Zohar 1:25-27"
        assert oref.he_normal() == "ספר הזהר א׳:כ״ה-כ״ז"

    @pytest.mark.skip(reason='Zohar structure has been changed. We currently have no index with talmud at second place')
    def test_zohar_volume_daf_range(self):
        oref = Ref("Zohar 1:25a-2:27b")
        assert oref.normal() == "Zohar 1:25-2:27"
        assert oref.he_normal() == "ספר הזהר א׳:כ״ה-ב׳:כ״ז"

    def test_first_available_section_ref(self):
        assert Ref('Genesis').first_available_section_ref() == Ref('Genesis 1')
        assert Ref('Siddur Ashkenaz').first_available_section_ref() == Ref('Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani')
        assert Ref('Penei Moshe on Jerusalem Talmud Shabbat 2').first_available_section_ref() == Ref('Penei Moshe on Jerusalem Talmud Shabbat 2:1:1')
        assert Ref('Animadversions by Elias Levita on Sefer HaShorashim').first_available_section_ref() == Ref('Animadversions by Elias Levita on Sefer HaShorashim, אבב')
        assert Ref('Jastrow, שְׁמַע I 1').first_available_section_ref() == Ref('Jastrow, שְׁמַע I 1')






class Test_term_refs(object):
    def test_ref_resolution(self):
        assert Ref("bo") ==  Ref('Exodus 10:1-13:16')
        assert Ref("משפטים") == Ref("Exodus 21:1-24:18")
        assert Ref("Shemot") == Ref("Exodus")  # This behavior may change, if we spec it more carefully

    def test_term_only(self):
        with pytest.raises(InputError):
            Ref("bo and then something")
        with pytest.raises(InputError):
            assert not Ref("botox")
        with pytest.raises(InputError):
            assert not Ref("משפטים ועוד")


class Test_Ambiguous_Forms(object):
    def test_mishnah_check_first(self):
        assert Ref("Shabbat 8:7") == Ref('Mishnah Shabbat 8:7')
        assert Ref("Shabbat 28:7").normal() == 'Shabbat 28a:7'
        assert Ref("Shabbat 7") == Ref("Shabbat 7a-7b")
        assert Ref("Shabbat 7a:1") != Ref("Shabbat 7:1")


class Test_comparisons(object):
    def test_overlaps(self):
        assert Ref("Genesis 5:10-20").overlaps(Ref("Genesis 5:18-25"))
        assert Ref("Genesis 5:10-20").overlaps(Ref("Genesis 5:13-28"))
        assert Ref("Genesis 5:13-28").overlaps(Ref("Genesis 5:10-20"))
        assert not Ref("Genesis 5:10-20").overlaps(Ref("Genesis 5:21-25"))

        assert not Ref("Genesis 1").overlaps(Ref("Genesis 2"))
        assert not Ref("Genesis 2").overlaps(Ref("Genesis 1"))
        assert Ref("Genesis 1").overlaps(Ref("Genesis 1"))

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

        assert Ref("Genesis 1:10-4:10").overlaps(Ref("Genesis 3:15-5:5"))


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

        assert Ref("Genesis 1:1-31").contains(Ref("Genesis 1"))
        assert Ref("Genesis 1").contains(Ref("Genesis 1:1-31"))

        assert Ref("Exodus").contains(Ref("Exodus 6"))
        assert Ref("Exodus").contains(Ref("Exodus 6:2"))
        assert Ref("Exodus").contains(Ref("Exodus 6:2-12"))

        assert not Ref("Exodus 6:2").contains(Ref("Exodus 6"))
        assert not Ref("Exodus 6:2-12").contains(Ref("Exodus 6"))

        assert not Ref("Exodus 6").contains(Ref("Exodus"))
        assert not Ref("Exodus 6:2").contains(Ref("Exodus"))
        assert not Ref("Exodus 6:2-12").contains(Ref("Exodus"))

        assert Ref("Leviticus").contains(Ref("Leviticus"))
        assert Ref("Leviticus").contains(Ref("Leviticus 1:1-27.34"))
        assert Ref("Leviticus").contains(Ref("Leviticus 1-27"))
        assert Ref("Leviticus 1:1-27.34").contains(Ref("Leviticus"))
        assert not Ref("Leviticus 1:1-27.30").contains(Ref("Leviticus"))
        assert not Ref("Leviticus 1:2-27.30").contains(Ref("Leviticus"))
        assert not Ref("Leviticus 2:2-27.30").contains(Ref("Leviticus"))

        # These fail, and always did
        # assert not Ref("Leviticus").contains(Ref("Leviticus 1:1-27.35"))
        # assert not Ref("Leviticus").contains(Ref("Leviticus 1-28"))

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

        assert not Ref("Steinsaltz_on_Jerusalem_Talmud_Shekalim.4.4.42-5.1.10").contains(Ref("Steinsaltz on Jerusalem Talmud Shekalim 4:4:1"))

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

@pytest.mark.skip(reason='Zohar structure has been changed. We currently have no index with talmud at second place')
class Test_Talmud_at_Second_Place(object):
    def test_simple_ref(self):
        assert Ref("Zohar 1.15b.3").sections[1] == 30
        assert Ref("Zohar 1.15a.3").sections[1] == 29
        assert Ref("Zohar 2.15b.3").sections[1] == 30
        assert Ref("Zohar 2.15a.3").sections[1] == 29
        assert Ref("Zohar 3.15b.3").sections[1] == 30
        assert Ref("Zohar 3.15a.3").sections[1] == 29

        assert Ref("Zohar 1.15b").sections[1] == 30
        assert Ref("Zohar 1.15a").sections[1] == 29
        assert Ref("Zohar 2.15b").sections[1] == 30
        assert Ref("Zohar 2.15a").sections[1] == 29
        assert Ref("Zohar 3.15b").sections[1] == 30
        assert Ref("Zohar 3.15a").sections[1] == 29

        assert Ref("Zohar 1.15b.3").sections[2] == 3
        assert Ref("Zohar 2.15b.3").sections[2] == 3
        assert Ref("Zohar 3.15b.3").sections[2] == 3

    def test_range(self):
        assert Ref("Zohar 1.10a:1 - 15b.3").toSections[1] == 30
        assert Ref("Zohar 1.10a:1 - 15a.3").toSections[1] == 29
        assert Ref("Zohar 2.10a:1 - 15b.3").toSections[1] == 30
        assert Ref("Zohar 2.10a:1 - 15a.3").toSections[1] == 29
        assert Ref("Zohar 3.10a:1 - 15b.3").toSections[1] == 30
        assert Ref("Zohar 3.10a:1 - 15a.3").toSections[1] == 29

        assert Ref("Zohar 1.10a - 15b").toSections[1] == 30
        assert Ref("Zohar 1.10a - 15a").toSections[1] == 29
        assert Ref("Zohar 2.10a - 15b").toSections[1] == 30
        assert Ref("Zohar 2.10a - 15a").toSections[1] == 29
        assert Ref("Zohar 3.10a - 15b").toSections[1] == 30
        assert Ref("Zohar 3.10a - 15a").toSections[1] == 29

    def test_cross_volume_range(self):
        assert Ref("Zohar 1.50a - 2.15b").toSections[1] == 30
        assert Ref("Zohar 1.50a - 2.15a").toSections[1] == 29
        assert Ref("Zohar 2.50a - 3.15b").toSections[1] == 30
        assert Ref("Zohar 2.50a - 3.15a").toSections[1] == 29
        assert Ref("Zohar 1.50a - 3.15b").toSections[1] == 30
        assert Ref("Zohar 1.50a - 3.15a").toSections[1] == 29

    def test_Zohar_Parsha_ref(self):
        assert Ref("Zohar, Lech Lecha")
        assert Ref("Zohar, Bo")

    def test_range_short_form(self):
        assert Ref("Zohar 2.15a - 15b").sections[1] == 29
        assert Ref("Zohar 2.15a - 15b").toSections[1] == 30
        assert Ref("Zohar 2.15a - b").sections[1] == 29
        assert Ref("Zohar 2.15a - b").toSections[1] == 30

class Test_condition_and_projection(object):
    def test_condition(self):
        #many variations
        pass

    def test_projection_simple_section(self):
        r = Ref("Exodus")
        p = r.part_projection()
        assert all([k in p for k in Version.required_attrs + Version.optional_attrs if k != Version.content_attr])
        assert Version.content_attr in p
        assert p[Version.content_attr] == 1

        # Todo: test Version objects returned
        """
        vs = VersionSet(r.condition_query(), p)
        assert vs.count() > 0
        for v in vs:
            assert ...
        """

    def test_projection_complex_section(self):
        r = Ref('Shelah, Torah Shebikhtav, Bereshit, Torah Ohr')
        p = r.part_projection()
        assert all([k in p for k in Version.required_attrs + Version.optional_attrs if k != Version.content_attr])
        assert Version.content_attr not in p
        assert 'chapter.Torah Shebikhtav.Bereshit.Torah Ohr' in p
        assert p['chapter.Torah Shebikhtav.Bereshit.Torah Ohr'] == 1

    def test_projection_simple_segment_slice(self):
        r = Ref("Exodus 4")
        p = r.part_projection()
        assert all([k in p for k in Version.required_attrs + Version.optional_attrs if k != Version.content_attr])
        assert Version.content_attr in p
        assert p[Version.content_attr] == {"$slice": [3, 1]}

    def test_projection_simple_segment_range_slice(self):
        r = Ref("Exodus 4-7")
        p = r.part_projection()
        assert all([k in p for k in Version.required_attrs + Version.optional_attrs if k != Version.content_attr])
        assert Version.content_attr in p
        assert p[Version.content_attr] == {"$slice": [3, 4]}

        r = Ref("Exodus 4:3-7:1")
        p = r.part_projection()
        assert all([k in p for k in Version.required_attrs + Version.optional_attrs if k != Version.content_attr])
        assert Version.content_attr in p
        assert p[Version.content_attr] == {"$slice": [3, 4]}


    def test_projection_complex_segment_slice(self):
        r = Ref('Shelah, Torah Shebikhtav, Bereshit, Torah Ohr 52')
        p = r.part_projection()
        assert all([k in p for k in Version.required_attrs + Version.optional_attrs if k != Version.content_attr])
        assert Version.content_attr not in p
        assert 'chapter.Torah Shebikhtav.Bereshit.Torah Ohr' in p
        assert p['chapter.Torah Shebikhtav.Bereshit.Torah Ohr'] == {"$slice": [51, 1]}

    def test_projection_complex_segment_range_slice(self):
        r = Ref('Shelah, Torah Shebikhtav, Bereshit, Torah Ohr 50-52')
        p = r.part_projection()
        assert all([k in p for k in Version.required_attrs + Version.optional_attrs if k != Version.content_attr])
        assert Version.content_attr not in p
        assert 'chapter.Torah Shebikhtav.Bereshit.Torah Ohr' in p
        assert p['chapter.Torah Shebikhtav.Bereshit.Torah Ohr'] == {"$slice": [49, 3]}


class Test_set_construction_from_ref(object):
    def test_ref_noteset(self):
        pass

    def test_ref_linkset(self):
        pass


class Test_Order_Id(object):
    def test_order_id_processes(self):
        assert Ref("Klein Dictionary, א").order_id()
        assert Ref("Shabbat 17b").order_id()
        assert Ref("Job 15:13").order_id()
        assert Ref("Shabbat 12a:14").order_id()
        assert Ref("Rashi on Shabbat 17b:12").order_id()
        assert Ref("Tosafot on Yoma 25a:24").order_id()

    def test_ordering_of_order_id(self):
        assert Ref("Job 15:13").order_id() < Ref("Shabbat 17b").order_id()
        assert Ref("Shabbat 12b").order_id() < Ref("Shabbat 17b").order_id()
        assert Ref("Shabbat 12b").order_id() < Ref("Bava Kamma 17b").order_id()

    def test_ordering_of_complex_texts(self):
        assert Ref("Meshekh Chokhmah, Vaera 2").order_id() > Ref("Meshekh Chokhmah, Shemot 6").order_id()

    def test_ordering_of_dictionary(self):
        i = library.get_index("Klein Dictionary")
        first = i.nodes.get_default_child().first_child()
        second = first.next_sibling()
        third = second.next_sibling()

        assert first.ref().order_id() < second.ref().order_id()
        assert second.ref().order_id() < third.ref().order_id()

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
