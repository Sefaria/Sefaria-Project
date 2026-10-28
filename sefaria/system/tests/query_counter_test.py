from types import SimpleNamespace
import pytest
from bson import ObjectId
from sefaria.system.database import QueryCounter


@pytest.fixture(autouse=True)
def _no_recording_leaks():
    # Every test must leave QueryCounter inert, even when it fails part-way.
    QueryCounter.end_recording()
    yield
    QueryCounter.end_recording()


def _run(cmd_name, command, reply):
    QueryCounter.begin_recording("n::t", "call")
    qc = QueryCounter()
    qc.started(SimpleNamespace(command_name=cmd_name, request_id=7, command=command))
    qc.succeeded(SimpleNamespace(request_id=7, reply=reply))
    return QueryCounter.end_recording()


def test_find_and_modify_is_recorded():
    oid = ObjectId()
    (rec,) = _run("findAndModify", {"findAndModify": "sheets", "query": {"id": 5}, "update": {"$set": {"a": 1}}},
                  {"value": {"_id": oid, "id": 5}, "ok": 1.0})
    assert rec["filter"] == {"id": 5} and rec["doc_ids"] == [str(oid)] and rec["n_returned"] == 1


def test_find_and_modify_without_match_returns_zero():
    (rec,) = _run("findAndModify", {"findAndModify": "sheets", "query": {"id": 9}}, {"value": None, "ok": 1.0})
    assert rec["doc_ids"] == [] and rec["n_returned"] == 0


def test_find_is_recorded_with_filter_and_doc_ids():
    oid = ObjectId()
    (rec,) = _run("find", {"find": "sheets", "filter": {"id": 5}},
                  {"cursor": {"firstBatch": [{"_id": oid, "id": 5}], "id": 0}, "ok": 1.0})
    assert rec["command"] == "find" and rec["collection"] == "sheets"
    assert rec["filter"] == {"id": 5} and rec["doc_ids"] == [str(oid)] and rec["n_returned"] == 1


def test_update_is_recorded_with_filter():
    (rec,) = _run("update", {"update": "sheets", "updates": [{"q": {"id": 5}, "u": {"$set": {"a": 1}}}]},
                  {"n": 1, "nModified": 1, "ok": 1.0})
    assert rec["command"] == "update" and rec["collection"] == "sheets"
    assert rec["filter"] == [{"id": 5}] and rec["doc_ids"] == [] and rec["n_returned"] == 1


def test_delete_is_recorded_with_filter():
    (rec,) = _run("delete", {"delete": "sheets", "deletes": [{"q": {"id": 5}, "limit": 1}]},
                  {"n": 1, "ok": 1.0})
    assert rec["command"] == "delete" and rec["collection"] == "sheets"
    assert rec["filter"] == [{"id": 5}] and rec["doc_ids"] == [] and rec["n_returned"] == 1


def test_insert_is_recorded_with_doc_ids():
    oid = ObjectId()
    (rec,) = _run("insert", {"insert": "sheets", "documents": [{"_id": oid, "id": 5}]},
                  {"n": 1, "ok": 1.0})
    assert rec["command"] == "insert" and rec["collection"] == "sheets"
    assert rec["filter"] is None and rec["doc_ids"] == [str(oid)] and rec["n_returned"] == 1


def test_aggregate_is_recorded_with_pipeline_and_doc_ids():
    oid = ObjectId()
    pipeline = [{"$match": {"id": 5}}]
    (rec,) = _run("aggregate", {"aggregate": "sheets", "pipeline": pipeline, "cursor": {}},
                  {"cursor": {"firstBatch": [{"_id": oid, "id": 5}], "id": 0}, "ok": 1.0})
    assert rec["command"] == "aggregate" and rec["collection"] == "sheets"
    assert rec["filter"] == pipeline and rec["doc_ids"] == [str(oid)] and rec["n_returned"] == 1


def test_inert_when_not_recording():
    QueryCounter.end_recording()
    qc = QueryCounter()
    qc.started(SimpleNamespace(command_name="find", request_id=1, command={"find": "x", "filter": {"a": 1}}))
    assert QueryCounter._pending == {} and QueryCounter.recorded == []


def test_recording_flag_off_by_default(monkeypatch):
    import sefaria.conftest as c
    monkeypatch.delenv("SEFARIA_RECORD_MONGO", raising=False)
    assert c._recording_enabled() is False


def test_find_records_the_open_cursor_id():
    (rec,) = _run("find", {"find": "index", "filter": {}},
                  {"cursor": {"firstBatch": [{"_id": ObjectId()}], "id": 4242}, "ok": 1.0})
    assert rec["cursor_id"] == 4242


def test_exhausted_find_has_no_cursor_id():
    (rec,) = _run("find", {"find": "index", "filter": {"title": "Genesis"}},
                  {"cursor": {"firstBatch": [], "id": 0}, "ok": 1.0})
    assert rec["cursor_id"] is None


def test_get_more_records_the_cursor_it_continues():
    oid = ObjectId()
    # The last batch reports id 0 (exhausted); the record keeps the id the command continued.
    (rec,) = _run("getMore", {"getMore": 4242, "collection": "index"},
                  {"cursor": {"nextBatch": [{"_id": oid}], "id": 0}, "ok": 1.0})
    assert rec["command"] == "getMore" and rec["collection"] == "index"
    assert rec["cursor_id"] == 4242 and rec["doc_ids"] == [str(oid)]
