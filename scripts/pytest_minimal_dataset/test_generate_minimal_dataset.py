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


class TestExtractMatchFilterAfterGroup:
    def test_match_after_group_is_ignored(self):
        pipeline = [{"$match": {"a": 1}}, {"$group": {"_id": "$x"}}, {"$match": {"b": 2}}]
        assert gen.extract_match_filter(pipeline) == {"a": 1}


class TestSameSourceAndTarget:
    def test_refuses_same_source_and_target(self, tmp_path, monkeypatch):
        (tmp_path / "_index.json").write_text("{}")
        (tmp_path / "t.jsonl").write_text("")
        calls = []

        class SpyClient:
            def __init__(self, *args, **kwargs):
                calls.append(args)

        monkeypatch.setattr(gen.pymongo, "MongoClient", SpyClient)
        drops = []
        monkeypatch.setattr(SpyClient, "drop_database", lambda self, name: drops.append(name), raising=False)

        with pytest.raises(SystemExit):
            gen.main(["--source-db", "x", "--target-db", "x", "--artifact-dir", str(tmp_path)])
        assert drops == []


class TestRerunRecording:
    def test_rerun_recording_uses_recorder_env(self, monkeypatch):
        import recording

        seen = {}

        class Done:
            returncode = 0

        def fake_run(cmd, **kwargs):
            seen["cmd"] = cmd
            seen["env"] = kwargs["env"]
            seen["cwd"] = kwargs["cwd"]
            return Done()

        monkeypatch.setattr(recording.subprocess, "run", fake_run)
        monkeypatch.setattr(gen, "artifacts_present", lambda: True)
        monkeypatch.setenv("SEFARIA_MOCK_MONGO", "1")

        gen.rerun_recording()

        assert seen["env"]["SEFARIA_RECORD_MONGO"] == "1"
        assert seen["env"]["SEFARIA_TEST_MONGO"] == "1"
        assert seen["env"]["LOCAL_TEST_MONGO_PORT"] == "27018"
        assert seen["env"]["LOCAL_TEST_DB_NAME"] == "sefaria"
        assert "SEFARIA_MOCK_MONGO" not in seen["env"]
        assert seen["cwd"] == recording.REPO_ROOT
        assert seen["cmd"][1:3] == ["-m", "pytest"]


class TestRerunForwardsPortAndSource:
    def test_main_forwards_port_and_source_db_to_rerun(self, tmp_path, monkeypatch):
        class _Stop(Exception):
            pass

        seen = {}

        def fake_rerun(test_target="sefaria/tests", port=27018, source_db="sefaria"):
            seen.update(test_target=test_target, port=port, source_db=source_db)
            raise _Stop

        monkeypatch.setattr(gen, "rerun_recording", fake_rerun)
        monkeypatch.setattr(gen, "ARTIFACT_DIR", gen.ARTIFACT_DIR)  # restored after the test
        with pytest.raises(_Stop):
            gen.main(["--port", "27019", "--source-db", "foo", "--target-db", "bar",
                      "--artifact-dir", str(tmp_path / "missing")])
        assert seen["port"] == 27019
        assert seen["source_db"] == "foo"
