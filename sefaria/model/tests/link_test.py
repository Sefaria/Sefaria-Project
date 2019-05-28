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
        assert u"A more precise link already exists: {} - {}".format("Avi Ezer, Deuteronomy 10:16:1", "Deuteronomy 10:16") in str(e_info)

    def test_more_precise_links_reversed_order(self):
        link = Link({"auto": True,
                     "generated_by" : "link_tester",
                     "type" : "commentary",
                     "refs": ["Deuteronomy 10", "Avi Ezer, Deuteronomy 10:16:1"]})
        with pytest.raises(DuplicateRecordError) as e_info:
            link._pre_save()
            assert u"A more precise link already exists: {} - {}".format("Avi Ezer, Deuteronomy 10:16:1", "Deuteronomy 10:16") in str(e_info)