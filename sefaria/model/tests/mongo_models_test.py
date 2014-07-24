# -*- coding: utf-8 -*-

import sefaria.model.abstract as abst

# Every subclass needs to be imported here.  There must be a better way.
#If we add each one to __all__ in the package, and import the package, that would work...
# noinspection PyUnresolvedReferences
import sefaria.model.version


def setup_module(module):
    global subs
    subs = abst.MongoAbstract.__subclasses__()


class Test_Mongo_Models():
    def test_class_attribute_collection(self):
        for sub in subs:
            assert sub.collection
            assert isinstance(sub.collection, basestring)

    def test_class_attribute_required_attrs(self):
        for sub in subs:
            #Next line could be more duck type-ish.
            #http://stackoverflow.com/questions/1835018/python-check-if-an-object-is-a-list-or-tuple-but-not-string
            assert isinstance(sub.required_attrs, (list, tuple))
            assert len(sub.required_attrs)
            assert "_id" not in sub.required_attrs

    def test_instanciation_load_and_validity(self):
        for sub in subs:
            m = sub()
            m.load_by_query({})
            assert m._id # Will fail if collection is empty
            assert m.is_valid()
