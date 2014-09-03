# -*- coding: utf-8 -*-
import sefaria.model as m


class Test_Ref():

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


    def test_cache(self):
        assert m.Ref(u"שבת ד' כב.") is m.Ref(u"שבת ד' כב.")
        assert m.Ref("Ramban on Genesis 1") is m.Ref("Ramban on Genesis 1")


    '''
    def test_parsed_cache(self):
        parsed = m.Ref("Ramban on Genesis 1")
        assert "Ramban on Genesis 1" in scache.parsed
        assert parsed == m.Ref("Ramban on Genesis 1")
        parsed_no_pad = m.Ref("Ramban on Genesis 1", pad=False)
        assert "Ramban on Genesis 1|NOPAD" in scache.parsed
        assert parsed_no_pad == m.Ref("Ramban on Genesis 1", pad=False)
        assert parsed != parsed_no_pad
    '''


class Test_normal_forms():
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