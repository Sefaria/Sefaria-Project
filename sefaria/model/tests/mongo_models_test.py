# -*- coding: utf-8 -*-

from sefaria.model import *

"""
There are a lot of class checks here.
Not very pythonic, but I think it's more important to keep this ship tight than to get crazy about duck typing.
"""

def setup_module(module):
    global record_classes
    global set_classes
    record_classes = abstract.get_record_classes()
    set_classes = abstract.get_set_classes()
    print record_classes

class Test_Mongo_Record_Models():

    def test_class_attribute_collection(self):
        for sub in record_classes:
            assert sub.collection
            assert isinstance(sub.collection, basestring)

    def test_class_attribute_required_attrs(self):
        for sub in record_classes:
            assert isinstance(sub.required_attrs, (list, tuple))
            assert len(sub.required_attrs)
            assert "_id" not in sub.required_attrs

    def test_history_has_noun(self):
        for sub in record_classes:
            if sub.tracked:
                assert sub.history_noun

    def test_instanciation_load_and_validity(self):
        for sub in record_classes:
            m = sub()
            m.load_by_query({})
            assert m._id  # Will fail if collection is empty
            assert "error" not in m.validate()


class Test_Mongo_Set_Models():

    def test_record_class(self):
        for sub in set_classes:
            assert sub.recordClass != abstract.AbstractMongoRecord
            assert issubclass(sub.recordClass, abstract.AbstractMongoRecord)