# sefaria/system/tests/ref_data_index_test.py
"""`ref_data.ref` must be a registered index.

update_pagesheetrank() ends with a single db.ref_data.bulk_write() of one
UpdateOne({"ref": tref}, upsert=True) per tref. Without an index on `ref`,
every one of those ~1.27M upserts is a COLLSCAN of the whole ref_data
collection (measured: 1,273,527 docs examined, 434ms for a single lookup).
That is ~1.6e12 document examinations, so a single pymongo batch far exceeds
socketTimeoutMS (300s) and the weekly reindex dies with
pymongo.errors.NetworkTimeout before it ever reaches Elasticsearch.
"""
import inspect

from sefaria.system import database


def _registered_indices():
    """Pull the literal `indices` list out of ensure_indices without running it.

    ensure_indices() talks to Mongo, so the test reads the source instead of
    executing it — this keeps the test a pure unit test with no live DB.
    """
    src = inspect.getsource(database.ensure_indices)
    start = src.index("indices = [")
    depth, i = 0, src.index("[", start)
    for end in range(i, len(src)):
        if src[end] == "[":
            depth += 1
        elif src[end] == "]":
            depth -= 1
            if depth == 0:
                return eval(src[i:end + 1], {"pymongo": __import__("pymongo")})
    raise AssertionError("could not parse the indices list")


def test_ref_data_ref_index_is_registered():
    indices = _registered_indices()
    collections = {col for col, _args, _kwargs in indices}
    assert "ref_data" in collections, (
        "ref_data is absent from ensure_indices(); its `ref` field is unindexed, "
        "which makes update_pagesheetrank()'s bulk_write a full collection scan "
        "per upsert and guarantees a NetworkTimeout on the weekly reindex"
    )

    ref_indexed = any(
        col == "ref_data" and args and args[0] == "ref"
        for col, args, _kwargs in indices
    )
    assert ref_indexed, "ref_data needs a plain ascending index on `ref`"
