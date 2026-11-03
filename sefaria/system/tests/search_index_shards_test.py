"""Primary shard count for new search indexes. Loaded with importlib so no Django/Mongo is needed."""
import importlib.util
import pathlib

import pytest

spec = importlib.util.spec_from_file_location(
    "search_index_shards", pathlib.Path("sefaria/search_index_shards.py"),
)
shards = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shards)


def test_text_index_spreads_over_three_primaries_by_default():
    # One primary put the whole ~20 GB build on one node next to the live copy and filled
    # a 30Gi disk (dev 2026-10-17, prod 2026-09-24).
    assert shards.primary_shard_count("text", {}) == 3


@pytest.mark.parametrize("index_type", ["sheet", "topic", "book", "category"])
def test_small_indexes_keep_one_primary(index_type):
    assert shards.primary_shard_count(index_type, {"SEARCH_TEXT_PRIMARY_SHARDS": "5"}) == 1


def test_text_primary_count_is_configurable():
    assert shards.primary_shard_count("text", {"SEARCH_TEXT_PRIMARY_SHARDS": "5"}) == 5
    assert shards.primary_shard_count("text", {"SEARCH_TEXT_PRIMARY_SHARDS": " "}) == 3


@pytest.mark.parametrize("raw", ["0", "17", "three", "-1"])
def test_invalid_text_primary_count_fails_loudly(raw):
    with pytest.raises(ValueError):
        shards.primary_shard_count("text", {"SEARCH_TEXT_PRIMARY_SHARDS": raw})
