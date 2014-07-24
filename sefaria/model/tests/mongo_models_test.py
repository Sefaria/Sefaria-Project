# -*- coding: utf-8 -*-

import sefaria.model.abstract as abst
"""
There are a lot of class checks here.
Not very pythonic, but I think it's more important to keep this ship tight than to get crazy about duck typing.
"""

# Every subclass needs to be imported here.  There must be a better way.
# If we add each one to __all__ in the package, and import the package, that would work...
# noinspection PyUnresolvedReferences
import sefaria.model.version


def setup_module(module):
    global record_classes
    global set_classes
    record_classes = abst.AbstractMongoRecord.__subclasses__()
    set_classes = abst.AbstractMongoSet.__subclasses__()

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

    def test_instanciation_load_and_validity(self):
        for sub in record_classes:
            m = sub()
            m.load_by_query({})
            assert m._id  # Will fail if collection is empty
            assert m.is_valid()


class Test_Mongo_Set_Models():

    def test_record_class(self):
        for sub in set_classes:
            assert sub.recordClass != abst.AbstractMongoRecord
            assert issubclass(sub.recordClass,abst.AbstractMongoRecord)