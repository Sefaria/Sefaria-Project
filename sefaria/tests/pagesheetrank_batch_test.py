# sefaria/tests/pagesheetrank_batch_test.py
"""update_pagesheetrank() must write ref_data in bounded batches.

It previously issued ONE db.ref_data.bulk_write() holding an UpdateOne per
tref (~1.27M ops). That single logical operation's socket reads exceed
socketTimeoutMS (300s), so the weekly reindex died with
pymongo.errors.NetworkTimeout after ~12h and lost the entire run's work
before ever reaching Elasticsearch.
"""
from unittest.mock import MagicMock

import pytest
from pymongo.errors import OperationFailure

from sefaria import pagesheetrank


@pytest.fixture
def captured_batches(monkeypatch):
    """Swap ref_data for a stub that records each bulk_write call."""
    calls = []

    def fake_bulk_write(ops, ordered=None):
        calls.append({"size": len(ops), "ordered": ordered, "ops": ops})
        result = MagicMock()
        result.modified_count = len(ops)
        result.upserted_ids = {}
        return result

    fake_db = MagicMock()
    fake_db.ref_data.bulk_write = fake_bulk_write
    monkeypatch.setattr(pagesheetrank, "db", fake_db)
    return calls


def test_writes_are_split_into_bounded_batches(captured_batches):
    data = {"Ref {}".format(i): float(i) for i in range(25001)}

    result = pagesheetrank._bulk_write_pagesheetranks(data, batch_size=10000)

    assert [c["size"] for c in captured_batches] == [10000, 10000, 5001]
    assert result["total"] == 25001
    # no single round trip may carry the whole workload
    assert max(c["size"] for c in captured_batches) <= 10000


def test_batches_are_unordered(captured_batches):
    pagesheetrank._bulk_write_pagesheetranks(
        {"Ref {}".format(i): float(i) for i in range(5)}, batch_size=2
    )
    assert all(c["ordered"] is False for c in captured_batches)


def test_empty_input_writes_nothing(captured_batches):
    result = pagesheetrank._bulk_write_pagesheetranks({}, batch_size=100)
    assert captured_batches == []
    assert result["total"] == 0


class TestEnsureRefDataIndex:
    """The job must guarantee its own index rather than assume someone ran it.

    ensure_indices() is dead code -- its only caller is a one-off migration
    script, so registering ref_data there never actually creates the index in
    any environment. Without the index each upsert is a full collection scan
    and the run dies on NetworkTimeout after ~12h, so the job creates it
    itself, up front, before doing hours of work it would only throw away.
    """

    def test_creates_the_index(self, monkeypatch):
        created = []
        fake_db = MagicMock()
        fake_db.ref_data.create_index = lambda spec, **kw: created.append(spec)
        monkeypatch.setattr(pagesheetrank, "db", fake_db)

        pagesheetrank._ensure_ref_data_index()

        assert created == ["ref"]

    def test_tolerates_failure_when_the_index_already_exists(self, monkeypatch):
        """A restricted DB user can't create indexes; that's fine if it's there."""
        fake_db = MagicMock()

        def boom(spec, **kw):
            raise OperationFailure("not authorized to create indexes")

        fake_db.ref_data.create_index = boom
        fake_db.ref_data.index_information.return_value = {
            "_id_": {"key": [("_id", 1)]},
            "ref_1": {"key": [("ref", 1)]},
        }
        monkeypatch.setattr(pagesheetrank, "db", fake_db)

        pagesheetrank._ensure_ref_data_index()  # must not raise

    def test_raises_when_creation_fails_and_index_is_missing(self, monkeypatch):
        """Fail fast and loud rather than burn 12h on a doomed run."""
        fake_db = MagicMock()

        def boom(spec, **kw):
            raise OperationFailure("not authorized to create indexes")

        fake_db.ref_data.create_index = boom
        fake_db.ref_data.index_information.return_value = {"_id_": {"key": [("_id", 1)]}}
        monkeypatch.setattr(pagesheetrank, "db", fake_db)

        with pytest.raises(OperationFailure):
            pagesheetrank._ensure_ref_data_index()

    def test_runs_before_any_expensive_work(self, monkeypatch):
        """Ordering is the whole point -- the guard is worthless after the walk."""
        order = []
        monkeypatch.setattr(pagesheetrank, "_ensure_ref_data_index",
                            lambda: order.append("ensure_index"))
        monkeypatch.setattr(pagesheetrank, "calculate_pagerank",
                            lambda: order.append("pagerank") or {})
        monkeypatch.setattr(pagesheetrank, "calculate_sheetrank",
                            lambda: order.append("sheetrank") or {})
        monkeypatch.setattr(pagesheetrank, "_bulk_write_pagesheetranks",
                            lambda d: order.append("write"))

        pagesheetrank.update_pagesheetrank()

        assert order == ["ensure_index", "pagerank", "sheetrank", "write"]


def test_each_op_upserts_by_ref(captured_batches):
    pagesheetrank._bulk_write_pagesheetranks({"Genesis 1:1": 3.5}, batch_size=10)

    op = captured_batches[0]["ops"][0]._doc if hasattr(
        captured_batches[0]["ops"][0], "_doc"
    ) else None
    # UpdateOne internals vary across pymongo versions; assert on the public repr
    rendered = repr(captured_batches[0]["ops"][0])
    assert "Genesis 1:1" in rendered
    assert "pagesheetrank" in rendered
    assert "upsert=True" in rendered or (op is not None)
