# -*- coding: utf-8 -*-
import pytest
import sefaria.model as m
from sefaria.system.exceptions import InputError

class Test_Ref(object):

    def test_short_names(self):
        ref = m.Ref(u"Exo. 3:1")
        assert ref.book == u"Exodus"

    def test_normal_form_is_identifcal(self):
        assert m.Ref("Genesis 2:5").normal() == "Genesis 2:5"
        assert m.Ref("Shabbat 32b").normal() == "Shabbat 32b"
        assert m.Ref("Mishnah Peah 4:2-4").normal() == "Mishnah Peah 4:2-4"

    def test_bible_range(self):
        ref = m.Ref(u"Job.2:3-3:1")
        assert ref.toSections == [3, 1]

    def test_short_bible_refs(self):  # this behavior is changed from earlier
        assert m.Ref(u"Exodus") != m.Ref(u"Exodus 1")
        assert m.Ref(u"Exodus").padded_ref() == m.Ref(u"Exodus 1")

    def test_short_talmud_refs(self):  # this behavior is changed from earlier
        assert m.Ref(u"Sanhedrin 2a") != m.Ref(u"Sanhedrin")
        assert m.Ref(u"Sanhedrin 2a") == m.Ref(u"Sanhedrin 2")

    def test_map(self):
        assert m.Ref("Me'or Einayim 16") == m.Ref("Me'or Einayim, Yitro")

    def test_comma(self):
        assert m.Ref("Me'or Einayim 24") == m.Ref("Me'or Einayim, 24")
        assert m.Ref("Genesis 18:24") == m.Ref("Genesis, 18:24")

    def test_padded_ref(self):
        assert m.Ref("Exodus").padded_ref().normal() == "Exodus 1"
        assert m.Ref("Exodus 1").padded_ref().normal() == "Exodus 1"
        assert m.Ref("Exodus 1:1").padded_ref().normal() == "Exodus 1:1"
        assert m.Ref("Rashi on Genesis 2:3:1").padded_ref().normal() == "Rashi on Genesis 2:3:1"

    def test_context_ref(self):
        assert m.Ref("Genesis 2:3").context_ref().normal() == "Genesis 2"
        assert m.Ref("Rashi on Genesis 2:3:1").context_ref().normal() == "Rashi on Genesis 2:3"
        assert m.Ref("Rashi on Genesis 2:3:1").context_ref(2).normal() == "Rashi on Genesis 2"

    def test_section_ref(self):
        assert m.Ref("Rashi on Genesis 2:3:1").section_ref().normal() == "Rashi on Genesis 2:3"
        assert m.Ref("Genesis 2:3").section_ref().normal() == "Genesis 2"
        assert m.Ref("Shabbat 4a").section_ref().normal() == "Shabbat 4a"

    def test_top_section_ref(self):
        assert m.Ref("Job 4:5").top_section_ref().normal() == "Job 4"
        assert m.Ref("Rashi on Genesis 1:2:3").top_section_ref().normal() == "Rashi on Genesis 1"
        assert m.Ref("Genesis").top_section_ref().normal() == "Genesis 1"

    def test_next_ref(self):
        assert m.Ref("Job 4:5").next_section_ref().normal() == "Job 5"
        assert m.Ref("Shabbat 4b").next_section_ref().normal() == "Shabbat 5a"
        assert m.Ref("Shabbat 5a").next_section_ref().normal() == "Shabbat 5b"
        assert m.Ref("Rashi on Genesis 5:32:2").next_section_ref().normal() == "Rashi on Genesis 6:2"
        assert m.Ref("Mekhilta 35.3").next_section_ref() is None
        # This will start to fail when we fill in this text
        assert m.Ref("Mekhilta 23:19").next_section_ref().normal() == "Mekhilta 31:12"

    def test_prev_ref(self):
        assert m.Ref("Job 4:5").prev_section_ref().normal() == "Job 3"
        assert m.Ref("Shabbat 4b").prev_section_ref().normal() == "Shabbat 4a"
        assert m.Ref("Shabbat 5a").prev_section_ref().normal() == "Shabbat 4b"
        assert m.Ref("Rashi on Genesis 6:2:1").prev_section_ref().normal() == "Rashi on Genesis 5:32"
        assert m.Ref("Mekhilta 12:1").prev_section_ref() is None
        # This will start to fail when we fill in this text
        assert m.Ref("Mekhilta 31:12").prev_section_ref().normal() == "Mekhilta 23:19"

    def test_split_spanning_ref(self):
        assert m.Ref("Leviticus 15:3 - 17:12").split_spanning_ref() == [m.Ref('Leviticus 15:3-33'), m.Ref('Leviticus 16'), m.Ref('Leviticus 17:1-12')]
        assert m.Ref("Leviticus 15-17").split_spanning_ref() == [m.Ref('Leviticus 15'), m.Ref('Leviticus 16'), m.Ref('Leviticus 17')]
        assert m.Ref("Leviticus 15:17-21").split_spanning_ref() == [m.Ref('Leviticus 15:17-21')]
        assert m.Ref("Leviticus 15:17").split_spanning_ref() == [m.Ref('Leviticus 15:17')]
        assert m.Ref("Shabbat 15a-16b").split_spanning_ref() == [m.Ref('Shabbat 15a'), m.Ref('Shabbat 15b'), m.Ref('Shabbat 16a'), m.Ref('Shabbat 16b')]
        assert m.Ref("Shabbat 15a").split_spanning_ref() == [m.Ref('Shabbat 15a')]
        assert m.Ref("Shabbat 15a:15-15b:13").split_spanning_ref() == [m.Ref('Shabbat 15a:15-55'), m.Ref('Shabbat 15b:1-13')]

    def test_range_refs(self):
        assert m.Ref("Leviticus 15:12-17").range_list() == [m.Ref('Leviticus 15:12'), m.Ref('Leviticus 15:13'), m.Ref('Leviticus 15:14'), m.Ref('Leviticus 15:15'), m.Ref('Leviticus 15:16'), m.Ref('Leviticus 15:17')]
        assert m.Ref("Shabbat 15b:5-8").range_list() == [m.Ref('Shabbat 15b:5'), m.Ref('Shabbat 15b:6'), m.Ref('Shabbat 15b:7'), m.Ref('Shabbat 15b:8')]

        with pytest.raises(InputError):
            m.Ref("Shabbat 15a:13-15b:2").range_list()
        with pytest.raises(InputError):
            m.Ref("Exodus 15:12-16:1").range_list()

    def test_ref_regex(self):
        assert m.Ref("Exodus 15").regex() == u'^Exodus( 15$| 15:| 15 \\d)'
        assert m.Ref("Exodus 15:15-17").regex() == u'^Exodus( 15:15$| 15:15:| 15:15 \\d| 15:16$| 15:16:| 15:16 \\d| 15:17$| 15:17:| 15:17 \\d)'
        assert m.Ref("Yoma 14a").regex() == u'^Yoma( 14a$| 14a:| 14a \\d)'
        assert m.Ref("Yoma 14a:12-15").regex() == u'^Yoma( 14a:12$| 14a:12:| 14a:12 \\d| 14a:13$| 14a:13:| 14a:13 \\d| 14a:14$| 14a:14:| 14a:14 \\d| 14a:15$| 14a:15:| 14a:15 \\d)'
        assert m.Ref("Yoma").regex() == u'^Yoma($|:| \\d)'  # This is as legacy had it
        pass


