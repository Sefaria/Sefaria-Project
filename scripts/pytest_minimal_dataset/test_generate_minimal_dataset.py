import sys
from pathlib import Path

import mongomock
import pytest
from bson import ObjectId

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import generate_minimal_dataset as gen


class TestToObjectId:
    def test_24_hex_string_becomes_object_id(self):
        oid = ObjectId()
        assert gen.to_object_id(str(oid)) == oid

    def test_24_char_non_hex_string_is_left_alone(self):
        assert gen.to_object_id("z" * 24) == "z" * 24

    def test_other_values_are_left_alone(self):
        assert gen.to_object_id("Genesis") == "Genesis"
        assert gen.to_object_id(7) == 7


class TestExtractMatchFilter:
    def test_single_match_is_returned_as_is(self):
        assert gen.extract_match_filter([{"$match": {"a": 1}}, {"$limit": 5}]) == {"a": 1}

    def test_several_matches_are_anded(self):
        pipeline = [{"$match": {"a": 1}}, {"$unwind": "$b"}, {"$match": {"b": 2}}]
        assert gen.extract_match_filter(pipeline) == {"$and": [{"a": 1}, {"b": 2}]}

    def test_no_match_stage_returns_none(self):
        assert gen.extract_match_filter([{"$group": {"_id": "$a"}}]) is None

    def test_non_list_pipeline_returns_none(self):
        assert gen.extract_match_filter({"$match": {"a": 1}}) is None


class TestNormalizeFilters:
    @pytest.mark.parametrize("cmd", ["find", "count", "distinct", "findAndModify"])
    def test_query_commands_replay_their_filter(self, cmd):
        assert gen.normalize_filters({"command": cmd, "filter": {"title": "Genesis"}}) == [{"title": "Genesis"}]

    @pytest.mark.parametrize("filt", [{}, None])
    def test_empty_filter_is_not_replayed(self, filt):
        # Replaying {} would copy a whole collection; the doc_id fallback covers it.
        assert gen.normalize_filters({"command": "find", "filter": filt}) == []

    def test_aggregate_replays_its_match(self):
        record = {"command": "aggregate", "filter": [{"$match": {"a": 1}}]}
        assert gen.normalize_filters(record) == [{"a": 1}]

    def test_update_and_delete_drop_empty_queries(self):
        record = {"command": "update", "filter": [{"a": 1}, {}, "junk"]}
        assert gen.normalize_filters(record) == [{"a": 1}]
        assert gen.normalize_filters({"command": "delete", "filter": None}) == []

    def test_insert_has_nothing_to_replay(self):
        assert gen.normalize_filters({"command": "insert", "filter": None}) == []


class TestNeedsDocIdFallback:
    def test_insert_never_falls_back(self):
        assert gen.needs_doc_id_fallback({"command": "insert"}) is False

    def test_bare_find_falls_back(self):
        assert gen.needs_doc_id_fallback({"command": "find", "filter": {}}) is True

    def test_filtered_find_does_not_fall_back(self):
        assert gen.needs_doc_id_fallback({"command": "find", "filter": {"a": 1}}) is False


class TestInsertBatched:
    def test_writes_every_document_across_batches(self):
        coll = mongomock.MongoClient().db.c
        written = gen.insert_batched(coll, [{"_id": i} for i in range(5)], batch_size=2)
        assert written == 5
        assert coll.count_documents({}) == 5

    def test_duplicate_ids_are_tolerated_and_not_counted(self):
        coll = mongomock.MongoClient().db.c
        coll.insert_one({"_id": 1})
        written = gen.insert_batched(coll, [{"_id": 1}, {"_id": 2}], batch_size=10)
        assert written == 1
        assert sorted(d["_id"] for d in coll.find()) == [1, 2]


class TestCopyIndexes:
    def test_copies_non_default_indexes_and_coerces_float_keys(self):
        client = mongomock.MongoClient()
        source, target = client.src, client.dst
        source.c.create_index([("title", 1)], name="title_1")
        source.c.insert_one({"title": "x"})

        real_list_indexes = source.c.list_indexes

        # Mongo can report key directions as floats; the generator must coerce them.
        def list_indexes_with_float_keys():
            for idx in real_list_indexes():
                idx = dict(idx)
                idx["key"] = {k: float(v) for k, v in idx["key"].items()}
                yield idx

        source.c.list_indexes = list_indexes_with_float_keys
        copied, failed = gen.copy_indexes(source, target, "c")
        assert (copied, failed) == (1, [])
        assert "title_1" in target.c.index_information()
