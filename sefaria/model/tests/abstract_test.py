# -*- coding: utf-8 -*-

import pytest

from sefaria.system.database import db
import sefaria.model as model
import sefaria.model.abstract as abstract

# cascade functions are tested in person_test.py

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


    def test_instantiation_load_and_validity(self):
        for sub in record_classes:
            m = sub()
            if m.collection == "term": #remove this line once terms are normalized
                continue
            res = m.load({})
            if not res:  # Collection may be empty
                return
            assert m._id
            m._validate()

    @pytest.mark.deep
    def test_attr_definitions(self):
        """
        As currently written, this examines every record in the mongo db.
        If this test fails, use the validate_model_attr_definitions.py script to diagnose.
        """
        for record_class in record_classes:
            class_keys = set(record_class.required_attrs + record_class.optional_attrs + [record_class.id_field])
            req_class_keys = set(record_class.required_attrs)
            records = getattr(db, record_class.collection).find()
            for rec in records:
                record_keys = set(rec.keys())
                assert record_keys <= class_keys
                assert req_class_keys <= record_keys


class Test_Mongo_Set_Models(object):

    def test_record_class(self):
        for sub in set_classes:
            assert sub.recordClass != abstract.AbstractMongoRecord
            assert issubclass(sub.recordClass, abstract.AbstractMongoRecord)


class Test_Mongo_Record_Methods(object):
    """ Tests of the methods on the abstract models.
    They often need instantiation, but are not designed to test the subclasses specifically.
    """
    def test_equality_and_identity(self):
        attrs = {
            "ref": "Psalms 145:22",
            "text": "Not a part of this Psalm, but tradition to read it at the end of recitation in Psukei d'Zimrah",
            "anchorText": "Psalm 115:18",
            "owner": 7934,
            "type": "note",
            "public": True
        }
        model.Note(attrs).save() # added to make sure there is a note in the db, if the table is truncated or not extant.
        n1 = model.Note(attrs)
        n2 = model.Note(attrs)
        n3 = model.Note()
        assert n1 is not n2
        assert n1 == n2
        assert not n1.same_record(n2)
        assert n1 != n3
        assert not n1.same_record(n3)


        n4 = model.Note().load({"ref": "Psalms 145:22", "owner": 7934})
        n5 = model.Note().load({"ref": "Psalms 145:22", "owner": 7934})
        assert n4 is not n5
        assert n4.same_record(n5)
        assert not n1.same_record(n5)

    def test_attribute_exception(self):
        attrs = {
            "ref": "Psalms 150:1",
            "text": "blah",
            "anchorText": "blue",
            "owner": 28,
            "type": "note",
            "public": True,
            "foobar": "blaz"  # should raise an exception when loaded
        }
        db.notes.remove({"ref": "Psalms 150:1", "owner": 28})
        db.notes.save(attrs)
        with pytest.raises(Exception):
            model.Note().load({"ref": "Psalms 150:1", "owner": 28})
        db.notes.remove({"ref": "Psalms 150:1", "owner": 28})

    def test_copy(self):
        for sub in record_classes:
            if sub is model.VersionState: #VersionState is derived - this test doesn't work well with it
                continue
            m = sub()
            res = m.load({})
            if not res:  # Collection may be empty
                return
            c = res.copy()
            del res._id
            assert res == c


