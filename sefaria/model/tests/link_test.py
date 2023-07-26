# -*- coding: utf-8 -*-
import pytest
from sefaria.model import *
from sefaria.system.exceptions import DuplicateRecordError

class Test_Link_Save(object):

    @classmethod
    def setup_class(cls):
        LinkSet({"generated_by": "link_tester"}).delete()
        LinkSet({"refs": ["Avi Ezer, Deuteronomy 10:16:1", "Deuteronomy 10:16"]}).delete()
        Link({"auto": True,
                     "generated_by": "link_tester",
                     "type": "commentary",
                     "refs": ["Avi Ezer, Deuteronomy 10:16:1", "Deuteronomy 10:16"]}).save()

    @classmethod
    def teardown_class(cls):
        LinkSet({"generated_by": "link_tester"}).delete()

    def test_duplicate_links(self):
        link = Link({"auto": True,
                     "generated_by" : "link_tester",
                     "type" : "commentary",
                     "refs": ["Avi Ezer, Deuteronomy 10:16:1", "Deuteronomy 10:16"]})
        with pytest.raises(DuplicateRecordError) as e_info:
            link._pre_save()

    def test_duplicate_links_reversed_order(self):
        link = Link({"auto": True,
                     "generated_by" : "link_tester",
                     "type" : "commentary",
                     "refs": ["Deuteronomy 10:16", "Avi Ezer, Deuteronomy 10:16:1"]})
        with pytest.raises(DuplicateRecordError) as e_info:
            link._pre_save()

    def test_more_precise_links(self):
        link = Link({"auto": True,
                     "generated_by": "link_tester",
                     "type": "commentary",
                     "refs": ["Avi Ezer, Deuteronomy 10:16:1", "Deuteronomy 10"]})
        with pytest.raises(DuplicateRecordError) as e_info:
            link._pre_save()
        assert "A more precise link already exists: {} - {}".format("Avi Ezer, Deuteronomy 10:16:1", "Deuteronomy 10:16") in str(e_info.value)

    def test_more_precise_links_reversed_order(self):
        link = Link({"auto": True,
                     "generated_by" : "link_tester",
                     "type" : "commentary",
                     "refs": ["Deuteronomy 10", "Avi Ezer, Deuteronomy 10:16:1"]})
        with pytest.raises(DuplicateRecordError) as e_info:
            link._pre_save()
            assert "A more precise link already exists: {} - {}".format("Avi Ezer, Deuteronomy 10:16:1", "Deuteronomy 10:16") in str(e_info.value)

    def test_override_preciselink(self):
        link1 = Link({"auto": True,
                     "generated_by": "link_tester",
                     "type": "quotation_auto_tanakh",
                     "refs": ["Psalms 1:1", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        link1.save()
        l1 = Link().load({"refs": ["Psalms 1:1", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        assert l1
        link2 = Link({"auto": True,
                     "generated_by": "link_tester",
                     "type": "quotation_auto_tanakh",
                     "refs": ["Psalms 1:1-6", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        with pytest.raises(DuplicateRecordError) as e_info:
            link2.save()
            assert "A more precise link already exists: {} - {}".format("Psalms 1:1", "Psalms 1") in str(e_info.value)

        link2._override_preciselink = True
        link2.save()
        l2 = Link().load({"refs": ["Psalms 1:1-6", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        assert l2
        l2.delete()
        l2 = Link().load({"refs": ["Psalms 1:1-6", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        assert not l2
        l1 = Link().load({"refs": ["Psalms 1:1", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        assert not l1

    def test_ranged_link_when_section_link_exists(self):
        link1 = Link({"auto": True,
                     "generated_by": "link_tester",
                     "type": "quotation_auto_tanakh",
                     "refs": ["Psalms 1", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        link1.save()
        l1 = Link().load({"refs": ["Psalms 1", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        assert l1
        link2 = Link({"auto": True,
                     "generated_by": "link_tester",
                     "type": "quotation_auto_tanakh",
                     "refs": ["Psalms 1:1-6", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        with pytest.raises(DuplicateRecordError) as e_info:
            link2.save()
        l1.delete()

    def test_section_link_when_ranged_link_exists(self):
        link1 = Link({"auto": True,
                     "generated_by": "link_tester",
                     "type": "quotation_auto_tanakh",
                     "refs": ["Psalms 1:1-6", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        link1.save()
        l1 = Link().load({"refs": ["Psalms 1:1-6", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        assert l1
        link2 = Link({"auto": True,
                     "generated_by": "link_tester",
                     "type": "quotation_auto_tanakh",
                     "refs": ["Psalms 1", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        with pytest.raises(DuplicateRecordError) as e_info:
            link2.save()
        l1.delete()

    def test_section_link_when_ranged_link_exists_reverse(self):
        link1 = Link({"auto": True,
                      "generated_by": "link_tester",
                      "type": "quotation_auto_tanakh",
                      "refs": ['Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1', "Psalms 1:1-6"]})
        link1.save()
        l1 = Link().load({"refs": ["Psalms 1:1-6", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        assert l1
        link2 = Link({"auto": True,
                      "generated_by": "link_tester",
                      "type": "quotation_auto_tanakh",
                      "refs": ["Psalms 1", 'Siddur Ashkenaz, Weekday, Maariv, Vehu Rachum 1']})
        with pytest.raises(DuplicateRecordError) as e_info:
            link2.save()
        l1.delete()

    def test_section_ref_in_default_node(self):
        for ref in ['Genesis 1', 'Zechariah 1']:
            link = Link({"auto": True,
                     "generated_by": "link_tester",
                      "type": "quotation_auto_tanakh",
                      "refs": [ref, "Ramban on Genesis 2:1"]})
            assert link._pre_save() == None
