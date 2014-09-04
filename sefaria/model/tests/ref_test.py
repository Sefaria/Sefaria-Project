# -*- coding: utf-8 -*-
import sefaria.model as m


class Test_Ref(object):

    def test_short_names(self):
        ref = m.Ref(u"Exo. 3:1")
        assert ref.book == u"Exodus"

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