class Test_Cache(object):
    def test_cache_identity(self):
        assert m.Ref("Ramban on Genesis 1") is m.Ref("Ramban on Genesis 1")
        assert m.Ref(u"שבת ד' כב.") is m.Ref(u"שבת ד' כב.")

    def test_obj_created_cache_identity(self):
        assert m.Ref("Job 4") is m.Ref("Job 4:5").top_section_ref()
        assert m.Ref("Rashi on Genesis 2:3:1").context_ref() is m.Ref("Rashi on Genesis 2:3")

    def test_different_tref_cache_identity(self):
        assert m.Ref("Genesis 27:3") is m.Ref("Gen. 27:3")
        assert m.Ref("Gen. 27:3") is m.Ref(u"בראשית כז.ג")


class Test_normal_forms(object):
    def test_normal(self):
        assert m.Ref("Genesis 2:5").normal() == "Genesis 2:5"
        assert m.Ref("Shabbat 32b").normal() == "Shabbat 32b"
        assert m.Ref("Mishnah Peah 4:2-4").normal() == "Mishnah Peah 4:2-4"


    def test_url_form(self):
        assert m.Ref("Genesis 2:5").url() == "Genesis.2.5"
        assert m.Ref("Genesis 2:5-10").url() == "Genesis.2.5-10"
        assert m.Ref("Rashi on Shabbat 12a.10").url() == "Rashi_on_Shabbat.12a.10"



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