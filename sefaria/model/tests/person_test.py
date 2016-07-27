# -*- coding: utf-8 -*-

import pytest

from sefaria.model import *

# cascade functions are tested in person_test.py


class Test_Person_Model_Cascade(object):
    def setup_method(self, method):
        """ setup any state tied to the execution of the given method in a
        class.  setup_method is invoked for every test method of a class.
        """
        p1 = Person().load({"key": "Bob"})
        if p1:
            p1.key = "Rav Ashi"
            p1.save()

    def teardown_method(self, method):
        """ teardown any state that was previously setup with a setup_method call.
        """
        p1 = Person().load({"key": "Bob"})
        if p1:
            p1.key = "Rav Ashi"
            p1.save()

    def test_relationship_cascade(self):
        p = Person().load({"key": "Rav Ashi"})

        rc = p.get_relationship_set().count()
        ic = len(p.get_indexes())

        p.key = "Bob"
        p.save()

        p1 = Person().load({"key": "Bob"})

        assert p1.get_relationship_set().count() == rc
        assert len(p1.get_indexes()) == ic

        p1.key = "Rav Ashi"
        p1.save()

        p2 = Person().load({"key": "Rav Ashi"})
        assert p2.get_relationship_set().count() == rc
        assert len(p2.get_indexes()) == ic
