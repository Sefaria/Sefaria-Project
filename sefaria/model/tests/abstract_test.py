# -*- coding: utf-8 -*-

import pytest

from sefaria.system.database import db
from sefaria.system.exceptions import InputError
import sefaria.model as model
import sefaria.model.abstract as abstract

# cascade functions are tested in person_test.py


def setup_module(module):
    global record_classes
    global set_classes
    global record_to_set
    record_classes = abstract.get_record_classes()
    set_classes = abstract.get_set_classes()
    record_to_set = {
        set_class.recordClass.__name__: set_class for set_class in set_classes
    }
    print(record_classes)


def get_record_classes_with_slugs():
    classes = abstract.get_record_classes()
    return filter(lambda x: getattr(x, 'slug_fields', None) is not None and x.__name__ != "Portal", classes)


class TestMongoRecordModels(object):

    def test_class_attribute_collection(self):
        for sub in record_classes:
            assert sub.collection
            assert isinstance(sub.collection, str)

    def test_class_attribute_required_attrs(self):
        for sub in record_classes:
            assert isinstance(sub.required_attrs, (list, tuple))
            assert len(sub.required_attrs)
            assert "_id" not in sub.required_attrs

    @pytest.mark.parametrize("sub", abstract.get_record_classes())
    def test_instanciation_load_and_validity(self, sub):
        m = sub()
        if m.collection == "term": #remove this line once terms are normalized
            return
        res = m.load({})
        if not res:  # Collection may be empty
            return
        assert m._id
        m._validate()

    def test_normalize_slug(self):
        a = abstract.SluggedAbstractMongoRecord

        def test_slug(slug, final_slug):
            new_slug = a.normalize_slug(slug)
            assert new_slug == final_slug

        test_slug('blah', 'blah')
        test_slug('blah1', 'blah1')
        test_slug('bla-h', 'bla-h')
        test_slug('blah and blah', 'blah-and-blah')
        test_slug('blah/blah', 'blah-blah')
        test_slug('blah == בלה', 'blah-בלה')

    @pytest.mark.django_db
    @pytest.mark.parametrize("sub", get_record_classes_with_slugs())
    def test_normalize_slug_field(self, sub):
        """

        :return:
        """
        test_slug = 'test'

        def get_slug(base, slug_field):
            return abstract.SluggedAbstractMongoRecord.normalize_slug('{}{}'.format(base, slug_field))
        attrs = {  # fill in requirements
            attr: None for attr in sub.required_attrs
        }
        attrs.update({
            slug_field: get_slug(test_slug, slug_field) for slug_field in sub.slug_fields
        })
        inst = sub(attrs)
        for slug_field in sub.slug_fields:
            temp_slug = get_slug(test_slug, slug_field)
            num_records = 1
            dup_str = ''
            count = 0
            sub_set = record_to_set[sub.__name__]({slug_field: temp_slug})
            sub_set.delete()
            while num_records > 0:
                sub_set = record_to_set[sub.__name__]({slug_field: temp_slug + dup_str})  # delete all
                count += 1
                dup_str = str(count)
                num_records = sub_set.count()
                sub_set.delete()
            new_slug = inst.normalize_slug_field(slug_field)
            assert new_slug == temp_slug

        # check that save doesn't alter slug
        inst.save()
        for slug_field in sub.slug_fields:
            temp_slug = get_slug(test_slug, slug_field)
            assert getattr(inst, slug_field) == temp_slug

        # check that duplicate slugs are handled correctly
        inst2 = sub(attrs)
        inst2.save()
        for slug_field in sub.slug_fields:
            temp_slug = get_slug(test_slug, slug_field) + '1'
            assert getattr(inst2, slug_field) == temp_slug

        # cleanup
        inst.delete()
        inst2.delete()

    @pytest.mark.deep
    @pytest.mark.parametrize("record_class", abstract.get_record_classes())
    def test_attr_definitions(self, record_class):
        """
        As currently written, this examines every record in the mongo db.
        If this test fails, use the validate_model_attr_definitions.py script to diagnose.
        """
        class_keys = set(record_class.required_attrs + record_class.optional_attrs + [record_class.id_field])
        req_class_keys = set(record_class.required_attrs)
        records = getattr(db, record_class.collection).find()
        for rec in records:
            record_keys = set(rec.keys())
            assert record_keys <= class_keys, "{} - unhandled keys {}".format(record_class, record_keys - class_keys)
            assert req_class_keys <= record_keys, "{} - required keys missing: {}".format(record_class, req_class_keys - record_keys)


class Test_Mongo_Set_Models(object):

    def test_record_class(self):
        for sub in set_classes:
            assert sub.recordClass != abstract.AbstractMongoRecord
            assert issubclass(sub.recordClass, abstract.AbstractMongoRecord)


