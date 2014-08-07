# -*- coding: utf-8 -*-

from sefaria.model import *


def setup_module(module):
    global record_classes
    global set_classes
    record_classes = abstract.get_record_classes()
    set_classes = abstract.get_set_classes()
    print record_classes


class Test_Mongo_Record_Models(object):

    def test_class_attribute_collection(self):
        for sub in record_classes:
            assert sub.collection
            assert isinstance(sub.collection, basestring)

    def test_class_attribute_required_attrs(self):
        for sub in record_classes:
            assert isinstance(sub.required_attrs, (list, tuple))
            assert len(sub.required_attrs)
            assert "_id" not in sub.required_attrs

    def test_instanciation_load_and_validity(self):
        for sub in record_classes:
            m = sub()
            res = m.load_by_query({})
            if res:  # Collection may be empty
                assert m._id
                assert m._validate()


class Test_Mongo_Set_Models(object):

    def test_record_class(self):
        for sub in set_classes:
            assert sub.recordClass != abstract.AbstractMongoRecord
            assert issubclass(sub.recordClass, abstract.AbstractMongoRecord)