class Test_Mongo_Record_Methods(object):
    """ Tests of the methods on the abstract models.
    They often need instanciation, but are not designed to test the subclasses specifically.
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
        db.notes.delete_one({"ref": "Psalms 150:1", "owner": 28})
        db.notes.insert_one(attrs)
        with pytest.raises(Exception):
            model.Note().load({"ref": "Psalms 150:1", "owner": 28})
        db.notes.delete_one({"ref": "Psalms 150:1", "owner": 28})

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


class TestWithSkipGuard(object):
    """AbstractMongoSet.with_skip_guard() -- skip records that fail to INSTANTIATE.

    `_read_records()` materializes the whole set the moment it is touched, including by the
    `for rec in SomeSet():` clause itself, so one malformed document aborts the set before a
    guarded loop body runs even once.
    """

    class _FakeGuard(object):
        """Stands in for skip_bad_record: records what it swallowed."""

        def __init__(self, exceptions=Exception):
            self.exceptions = exceptions
            self.skipped = []

        def __call__(self, pathway, operation, record=None, level="warning"):
            import contextlib

            @contextlib.contextmanager
            def guard():
                try:
                    yield
                except self.exceptions as e:
                    self.skipped.append((operation, record, type(e).__name__))
            return guard()

    def _set_of(self, docs, instantiate, post=None):
        """A minimal AbstractMongoSet over `docs` with a stubbed instantiation hook."""
        class _Set(abstract.AbstractMongoSet):
            def __init__(self):
                self.raw_records = list(docs)
                self.records = None
                self.record_kwargs = {}
                self.max = None
            def _instantiate_record(self, raw):
                return instantiate(raw)
            def _post_read_records(self):
                if post:
                    post(self)
        return _Set()

    def _failing_set(self, docs):
        def instantiate(raw):
            if raw.get("title") == "bad" or raw.get("boom"):
                raise InputError("Please provide category for Index record: bad.")
            return raw.get("title")
        return self._set_of(docs, instantiate)

    def test_without_the_guard_one_bad_record_aborts_the_whole_set(self):
        """The behavior being fixed: the bad record is third, yet the first two are lost too,
        because the set is materialized in one pass before iteration yields anything."""
        s = self._failing_set([{"title": "good1"}, {"title": "good2"}, {"title": "bad"}])
        with pytest.raises(InputError):
            list(s)

    def test_bad_record_is_skipped_and_the_rest_survive(self):
        guard = self._FakeGuard(InputError)
        s = self._failing_set([{"title": "good1"}, {"title": "bad"}, {"title": "good2"}])
        assert list(s.with_skip_guard(guard, "startup", "op")) == ["good1", "good2"]
        assert guard.skipped == [("op", "bad", "InputError")]
        assert s.max == 2

    def test_guard_applies_to_every_access_path_not_just_iteration(self):
        """The reason the guard lives on the set rather than on one method: rewriting a loop
        as .array() / len() / contents() must not silently drop the protection."""
        class _Rec(object):                       # contents() calls .contents() per record
            def __init__(self, title):
                self.title = title
            def contents(self, **kwargs):
                return {"title": self.title}

        def instantiate(raw):
            if raw["title"] == "bad":
                raise InputError("bad record")
            return _Rec(raw["title"])

        for access in (lambda s: list(s), lambda s: s.array(), lambda s: len(s),
                       lambda s: s[0], lambda s: s.contents()):
            s = self._set_of([{"title": "good1"}, {"title": "bad"}], instantiate)
            s.with_skip_guard(self._FakeGuard(InputError), "startup", "op")
            access(s)                     # must not raise
            assert s.max == 1

    def test_returns_self_so_it_reads_inline(self):
        s = self._failing_set([{"title": "a"}])
        assert s.with_skip_guard(self._FakeGuard(), "startup", "op") is s

    def test_unguarded_exception_still_propagates(self):
        def instantiate(raw):
            raise ImportError("bad deploy")

        s = self._set_of([{"title": "x"}], instantiate)
        s.with_skip_guard(self._FakeGuard(InputError), "startup", "op")
        with pytest.raises(ImportError):
            list(s)

    def test_record_is_identified_from_the_raw_document(self):
        """Instantiation is what failed, so the log can only name the record from raw fields."""
        guard = self._FakeGuard()
        for doc in [{"title": "T"}, {"slug": "s"}, {"name": "n"}, {"_id": 7}, {"unknown": 1}]:
            doc = dict(doc, boom=True)
            s = self._failing_set([doc])
            list(s.with_skip_guard(guard, "startup", "op"))
        assert [rec for _, rec, _ in guard.skipped] == ["T", "s", "n", "_id=7", "<unidentifiable>"]

    def test_guarded_path_uses_the_sets_own_instantiation_hook(self):
        """Regression: an earlier version instantiated via `self.recordClass(...)` directly,
        which silently produced base-class objects for LexiconEntrySet (whose entry class
        depends on the document's lexicon) and skipped TopicSet's subclass casting."""
        s = self._set_of([{"title": "a"}], lambda raw: "instantiated:" + raw["title"])
        s.with_skip_guard(self._FakeGuard(), "startup", "op")
        assert list(s) == ["instantiated:a"]

    def test_guarded_path_runs_the_post_materialize_hook(self):
        s = self._set_of([{"title": "b"}, {"title": "a"}], lambda raw: raw["title"],
                         post=lambda self: self.records.sort())
        s.with_skip_guard(self._FakeGuard(), "startup", "op")
        assert list(s) == ["a", "b"]

    def test_unguarded_sets_are_unaffected(self):
        """The default must stay 'a record that fails to load aborts the set'."""
        s = self._set_of([{"title": "a"}], lambda raw: raw["title"])
        assert s._skip_guard is None
        assert list(s) == ["a"]


class TestPolymorphicSetsStillTypeTheirRecords(object):
    """The instantiation hooks moved in the same change as with_skip_guard; these pin the
    behavior that moved, against the real sets rather than stubs."""

    def test_topic_set_casts_to_subclass(self):
        from sefaria.model.topic import TopicSet, AuthorTopic
        authors = TopicSet({"subclass": "author"}, limit=1)
        for topic in authors:
            assert isinstance(topic, AuthorTopic)

    def test_lexicon_entry_set_builds_lexicon_specific_entries(self):
        from sefaria.model.lexicon import LexiconEntrySet, LexiconEntry
        entries = LexiconEntrySet({"parent_lexicon": "Jastrow Dictionary"}, limit=1)
        for entry in entries:
            assert type(entry) is not LexiconEntry
            assert hasattr(entry, "get_alt_headwords")
